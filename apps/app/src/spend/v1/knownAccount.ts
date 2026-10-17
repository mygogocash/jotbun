import { isUuid } from '@gogospend/contracts';

// The last account id the server verified for one v1 binding, kept on the
// device so a launch without a connection can still open that account's
// diary. Keyed by a hash of the binding: a new binding (a new identity, even
// with the same email) never recalls another identity's account.

export interface SecretSlot {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface KnownAccount {
  /** Records the account `/v1/me` verified for this binding. */
  remember(binding: string, accountId: string): Promise<void>;
  /** The account verified earlier for exactly this binding, or null. */
  recall(binding: string): Promise<string | null>;
  forget(): Promise<void>;
}

type Stored = { v: 1; binding: string; accountId: string };

function parse(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored>;
    return value.v === 1 && typeof value.binding === 'string' && typeof value.accountId === 'string' && isUuid(value.accountId) ? (value as Stored) : null;
  } catch {
    return null;
  }
}

export function createKnownAccount(slot: SecretSlot, sha256Hex: (text: string) => Promise<string>): KnownAccount {
  return {
    async remember(binding, accountId) {
      if (!isUuid(accountId)) throw new RangeError('An account id is a UUID.');
      const stored: Stored = { v: 1, binding: await sha256Hex(binding), accountId };
      await slot.set(JSON.stringify(stored));
    },
    async recall(binding) {
      const stored = parse(await slot.get());
      if (!stored) return null;
      return stored.binding === (await sha256Hex(binding)) ? stored.accountId : null;
    },
    forget: () => slot.remove(),
  };
}
