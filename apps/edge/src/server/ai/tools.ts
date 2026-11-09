import type Anthropic from '@anthropic-ai/sdk'
import type { AiFigure, AiLocale } from '@gogospend/contracts'

import type { OwnerTx } from '@api/database/owner-transaction'
import { SummaryQuery } from '@api/summary/summary-query'

import type { CategoryNames } from './facts'
import { categoryText, figureLabel, figureWord, leftOf, monthText, periodText } from './fact-text'
import { AllowedNumbers, formatBaht } from './grounding'

/**
 * Ask Bun's tools: read-only questions over the person's own records, run
 * in their owner transaction (RLS). Every amount a tool returns is recorded
 * as a figure and allowed for grounding; the model never sees anything else.
 */
export type ToolRun = { result: unknown; figures: AiFigure[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_SPAN_DAYS = 400

const range = { from: { type: 'string', description: 'First day, YYYY-MM-DD (Bangkok calendar).' }, through: { type: 'string', description: 'Last day, YYYY-MM-DD, inclusive.' } }

export const ASK_TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: 'spending_total',
    description: 'Total and count of the person’s expense or income records between two dates, optionally in one category.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'through', 'type', 'category_id'],
      properties: { ...range, type: { type: 'string', enum: ['expense', 'income'] }, category_id: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'A category id from the list, or null for all.' } },
    },
  },
  {
    name: 'category_totals',
    description: 'Expense or income totals per category between two dates, largest first.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'through', 'type'],
      properties: { ...range, type: { type: 'string', enum: ['expense', 'income'] } },
    },
  },
  {
    name: 'top_merchants',
    description: 'The places or descriptions the person spent most at between two dates (up to 8), with totals and counts.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['from', 'through'], properties: range },
  },
  {
    name: 'budget_status',
    description: 'The month’s budget: limit, spent and left, overall and per category. Null when no budget is set.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['month'], properties: { month: { type: 'string', description: 'YYYY-MM' } } },
  },
]

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

function dates(input: Record<string, unknown>): { from: string; through: string } {
  const { from, through } = input
  if (typeof from !== 'string' || typeof through !== 'string' || !DATE.test(from) || !DATE.test(through) || from > through) throw new ToolInputError('from and through must be YYYY-MM-DD with from <= through')
  const span = (Date.parse(`${through}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (!Number.isFinite(span) || span > MAX_SPAN_DAYS) throw new ToolInputError(`the range is at most ${MAX_SPAN_DAYS} days`)
  return { from, through }
}

// The model sees built-in keys and the person's own labels; the figures the
// phone shows are worded in the person's language (fact-text.ts).
const categoryName = (names: CategoryNames, id: string | null) => {
  const name = id ? names.get(id) : undefined
  return name?.label ?? name?.builtin_key ?? 'uncategorised'
}

const categoryShown = (names: CategoryNames, id: string | null, locale: AiLocale) => {
  const name = id ? names.get(id) : undefined
  return categoryText({ category_key: name?.builtin_key ?? null, category_label: name?.label ?? null }, locale)
}

export async function runTool(tx: OwnerTx, name: string, input: Record<string, unknown>, names: CategoryNames, allowed: AllowedNumbers, locale: AiLocale): Promise<ToolRun> {
  const money = (label: string, minor: string): AiFigure => {
    allowed.addSatang(minor)
    return { label, amount_minor: minor }
  }
  switch (name) {
    case 'spending_total': {
      const { from, through } = dates(input)
      const type = input.type === 'income' ? 'income' : 'expense'
      const category = typeof input.category_id === 'string' && names.has(input.category_id) ? input.category_id : null
      const [row] = await tx.query<{ total: string; n: number }>(
        `SELECT coalesce(sum(t.amount_minor), 0)::text AS total, count(*)::int AS n FROM transactions t
          WHERE t.deleted_at IS NULL AND t.type = $1 AND t.occurred_on BETWEEN $2::date AND $3::date
            AND ($4::uuid IS NULL OR t.category_id = $4::uuid)`,
        [type, from, through, category],
      )
      allowed.addCount(row.n).addDate(from).addDate(through)
      const what = category ? categoryShown(names, category, locale) : figureWord(type === 'income' ? 'in' : 'out', locale)
      const label = figureLabel(what, periodText(from, through, locale), locale)
      return { result: { total_say: formatBaht(row.total), count: row.n }, figures: [money(label, row.total)] }
    }
    case 'category_totals': {
      const { from, through } = dates(input)
      const type = input.type === 'income' ? 'income' : 'expense'
      const rows = await tx.query<{ category_id: string | null; total: string; n: number }>(
        `SELECT t.category_id, sum(t.amount_minor)::text AS total, count(*)::int AS n FROM transactions t
          WHERE t.deleted_at IS NULL AND t.type = $1 AND t.occurred_on BETWEEN $2::date AND $3::date
          GROUP BY t.category_id ORDER BY sum(t.amount_minor) DESC LIMIT 12`,
        [type, from, through],
      )
      allowed.addDate(from).addDate(through)
      const when = periodText(from, through, locale)
      const figures = rows.map((r) => money(figureLabel(categoryShown(names, r.category_id, locale), when, locale), r.total))
      for (const r of rows) allowed.addCount(r.n)
      return { result: rows.map((r) => ({ category: categoryName(names, r.category_id), total_say: formatBaht(r.total), count: r.n })), figures }
    }
    case 'top_merchants': {
      const { from, through } = dates(input)
      const rows = await tx.query<{ merchant: string | null; total: string; n: number }>(
        `SELECT coalesce(nullif(t.merchant, ''), nullif(t.note, '')) AS merchant, sum(t.amount_minor)::text AS total, count(*)::int AS n
           FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on BETWEEN $1::date AND $2::date
          GROUP BY 1 ORDER BY sum(t.amount_minor) DESC LIMIT 8`,
        [from, through],
      )
      allowed.addDate(from).addDate(through)
      for (const r of rows) allowed.addCount(r.n)
      const when = periodText(from, through, locale)
      const figures = rows.map((r) => money(figureLabel(r.merchant ?? figureWord('noDescription', locale), when, locale), r.total))
      return { result: rows.map((r) => ({ merchant: r.merchant ?? '(no description)', total_say: formatBaht(r.total), count: r.n })), figures }
    }
    case 'budget_status': {
      const month = input.month
      if (typeof month !== 'string' || !MONTH.test(month)) throw new ToolInputError('month must be YYYY-MM')
      const summary = await SummaryQuery.month(tx, month)
      if (!summary.budget) return { result: null, figures: [] }
      const b = summary.budget
      const when = monthText(month, locale)
      const figures = [
        money(figureLabel(figureWord('budget', locale), when, locale), b.overall_limit_minor),
        money(figureLabel(figureWord('spent', locale), when, locale), b.spent_minor),
        money(figureLabel(figureWord('left', locale), when, locale), b.remaining_minor),
      ]
      const categories = b.categories.map((c) => {
        figures.push(money(figureLabel(leftOf(categoryShown(names, c.category_id, locale), locale), when, locale), c.remaining_minor))
        allowed.addSatang(c.limit_minor).addSatang(c.spent_minor)
        return { category: categoryName(names, c.category_id), limit_say: formatBaht(c.limit_minor), spent_say: formatBaht(c.spent_minor), left_say: formatBaht(c.remaining_minor) }
      })
      return { result: { limit_say: formatBaht(b.overall_limit_minor), spent_say: formatBaht(b.spent_minor), left_say: formatBaht(b.remaining_minor), categories }, figures }
    }
    default:
      throw new ToolInputError(`unknown tool ${name}`)
  }
}
