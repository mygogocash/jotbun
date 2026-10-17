// The device's sync engine and scheduler for one open account diary. S4
// connects them to the screens and AppState; F5 supplies the token refresh
// (until then a rejected token stops the flush and keeps every draft).
import * as Crypto from 'expo-crypto';

import { getSharedSyncRemote } from '../api/sharedV1';
import type { DiaryStore } from '../storage/diaryRepository.ts';
import { createSyncScheduler } from './scheduler.ts';
import type { SyncScheduler } from './scheduler.ts';
import { createSyncEngine } from './syncEngine.ts';
import type { SyncEngine } from './syncEngine.ts';
import type { SyncSession } from './types.ts';

export function createDeviceSync(store: DiaryStore, session: () => SyncSession, refreshSession: () => Promise<boolean> = async () => false): { engine: SyncEngine; scheduler: SyncScheduler } {
  const engine = createSyncEngine({
    store,
    remote: getSharedSyncRemote(),
    now: () => Date.now(),
    random: () => Math.random(),
    refreshSession,
    reconcile: { newKey: () => Crypto.randomUUID(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
  });
  const scheduler = createSyncScheduler({
    flush: (trigger) => engine.flush(session(), trigger),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return { engine, scheduler };
}
