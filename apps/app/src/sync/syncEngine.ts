import type { CategoryDto, WalletSnapshot } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { DiaryStore } from '../storage/diaryRepository.ts';
import { StaleEpochError } from '../storage/types.ts';
import type { OutboxCommand, OutboxState } from '../storage/types.ts';
import { isStale, verdictFor } from './outbox.ts';
import { reconcile } from './reconcile.ts';
import type { ReconcileOptions } from './reconcile.ts';
import { INITIAL_RETRY, afterFailure, afterPacing, afterSuccess, gate } from './retryPolicy.ts';
import type { RetryState } from './retryPolicy.ts';
import type { FlushTrigger, SyncOutcome, SyncRemote, SyncSession, SyncStatus } from './types.ts';

export type SyncEngineDeps = {
  store: DiaryStore;
  remote: SyncRemote;
  now: () => number;
  random: () => number;
  /** Refreshes the access token once (F5); false when the session cannot be renewed. */
  refreshSession: () => Promise<boolean>;
  reconcile: ReconcileOptions;
};

export interface SyncEngine {
  flush(session: SyncSession, trigger?: FlushTrigger): Promise<SyncOutcome>;
}

const MAX_IN_FLIGHT = 2;
const STATUS_BATCH = 100;

class Stop extends Error {
  readonly status: SyncStatus;
  constructor(status: SyncStatus) {
    super(status);
    this.status = status;
  }
}

