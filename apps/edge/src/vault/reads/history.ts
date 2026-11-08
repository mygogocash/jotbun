// History, ported from apps/api/src/history/history-query.ts (HistoryQuery) and
// history/totals.ts (scopedTotals, accountRevision). The request parser and the
// cursor are the API's own (@api/history/history-query, @api/history/cursor).
// Keyset order is (occurred_on, id), as transactions_history_idx holds it: 50
// rows by default, 200 at most, plus one look-ahead row that decides whether
// there is a next page. Every sum and the revision are read as CAST(... AS TEXT),
// so none passes through a JavaScript number.
import type { FilteredTotals, HistoryFilter, HistoryPage, Minor, Revision } from '@gogospend/contracts'

import { decodeCursor, encodeCursor } from '@api/history/cursor'
import { parseHistoryRequest } from '@api/history/history-query'

import type { VaultContext } from '../context'
import { COLUMNS as RECORD_COLUMNS, toDto } from '../domain/transactions'
import type { TransactionRow } from '../domain/transactions'

/**
 * The filter as SQL over alias `t`, with its parameters (scopeOf in
 * history-query.ts). The API binds every filter and tests each for NULL; here a
 * filter that is absent adds no clause, which selects the same rows. The text
 * filter is LIKE with the API's escaping of `\`, `%` and `_`.
 */
function scopeOf(filter: HistoryFilter): { scope: string; params: unknown[] } {
  const clauses = ['t.deleted_at IS NULL', 't.occurred_on BETWEEN ? AND ?']
  const params: unknown[] = [filter.from, filter.through]
  if (filter.wallet_id !== undefined) {
    clauses.push('(t.wallet_id = ? OR t.source_wallet_id = ? OR t.destination_wallet_id = ?)')
    params.push(filter.wallet_id, filter.wallet_id, filter.wallet_id)
  }
  if (filter.category_id !== undefined) {
    clauses.push('t.category_id = ?')
    params.push(filter.category_id)
  }
  if (filter.type !== undefined) {
    clauses.push('t.type = ?')
    params.push(filter.type)
  }
  if (filter.query !== undefined) {
    const pattern = `%${filter.query.replace(/[\\%_]/g, '\\$&')}%`
    clauses.push("(t.note LIKE ? ESCAPE '\\' OR t.merchant LIKE ? ESCAPE '\\')")
    params.push(pattern, pattern)
  }
  return { scope: clauses.join(' AND '), params }
}

/**
 * Totals over the live records `scope` selects (a WHERE fragment over alias `t`
 * using `params`), as scopedTotals in history/totals.ts computes them: income
 * and expense leave out transfers and opening balances; by_wallet is each
 * wallet's net change, with a transfer counted on both sides, in wallet id order.
 */
export function scopedTotals(c: VaultContext, scope: string, params: readonly unknown[]): FilteredTotals {
  const totals = c.sql
    .exec<{ count: number; income: Minor; expense: Minor; balance: Minor }>(
      `SELECT count(*) AS count,
              CAST(coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'income'), 0) AS TEXT) AS income,
              CAST(coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'expense'), 0) AS TEXT) AS expense,
              CAST(coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'income'), 0)
                 - coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'expense'), 0) AS TEXT) AS balance
         FROM transactions t WHERE ${scope}`,
      ...params,
    )
    .one()
  const wallets = c.sql
    .exec<{ wallet: string; delta: Minor }>(
      `SELECT x.wallet, CAST(sum(x.delta) AS TEXT) AS delta FROM (
         SELECT t.wallet_id AS wallet, CASE WHEN t.type = 'income' THEN t.amount_minor ELSE -t.amount_minor END AS delta
           FROM transactions t WHERE ${scope} AND t.type <> 'transfer'
         UNION ALL
         SELECT t.source_wallet_id, -t.amount_minor FROM transactions t WHERE ${scope} AND t.type = 'transfer'
         UNION ALL
         SELECT t.destination_wallet_id, t.amount_minor FROM transactions t WHERE ${scope} AND t.type = 'transfer'
       ) x GROUP BY x.wallet ORDER BY x.wallet`,
      ...params,
      ...params,
      ...params,
    )
    .toArray()
  return {
    count: totals.count,
    income_minor: totals.income,
    expense_minor: totals.expense,
    balance_minor: totals.balance,
    by_wallet: Object.fromEntries(wallets.map((row) => [row.wallet, row.delta])),
  }
}

/** The vault's current revision, as text (accountRevision in history/totals.ts). */
export function accountRevision(c: VaultContext): Revision {
  return c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').one().revision
}

/**
 * GET /v1/history: one keyset page in the requested order, the totals over the
 * whole filter, and the revision, all read in this call's one transaction. A
 * cursor carries its first page's revision, so a later page can suggest a
 * refresh when the vault changed in between.
 */
export function history(c: VaultContext, query: unknown): HistoryPage {
  const request = parseHistoryRequest(query as Record<string, unknown>)
  const filter = request.filter
  const position = request.cursor === undefined ? null : decodeCursor(filter, request.cursor)
  const { scope, params } = scopeOf(filter)
  const descending = filter.sort === 'date_desc'
  const keyset = position ? `AND (t.occurred_on, t.id) ${descending ? '<' : '>'} (?, ?)` : ''
  const order = descending ? 'DESC' : 'ASC'
  const rows = c.sql
    .exec<TransactionRow>(
      `SELECT ${RECORD_COLUMNS}
         FROM transactions t WHERE ${scope} ${keyset}
        ORDER BY t.occurred_on ${order}, t.id ${order}
        LIMIT ?`,
      ...params,
      ...(position ? [position.occurredOn, position.id] : []),
      request.limit + 1,
    )
    .toArray()
  const revision = accountRevision(c)
  const items = rows.slice(0, request.limit)
  const last = items[items.length - 1]
  const chainRevision = position?.revision ?? revision
  return {
    items: items.map(toDto),
    next_cursor: rows.length > request.limit && last ? encodeCursor(filter, { occurredOn: last.occurred_on, id: last.id, revision: chainRevision }) : null,
    as_of_revision: revision,
    refresh_suggested: position !== null && position.revision !== revision,
    summary: scopedTotals(c, scope, params),
  }
}
