// An in-memory KeyStore for tests. Test use only.
import { randomBytes } from 'node:crypto';

import type { KeyStore } from '../types.ts';

export function createMemoryKeyStore(): KeyStore & { keys: Map<string, string> } {
  const keys = new Map<string, string>();
  return {
    keys,
    async get(accountId) {
      return keys.get(accountId) ?? null;
    },
    async create(accountId) {
      const key = randomBytes(32).toString('hex');
      keys.set(accountId, key);
      return key;
    },
    async delete(accountId) {
      keys.delete(accountId);
    },
  };
}
