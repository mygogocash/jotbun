import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { normalizeCommand } from '@gogospend/contracts';
import type { CommandInput } from '@gogospend/contracts';

export type DigestKey = { id: string; secret: Buffer };
export type StoredDigest = { keyId: string; digest: Buffer };

/**
 * The text a receipt digest covers: the canonical command (kind, schema
 * version, normalized payload - which names the target entity id) and the
 * expected version, bound to the account and command id. Null when the schema
 * version is missing or malformed: such a request can neither replay a
 * receipt nor be accepted.
 */
export function canonicalCommandText(accountId: string, input: CommandInput<unknown>): string | null {
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) return null;
  const { canonicalJson } = normalizeCommand(input.kind, input.schemaVersion, input.payload);
  const expected = input.expectedVersion === undefined ? '' : String(input.expectedVersion);
  return ['gogospend.command.v1', accountId, input.commandId, canonicalJson, expected].join('\u0000');
}

const keyIdOf = (secret: Buffer) => `k${createHash('sha256').update(secret).digest('hex').slice(0, 12)}`;

/**
 * Receipt digests are HMAC-SHA256 under a server key, so a receipt row (which
 * outlives purged entities) cannot be used to confirm a guessed amount, date
 * or category. Each receipt records its key id; rotated-out keys stay in
 * `previous` for at least the 30-day outbox lifetime so replays still verify.
 * A receipt whose key is gone no longer matches (409 IDEMPOTENCY_MISMATCH).
 */
export class CommandDigester {
  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly current: DigestKey, previous: readonly DigestKey[] = []) {
    for (const key of [current, ...previous]) this.keys.set(key.id, key.secret);
  }

  digest(accountId: string, input: CommandInput<unknown>): StoredDigest | null {
    const text = canonicalCommandText(accountId, input);
    return text === null ? null : { keyId: this.current.id, digest: createHmac('sha256', this.current.secret).update(text).digest() };
  }

  matches(accountId: string, input: CommandInput<unknown>, stored: StoredDigest): boolean {
    const secret = this.keys.get(stored.keyId);
    const text = canonicalCommandText(accountId, input);
    if (!secret || text === null || stored.digest.length !== 32) return false;
    return timingSafeEqual(createHmac('sha256', secret).update(text).digest(), stored.digest);
  }
}

function digestKey(secret: string, name: string): DigestKey {
  if (secret.length < 32) throw new Error(`${name} keys must be at least 32 characters.`);
  const bytes = Buffer.from(secret, 'utf8');
  return { id: keyIdOf(bytes), secret: bytes };
}

/**
 * COMMAND_DIGEST_KEY (required, at least 32 random characters) signs new
 * receipts; COMMAND_DIGEST_PREVIOUS_KEYS (comma-separated) still verifies
 * replays after a rotation. Rotate by moving the old key into PREVIOUS and
 * keep it there for at least 30 days.
 */
export function commandDigesterFromEnv(env: NodeJS.ProcessEnv): CommandDigester {
  const current = env.COMMAND_DIGEST_KEY ?? '';
  if (current.length < 32) throw new Error('COMMAND_DIGEST_KEY must be at least 32 characters.');
  const previous = (env.COMMAND_DIGEST_PREVIOUS_KEYS ?? '').split(',').map((key) => key.trim()).filter(Boolean);
  return new CommandDigester(digestKey(current, 'COMMAND_DIGEST_KEY'), previous.map((key) => digestKey(key, 'COMMAND_DIGEST_PREVIOUS_KEYS')));
}

/** A fixed synthetic key for tests only. */
export const TEST_DIGEST_KEY: DigestKey = { id: 'test1', secret: Buffer.from('synthetic-command-digest-key-0123456789abcdef', 'utf8') };
