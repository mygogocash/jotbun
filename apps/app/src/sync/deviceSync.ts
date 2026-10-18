// The device's sync engine and scheduler for one open account diary, bound
// to the session the diary was opened for. The shared transport (F5) already
// renews an expired token (at most one serialized refresh, shared by every
// request that sent the same token) and reports a session the server ended
// to the credential provider, so the engine's own refresh hook stays off.
import * as Crypto from 'expo-crypto';

import { getSharedSyncRemote } from '../api/sharedV1';
import type { DiaryStore } from '../storage/diaryRepository.ts';
import { createSyncScheduler } from './scheduler.ts';
import type { SyncScheduler } from './scheduler.ts';
import { createSyncEngine } from './syncEngine.ts';
import type { SyncEngine } from './syncEngine.ts';
import type { SyncOutcome, SyncSession } from './types.ts';

export type DeviceSyncReport = { outcome(outcome: SyncOutcome): void; progress(progress: { sent: number; total: number }): void };

export function createDeviceSync(store: DiaryStore, session: SyncSession, report: DeviceSyncReport): { engine: SyncEngine; scheduler: SyncScheduler } {
  const engine = createSyncEngine({
    store,
    remote: getSharedSyncRemote(),
    now: () => Date.now(),
    random: () => Math.random(),
    refreshSession: async () => false,
    reconcile: { newKey: () => Crypto.randomUUID(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
    onProgress: report.progress,
  });
  const scheduler = createSyncScheduler({
    flush: (trigger) => engine.flush(session, trigger),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onOutcome: report.outcome,
  });
  return { engine, scheduler };
}
