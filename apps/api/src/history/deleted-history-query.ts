import { HISTORY_DEFAULT_LIMIT, RESTORE_WINDOW_DAYS, assertKnownFields } from '@gogospend/contracts';
import type { DeletedHistoryPage, DeletedTransactionDto } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';
import { RECORD_COLUMNS, toDto } from '../transactions/transactions.repository';
import type { RecordRow } from '../transactions/transactions.repository';
import { decodeDeletedCursor, encodeDeletedCursor } from './cursor';
import { parseLimit, single } from './history-query';
import { accountRevision } from './totals';

const QUERY_KEYS = ['limit', 'cursor'];

/** Validates GET /v1/history/deleted query parameters: a page size and a cursor, nothing else. */
export function parseDeletedHistoryRequest(query: Record<string, unknown>): { cursor?: string; limit: number } {
  const input = assertKnownFields({ ...query }, QUERY_KEYS);
  const limit = parseLimit(single(input.limit, 'limit'));
  const cursor = single(input.cursor, 'cursor');
  return cursor === undefined ? { limit } : { cursor, limit };
}

/** The deletion instant to the microsecond, in UTC: the keyset position (see cursor.ts). */
const DELETED_KEY = `to_char(t.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deleted_key`;

/**
 * "Recently deleted": the owner's records deleted at most RESTORE_WINDOW_DAYS
 * ago - exactly the rows the restore command still accepts (it refuses
 * `deleted_at < now() - window`) - newest deletion first, keyset on
 * (deleted_at, id), from the caller's snapshot transaction. A purged record
 * has no row, and one past the window but not yet purged is left out. As in
 * history, a cursor carries its first page's revision so later pages can
 * suggest a refresh when the account changed.
 */
export const DeletedHistoryQuery = {
  async list(tx: OwnerTx, cursor?: string, limit = HISTORY_DEFAULT_LIMIT): Promise<DeletedHistoryPage> {
    const position = cursor === undefined ? null : decodeDeletedCursor(cursor);
    const keyset = position ? 'AND (t.deleted_at, t.id) < ($2::timestamptz, $3::uuid)' : '';
    const rows = await tx.query<RecordRow & { deleted_key: string }>(
      `SELECT ${RECORD_COLUMNS}, ${DELETED_KEY}
         FROM transactions t
        WHERE t.deleted_at IS NOT NULL AND t.deleted_at >= now() - make_interval(days => $1) ${keyset}
        ORDER BY t.deleted_at DESC, t.id DESC
        LIMIT ${limit + 1}`,
      position ? [RESTORE_WINDOW_DAYS, position.deletedAt, position.id] : [RESTORE_WINDOW_DAYS],
    );
    const revision = await accountRevision(tx);
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const chainRevision = position?.revision ?? revision;
    return {
      // Every row here has a deletion instant (the WHERE above).
      items: items.map((row) => toDto(row) as DeletedTransactionDto),
      next_cursor: rows.length > limit && last ? encodeDeletedCursor({ deletedAt: last.deleted_key, id: last.id, revision: chainRevision }) : null,
      as_of_revision: revision,
      refresh_suggested: position !== null && position.revision !== revision,
    };
  },
};
