// The month summary, ported from apps/api/src/summary/summary-query.ts
// (SummaryQuery) and the query check of summary.controller.ts. SummaryQuery
// imports the API's budget service, so it is not reused; this file keeps its
// SQL and order. Month bounds are computed in JS (plan Task 7). Every sum is
// read as CAST(... AS TEXT), and remaining amounts are BigInt arithmetic.
import { assertKnownFields, parseMonth } from '@gogospend/contracts'
import type { BudgetCategoryUsage, CategoryTotal, MonthSummary } from '@gogospend/contracts'

import type { VaultContext } from '../context'
import { readBudget } from '../domain/budgets'
import { accountRevision, scopedTotals } from './history'

/**
 * The first and last day of a calendar month `YYYY-MM`. Dates are already
 * Bangkok dates, and every stored occurred_on is a real `YYYY-MM-DD` (its CHECK),
 * so BETWEEN these two is the API's `>= first AND < first + interval '1 month'`.
 */
function monthBounds(month: string): { first: string; last: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, '0')}` }
}

// Records dated within the calendar month (MONTH_SCOPE in summary-query.ts).
const MONTH_SCOPE = 't.deleted_at IS NULL AND t.occurred_on BETWEEN ? AND ?'

/**
 * GET /v1/summary?month=YYYY-MM: the month's totals, per-category totals and
 * budget usage, read in this call's one transaction at one revision. Budget
 * spending is every expense in the month, capped categories or not; transfers
 * and opening balances never count. Renamed or archived categories keep their
 * ids, so their history and limits stay attached.
 */
export function summary(c: VaultContext, query: unknown): MonthSummary {
  const month = parseMonth(assertKnownFields({ ...(query as Record<string, unknown>) }, ['month']).month)
  const { first, last } = monthBounds(month)
  const { count: _count, ...totals } = scopedTotals(c, MONTH_SCOPE, [first, last])
  const categories = c.sql
    .exec<CategoryTotal>(
      `SELECT t.category_id, t.type, CAST(sum(t.amount_minor) AS TEXT) AS total_minor
         FROM transactions t WHERE ${MONTH_SCOPE} AND t.type <> 'transfer'
        GROUP BY t.category_id, t.type ORDER BY t.type, t.category_id`,
      first,
      last,
    )
    .toArray()
  const budget = readBudget(c, month)
  let usage: MonthSummary['budget'] = null
  if (budget) {
    // The capped category ids bind as one JSON parameter (R57).
    const spent = c.sql
      .exec<{ category_id: string; spent: string }>(
        `SELECT t.category_id, CAST(sum(t.amount_minor) AS TEXT) AS spent FROM transactions t
          WHERE ${MONTH_SCOPE} AND t.type = 'expense' AND t.category_id IN (SELECT value FROM json_each(?))
          GROUP BY t.category_id`,
        first,
        last,
        JSON.stringify(budget.category_limits.map((limit) => limit.category_id)),
      )
      .toArray()
    const byCategory = new Map(spent.map((row) => [row.category_id, row.spent]))
    const categoryUsage: BudgetCategoryUsage[] = budget.category_limits.map((limit) => {
      const used = byCategory.get(limit.category_id) ?? '0'
      return { category_id: limit.category_id, limit_minor: limit.limit_minor, spent_minor: used, remaining_minor: (BigInt(limit.limit_minor) - BigInt(used)).toString() }
    })
    usage = {
      overall_limit_minor: budget.overall_limit_minor,
      spent_minor: totals.expense_minor,
      remaining_minor: (BigInt(budget.overall_limit_minor) - BigInt(totals.expense_minor)).toString(),
      categories: categoryUsage,
    }
  }
  return { month, ...totals, categories, budget: usage, as_of_revision: accountRevision(c) }
}
