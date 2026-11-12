// Sync outcomes as reliability events (1D-T7): a failing run is counted once,
// not on every retry, and a resync once when it is needed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { syncEvents } from './syncTelemetry.ts';
import type { SyncEvent } from './syncTelemetry.ts';
import type { SyncOutcome, SyncStatus } from './types.ts';

const outcome = (status: SyncStatus, reason: string | null = null): SyncOutcome => ({ status, progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0, reason });

/** Every event a run of outcomes gives, each worked out from the one before it. */
function eventsOf(outcomes: readonly SyncOutcome[]): SyncEvent[] {
  const events: SyncEvent[] = [];
  let previous: SyncOutcome | null = null;
  for (const next of outcomes) {
    events.push(...syncEvents(previous, next));
    previous = next;
  }
  return events;
}

const failed = (code: string): SyncEvent => ({ name: 'sync_failed', properties: { reason_code: code } });
const RESYNC: SyncEvent = { name: 'resync_required', properties: { reason_code: 'RESYNC_REQUIRED' } };

test('a failing run is counted once, not on every retry', () => {
  assert.deepEqual(eventsOf([
    outcome('synced'), outcome('waiting', 'NETWORK_ERROR'), outcome('waiting', 'NETWORK_ERROR'), outcome('paused', 'NETWORK_ERROR'),
    // A foreground retry that fails again is the same failure.
    outcome('waiting', 'TIMEOUT'), outcome('synced'),
  ]), [failed('NETWORK_ERROR')]);
  assert.deepEqual(eventsOf([outcome('synced'), outcome('resync_pending'), outcome('resync_pending'), outcome('synced')]), [RESYNC]);
});

test('a failure after a recovery is counted again, and the first failure can be the first outcome or a pause', () => {
  assert.deepEqual(eventsOf([outcome('waiting', 'HTTP_502'), outcome('synced'), outcome('waiting', 'INTERNAL_ERROR')]), [failed('HTTP_502'), failed('INTERNAL_ERROR')]);
  assert.deepEqual(eventsOf([outcome('session_changed'), outcome('paused', 'NETWORK_ERROR')]), [failed('NETWORK_ERROR')]);
  assert.deepEqual(eventsOf([outcome('resync_pending'), outcome('synced'), outcome('resync_pending')]), [RESYNC, RESYNC]);
});

test('pacing is not a failure, an outcome without a code is LOCAL_ERROR, and nothing else is counted', () => {
  assert.deepEqual(eventsOf([outcome('synced'), outcome('rate_limited'), outcome('rate_limited')]), []);
  assert.deepEqual(eventsOf([outcome('rate_limited'), outcome('waiting', 'SERVICE_UNAVAILABLE')]), [failed('SERVICE_UNAVAILABLE')]);
  // The scheduler's outcome for a flush that threw names no code.
  const thrown = { status: 'waiting', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 } as SyncOutcome;
  assert.deepEqual(syncEvents(outcome('synced'), thrown), [failed('LOCAL_ERROR')]);
  assert.deepEqual(syncEvents(null, outcome('waiting')), [failed('LOCAL_ERROR')]);
  for (const status of ['synced', 'signed_out', 'policy_required', 'upgrade_required', 'session_changed'] as const) {
    assert.deepEqual(syncEvents(outcome('waiting', 'NETWORK_ERROR'), outcome(status)), [], status);
  }
});
