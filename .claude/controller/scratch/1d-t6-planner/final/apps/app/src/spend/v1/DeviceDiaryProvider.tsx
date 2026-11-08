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

import { eraseStoredConsent } from '@mobile/analytics/consentStorage';
import { fetchAccountId } from '@mobile/api/sharedV1';
import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import { eraseStoredBunIntensity } from '@mobile/mascot/bunIntensityStorage';
import { forgetKeptHistory } from '@mobile/screens/redesign/historyKeep';
import { eraseCheerDay } from '@mobile/screens/redesign/quickAddCheer';
import { eraseCelebratedWeek } from '@mobile/screens/redesign/insights/celebrationWeek';
import { eraseCashbackDeclined } from '@mobile/screens/redesign/insights/cashbackDecline';
import { eraseStoredHapticPreference } from '@mobile/lib/hapticPreferenceStorage';
import type { AccountDatabase } from '@mobile/storage/accountDatabase';
import { createDeviceAccountDatabase } from '@mobile/storage/deviceDiary';
import { createDeviceSync } from '@mobile/sync/deviceSync';
import { eraseDeviceSettings } from '@mobile/wallet/store/deviceWalletStore';
import { createDiarySessionResolver } from './diarySession';
import { eraseAllLegacyImportDrafts, eraseLegacyImportDraft } from './deviceImportDraftStore';
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
 * The explicit sign-out erase, with the diary (which takes its own import
 * draft): a plain-text import draft an older build left for this account, the
 * bun's device settings (its intensity and the day the Quick add cheer last
 * showed), History's view kept while a record is open (memory only), and the
 * wallet's device settings, and this phone's analytics answer (1D-T6), so the
 * next person starts from the defaults. An
 * account's looks stay. A setting that cannot be erased never stops the
 * diary's erase. Exported for its test.
 */
export async function eraseWithDiary(accountId: string): Promise<void> {
  forgetKeptHistory();
  await eraseLegacyImportDraft(accountId);
  await Promise.all([eraseStoredBunIntensity().catch(() => undefined), eraseStoredHapticPreference().catch(() => undefined), eraseCheerDay(), eraseCelebratedWeek(), eraseCashbackDeclined(), eraseStoredConsent().catch(() => undefined)]);
  await eraseDeviceSettings().catch(() => undefined);
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
    // Every account's leftover, not just this one's: no plain-text draft outlives the first diary draft.
    eraseLegacyImportDraft: () => eraseAllLegacyImportDrafts(),
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

type DeviceDiary = ReturnType<typeof createDeviceDiary>;

/** Syncs on launch, foreground, session change; stops on background. Returns the detach. */
function attach(device: DeviceDiary): () => void {
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
  };
}

// One device diary for the app. The spend and Settings route groups are
// mounted together whenever Settings sits on top of a spend screen; two
// diaries over the one database would each sync it, and the first to unmount
// would lock the store the other still used. Each provider takes a share; the
// diary closes a tick after the last share goes, so a provider that unmounts
// and one that mounts in the same commit keep the same diary.
let shared: { device: DeviceDiary; users: number; detach: (() => void) | null } | null = null;

function sharedDeviceDiary(): DeviceDiary {
  shared ??= { device: createDeviceDiary(), users: 0, detach: null };
  return shared.device;
}

/** Takes a share of `device`; null when it was already closed (ask for the current one). */
function retain(device: DeviceDiary): (() => void) | null {
  const entry = shared;
  if (!entry || entry.device !== device) return null;
  entry.users += 1;
  entry.detach ??= attach(device);
  return () => {
    entry.users -= 1;
    if (entry.users > 0) return;
    setTimeout(() => {
      if (entry.users > 0) return;
      if (shared === entry) shared = null;
      entry.detach?.();
      entry.detach = null;
      void device.dispose();
    }, 0);
  };
}

export function DeviceDiaryProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState(() => (Platform.OS === 'ios' || Platform.OS === 'android' ? sharedDeviceDiary() : null));
  useEffect(() => {
    if (!device) return undefined;
    const release = retain(device);
    if (!release) {
      setDevice(sharedDeviceDiary());
      return undefined;
    }
    return release;
  }, [device]);
  return <SpendDiaryProvider diary={device?.diary ?? null}>{children}</SpendDiaryProvider>;
}
