// This phone's analytics answer (plan 1D-T6): one value in the secure store on
// iOS and Android, readable only on this device while it is unlocked. The web
// keeps nothing. A read never throws, and anything that is not exactly a
// stored answer reads as none, because a failing read would stop a refresh
// before it reads the server's answer (1D-T1's notes).
import { Platform } from 'react-native';
import { isUuid } from '@gogospend/contracts';

import type { StoredConsent } from './controller';

export const ANALYTICS_CONSENT_KEY = 'gogospend.analytics-consent';

async function secureStore() {
  const store = await import('expo-secure-store');
  return { store, options: { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY } };
}

function storedConsent(text: string | null): StoredConsent | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join(',') !== 'accountId,answer,pendingServer') return null;
  const { accountId, answer, pendingServer } = value as Record<string, unknown>;
  if (!isUuid(accountId)) return null;
  if (answer !== 'yes' && answer !== 'no') return null;
  if (typeof pendingServer !== 'boolean') return null;
  return { accountId, answer, pendingServer };
}

export async function readStoredConsent(): Promise<StoredConsent | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { store, options } = await secureStore();
    return storedConsent(await store.getItemAsync(ANALYTICS_CONSENT_KEY, options));
  } catch {
    return null;
  }
}

export async function writeStoredConsent(value: StoredConsent): Promise<void> {
  if (Platform.OS === 'web') return;
  const { store, options } = await secureStore();
  const { accountId, answer, pendingServer } = value;
  await store.setItemAsync(ANALYTICS_CONSENT_KEY, JSON.stringify({ accountId, answer, pendingServer }), options);
}

/** Forgets the answer (the explicit sign-out erase, with the diary). */
export async function eraseStoredConsent(): Promise<void> {
  if (Platform.OS === 'web') return;
  const { store, options } = await secureStore();
  await store.deleteItemAsync(ANALYTICS_CONSENT_KEY, options);
}
