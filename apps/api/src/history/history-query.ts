import {
  ContractValidationError,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  HISTORY_QUERY_MAX_CHARS,
  HISTORY_SORTS,
  TRANSACTION_TYPES,
  assertKnownFields,
  isUuid,
  validateOccurredOn,
} from '@gogospend/contracts';
import type { HistoryFilter, HistoryPage, HistorySort, TransactionType } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';
import { RECORD_COLUMNS, toDto } from '../transactions/transactions.repository';
import type { RecordRow } from '../transactions/transactions.repository';
import { decodeCursor, encodeCursor } from './cursor';
import { accountRevision, scopedTotals } from './totals';

const QUERY_KEYS = ['from', 'through', 'wallet_id', 'category_id', 'type', 'query', 'sort', 'limit', 'cursor'];
// Any real Gregorian date from 1970; `through` may be in the future.
const date = (value: unknown, field: string) => validateOccurredOn(value, '1970-01-01', '9999-12-31', field);
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

function single(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ContractValidationError('VALIDATION_FAILED', 'Repeated or structured parameter.', field);
  return value;
}

/** Validates GET /v1/history query parameters into a filter, cursor and limit. */
export function parseHistoryRequest(query: Record<string, unknown>): { filter: HistoryFilter; cursor?: string; limit: number } {
  const input = assertKnownFields({ ...query }, QUERY_KEYS);
  const from = date(single(input.from, 'from'), 'from');
  const through = date(single(input.through, 'through'), 'through');
  if (through < from) throw new ContractValidationError('VALIDATION_FAILED', 'through must not be before from.', 'through');
  const filter: HistoryFilter = { from, through, sort: 'date_desc' };
  for (const field of ['wallet_id', 'category_id'] as const) {
    const value = single(input[field], field);
    if (value !== undefined) {
      if (!isUuid(value)) throw new ContractValidationError('VALIDATION_FAILED', `${field} must be a lower-case UUID.`, field);
      filter[field] = value;
    }
  }
  const type = single(input.type, 'type');
  if (type !== undefined) {
    if (!TRANSACTION_TYPES.includes(type as TransactionType)) throw new ContractValidationError('VALIDATION_FAILED', 'Unknown type.', 'type');
    filter.type = type as TransactionType;
  }
  const text = single(input.query, 'query')?.normalize('NFC').trim();
  if (text) {
    if ([...text].length > HISTORY_QUERY_MAX_CHARS || CONTROL.test(text)) {
      throw new ContractValidationError('VALIDATION_FAILED', `Search text is at most ${HISTORY_QUERY_MAX_CHARS} characters.`, 'query');
    }
    filter.query = text;
  }
  const sort = single(input.sort, 'sort');
  if (sort !== undefined) {
    if (!HISTORY_SORTS.includes(sort as HistorySort)) throw new ContractValidationError('VALIDATION_FAILED', 'Unknown sort.', 'sort');
    filter.sort = sort as HistorySort;
  }
  const rawLimit = single(input.limit, 'limit');
  let limit = HISTORY_DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    limit = /^[1-9][0-9]{0,2}$/.test(rawLimit) ? Number(rawLimit) : 0;
    if (limit < 1 || limit > HISTORY_MAX_LIMIT) throw new ContractValidationError('VALIDATION_FAILED', `limit must be 1-${HISTORY_MAX_LIMIT}.`, 'limit');
  }
  return { filter, cursor: single(input.cursor, 'cursor'), limit };
}

/** The filter as SQL over alias `t`, with its parameters ($1–$6). */
function scopeOf(filter: HistoryFilter): { scope: string; params: unknown[] } {
  const pattern = filter.query === undefined ? null : `%${filter.query.replace(/[\\%_]/g, '\\$&')}%`;
  return {
    scope: `t.deleted_at IS NULL AND t.occurred_on BETWEEN $1::date AND $2::date
      AND ($3::uuid IS NULL OR t.wallet_id = $3 OR t.source_wallet_id = $3 OR t.destination_wallet_id = $3)
      AND ($4::uuid IS NULL OR t.category_id = $4)
      AND ($5::text IS NULL OR t.type = $5)
      AND ($6::text IS NULL OR t.note ILIKE $6 OR t.merchant ILIKE $6)`,
    params: [filter.from, filter.through, filter.wallet_id ?? null, filter.category_id ?? null, filter.type ?? null, pattern],
  };
}

/**
 * Keyset history on (occurred_on, id) in the requested order, plus totals
 * over the whole filter and the account revision - all from the caller's
 * snapshot transaction. Pages never split or drop rows of an unchanged
 * dataset; a cursor carries its first page's revision so later pages can
 * suggest a refresh when the account changed.
 */
export const HistoryQuery = {
  async list(tx: OwnerTx, filter: HistoryFilter, cursor?: string, limit = HISTORY_DEFAULT_LIMIT): Promise<HistoryPage> {
    const position = cursor === undefined ? null : decodeCursor(filter, cursor);
    const { scope, params } = scopeOf(filter);
    const descending = filter.sort === 'date_desc';
    const keyset = position ? `AND (t.occurred_on, t.id) ${descending ? '<' : '>'} ($7::date, $8::uuid)` : '';
    const order = descending ? 'DESC' : 'ASC';
    const rows = await tx.query<RecordRow>(
      `SELECT ${RECORD_COLUMNS}
         FROM transactions t WHERE ${scope} ${keyset}
        ORDER BY t.occurred_on ${order}, t.id ${order}
        LIMIT ${limit + 1}`,
      position ? [...params, position.occurredOn, position.id] : params,
    );
    const revision = await accountRevision(tx);
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const chainRevision = position?.revision ?? revision;
    return {
      items: items.map(toDto),
      next_cursor: rows.length > limit && last ? encodeCursor(filter, { occurredOn: last.occurred_on, id: last.id, revision: chainRevision }) : null,
      as_of_revision: revision,
      refresh_suggested: position !== null && position.revision !== revision,
      summary: await scopedTotals(tx, scope, params),
    };
  },
};