/**
 * One engine per open account diary. A flush:
 *   1. turns commands left `sending` by a crash into `uncertain`;
 *   2. asks the server about uncertain commands - known ones are
 *      acknowledged, unknown ones may be resent, only as themselves;
 *   3. pulls deltas, so reference checks see archived or deleted wallets
 *      and categories;
 *   4. moves drafts older than 30 days or with unusable references to
 *      needs-review;
 *   5. sends the rest in order, at most two at a time, each marked `sending`
 *      first (frozen), with one token refresh per failed request;
 *   6. reconciles, so acknowledged commands resolve from the confirmed state.
 * Concurrent flushes share one run. 429 is pacing, not failure; five
 * transport failures in a row pause until foreground or a manual retry; 426
 * stops all sending until the app is updated.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { store, remote } = deps;
  let retry: RetryState = INITIAL_RETRY;
  let upgradeRequired = false;
  let running: Promise<SyncOutcome> | null = null;

  const iso = () => new Date(deps.now()).toISOString();

  /** Runs a non-command request with at most one token refresh. */
  async function call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof V1Error && error.outcome === 'signed_out' && (await deps.refreshSession())) return request();
      throw error;
    }
  }

  async function pauseForUpgrade(): Promise<void> {
    upgradeRequired = true;
    for (const command of await store.readOutbox()) {
      if (command.state === 'unsent') await store.setCommandState(command.commandId, ['unsent'], 'paused_upgrade');
    }
  }

  /** Maps a failure outside a command send to a stop. */
  async function stopFor(error: unknown): Promise<Stop> {
    if (error instanceof Stop) return error;
    if (error instanceof StaleEpochError) return new Stop('session_changed');
    if (!(error instanceof V1Error)) throw error;
    switch (error.outcome) {
      case 'rate_limited':
        retry = afterPacing(retry, deps.now(), error.retryAfterSeconds);
        return new Stop('rate_limited');
      case 'upgrade_required':
        await pauseForUpgrade();
        return new Stop('upgrade_required');
      case 'signed_out':
        return new Stop('signed_out');
      case 'policy_required':
        return new Stop('policy_required');
      case 'session_changed':
        return new Stop('session_changed');
      default:
        retry = afterFailure(retry, deps.now(), deps.random(), error.retryAfterSeconds);
        return new Stop(retry.paused ? 'paused' : 'waiting');
    }
  }

  async function referencesUsable(command: OutboxCommand): Promise<boolean> {
    const state = await store.readState();
    const active = new Map(state.confirmed.filter((entity) => entity.state === 'active').map((entity) => [`${entity.entity}:${entity.id}`, entity.snapshot]));
    const payload = command.payload as Record<string, unknown>;
    const wallets = payload.type === 'transfer' ? [payload.source_wallet_id, payload.destination_wallet_id] : [payload.wallet_id];
    for (const id of wallets) {
      const wallet = active.get(`wallet:${id}`) as WalletSnapshot | undefined;
      if (!wallet || wallet.archived) return false;
    }
    if (payload.type !== 'transfer') {
      const category = active.get(`category:${payload.category_id}`) as CategoryDto | undefined;
      if (!category || category.archived || category.type !== payload.type) return false;
    }
    return true;
  }

  async function send(command: OutboxCommand, progress: { sent: number }): Promise<Stop | null> {
    const previous: OutboxState = await store.beginTransmission(command.commandId, iso());
    let refreshed = false;
    for (;;) {
      try {
        const ack = await remote.sendCreate({ ...command, state: 'sending' });
        await store.setCommandState(command.commandId, ['sending'], 'acknowledged', ack.committed_revision);
        retry = afterSuccess(retry);
        progress.sent += 1;
        return null;
      } catch (error) {
        if (error instanceof StaleEpochError) return new Stop('session_changed');
        if (!(error instanceof V1Error)) throw error;
        if (error.outcome === 'signed_out' && !refreshed) {
          refreshed = true;
          if (await deps.refreshSession()) continue;
        }
        const verdict = verdictFor(error.outcome);
        if (verdict.next !== 'keep_sending') {
          await store.setCommandState(command.commandId, ['sending'], verdict.next === 'previous' ? previous : verdict.next);
        }
        if (error.outcome === 'upgrade_required') {
          await pauseForUpgrade();
          return new Stop('upgrade_required');
        }
        if (error.outcome === 'rate_limited') {
          retry = afterPacing(retry, deps.now(), error.retryAfterSeconds);
          return new Stop('rate_limited');
        }
        if (verdict.failure) retry = afterFailure(retry, deps.now(), deps.random(), error.retryAfterSeconds);
        if (verdict.flush === 'continue') return null;
        if (verdict.failure) return new Stop(retry.paused ? 'paused' : 'waiting');
        return new Stop(error.outcome === 'session_changed' ? 'session_changed' : error.outcome === 'policy_required' ? 'policy_required' : 'signed_out');
      }
    }
  }

  async function summarize(status: SyncStatus, progress: { sent: number; total: number }): Promise<SyncOutcome> {
    const outbox = await store.readOutbox().catch(() => [] as OutboxCommand[]);
    const nextAttemptAt = status === 'rate_limited' ? retry.paceUntil : status === 'waiting' ? retry.notBefore : null;
    return {
      status,
      progress: { sent: progress.sent, total: progress.total },
      nextAttemptAt,
      uncertain: outbox.filter((command) => command.state === 'uncertain' || command.state === 'sending').length,
      needsReview: outbox.filter((command) => command.state === 'needs_review').length,
    };
  }

  async function run(session: SyncSession, trigger: FlushTrigger): Promise<SyncOutcome> {
    const progress = { sent: 0, total: 0 };
    if (session.accountId !== store.accountId) return summarize('session_changed', progress);
    if (upgradeRequired) return summarize('upgrade_required', progress);
    const allowed = gate(retry, deps.now(), trigger);
    retry = allowed.state;
    if (!allowed.go) return summarize(allowed.wait === 'rate_limited' ? 'rate_limited' : allowed.wait === 'paused' ? 'paused' : 'waiting', progress);
    try {
      // 1. Recover transmissions a crash interrupted.
      for (const command of await store.readOutbox()) {
        if (command.state === 'sending') await store.setCommandState(command.commandId, ['sending'], 'uncertain');
      }
      // 2. Ask about uncertain commands before anything is resent.
      const uncertain = (await store.readOutbox()).filter((command) => command.state === 'uncertain');
      progress.total += uncertain.length;
      for (let start = 0; start < uncertain.length; start += STATUS_BATCH) {
        const statuses = await call(() => remote.commandStatus(uncertain.slice(start, start + STATUS_BATCH).map((command) => command.commandId)));
        for (const status of statuses) {
          if (status.state === 'known' && (await store.setCommandState(status.command_id, ['uncertain'], 'acknowledged', status.ack.committed_revision))) progress.sent += 1;
        }
      }
      // 3. Current references.
      const pulled = await call(() => reconcile(store, remote, deps.reconcile));
      if (pulled.status === 'resync_pending') return summarize('resync_pending', progress);
      // 4. Review, then 5. send.
      const queue: OutboxCommand[] = [];
      for (const command of await store.readOutbox()) {
        const sendable = command.state === 'unsent' || command.state === 'uncertain' || command.state === 'paused_upgrade';
        if (!sendable) continue;
        if (isStale(command, deps.now()) || !(await referencesUsable(command))) {
          await store.setCommandState(command.commandId, [command.state], 'needs_review');
          if (command.state === 'uncertain') progress.total -= 1;
          continue;
        }
        if (command.state !== 'uncertain') progress.total += 1;
        queue.push(command);
      }
      let stop: Stop | null = null;
      const worker = async () => {
        while (!stop && queue.length > 0) {
          const command = queue.shift() as OutboxCommand;
          const result = await send(command, progress);
          if (result && !stop) stop = result;
        }
      };
      await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));
      // 6. Resolve what was acknowledged (also after a stop, if the connection still works).
      if (progress.sent > 0) {
        try {
          await call(() => reconcile(store, remote, deps.reconcile));
        } catch (error) {
          if (!stop) stop = await stopFor(error);
        }
      }
      if (stop) return summarize((stop as Stop).status, progress);
      return summarize('synced', progress);
    } catch (error) {
      return summarize((await stopFor(error)).status, progress);
    }
  }

  return {
    flush(session, trigger = 'timer') {
      if (!running) {
        running = run(session, trigger).finally(() => {
          running = null;
        });
      }
      return running;
    },
  };
}
