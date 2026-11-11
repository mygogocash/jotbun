// The slip reference the phone sends (P4-T12; §6.8 step 4, A25, B12, S16):
// the vault's salt, kept per account in SecureStore on this device only and
// readable only while it is unlocked, and the salted SHA-256 of a slip QR's
// normalized reference. Only the hash leaves the phone. A reference that
// cannot be normalized gives no hash, and its photo stays on the phone. The
// QR check itself is P3's slipQrIn (A13). Default pending owner Q5 (B12).
// expo-secure-store and expo-crypto load only when used (src/lib/haptics.ts's
// pattern), so Node loads this module.
import { normalizeSlipRef, slipRefHash } from '@gogospend/contracts';
import type { SlipSaltDto } from '@gogospend/contracts';

import type { SlipQr } from './slipQr.ts';
import type { SlipResources } from './slipResources.ts';

type SecureStoreModule = typeof import('expo-secure-store');
type CryptoModule = typeof import('expo-crypto');

export type SaltStore = {
  /** null when this account keeps no salt here; rejects when the keychain cannot be read (a locked phone, P4-T15). */
  read(accountId: string): Promise<Uint8Array | null>;
  write(accountId: string, salt: Uint8Array): Promise<void>;
  forget(accountId: string): Promise<void>;
};

export const SALT_KEY_PREFIX = 'jotbun.slip-salt.';

/** A kept salt: its 32 bytes as 64 lowercase hex digits. */
const HEX_SALT = /^[0-9a-f]{64}$/;
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

const loadSecureStore = async (): Promise<SecureStoreModule> => import('expo-secure-store');

/**
 * Each account's salt under `jotbun.slip-salt.<account id>`, readable only
 * while this device is unlocked and never restored to another device (B12,
 * S16); in `accessGroup` when one is given (P6A's share extension). A kept
 * value that is not 32 bytes reads as no salt, so the hasher fetches the
 * vault's again (it never changes).
 */
export function secureSaltStore(options: { accessGroup?: string; loadModule?: () => Promise<SecureStoreModule> } = {}): SaltStore {
  const load = options.loadModule ?? loadSecureStore;
  const open = async () => {
    const store = await load();
    const secret = { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY, ...(options.accessGroup === undefined ? {} : { accessGroup: options.accessGroup }) };
    return { store, secret };
  };
  return {
    async read(accountId) {
      const { store, secret } = await open();
      const text = await store.getItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);
      return text !== null && HEX_SALT.test(text) ? fromHex(text) : null;
    },
    async write(accountId, salt) {
      const { store, secret } = await open();
      await store.setItemAsync(`${SALT_KEY_PREFIX}${accountId}`, toHex(salt), secret);
    },
    async forget(accountId) {
      const { store, secret } = await open();
      await store.deleteItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);
    },
  };
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

const loadCrypto = async (): Promise<CryptoModule> => import('expo-crypto');

/**
 * SHA-256 through expo-crypto's digest: the app runs on Hermes, which has no
 * Web Crypto. The input goes as a copy on its own ArrayBuffer, the
 * BufferSource digest takes (a Uint8Array may view a shared buffer).
 */
export function expoSha256(loadModule: () => Promise<CryptoModule> = loadCrypto): Sha256 {
  return async (data) => {
    const expoCrypto = await loadModule();
    return new Uint8Array(await expoCrypto.digest(expoCrypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data)));
  };
}

export type SlipHasher = (slip: SlipQr) => Promise<string | null>;

/** The vault's 32 salt bytes, sent as base64url without padding (isSlipSaltDto). */
function saltBytes(dto: SlipSaltDto): Uint8Array {
  const base64 = dto.salt.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

/**
 * Hashes a slip QR's reference with this account's salt: the kept salt, else
 * the vault's, fetched once, kept and held in memory. A salt that could not
 * be read, fetched or kept is asked for again with the next slip. A reference
 * that cannot be normalized gives null and asks for no salt.
 */
export function createSlipHasher(deps: { accountId: string; store: SaltStore; resources: Pick<SlipResources, 'salt'>; sha256: Sha256 }): SlipHasher {
  let salt: Promise<Uint8Array> | null = null;
  const load = async (): Promise<Uint8Array> => {
    const kept = await deps.store.read(deps.accountId);
    if (kept !== null) return kept;
    const fetched = saltBytes(await deps.resources.salt());
    await deps.store.write(deps.accountId, fetched);
    return fetched;
  };
  return async (slip) => {
    const normalized = normalizeSlipRef(slip.bankCode, slip.reference);
    if (normalized === null) return null;
    const pending = (salt ??= load().catch((error: unknown) => {
      salt = null;
      throw error;
    }));
    return slipRefHash(await pending, normalized, deps.sha256);
  };
}
