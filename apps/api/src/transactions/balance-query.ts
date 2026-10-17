import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts';
import type { Minor } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';

/**
 * Wallet balances derived from the opening balance and active (not deleted)
 * records: income adds, expense subtracts, a transfer subtracts from its
 * source and adds to its destination. Summed in PostgreSQL numeric and
 * returned as exact decimal strings; never a stored counter, never a JS
 * number. Balances may be negative.
 */
export const BalanceQuery = {
  async forWallets(tx: OwnerTx, ids: readonly string[]): Promise<ReadonlyMap<string, Minor>> {
    const rows = await tx.query<{ id: string; balance: Minor }>(
      `SELECT w.id, (w.opening_minor + coalesce(d.delta, 0))::text AS balance
         FROM wallets w
         LEFT JOIN LATERAL (
           SELECT sum(x.delta) AS delta FROM (
             SELECT CASE WHEN t.type = 'income' THEN t.amount_minor ELSE -t.amount_minor END AS delta
               FROM transactions t WHERE t.account_id = w.account_id AND t.wallet_id = w.id AND t.deleted_at IS NULL
             UNION ALL
             SELECT -t.amount_minor FROM transactions t WHERE t.account_id = w.account_id AND t.source_wallet_id = w.id AND t.deleted_at IS NULL
             UNION ALL
             SELECT t.amount_minor FROM transactions t WHERE t.account_id = w.account_id AND t.destination_wallet_id = w.id AND t.deleted_at IS NULL
           ) x
         ) d ON true
        WHERE w.id = ANY($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((row) => [row.id, row.balance]));
  },

  /**
   * The earliest date of a record touching the wallet that is active or still
   * restorable (deleted within the restore window), or null. Setup rules
   * count restorable records, so delete-correct-restore cannot skip them.
   */
  async firstRecordOn(tx: OwnerTx, walletId: string): Promise<string | null> {
    const [row] = await tx.query<{ first: string | null }>(
      `SELECT to_char(min(occurred_on), 'YYYY-MM-DD') AS first FROM transactions
        WHERE (deleted_at IS NULL OR deleted_at >= now() - make_interval(days => $2))
          AND (wallet_id = $1 OR source_wallet_id = $1 OR destination_wallet_id = $1)`,
      [walletId, RESTORE_WINDOW_DAYS],
    );
    return row?.first ?? null;
  },
};
