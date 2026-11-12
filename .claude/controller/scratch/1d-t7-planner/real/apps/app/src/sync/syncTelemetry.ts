// Sync outcomes as §7's reliability events (1D-T7), worked out from one
// outcome to the next, so a failing run is counted once, not on every retry.
// Pure: createDeviceSync keeps the previous outcome and sends what this says
// through trackSyncFailed and trackResyncRequired.
import type { SyncOutcome, SyncStatus } from './types.ts';

export type SyncEvent = { name: 'sync_failed' | 'resync_required'; properties: Record<string, string> };

/** The failure set: a run failed and the engine is backing off (`waiting`) or has paused. Pacing (429) is not a failure. */
const FAILING: ReadonlySet<SyncStatus> = new Set<SyncStatus>(['waiting', 'paused']);

/**
 * sync_failed once on entering the failure set from a status outside it (or
 * from no outcome yet), with the run's V1Error code, or LOCAL_ERROR when the
 * outcome names none (a flush that threw); waiting to paused, or a retry
 * still failing, sends nothing. resync_required once on entering
 * resync_pending. Nothing else is counted.
 */
export function syncEvents(previous: SyncOutcome | null, next: SyncOutcome): SyncEvent[] {
  const before = previous?.status ?? null;
  if (FAILING.has(next.status) && (before === null || !FAILING.has(before))) {
    return [{ name: 'sync_failed', properties: { reason_code: next.reason ?? 'LOCAL_ERROR' } }];
  }
  if (next.status === 'resync_pending' && before !== 'resync_pending') {
    return [{ name: 'resync_required', properties: { reason_code: 'RESYNC_REQUIRED' } }];
  }
  return [];
}
