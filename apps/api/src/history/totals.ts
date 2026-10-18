import type { FilteredTotals, Minor } from '@gogospend/contracts';

import type { OwnerTx } from '../database/owner-transaction';

/**
 * Totals over active records matching `scope` (a WHERE fragment over alias
 * `t` using `params`): income and expense exclude transfers and opening
 * balances; by_wallet is each wallet's net change, with transfers counted on
 * both sides. Summed in numeric, returned as exact strings.
 */
export async function scopedTotals(tx: OwnerTx, scope: string, params: readonly unknown[]): Promise<FilteredTotals> {
  const [totals] = await tx.query<{ count: number; income: Minor; expense: Minor; balance: Minor }>(
    `SELECT count(*)::int AS count,
            coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'income'), 0)::text AS income,
            coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'expense'), 0)::text AS expense,
            (coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'income'), 0)
             - coalesce(sum(t.amount_minor) FILTER (WHERE t.type = 'expense'), 0))::text AS balance
       FROM transactions t WHERE ${scope}`,
    [...params],
  );
  const wallets = await tx.query<{ wallet: string; delta: Minor }>(
    `SELECT x.wallet, sum(x.delta)::text AS delta FROM (
       SELECT t.wallet_id AS wallet, CASE WHEN t.type = 'income' THEN t.amount_minor ELSE -t.amount_minor END AS delta
         FROM transactions t WHERE ${scope} AND t.type <> 'transfer'
       UNION ALL
       SELECT t.source_wallet_id, -t.amount_minor FROM transactions t WHERE ${scope} AND t.type = 'transfer'
       UNION ALL
       SELECT t.destination_wallet_id, t.amount_minor FROM transactions t WHERE ${scope} AND t.type = 'transfer'
     ) x GROUP BY x.wallet ORDER BY x.wallet`,
    [...params],
  );
  return {
    count: totals.count,
    income_minor: totals.income,
    expense_minor: totals.expense,
    balance_minor: totals.balance,
    by_wallet: Object.fromEntries(wallets.map((row) => [row.wallet, row.delta])),
  };
}

export async function accountRevision(tx: OwnerTx): Promise<string> {
  const [row] = await tx.query<{ revision: string }>('SELECT revision::text AS revision FROM account_sync_state WHERE account_id = $1', [tx.accountId]);
  return row.revision;
}
