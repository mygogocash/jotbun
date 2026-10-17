import { isUuid } from '@gogospend/contracts';

import { MalformedDiaryKey } from './types.ts';
import type { KeyStore } from './types.ts';

/** The subset of expo-secure-store the key store needs. */
export type SecureStorePort = {
  getItemAsync(key: string, options: { keychainAccessible: number }): Promise<string | null>;
  setItemAsync(key: string, value: string, options: { keychainAccessible: number }): Promise<void>;
  deleteItemAsync(key: string, options: { keychainAccessible: number }): Promise<void>;
};

const KEY = /^[0-9a-f]{64}$/;

function itemName(accountId: string): string {
  if (!isUuid(accountId)) throw new RangeError('a diary key belongs to an account id');
  return `gogospend.diary.v1.${accountId}`;
}

/**
 * One random 256-bit SQLCipher key per account in SecureStore, readable only
 * on this device while unlocked (`thisDeviceOnly`, e.g.
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY): never restored to another device. An
 * existing key is never overwritten, and a malformed stored value is an
 * error (MalformedDiaryKey), never a key.
 */
export function createSecureKeyStore(secure: SecureStorePort, random: (bytes: number) => Uint8Array, thisDeviceOnly: number): KeyStore {
  const options = { keychainAccessible: thisDeviceOnly };
  return {
    async get(accountId) {
      const value = await secure.getItemAsync(itemName(accountId), options);
      if (value === null) return null;
      if (!KEY.test(value)) throw new MalformedDiaryKey();
      return value;
    },
    async create(accountId) {
      const name = itemName(accountId);
      // Overwriting would make an existing diary unreadable.
      if ((await secure.getItemAsync(name, options)) !== null) throw new Error('This account already has a diary key.');
      const bytes = random(32);
      if (bytes.length !== 32) throw new Error('The random source returned the wrong length.');
      const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      await secure.setItemAsync(name, key, options);
      return key;
    },
    async delete(accountId) {
      await secure.deleteItemAsync(itemName(accountId), options);
    },
  };
}
