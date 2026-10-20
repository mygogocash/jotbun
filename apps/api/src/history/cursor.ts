import { createHash } from 'node:crypto';

import { ContractValidationError, isUuid, validateOccurredOn } from '@gogospend/contracts';
import type { HistoryFilter } from '@gogospend/contracts';

export type CursorPosition = { occurredOn: string; id: string; revision: string };

/** A short digest of the normalized filter, so a cursor only continues the listing it came from. */
function filterKey(filter: HistoryFilter): string {
  const canonical = JSON.stringify([filter.from, filter.through, filter.wallet_id ?? null, filter.category_id ?? null, filter.type ?? null, filter.query ?? null, filter.sort]);
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}

/**
 * Opaque keyset cursor: the last row's (occurred_on, id), the account
 * revision of the first page in the chain, and the filter it belongs to. It
 * grants nothing: rows are still read under the owner's RLS.
 */
export function encodeCursor(filter: HistoryFilter, position: CursorPosition): string {
  return Buffer.from(JSON.stringify({ v: 1, f: filterKey(filter), d: position.occurredOn, i: position.id, r: position.revision })).toString('base64url');
}

const invalid = (reason: string) => new ContractValidationError('VALIDATION_FAILED', reason, 'cursor');

export function decodeCursor(filter: HistoryFilter, cursor: string): CursorPosition {
  let value: { v?: unknown; f?: unknown; d?: unknown; i?: unknown; r?: unknown };
  try {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof value;
  } catch {
    throw invalid('The cursor is malformed.');
  }
  if (value?.v !== 1 || typeof value.d !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value.d) || !isUuid(value.i) || typeof value.r !== 'string' || !/^[0-9]{1,19}$/.test(value.r)) {
    throw invalid('The cursor is malformed.');
  }
  try {
    // A real Gregorian date, so a garbled or forged cursor is a 422, not a database error.
    validateOccurredOn(value.d, '0001-01-01', '9999-12-31', 'cursor');
  } catch {
    throw invalid('The cursor is malformed.');
  }
  if (value.f !== filterKey(filter)) throw invalid('The cursor belongs to a different filter or order.');
  return { occurredOn: value.d, id: value.i, revision: value.r };
}

/** "Recently deleted" keyset position: the last row's deletion instant (microseconds, UTC) and id, plus the chain's first revision. */
export type DeletedCursorPosition = { deletedAt: string; id: string; revision: string };

// PostgreSQL keeps microseconds; a JS Date only milliseconds, so the instant
// travels as the database's own text and is compared as timestamptz.
const DELETED_INSTANT = /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{6}Z$/;

/**
 * Opaque keyset cursor for GET /v1/history/deleted: the last row's
 * (deleted_at, id) and the first page's account revision. Its kind sets it
 * apart from a history cursor, so neither listing accepts the other's. Like
 * history's, it grants nothing: rows are still read under the owner's RLS.
 */
export function encodeDeletedCursor(position: DeletedCursorPosition): string {
  return Buffer.from(JSON.stringify({ v: 1, k: 'deleted', t: position.deletedAt, i: position.id, r: position.revision })).toString('base64url');
}

export function decodeDeletedCursor(cursor: string): DeletedCursorPosition {
  let value: { v?: unknown; k?: unknown; t?: unknown; i?: unknown; r?: unknown } | null;
  try {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as typeof value;
  } catch {
    throw invalid('The cursor is malformed.');
  }
  const instant = typeof value?.t === 'string' ? DELETED_INSTANT.exec(value.t) : null;
  if (value?.v !== 1 || value.k !== 'deleted' || !instant || !isUuid(value.i) || typeof value.r !== 'string' || !/^[0-9]{1,19}$/.test(value.r)) {
    throw invalid('The cursor is malformed.');
  }
  try {
    // A real Gregorian date, so a forged instant is a 422, not a database error.
    validateOccurredOn(instant[1], '0001-01-01', '9999-12-31', 'cursor');
  } catch {
    throw invalid('The cursor is malformed.');
  }
  return { deletedAt: value.t as string, id: value.i, revision: value.r };
}
