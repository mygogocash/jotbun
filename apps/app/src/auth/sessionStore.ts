// The session's SecureStore items: the Better Auth session record, and the
// installation epoch's high-water mark. Both are readable only on this device
// while unlocked. The old Auth0 binding item is removed the first time the
// record is loaded.
import { isUuid } from '@gogospend/contracts';

import type { SecureStorePort } from '../storage/keyStore.ts';
import type { SignInMethod } from './betterAuthPort.ts';
import type { EpochStore } from './credentialProvider.ts';

export type StoredSession = { accountId: string; sessionId: string; email: string; method: SignInMethod };

export interface SessionRecordStore {
  load(): Promise<StoredSession | null>;
  save(value: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

const SESSION_ITEM = 'jotbun.v1.session';
const OLD_BINDING_ITEM = 'gogospend.v1.session-binding';
const EPOCH_ITEM = 'gogospend.v1.session-epoch';

function isMethod(value: unknown): value is SignInMethod {
  return value === 'apple' || value === 'google' || value === 'email';
}

function field(value: object, key: string): unknown {
  for (const [name, item] of Object.entries(value)) if (name === key) return item;
  return undefined;
}

/** A record with exactly the four session fields, or null when it is not one. */
function storedSession(value: unknown): StoredSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join(',') !== 'accountId,email,method,sessionId') return null;
  const accountId = field(value, 'accountId');
  const sessionId = field(value, 'sessionId');
  const email = field(value, 'email');
  const method = field(value, 'method');
  if (!isUuid(accountId)) return null;
  if (!isUuid(sessionId)) return null;
  if (typeof email !== 'string' || email.length === 0 || email.length > 320) return null;
  if (!isMethod(method)) return null;
  return { accountId, sessionId, email, method };
}

export function createSecureSessionStore(secure: SecureStorePort, thisDeviceOnly: number): SessionRecordStore {
  const options = { keychainAccessible: thisDeviceOnly };
  let oldItemRemoved = false;
  return {
    async load() {
      if (!oldItemRemoved) {
        oldItemRemoved = true;
        await secure.deleteItemAsync(OLD_BINDING_ITEM, options).catch(() => undefined);
      }
      const text = await secure.getItemAsync(SESSION_ITEM, options);
      if (text === null) return null;
      try {
        return storedSession(JSON.parse(text));
      } catch {
        return null;
      }
    },
    async save(value) {
      const stored = storedSession(value);
      if (!stored) throw new RangeError('Not a session record.');
      await secure.setItemAsync(SESSION_ITEM, JSON.stringify(stored), options);
    },
    async clear() {
      await secure.deleteItemAsync(SESSION_ITEM, options);
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
