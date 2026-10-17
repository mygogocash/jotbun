import type { BudgetCategoryUsage, CategoryTotal, MonthSummary } from '@gogospend/contracts';

import { readBudget } from '../budgets/budgets.service';
import type { OwnerTx } from '../database/owner-transaction';
import { accountRevision, scopedTotals } from '../history/totals';

// Records dated within the calendar month (dates are already Bangkok dates).
const MONTH_SCOPE = `t.deleted_at IS NULL AND t.occurred_on >= ($1 || '-01')::date AND t.occurred_on < ($1 || '-01')::date + interval '1 month'`;

/**
 * One month's totals, per-category totals and budget usage, read from the
 * caller's snapshot transaction at one account revision. Budget spending is
 * every expense in the month (capped categories or not); transfers and
 * opening balances never count. Renamed or archived categories keep their
 * ids, so their history and limits stay attached.
 */
export const SummaryQuery = {
  async month(tx: OwnerTx, month: string): Promise<MonthSummary> {
    const { count: _count, ...totals } = await scopedTotals(tx, MONTH_SCOPE, [month]);
    const categories = await tx.query<CategoryTotal>(
      `SELECT t.category_id, t.type, sum(t.amount_minor)::text AS total_minor
         FROM transactions t WHERE ${MONTH_SCOPE} AND t.type <> 'transfer'
        GROUP BY t.category_id, t.type ORDER BY t.type, t.category_id`,
      [month],
    );
    const budget = await readBudget(tx, month);
    let usage: MonthSummary['budget'] = null;
    if (budget) {
      const spent = await tx.query<{ category_id: string; spent: string }>(
        `SELECT t.category_id, sum(t.amount_minor)::text AS spent FROM transactions t
          WHERE ${MONTH_SCOPE} AND t.type = 'expense' AND t.category_id = ANY($2::uuid[])
          GROUP BY t.category_id`,
        [month, budget.category_limits.map((limit) => limit.category_id)],
      );
      const byCategory = new Map(spent.map((row) => [row.category_id, row.spent]));
      const categoryUsage: BudgetCategoryUsage[] = budget.category_limits.map((limit) => {
        const used = byCategory.get(limit.category_id) ?? '0';
        return { category_id: limit.category_id, limit_minor: limit.limit_minor, spent_minor: used, remaining_minor: (BigInt(limit.limit_minor) - BigInt(used)).toString() };
      });
      usage = {
        overall_limit_minor: budget.overall_limit_minor,
        spent_minor: totals.expense_minor,
        remaining_minor: (BigInt(budget.overall_limit_minor) - BigInt(totals.expense_minor)).toString(),
        categories: categoryUsage,
      };
    }
    return { month, ...totals, categories, budget: usage, as_of_revision: await accountRevision(tx) };
  },
};
