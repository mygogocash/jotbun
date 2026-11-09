// Legacy only. Builds before decision 7 (19 October 2026) kept the import
// review draft in plain AsyncStorage; it now lives in the encrypted diary
// (importDraftStore.ts). This binding is kept only to erase such a leftover:
// before the diary draft's first use, and at the explicit sign-out erase.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { eraseImportDrafts } from './importDraftStore.ts';
import type { DraftStorage } from './importDraftStore.ts';

// Removal only: nothing reads or writes a draft here any more.
const storage: Pick<DraftStorage, 'removeItem' | 'getAllKeys'> = {
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
};

/** Removes the plain-text import draft an older build kept for this account (the sign-out erase). */
export const eraseLegacyImportDraft = (accountId: string): Promise<void> => eraseImportDrafts(storage, accountId);

/** Removes every account's plain-text import draft, before a diary draft's first use: none outlives it on this device. */
export const eraseAllLegacyImportDrafts = (): Promise<void> => eraseImportDrafts(storage);
