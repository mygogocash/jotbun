// The device diary for the signed-in account (iOS/Android only; the web keeps
// no diary). Opens it for the account the server names (GET /v1/me) - or,
// offline, the account it verified earlier for this same binding - syncs on
// launch, foreground, save and manual retry, and stops on background. Every
// session change (sign-out, account switch, new binding) closes the previous
// account's diary first; a token refresh for the same identity changes nothing.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { fetchAccountId } from '@mobile/api/sharedV1';
import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import { eraseStoredBunIntensity } from '@mobile/mascot/bunIntensityStorage';
import { eraseCheerDay } from '@mobile/screens/redesign/quickAddCheer';
import type { AccountDatabase } from '@mobile/storage/accountDatabase';
import { createDeviceAccountDatabase } from '@mobile/storage/deviceDiary';
import { createDeviceSync } from '@mobile/sync/deviceSync';
import { createDiarySessionResolver } from './diarySession';
import { eraseDeviceImportDraft } from './deviceImportDraftStore';
import { createKnownAccount } from './knownAccount';
import { V1_COMMAND_SCHEMA } from './resources';
import { SpendDiaryProvider } from './SpendDiaryContext';
import { createSpendDiary } from './spendDiary';
import type { SpendDiary } from './spendDiary';

// One database for the app's lifetime: a remount never opens a second
// connection to a diary file another mount is still closing.
let sharedDatabase: AccountDatabase | null = null;
const deviceDatabase = () => (sharedDatabase ??= createDeviceAccountDatabase());

const KNOWN_ACCOUNT_KEY = 'gogospend.v1.known-account';
const secretOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const knownAccount = createKnownAccount(
  {
    get: () => SecureStore.getItemAsync(KNOWN_ACCOUNT_KEY, secretOptions),
    set: (value) => SecureStore.setItemAsync(KNOWN_ACCOUNT_KEY, value, secretOptions),
    remove: () => SecureStore.deleteItemAsync(KNOWN_ACCOUNT_KEY, secretOptions),
  },
  (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
);

/**
 * The explicit sign-out erase, with the diary: this account's import draft,
 * and the bun's device settings (its intensity and the day the Quick add
 * cheer last showed), so the next person starts from the defaults. A setting
 * that cannot be erased never stops the diary's erase. Exported for its test.
 */
export async function eraseWithDiary(accountId: string): Promise<void> {
  await eraseDeviceImportDraft(accountId);
  await Promise.all([eraseStoredBunIntensity().catch(() => undefined), eraseCheerDay()]);
}

function createDeviceDiary(): { diary: SpendDiary; refresh: () => Promise<void>; dispose: () => Promise<void> } {
  const database = deviceDatabase();
  const resolver = createDiarySessionResolver({
    snapshot: getV1SessionSnapshot,
    fetchAccountId,
    known: knownAccount,
    sessionChanged: () => diary.sessionChanged(),
  });
  const diary = createSpendDiary({
    open: (accountId, epoch) => database.open(accountId, epoch),
    discard: (accountId) => database.discard(accountId),
    eraseWithDiary: eraseWithDiary,
    session: resolver.current,
    now: () => Date.now(),
    newId: () => Crypto.randomUUID(),
    schemaVersion: V1_COMMAND_SCHEMA,
    makeSync: (store, session, report) => createDeviceSync(store, session, report),
  });
  return {
    diary,
    refresh: resolver.refresh,
    async dispose() {
      resolver.dispose();
      await diary.close();
    },
  };
}

export function DeviceDiaryProvider({ children }: { children: ReactNode }) {
  const [device] = useState(() => (Platform.OS === 'ios' || Platform.OS === 'android' ? createDeviceDiary() : null));
  useEffect(() => {
    if (!device) return undefined;
    void device.refresh().then(() => {
      // Launched without coming to the foreground (e.g. a background start): no timer.
      if (AppState.currentState !== 'active') device.diary.background();
    });
    const unsubscribe = subscribeSession(() => void device.refresh());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Re-check the session (an offline launch verifies its account now), then sync.
        void device.refresh().then(() => device.diary.foreground());
      } else device.diary.background();
    });
    return () => {
      unsubscribe();
      appState.remove();
      void device.dispose();
    };
  }, [device]);
  return <SpendDiaryProvider diary={device?.diary ?? null}>{children}</SpendDiaryProvider>;
}
