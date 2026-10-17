import { createHash } from 'node:crypto';

/**
 * A deterministic UUID (version 8, RFC 9562) from its parts, for ids the
 * server must derive the same way every time - e.g. an account's built-in
 * categories and the command that seeds them, so two devices seeding at once
 * replay one command instead of creating two sets.
 */
export function derivedUuid(...parts: string[]): string {
  const bytes = createHash('sha256').update(['gogospend.derived.v1', ...parts].join('\u0000')).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
