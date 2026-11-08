// "Recently deleted", ported from apps/api/src/history/deleted-history-query.ts
// (DeletedHistoryQuery). The request parser and the cursor are the API's own
// (@api/history/deleted-history-query, @api/history/cursor).
import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts'
import type { DeletedHistoryPage, DeletedTransactionDto } from '@gogospend/contracts'

import { decodeDeletedCursor, encodeDeletedCursor } from '@api/history/cursor'
import { parseDeletedHistoryRequest } from '@api/history/deleted-history-query'

import type { VaultContext } from '../context'
import { COLUMNS as RECORD_COLUMNS, toDto } from '../domain/transactions'
import type { TransactionRow } from '../domain/transactions'
import { accountRevision } from './history'

const DAY_MS = 86_400_000

/**
 * The deletion instant as the API's cursor carries it, `YYYY-MM-DDTHH:MM:SS.ffffffZ`
 * (DELETED_KEY in deleted-history-query.ts). The vault stores milliseconds
 * (`Date#toISOString()`), so the key is the stored text with `000` added before
 * the `Z`. Keys of one width compare as text in time order, so a cursor with any
 * six-digit fraction pages exactly as PostgreSQL compares it.
 */
const DELETED_KEY = `substr(t.deleted_at, 1, 23) || '000Z'`

/**
 * GET /v1/history/deleted: the records deleted at most RESTORE_WINDOW_DAYS ago,
 * exactly the ones the restore command still accepts (restoreTransaction refuses
 * a deletion before the same cutoff), newest deletion first, keyset on
 * (deleted_at, id). A purged record has no row. One past the window but not yet
 * purged is left out. As in history, a cursor carries its first page's revision.
 */
export function deletedHistory(c: VaultContext, query: unknown): DeletedHistoryPage {
  const request = parseDeletedHistoryRequest(query as Record<string, unknown>)
  const position = request.cursor === undefined ? null : decodeDeletedCursor(request.cursor)
  const since = new Date(c.now.getTime() - RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
  const keyset = position ? `AND (${DELETED_KEY}, t.id) < (?, ?)` : ''
  const rows = c.sql
    .exec<TransactionRow & { deleted_key: string }>(
      `SELECT ${RECORD_COLUMNS}, ${DELETED_KEY} AS deleted_key
         FROM transactions t
        WHERE t.deleted_at IS NOT NULL AND t.deleted_at >= ? ${keyset}
        ORDER BY t.deleted_at DESC, t.id DESC
        LIMIT ?`,
      since,
      ...(position ? [position.deletedAt, position.id] : []),
      request.limit + 1,
    )
    .toArray()
  const revision = accountRevision(c)
  const items = rows.slice(0, request.limit)
  const last = items[items.length - 1]
  const chainRevision = position?.revision ?? revision
  return {
    // Every row here has a deletion instant (the WHERE above).
    items: items.map((row) => toDto(row) as DeletedTransactionDto),
    next_cursor: rows.length > request.limit && last ? encodeDeletedCursor({ deletedAt: last.deleted_key, id: last.id, revision: chainRevision }) : null,
    as_of_revision: revision,
    refresh_suggested: position !== null && position.revision !== revision,
  }
}
