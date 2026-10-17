import { createHash } from 'node:crypto';

import { ContractValidationError } from '@gogospend/contracts';
import type { Revision } from '@gogospend/contracts';

const REVISION = /^(0|[1-9][0-9]{0,18})$/;

/** A short, one-way tag of the account, so a cursor only continues its own account's stream. */
const accountTag = (accountId: string) => createHash('sha256').update(`gogospend.sync-cursor.v1\u0000${accountId}`).digest('base64url').slice(0, 16);

const invalid = () => new ContractValidationError('VALIDATION_FAILED', 'The cursor is malformed or belongs to another account.', 'cursor');

export type SyncPosition = { revision: Revision; generation: number };

/**
 * Opaque delta cursor: the last fully included group revision and the
 * account's lifecycle generation, bound to the account. It grants nothing
 * (changes are still read under the owner's RLS); the binding only turns a
 * cursor from another account into a clear error instead of a silently wrong
 * stream, and the generation sends a cursor from before a lifecycle change to
 * a resync.
 */
export function encodeSyncCursor(accountId: string, revision: Revision, generation = 0): string {
  if (!REVISION.test(revision)) throw new RangeError('a revision is a nonnegative decimal');
  if (!Number.isInteger(generation) || generation < 0) throw new RangeError('a generation is a nonnegative integer');
  return Buffer.from(JSON.stringify({ v: 1, a: accountTag(accountId), g: generation, r: revision })).toString('base64url');
}

export function decodeSyncPosition(accountId: string, cursor: string): SyncPosition {
  let value: { v?: unknown; a?: unknown; g?: unknown; r?: unknown };
  try {
    if (typeof cursor !== 'string' || cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof value;
  } catch {
    throw invalid();
  }
  if (
    value?.v !== 1 || value.a !== accountTag(accountId) || !Number.isInteger(value.g) || (value.g as number) < 0 ||
    typeof value.r !== 'string' || !REVISION.test(value.r) || BigInt(value.r) > 9_223_372_036_854_775_807n
  ) {
    throw invalid();
  }
  return { revision: value.r, generation: value.g as number };
}

export function decodeSyncCursor(accountId: string, cursor: string): Revision {
  return decodeSyncPosition(accountId, cursor).revision;
}
