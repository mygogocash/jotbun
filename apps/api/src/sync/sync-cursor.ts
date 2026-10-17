import { createHash } from 'node:crypto';

import { ContractValidationError } from '@gogospend/contracts';
import type { Revision } from '@gogospend/contracts';

const REVISION = /^(0|[1-9][0-9]{0,18})$/;

/** A short, one-way tag of the account, so a cursor only continues its own account's stream. */
const accountTag = (accountId: string) => createHash('sha256').update(`gogospend.sync-cursor.v1\u0000${accountId}`).digest('base64url').slice(0, 16);

const invalid = () => new ContractValidationError('VALIDATION_FAILED', 'The cursor is malformed or belongs to another account.', 'cursor');

/**
 * Opaque delta cursor: the last fully included group revision, bound to the
 * account. It grants nothing (changes are still read under the owner's RLS);
 * the binding only turns a cursor from another account into a clear error
 * instead of a silently wrong stream.
 */
export function encodeSyncCursor(accountId: string, revision: Revision): string {
  if (!REVISION.test(revision)) throw new RangeError('a revision is a nonnegative decimal');
  return Buffer.from(JSON.stringify({ v: 1, a: accountTag(accountId), r: revision })).toString('base64url');
}

export function decodeSyncCursor(accountId: string, cursor: string): Revision {
  let value: { v?: unknown; a?: unknown; r?: unknown };
  try {
    if (typeof cursor !== 'string' || cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof value;
  } catch {
    throw invalid();
  }
  if (value?.v !== 1 || value.a !== accountTag(accountId) || typeof value.r !== 'string' || !REVISION.test(value.r) || BigInt(value.r) > 9_223_372_036_854_775_807n) throw invalid();
  return value.r;
}
