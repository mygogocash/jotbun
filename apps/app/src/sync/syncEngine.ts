import type { CategoryDto, WalletSnapshot } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { DiaryStore } from '../storage/diaryRepository.ts';
import { CursorMoved, DiaryLocked, StaleEpochError } from '../storage/types.ts';
import type { OutboxCommand } from '../storage/types.ts';
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
  /** Live "n of m" while a run sends: called when the run's work is known and after each acknowledgement. */
  onProgress?: (progress: { sent: number; total: number }) => void;
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
  let followUp: Promise<SyncOutcome> | null = null;

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

  /** One run's view of what went wrong: decided once at the end, so a later success never erases a failure. */
  type RunState = { failed: V1Error | null; paced: V1Error | null };

  /** Maps any failure to a stop; transport/server failures and unexpected errors count toward the pause. */
  async function stopFor(error: unknown, run: RunState): Promise<Stop> {
    if (error instanceof Stop) return error;
    if (error instanceof StaleEpochError || error instanceof DiaryLocked) return new Stop('session_changed');
    if (!(error instanceof V1Error)) {
      run.failed ??= new V1Error('unavailable', 0, error instanceof CursorMoved ? 'CURSOR_MOVED' : 'LOCAL_ERROR');
      return new Stop('waiting');
    }
    switch (error.outcome) {
      case 'rate_limited':
        run.paced = error;
        return new Stop('rate_limited');
      case 'upgrade_required':
        await pauseForUpgrade();
        return new Stop('upgrade_required');
      case 'signed_out':
      case 'unsupported_platform':
        return new Stop('signed_out');
      case 'policy_required':
        return new Stop('policy_required');
      case 'session_changed':
        return new Stop('session_changed');
      default:
        run.failed ??= error;
        return new Stop('waiting');
    }
  }

  function usable(command: OutboxCommand, active: Map<string, unknown>): boolean {
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

  /** Sends one queued command as the frozen row; null when it is done or was skipped. */
  const report = (progress: { sent: number; total: number }) => deps.onProgress?.({ sent: progress.sent, total: progress.total });

  async function send(commandId: string, progress: { sent: number; total: number }, run: RunState): Promise<Stop | null> {
    const frozen = await store.beginTransmission(commandId, iso());
    if (!frozen) return null; // removed (undone) before its turn
    const { previous, command } = frozen;
    let refreshed = false;
    for (;;) {
      try {
        const ack = await remote.sendCreate(command);
        await store.setCommandState(commandId, ['sending'], 'acknowledged', ack.committed_revision);
        progress.sent += 1;
        report(progress);
        return null;
      } catch (error) {
        if (!(error instanceof V1Error)) return stopFor(error, run);
        if (error.outcome === 'signed_out' && !refreshed) {
          refreshed = true;
          if (await deps.refreshSession()) continue;
        }
        const verdict = verdictFor(error.outcome);
        if (verdict.next !== 'keep_sending') {
          await store.setCommandState(commandId, ['sending'], verdict.next === 'previous' ? previous : verdict.next);
        }
        if (verdict.flush === 'continue') return null;
        if (verdict.failure) {
          run.failed ??= error;
          return new Stop('waiting');
        }
        return stopFor(error, run);
      }
    }
  }

  async function summarize(status: SyncStatus, progress: { sent: number; total: number }): Promise<SyncOutcome> {
    const outbox = await store.readOutbox().catch(() => [] as OutboxCommand[]);
    const nextAttemptAt = status === 'rate_limited' ? retry.paceUntil : status === 'waiting' ? retry.notBefore : null;
    return {
      status: status === 'waiting' && retry.paused ? 'paused' : status,
      progress: { sent: progress.sent, total: progress.total },
      nextAttemptAt: status === 'waiting' && retry.paused ? null : nextAttemptAt,
      uncertain: outbox.filter((command) => command.state === 'uncertain' || command.state === 'sending').length,
      needsReview: outbox.filter((command) => command.state === 'needs_review').length,
    };
  }

  async function steps(progress: { sent: number; total: number }, run: RunState): Promise<SyncStatus> {
    // 1. Recover transmissions a crash interrupted.
    for (const command of await store.readOutbox()) {
      if (command.state === 'sending') await store.setCommandState(command.commandId, ['sending'], 'uncertain');
    }
    // 2. Ask about uncertain commands before anything is resent; only an
    //    answer for exactly this command and record counts.
    const uncertain = (await store.readOutbox()).filter((command) => command.state === 'uncertain');
    progress.total += uncertain.length;
    for (let start = 0; start < uncertain.length; start += STATUS_BATCH) {
      const batch = uncertain.slice(start, start + STATUS_BATCH);
      const byId = new Map(batch.map((command) => [command.commandId, command]));
      const statuses = await call(() => remote.commandStatus(batch.map((command) => command.commandId)));
      for (const status of statuses) {
        const command = byId.get(status.command_id);
        if (!command) throw new V1Error('invalid_response', 200, 'STATUS_MISMATCH');
        if (status.state !== 'known') continue;
        if (status.ack.command_id !== command.commandId || status.ack.entity_id !== command.payload.id) throw new V1Error('invalid_response', 200, 'STATUS_MISMATCH');
        if (await store.setCommandState(command.commandId, ['uncertain'], 'acknowledged', status.ack.committed_revision)) progress.sent += 1;
      }
    }
    // 3. Current references (and anything that already committed resolves).
    const pulled = await call(() => reconcile(store, remote, deps.reconcile));
    if (pulled.status === 'resync_pending') return 'resync_pending';
    // 4. Review, then 5. send.
    const state = await store.readState();
    const active = new Map(state.confirmed.filter((entity) => entity.state === 'active').map((entity) => [`${entity.entity}:${entity.id}`, entity.snapshot]));
    const queue: string[] = [];
    for (const command of await store.readOutbox()) {
      const sendable = command.state === 'unsent' || command.state === 'uncertain' || command.state === 'paused_upgrade';
      if (!sendable) continue;
      if (isStale(command, deps.now()) || !usable(command, active)) {
        await store.setCommandState(command.commandId, [command.state], 'needs_review');
        if (command.state === 'uncertain') progress.total -= 1;
        continue;
      }
      if (command.state !== 'uncertain') progress.total += 1;
      queue.push(command.commandId);
    }
    if (queue.length > 0) report(progress);
    let stop: Stop | null = null;
    const worker = async () => {
      while (!stop && queue.length > 0) {
        const commandId = queue.shift() as string;
        let result: Stop | null;
        try {
          result = await send(commandId, progress, run);
        } catch (error) {
          result = await stopFor(error, run);
        }
        if (result && !stop) stop = result;
      }
    };
    await Promise.allSettled(Array.from({ length: MAX_IN_FLIGHT }, worker));
    // 6. Resolve what was acknowledged.
    if (progress.sent > 0) {
      try {
        const after = await call(() => reconcile(store, remote, deps.reconcile));
        if (after.status === 'resync_pending' && !stop) return 'resync_pending';
      } catch (error) {
        if (!stop) stop = await stopFor(error, run);
      }
    }
    return stop ? (stop as Stop).status : 'synced';
  }

  async function runOnce(session: SyncSession, trigger: FlushTrigger): Promise<SyncOutcome> {
    const progress = { sent: 0, total: 0 };
    if (session.accountId !== store.accountId) return summarize('session_changed', progress);
    if (upgradeRequired) return summarize('upgrade_required', progress);
    const allowed = gate(retry, deps.now(), trigger);
    retry = allowed.state;
    if (!allowed.go) return summarize(allowed.wait === 'rate_limited' ? 'rate_limited' : allowed.wait === 'paused' ? 'paused' : 'waiting', progress);
    const run: RunState = { failed: null, paced: null };
    let status: SyncStatus;
    try {
      status = await steps(progress, run);
    } catch (error) {
      status = (await stopFor(error, run)).status;
    }
    // One retry decision per run.
    if (run.failed) retry = afterFailure(retry, deps.now(), deps.random(), run.failed.retryAfterSeconds);
    else if (status === 'synced' || progress.sent > 0) retry = afterSuccess(retry);
    if (run.paced) retry = afterPacing(retry, deps.now(), run.paced.retryAfterSeconds);
    if (run.failed && status !== 'session_changed' && status !== 'signed_out' && status !== 'policy_required' && status !== 'upgrade_required') status = 'waiting';
    return summarize(status, progress);
  }

  return {
    flush(session, trigger = 'timer') {
      if (!running) {
        running = runOnce(session, trigger).finally(() => {
          running = null;
        });
        return running;
      }
      // A call during a run (a new save) gets exactly one follow-up run.
      followUp ??= running.then(
        () => {
          followUp = null;
          return this.flush(session, trigger);
        },
        () => {
          followUp = null;
          return this.flush(session, trigger);
        },
      );
      return followUp;
    },
  };
}
