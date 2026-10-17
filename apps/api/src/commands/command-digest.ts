import { createHash } from 'node:crypto';

import { normalizeCommand } from '@gogospend/contracts';
import type { CommandInput } from '@gogospend/contracts';

/**
 * The receipt's request digest: sha256 over the canonical command (kind,
 * schema version, normalized payload) plus the expected version, salted with
 * the account and command ids so equal payloads never share a digest across
 * commands. Receipts keep only this digest, never the payload. Null when the
 * schema version is missing or malformed: such a request can neither replay
 * a receipt nor be accepted.
 */
export function commandDigest(accountId: string, input: CommandInput<unknown>): Buffer | null {
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) return null;
  const { canonicalJson } = normalizeCommand(input.kind, input.schemaVersion, input.payload);
  const expected = input.expectedVersion === undefined ? '' : String(input.expectedVersion);
  return createHash('sha256').update(['gogospend.command.v1', accountId, input.commandId, canonicalJson, expected].join('\u0000')).digest();
}
