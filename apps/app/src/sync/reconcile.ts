import type { EntityChange, Minor } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { DiaryState, DiaryStore } from '../storage/diaryRepository.ts';
import { CursorMoved } from '../storage/types.ts';
import type { SyncRemote } from './types.ts';

export type ReconcileOptions = {
  /** A fresh idempotency key for a snapshot request. */
  newKey: () => string;
  sleep: (ms: number) => Promise<void>;
  /** How many times to poll a pending snapshot before giving up for this run. */
  maxSnapshotPolls?: number;
  now?: () => number;
};

export type ReconcileOutcome = { status: 'synced' | 'resync_pending'; resolved: number };

const SNAPSHOT_POLL_MS = 2_000;
const GRANT_MARGIN_MS = 30_000;
const CURSOR_RETRIES = 3;

/** Downloads a full snapshot and swaps it in; false when it is not ready (or failed) in this run. */
async function resync(store: DiaryStore, remote: SyncRemote, options: ReconcileOptions): Promise<boolean> {
  let dto = await remote.requestSnapshot(options.newKey());
  for (let polls = 0; dto.status === 'pending'; polls += 1) {
    if (polls >= (options.maxSnapshotPolls ?? 10)) return false;
    await options.sleep(SNAPSHOT_POLL_MS);
    dto = await remote.snapshotStatus(dto.snapshot_id);
  }
  if (dto.status !== 'ready') return false;
  const now = options.now ?? (() => Date.now());
  const entities: EntityChange[] = [];
  for (let index = 0; index < dto.chunks.length; index += 1) {
    // Grants last minutes; renew them (one status call) before one runs out.
    if (Date.parse(dto.chunks[index].grant_expires_at) - GRANT_MARGIN_MS <= now()) {
      const renewed = await remote.snapshotStatus(dto.snapshot_id);
      if (renewed.status !== 'ready' || renewed.high_water !== dto.high_water) return false;
      dto = renewed;
    }
    const grant = dto.chunks[index];
    const chunk = await remote.snapshotChunk(grant);
    if (chunk.snapshot_id !== dto.snapshot_id || chunk.high_water !== dto.high_water || chunk.index !== grant.index) {
      throw new V1Error('invalid_response', 200, 'SNAPSHOT_MISMATCH');
    }
    entities.push(...chunk.entities);
  }
  await store.replaceConfirmed({ entities, cursor: dto.cursor }, dto.high_water);
  return true;
}

/**
 * A command whose record the confirmed state holds (active, deleted or
 * purged) is done, whatever its local state - its id is client-generated, so
 * the record can only come from it - and its draft goes with it: a deleted or
 * purged record never comes back from an old draft or acknowledgement. Only a
 * command being transmitted right now is left alone. An acknowledged command
 * whose record is missing although the confirmed state has passed its
 * revision (a server restore lost it) becomes uncertain again, so its status
 * is checked and the same command resent - never deleted.
 */
async function resolve(store: DiaryStore): Promise<number> {
  const state = await store.readState();
  const confirmed = new Set(state.confirmed.map((entity) => entity.id));
  const applied = BigInt(state.appliedRevision);
  const done: string[] = [];
  for (const command of await store.readOutbox()) {
    if (command.state === 'sending') continue;
    if (confirmed.has(command.payload.id)) done.push(command.commandId);
    else if (command.state === 'acknowledged' && command.ackedRevision !== null && BigInt(command.ackedRevision) <= applied) {
      await store.setCommandState(command.commandId, ['acknowledged'], 'uncertain');
    }
  }
  if (done.length > 0) await store.resolveCommands(done);
  return done.length;
}

/** The server cannot continue from this cursor: retention passed it, a restore moved behind it, or it refused it. */
const needsResync = (error: V1Error) =>
  error.code === 'RESYNC_REQUIRED' || error.status === 410 || (error.status === 422 && error.fields?.cursor !== undefined);

/**
 * Brings the confirmed state up to date - every delta page from the stored
 * cursor; on 410 RESYNC_REQUIRED a full snapshot, then deltas from its
 * cursor - and resolves finished commands. Confirmed state only ever comes
 * from deltas and snapshots, never from an acknowledgement or a receipt. A
 * resync keeps every unresolved command and draft. If the cursor moves under
 * a page (another pull applied first), the pull starts again from it.
 */
export async function reconcile(store: DiaryStore, remote: SyncRemote, options: ReconcileOptions): Promise<ReconcileOutcome> {
  let cursorRetries = 0;
  let resynced = false;
  for (;;) {
    try {
      let cursor = (await store.readState()).cursor;
      for (;;) {
        const page = await remote.changes(cursor);
        await store.applyChangeGroups(page.groups, page.next_cursor, cursor);
        cursor = page.next_cursor;
        if (!page.has_more) break;
      }
      break;
    } catch (error) {
      if (error instanceof CursorMoved && cursorRetries < CURSOR_RETRIES) {
        cursorRetries += 1;
        continue;
      }
      if (error instanceof V1Error && needsResync(error) && !resynced) {
        if (!(await resync(store, remote, options))) return { status: 'resync_pending', resolved: 0 };
        resynced = true;
        continue;
      }
      throw error;
    }
  }
  return { status: 'synced', resolved: await resolve(store) };
}

/** Pending expenses the confirmed state does not hold yet, as an exact integer string (S4 shows it beside confirmed totals). */
export function pendingAdjustmentMinor(state: DiaryState): Minor {
  const confirmed = new Set(state.confirmed.map((entity) => entity.id));
  let total = 0n;
  for (const entry of state.pending) if (entry.type === 'expense' && !confirmed.has(entry.id)) total += BigInt(entry.amount_minor);
  return total.toString();
}
