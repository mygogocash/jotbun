import type { BunFact, CategoryDto } from '@gogospend/contracts'

import type { OwnerTx } from '@api/database/owner-transaction'
import { SummaryQuery } from '@api/summary/summary-query'

export type CategoryNames = ReadonlyMap<string, Pick<CategoryDto, 'builtin_key' | 'label'>>

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * The true, kind facts about one Bangkok day, most useful first. Money comes
 * from the same SQL as the summary screen (SummaryQuery), read in one
 * snapshot, so a note never disagrees with the numbers beside it.
 * - Over budget comes first, said plainly (never shaming).
 * - Then today: spent so far, or nothing logged yet.
 * - Then pace: left to spend this month and per day.
 * - Then the week's logging rhythm (days with a record), and the top category.
 */
export async function dayFacts(tx: OwnerTx, date: string, names: CategoryNames): Promise<BunFact[]> {
  const month = date.slice(0, 7)
  const [today] = await tx.query<{ spent: string; n: number }>(
    `SELECT coalesce(sum(t.amount_minor), 0)::text AS spent, count(*)::int AS n
       FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on = $1::date`,
    [date],
  )
  const [week] = await tx.query<{ days: number }>(
    `SELECT count(DISTINCT t.occurred_on)::int AS days FROM transactions t
      WHERE t.deleted_at IS NULL AND t.occurred_on > $1::date - 7 AND t.occurred_on <= $1::date`,
    [date],
  )
  const summary = await SummaryQuery.month(tx, month)

  const facts: BunFact[] = []
  if (summary.budget && BigInt(summary.budget.remaining_minor) < 0n) {
    facts.push({ kind: 'over_budget', amount_minor: (-BigInt(summary.budget.remaining_minor)).toString(), days: daysInMonth(month) - Number(date.slice(8)) })
  }
  if (today.n > 0) facts.push({ kind: 'spent_today', amount_minor: today.spent, count: today.n })
  else facts.push({ kind: 'no_records_today' })
  if (summary.budget && BigInt(summary.budget.remaining_minor) >= 0n) {
    const daysLeft = daysInMonth(month) - Number(date.slice(8)) + 1
    facts.push({ kind: 'budget_left', amount_minor: summary.budget.remaining_minor, days: daysLeft })
    facts.push({ kind: 'budget_per_day', amount_minor: (BigInt(summary.budget.remaining_minor) / BigInt(daysLeft)).toString(), days: daysLeft })
  }
  facts.push({ kind: 'logged_days_week', count: week.days, days: 7 })
  const top = summary.categories
    .filter((c) => c.type === 'expense')
    .sort((a, b) => (BigInt(b.total_minor) > BigInt(a.total_minor) ? 1 : BigInt(b.total_minor) < BigInt(a.total_minor) ? -1 : 0))[0]
  if (top) {
    const name = names.get(top.category_id)
    const percent = BigInt(summary.expense_minor) > 0n ? Number((BigInt(top.total_minor) * 100n) / BigInt(summary.expense_minor)) : 0
    facts.push({ kind: 'top_category', amount_minor: top.total_minor, percent, category_key: name?.builtin_key ?? null, category_label: name?.label ?? null })
  }
  facts.push({ kind: 'month_spent', amount_minor: summary.expense_minor })
  if (BigInt(summary.income_minor) > 0n) facts.push({ kind: 'month_income', amount_minor: summary.income_minor })
  return facts
}
