// The device diary for the signed-in account (iOS/Android only; the web keeps
// no diary). Opens it for the account the server names (GET /v1/me), syncs
// on launch, foreground, save and manual retry, and stops on background.
// Every session change (sign-out, account switch, new binding) closes the
// previous account's diary first.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

import { fetchAccountId } from '@mobile/api/sharedV1';
import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import { createDeviceAccountDatabase } from '@mobile/storage/deviceDiary';
import { createDeviceSync } from '@mobile/sync/deviceSync';
import { V1_COMMAND_SCHEMA } from './resources';
import { SpendDiaryProvider } from './SpendDiaryContext';
import { createSpendDiary } from './spendDiary';
import type { DiarySession, SpendDiary } from './spendDiary';

function createDeviceDiary(): { diary: SpendDiary; refreshSession: () => Promise<void> } {
  const database = createDeviceAccountDatabase();
  let session: DiarySession = { accountId: null, epoch: getV1SessionSnapshot().epoch };
  const diary = createSpendDiary({
    open: (accountId) => database.open(accountId),
    session: () => session,
    now: () => Date.now(),
    newId: () => Crypto.randomUUID(),
    schemaVersion: V1_COMMAND_SCHEMA,
    makeSync: (store, onOutcome) => {
      const { engine, scheduler } = createDeviceSync(store, () => ({ accountId: store.accountId, epoch: getV1SessionSnapshot().epoch }));
      const flushAndReport = engine.flush.bind(engine);
      engine.flush = async (current, trigger) => {
        const outcome = await flushAndReport(current, trigger);
        onOutcome(outcome);
        return outcome;
      };
      return { engine, scheduler };
    },
  });
  async function refreshSession() {
    const epoch = getV1SessionSnapshot().epoch;
    let accountId: string | null = null;
    if (getV1SessionSnapshot().binding) {
      try {
        accountId = await fetchAccountId();
      } catch {
        accountId = null;
      }
    }
    if (getV1SessionSnapshot().epoch !== epoch) return;
    session = { accountId, epoch };
    await diary.sessionChanged();
  }
  return { diary, refreshSession };
}

export function DeviceDiaryProvider({ children }: { children: ReactNode }) {
  const [device] = useState(() => (Platform.OS === 'ios' || Platform.OS === 'android' ? createDeviceDiary() : null));
  useEffect(() => {
    if (!device) return undefined;
    void device.refreshSession();
    const unsubscribe = subscribeSession(() => void device.refreshSession());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void device.diary.foreground();
      else device.diary.background();
    });
    return () => {
      unsubscribe();
      appState.remove();
      void device.diary.close();
    };
  }, [device]);
  return <SpendDiaryProvider diary={device?.diary ?? null}>{children}</SpendDiaryProvider>;
}
