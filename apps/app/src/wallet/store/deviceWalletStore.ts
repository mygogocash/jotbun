// AsyncStorage 2.2.0 under the two wallet scopes. Tests install a memory backend.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { accountStore, deviceStore } from './walletStore.ts';
import type { KeyValueStore, StoreBackend } from './walletStore.ts';

let installed: StoreBackend | null = null;

const asyncStorage: StoreBackend = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
  multiRemove: (keys) => AsyncStorage.multiRemove(keys),
};

function backend(): StoreBackend {
  return installed ?? asyncStorage;
}

/** Tests only. Pass null to use AsyncStorage again. */
export function installStoreBackend(next: StoreBackend | null): void {
  installed = next;
}

export function walletDeviceStore(): KeyValueStore {
  return deviceStore(backend());
}

export function walletAccountStore(accountId: string): KeyValueStore {
  return accountStore(backend(), accountId);
}

/** The sign-out erase. Account-kept looks stay. */
export function eraseDeviceSettings(): Promise<void> {
  return walletDeviceStore().eraseAll();
}

/** After a confirmed account deletion. */
export function eraseAccountKept(accountId: string): Promise<void> {
  return walletAccountStore(accountId).eraseAll();
}
