// Two scopes over one key-value backend (R64). Device settings use
// `jotbun.wallet.<name>` and leave at sign-out. An account's looks, icons and
// order use `jotbun.account.<accountId>.<name>` and leave only with that account.

export const DEVICE_PREFIX = 'jotbun.wallet.';

export const ACCOUNT_PREFIX = 'jotbun.account.';

export type StoreBackend = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
};

export type KeyValueStore = {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
  eraseAll(): Promise<void>;
};

function named(backend: StoreBackend, prefix: string): Pick<KeyValueStore, 'get' | 'set' | 'remove'> {
  return {
    get: (name) => backend.getItem(prefix + name),
    set: (name, value) => backend.setItem(prefix + name, value),
    remove: (name) => backend.removeItem(prefix + name),
  };
}

/** Removes every key that starts with `prefix`, and nothing else. */
async function erasePrefixed(backend: StoreBackend, prefix: string): Promise<void> {
  const keys = (await backend.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (keys.length > 0) await backend.multiRemove(keys);
}

/** Device settings: `jotbun.wallet.<name>`. */
export function deviceStore(backend: StoreBackend): KeyValueStore {
  return { ...named(backend, DEVICE_PREFIX), eraseAll: () => erasePrefixed(backend, DEVICE_PREFIX) };
}

/** This account's kept data: `jotbun.account.<accountId>.<name>`. `eraseAll` removes only that account. */
export function accountStore(backend: StoreBackend, accountId: string): KeyValueStore {
  const prefix = `${ACCOUNT_PREFIX}${accountId}.`;
  return { ...named(backend, prefix), eraseAll: () => erasePrefixed(backend, prefix) };
}
