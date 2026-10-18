// The session's SecureStore items (F5): the application binding with its
// account, and the installation epoch's high-water mark. Both are readable
// only on this device while unlocked (`thisDeviceOnly`, e.g.
// WHEN_UNLOCKED_THIS_DEVICE_ONLY): never backed up or restored elsewhere, and
// never in the diary.
import { isUuid } from '@gogospend/contracts';

import type { SecureStorePort } from '../storage/keyStore.ts';
import { SESSION_BINDING } from './authApi.ts';
import type { BindingStore, EpochStore } from './credentialProvider.ts';

const BINDING_ITEM = 'gogospend.v1.session-binding';
const EPOCH_ITEM = 'gogospend.v1.session-epoch';

type StoredBinding = { accountId: string; binding: string };

const valid = (value: unknown): value is StoredBinding =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === 'accountId,binding' &&
  isUuid((value as StoredBinding).accountId) &&
  typeof (value as StoredBinding).binding === 'string' &&
  SESSION_BINDING.test((value as StoredBinding).binding);

/** A malformed stored value reads as nothing stored (signed out); a malformed value is never saved. */
export function createSecureBindingStore(secure: SecureStorePort, thisDeviceOnly: number): BindingStore {
  const options = { keychainAccessible: thisDeviceOnly };
  return {
    async load() {
      const text = await secure.getItemAsync(BINDING_ITEM, options);
      if (text === null) return null;
      try {
        const value: unknown = JSON.parse(text);
        return valid(value) ? { accountId: value.accountId, binding: value.binding } : null;
      } catch {
        return null;
      }
    },
    async save(value) {
      const stored = { accountId: value.accountId, binding: value.binding };
      if (!valid(stored)) throw new RangeError('Not an account binding.');
      await secure.setItemAsync(BINDING_ITEM, JSON.stringify(stored), options);
    },
    async clear() {
      await secure.deleteItemAsync(BINDING_ITEM, options);
    },
  };
}

/** The epoch's durable high-water mark; an unreadable value is 0. */
export function createSecureEpochStore(secure: SecureStorePort, thisDeviceOnly: number): EpochStore {
  const options = { keychainAccessible: thisDeviceOnly };
  return {
    async load() {
      const text = await secure.getItemAsync(EPOCH_ITEM, options);
      const value = text !== null && /^\d{1,15}$/.test(text) ? Number(text) : 0;
      return Number.isSafeInteger(value) ? value : 0;
    },
    async save(epoch) {
      if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RangeError('Not an epoch.');
      await secure.setItemAsync(EPOCH_ITEM, String(epoch), options);
    },
  };
}
