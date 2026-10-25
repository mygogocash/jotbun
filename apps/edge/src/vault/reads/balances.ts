import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts'

import type { VaultContext } from '../context'

const DAY_MS = 86_400_000

/**
 * Wallet balances derived from the opening balance and live (not deleted)
 * records, as apps/api/src/transactions/balance-query.ts computes them: income
 * adds, expense subtracts, a transfer subtracts from its source and adds to its
 * destination. The sum is exact INTEGER arithmetic in SQLite, read back as text.
 * `ids` limits the result; none means every wallet of this vault.
 */
export function walletBalances(c: VaultContext, ids?: readonly string[]): Map<string, string> {
  if (ids !== undefined && ids.length === 0) return new Map()
  const where = ids === undefined ? '' : `WHERE w.id IN (${ids.map(() => '?').join(', ')})`
  const rows = c.sql
    .exec<{ id: string; balance: string }>(
      `SELECT w.id, CAST(w.opening_minor + coalesce((
          SELECT sum(x.delta) FROM (
            SELECT CASE WHEN t.type = 'income' THEN t.amount_minor ELSE -t.amount_minor END AS delta
              FROM transactions t WHERE t.wallet_id = w.id AND t.deleted_at IS NULL
            UNION ALL
            SELECT -t.amount_minor FROM transactions t WHERE t.source_wallet_id = w.id AND t.deleted_at IS NULL
            UNION ALL
            SELECT t.amount_minor FROM transactions t WHERE t.destination_wallet_id = w.id AND t.deleted_at IS NULL
          ) x), 0) AS TEXT) AS balance
         FROM wallets w ${where}`,
      ...(ids ?? []),
    )
    .toArray()
  return new Map(rows.map((row) => [row.id, row.balance]))
}

/**
 * The earliest date of a record that touches the wallet and is live or still
 * restorable (deleted within the restore window), or null. Setup rules count
 * restorable records, so delete, correct and restore cannot skip them.
 */
export function firstRecordOn(c: VaultContext, walletId: string): string | null {
  const since = new Date(c.now.getTime() - RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
  const [row] = c.sql
    .exec<{ first: string | null }>(
      `SELECT min(occurred_on) AS first FROM transactions
        WHERE (deleted_at IS NULL OR deleted_at >= ?) AND (wallet_id = ? OR source_wallet_id = ? OR destination_wallet_id = ?)`,
      since,
      walletId,
      walletId,
      walletId,
    )
    .toArray()
  return row?.first ?? null
}
