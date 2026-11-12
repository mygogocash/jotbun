// createDeviceSync's report (1D-T7): every run's outcome still reaches the
// diary, and its reliability events go out through the typed emitters, once
// each. The engine, the live channel and the transport are stand-ins: only
// the report between the scheduler and the diary is under test.
import { expect, test, vi } from 'vitest';

const runs = vi.hoisted(() => ({ outcomes: [] as unknown[] }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/api/sharedV1', () => ({ getSharedSyncRemote: () => ({}), getSharedLiveTarget: () => null }));
vi.mock('@mobile/sync/syncEngine', () => ({ createSyncEngine: () => ({ flush: async () => runs.outcomes.shift() }) }));
vi.mock('@mobile/sync/liveChannel', () => ({ createLiveChannel: () => ({ start: () => undefined, stop: () => undefined }) }));

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { DiaryStore } from '@mobile/storage/diaryRepository';
import { createDeviceSync } from './deviceSync';
import type { SyncOutcome, SyncStatus } from './types';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const outcome = (status: SyncStatus, reason: string | null = null): SyncOutcome => ({ status, progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0, reason });

test('a device sync hands every outcome to the diary, and reports a failing run once and a resync once', async () => {
  const recorded = await recordAnalytics();
  try {
    runs.outcomes = [
      outcome('synced'), outcome('waiting', 'NETWORK_ERROR'), outcome('waiting', 'NETWORK_ERROR'), outcome('paused', 'NETWORK_ERROR'),
      outcome('synced'), outcome('resync_pending'), outcome('resync_pending'),
    ];
    const seen: SyncStatus[] = [];
    const { scheduler } = createDeviceSync({} as DiaryStore, { accountId: ACCOUNT, epoch: 1 }, { outcome: (next) => { seen.push(next.status); }, progress: () => undefined });
    for (let run = 0; run < 7; run += 1) await scheduler.manual();
    scheduler.stop();
    expect(seen).toEqual(['synced', 'waiting', 'waiting', 'paused', 'synced', 'resync_pending', 'resync_pending']);
    expect(recorded.sent.map(({ kind, name, properties }) => [kind, name, properties])).toEqual([
      ['capture', 'sync_failed', { reason_code: 'NETWORK_ERROR', origin: 'app' }],
      ['capture', 'resync_required', { reason_code: 'RESYNC_REQUIRED', origin: 'app' }],
    ]);
  } finally {
    recorded.restore();
  }
});

test("the diary hears each outcome before that outcome's events go out", async () => {
  const recorded = await recordAnalytics();
  try {
    runs.outcomes = [outcome('waiting', 'NETWORK_ERROR'), outcome('signed_out')];
    // What the recorder had sent when the diary heard each outcome.
    const heard: (readonly [SyncStatus, number])[] = [];
    const { scheduler } = createDeviceSync({} as DiaryStore, { accountId: ACCOUNT, epoch: 1 }, { outcome: (next) => { heard.push([next.status, recorded.sent.length]); }, progress: () => undefined });
    await scheduler.manual();
    await scheduler.manual();
    scheduler.stop();
    expect(heard).toEqual([['waiting', 0], ['signed_out', 1]]);
    expect(recorded.sent.map(({ name }) => name)).toEqual(['sync_failed']);
  } finally {
    recorded.restore();
  }
});
