// S3: the outbox, retry discipline and reconciliation between the device
// diary (S2) and the server (M1 command status, S1 deltas and snapshots).
import type { CommandAck, CommandStatus, SnapshotChunk, SnapshotChunkGrant, SnapshotDto, SyncChangesPage } from '@gogospend/contracts';

import type { OutboxCommand } from '../storage/types.ts';

/** The server side of sync. It sends a command only as itself: same id, same body, same schema. */
export interface SyncRemote {
  sendCreate(command: OutboxCommand): Promise<CommandAck>;
  commandStatus(ids: readonly string[]): Promise<CommandStatus[]>;
  changes(cursor: string | null, limit?: number): Promise<SyncChangesPage>;
  requestSnapshot(key: string): Promise<SnapshotDto>;
  snapshotStatus(id: string): Promise<SnapshotDto>;
  /** Downloads one chunk and checks its size and SHA-256 against the grant. */
  snapshotChunk(grant: SnapshotChunkGrant): Promise<SnapshotChunk>;
}

/**
 * What started a flush. Foreground, manual and live flushes lift a failure pause.
 * `live`: the live channel's poke, or its (re)connect (plan 1D, L2).
 */
export type FlushTrigger = 'launch' | 'foreground' | 'manual' | 'write' | 'timer' | 'live';

export type SyncStatus =
  | 'synced'
  | 'waiting' // backing off after failures; retry at nextAttemptAt
  | 'rate_limited' // pacing (429 Retry-After), not a failure; progress continues
  | 'paused' // five failures in a row: waits for foreground or a manual retry
  | 'signed_out'
  | 'policy_required'
  | 'upgrade_required'
  | 'session_changed'
  | 'resync_pending';

export type SyncOutcome = {
  status: SyncStatus;
  /** "n of m": commands acknowledged in this run out of those waiting when it started. */
  progress: { sent: number; total: number };
  nextAttemptAt: number | null;
  uncertain: number;
  needsReview: number;
  /**
   * The V1Error code of the run's failure (NETWORK_ERROR, TIMEOUT, HTTP_502,
   * INTERNAL_ERROR, LOCAL_ERROR, ...), else null (1D-T7: sync_failed's
   * reason_code). The engine always sets it; an outcome made elsewhere (the
   * scheduler's flush that threw, a fixture) may leave it out.
   */
  reason?: string | null;
};

/** The session a flush runs for (F5): the store must belong to the same account. */
export type SyncSession = { accountId: string; epoch: number };
