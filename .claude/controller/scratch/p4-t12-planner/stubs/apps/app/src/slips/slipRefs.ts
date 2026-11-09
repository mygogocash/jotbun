// RED stub (P4-T12): the plan's interface, with no behaviour yet.
import type { SlipQr } from './slipQr.ts';
import type { SlipResources } from './slipResources.ts';

type SecureStoreModule = typeof import('expo-secure-store');
type CryptoModule = typeof import('expo-crypto');

export type SaltStore = {
  read(accountId: string): Promise<Uint8Array | null>;
  write(accountId: string, salt: Uint8Array): Promise<void>;
  forget(accountId: string): Promise<void>;
};

export const SALT_KEY_PREFIX = '';

export function secureSaltStore(_options: { accessGroup?: string; loadModule?: () => Promise<SecureStoreModule> } = {}): SaltStore {
  return { read: async () => null, write: async () => undefined, forget: async () => undefined };
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

export function expoSha256(_loadModule?: () => Promise<CryptoModule>): Sha256 {
  return async () => new Uint8Array();
}

export type SlipHasher = (slip: SlipQr) => Promise<string | null>;

export function createSlipHasher(_deps: { accountId: string; store: SaltStore; resources: Pick<SlipResources, 'salt'>; sha256: Sha256 }): SlipHasher {
  return async () => '';
}
