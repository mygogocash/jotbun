// Binds the import draft store to the device's AsyncStorage (the daily
// reminder's pattern). The review screen is not routed yet; nothing mounts
// this until E2 approves the screen and the at-rest caveat in importDraftStore.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStorageDraftStore, eraseImportDrafts } from './importDraftStore.ts';
import type { DraftStorage } from './importDraftStore.ts';
import type { ImportDraftStore } from './importReview.ts';

const storage: DraftStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
};

/** This account's import draft, kept on the device across restarts. */
export const createDeviceImportDraftStore = (accountId: string): ImportDraftStore => createStorageDraftStore(storage, accountId);

/** The explicit sign-out erase: this account's draft leaves the device with its diary. */
export const eraseDeviceImportDraft = (accountId: string): Promise<void> => eraseImportDrafts(storage, accountId);
