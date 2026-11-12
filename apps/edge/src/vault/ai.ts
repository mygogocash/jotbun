// The AI companion on vault SQL (1B-T7): consent and the daily uses
// (ai_preferences, ai_usage), what a draft may choose from, the day's facts (a
// port of the PostgreSQL edge's dayFacts) and Ask Bun's read-only tools (a
// port of its runTool; both retired at C1). The AI routes call these as steps
// (src/v1/ai/service.ts), each under the route's session and policy checks.
// Nothing a person writes to Bun, and no slip image, reaches the vault: the
// only row an AI call writes is its use. Sums leave SQLite as CAST(... AS TEXT).
import { AI_DAILY_LIMITS, AI_FEATURES, AI_NOTICE_VERSION, bangkokDate } from '@gogospend/contracts'
import type { AiFeature, AiFigure, AiLocale, AiPreferences, AiPreferencesDto, AiPreferencesUpdate, BunFact, CategoryDto, WalletDto } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import { categoryText, figureLabel, figureWord, leftOf, monthText, periodText } from '../server/ai/fact-text'
import { formatBaht } from '../server/ai/grounding'
import { ToolInputError } from '../v1/ai/tools'
import type { VaultContext } from './context'
import { listCategories } from './domain/categories'
import { listWallets } from './domain/wallets'
import { summary } from './reads/summary'

/** What the vault answers for GET /v1/me/ai-preferences; the service adds `available`. */
export type AiStoredPreferences = Omit<AiPreferencesDto, 'available'>

/** What a draft may choose from, with the consent the route needs first. */
export type AiContext = { consent: boolean; wallets: WalletDto[]; categories: CategoryDto[] }

/** The numbers one tool run allows, in the order runTool allowed them (AllowedNumbers' three adders). */
export type Allowance = { satang: string[]; counts: number[]; dates: string[] }

export type AiToolReply = { result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }

/** Daily uses are kept this long, then forgotten (AiService's USAGE_KEEP_DAYS). */
const USAGE_KEEP_DAYS = 35

/** Seconds until the next Bangkok midnight, when today's uses reset (AiService's secondsToBangkokMidnight). */
function secondsToBangkokMidnight(now: Date): number {
  const bangkok = new Date(now.getTime() + 7 * 3_600_000)
  const next = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() + 1) - 7 * 3_600_000
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

/** The one preferences row, or the defaults before the person sets any. */
function storedPreferences(c: VaultContext): AiPreferences {
  const [row] = c.sql
    .exec<{ companion: number; cashback_tips: number; notice_version: number | null }>('SELECT companion, cashback_tips, notice_version FROM ai_preferences WHERE id = 1')
    .toArray()
  return row ? { companion: row.companion === 1, cashback_tips: row.cashback_tips === 1, notice_version: row.notice_version } : { companion: false, cashback_tips: false, notice_version: null }
}

/** Consent counts only for the current notice: consent to another version no longer does. */
const consented = (prefs: AiPreferences): boolean => prefs.companion && prefs.notice_version === AI_NOTICE_VERSION

/** GET /v1/me/ai-preferences without `available`: the stored choices, with today's uses left per feature (Bangkok day, vault clock). */
export function aiPreferences(c: VaultContext): AiStoredPreferences {
  const prefs = storedPreferences(c)
  const used = c.sql.exec<{ feature: AiFeature; uses: number }>('SELECT feature, uses FROM ai_usage WHERE day = ?', bangkokDate(c.now)).toArray()
  const usedBy = new Map(used.map((row) => [row.feature, row.uses]))
  return {
    ...prefs,
    companion: consented(prefs),
    current_notice_version: AI_NOTICE_VERSION,
    remaining: Object.fromEntries(AI_FEATURES.map((feature) => [feature, Math.max(0, AI_DAILY_LIMITS[feature] - (usedBy.get(feature) ?? 0))])) as Record<AiFeature, number>,
  }
}

/** PUT /v1/me/ai-preferences: merges the update into the stored choices. Turning AI on needs the current notice (403). */
export function setAiPreferences(c: VaultContext, update: AiPreferencesUpdate): AiStoredPreferences {
  const next: AiPreferences = { ...storedPreferences(c), ...update }
  if (next.companion && next.notice_version !== AI_NOTICE_VERSION) {
    throw new ProblemException(403, 'AI_CONSENT_REQUIRED', { messageKey: 'errors.ai_notice_required' })
  }
  c.sql.exec(
    `INSERT INTO ai_preferences (id, companion, cashback_tips, notice_version, updated_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET companion = excluded.companion, cashback_tips = excluded.cashback_tips,
       notice_version = excluded.notice_version, updated_at = excluded.updated_at`,
    next.companion ? 1 : 0,
    next.cashback_tips ? 1 : 0,
    next.notice_version,
    c.now.toISOString(),
  )
  return aiPreferences(c)
}

/** Consent, then the wallets and categories a draft may name (the same lists GET /v1/wallets and /v1/categories answer). */
export function aiContext(c: VaultContext): AiContext {
  return { consent: consented(storedPreferences(c)), wallets: listWallets(c), categories: listCategories(c) }
}

/**
 * Counts one use against today's Bangkok limit (vault clock) before the model
 * runs, so a failing call costs a use unless H5 gives it back (refundAi). Over
 * the limit it throws, the call's transaction rolls back (the count stays at
 * the limit), and the answer is 429 until midnight. Uses older than 35 days
 * are forgotten first. Answers the Bangkok day it counted (P3-T7).
 */
export function consumeAi(c: VaultContext, feature: AiFeature): { day: string } {
  const today = bangkokDate(c.now)
  c.sql.exec(`DELETE FROM ai_usage WHERE day < date(?, '-${USAGE_KEEP_DAYS} days')`, today)
  const { uses } = c.sql
    .exec<{ uses: number }>(
      `INSERT INTO ai_usage (day, feature, uses) VALUES (?, ?, 1)
       ON CONFLICT (day, feature) DO UPDATE SET uses = uses + 1 RETURNING uses`,
      today,
      feature,
    )
    .one()
  if (uses > AI_DAILY_LIMITS[feature]) throw new ProblemException(429, 'AI_LIMIT_REACHED', { retryAfterSeconds: secondsToBangkokMidnight(c.now) })
  return { day: today }
}

/**
 * Gives back one use of `feature` (P3-T7, H5) on `day`, the day consumeAi
 * counted it on, even after Bangkok midnight: that day's uses minus one, never
 * below 0. With no row for that day nothing changes.
 */
export function refundAi(c: VaultContext, feature: AiFeature, day: string): void {
  c.sql.exec('UPDATE ai_usage SET uses = uses - 1 WHERE day = ? AND feature = ? AND uses > 0', day, feature)
}

type CategoryNames = ReadonlyMap<string, Pick<CategoryDto, 'builtin_key' | 'label'>>

/** Every category's built-in key and label, by id (AiService's categoryNames). */
function categoryNames(c: VaultContext): CategoryNames {
  return new Map(listCategories(c).map((category) => [category.id, { builtin_key: category.builtin_key, label: category.label }]))
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * The true, kind facts about one Bangkok day, most useful first (dayFacts).
 * Money comes from the summary screen's own read (reads/summary.ts), in this
 * call's one transaction, so a note never disagrees with the numbers beside it:
 * over budget first, then today, the month's pace, the week's logging rhythm,
 * the top category and the month's totals.
 */
export function aiDayFacts(c: VaultContext, date: string): BunFact[] {
  const month = date.slice(0, 7)
  const names = categoryNames(c)
  const today = c.sql
    .exec<{ spent: string; n: number }>(
      `SELECT CAST(coalesce(sum(t.amount_minor), 0) AS TEXT) AS spent, count(*) AS n
         FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on = ?`,
      date,
    )
    .one()
  const week = c.sql
    .exec<{ days: number }>(
      `SELECT count(DISTINCT t.occurred_on) AS days FROM transactions t
        WHERE t.deleted_at IS NULL AND t.occurred_on > date(?, '-7 days') AND t.occurred_on <= ?`,
      date,
      date,
    )
    .one()
  const totals = summary(c, { month })

  const facts: BunFact[] = []
  if (totals.budget && BigInt(totals.budget.remaining_minor) < 0n) {
    facts.push({ kind: 'over_budget', amount_minor: (-BigInt(totals.budget.remaining_minor)).toString(), days: daysInMonth(month) - Number(date.slice(8)) })
  }
  if (today.n > 0) facts.push({ kind: 'spent_today', amount_minor: today.spent, count: today.n })
  else facts.push({ kind: 'no_records_today' })
  if (totals.budget && BigInt(totals.budget.remaining_minor) >= 0n) {
    const daysLeft = daysInMonth(month) - Number(date.slice(8)) + 1
    facts.push({ kind: 'budget_left', amount_minor: totals.budget.remaining_minor, days: daysLeft })
    facts.push({ kind: 'budget_per_day', amount_minor: (BigInt(totals.budget.remaining_minor) / BigInt(daysLeft)).toString(), days: daysLeft })
  }
  facts.push({ kind: 'logged_days_week', count: week.days, days: 7 })
  const top = totals.categories
    .filter((category) => category.type === 'expense')
    .sort((a, b) => (BigInt(b.total_minor) > BigInt(a.total_minor) ? 1 : BigInt(b.total_minor) < BigInt(a.total_minor) ? -1 : 0))[0]
  if (top) {
    const name = names.get(top.category_id)
    const percent = BigInt(totals.expense_minor) > 0n ? Number((BigInt(top.total_minor) * 100n) / BigInt(totals.expense_minor)) : 0
    facts.push({ kind: 'top_category', amount_minor: top.total_minor, percent, category_key: name?.builtin_key ?? null, category_label: name?.label ?? null })
  }
  facts.push({ kind: 'month_spent', amount_minor: totals.expense_minor })
  if (BigInt(totals.income_minor) > 0n) facts.push({ kind: 'month_income', amount_minor: totals.income_minor })
  return facts
}

// Ask Bun's tools (runTool): read-only questions over the person's own records.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_SPAN_DAYS = 400

/** Records each number a tool allows, call by call, so the service can replay them into its own AllowedNumbers. */
class AllowanceRecorder {
  readonly allow: Allowance = { satang: [], counts: [], dates: [] }

  addSatang(minor: string): this {
    this.allow.satang.push(minor)
    return this
  }

  addCount(value: number): this {
    this.allow.counts.push(value)
    return this
  }

  addDate(iso: string): this {
    this.allow.dates.push(iso)
    return this
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

function runVaultTool(c: VaultContext, name: string, input: Record<string, unknown>, names: CategoryNames, allowed: AllowanceRecorder, locale: AiLocale): { result: unknown; figures: AiFigure[] } {
  const money = (label: string, minor: string): AiFigure => {
    allowed.addSatang(minor)
    return { label, amount_minor: minor }
  }
  switch (name) {
    case 'spending_total': {
      const { from, through } = dates(input)
      const type = input.type === 'income' ? 'income' : 'expense'
      const category = typeof input.category_id === 'string' && names.has(input.category_id) ? input.category_id : null
      const row = c.sql
        .exec<{ total: string; n: number }>(
          `SELECT CAST(coalesce(sum(t.amount_minor), 0) AS TEXT) AS total, count(*) AS n FROM transactions t
            WHERE t.deleted_at IS NULL AND t.type = ? AND t.occurred_on BETWEEN ? AND ?
              AND (? IS NULL OR t.category_id = ?)`,
          type,
          from,
          through,
          category,
          category,
        )
        .one()
      allowed.addCount(row.n).addDate(from).addDate(through)
      const what = category ? categoryShown(names, category, locale) : figureWord(type === 'income' ? 'in' : 'out', locale)
      const label = figureLabel(what, periodText(from, through, locale), locale)
      return { result: { total_say: formatBaht(row.total), count: row.n }, figures: [money(label, row.total)] }
    }
    case 'category_totals': {
      const { from, through } = dates(input)
      const type = input.type === 'income' ? 'income' : 'expense'
      const rows = c.sql
        .exec<{ category_id: string | null; total: string; n: number }>(
          `SELECT t.category_id, CAST(sum(t.amount_minor) AS TEXT) AS total, count(*) AS n FROM transactions t
            WHERE t.deleted_at IS NULL AND t.type = ? AND t.occurred_on BETWEEN ? AND ?
            GROUP BY t.category_id ORDER BY sum(t.amount_minor) DESC LIMIT 12`,
          type,
          from,
          through,
        )
        .toArray()
      allowed.addDate(from).addDate(through)
      const when = periodText(from, through, locale)
      const figures = rows.map((r) => money(figureLabel(categoryShown(names, r.category_id, locale), when, locale), r.total))
      for (const r of rows) allowed.addCount(r.n)
      return { result: rows.map((r) => ({ category: categoryName(names, r.category_id), total_say: formatBaht(r.total), count: r.n })), figures }
    }
    case 'top_merchants': {
      const { from, through } = dates(input)
      const rows = c.sql
        .exec<{ merchant: string | null; total: string; n: number }>(
          `SELECT coalesce(nullif(t.merchant, ''), nullif(t.note, '')) AS merchant, CAST(sum(t.amount_minor) AS TEXT) AS total, count(*) AS n
             FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on BETWEEN ? AND ?
            GROUP BY coalesce(nullif(t.merchant, ''), nullif(t.note, '')) ORDER BY sum(t.amount_minor) DESC LIMIT 8`,
          from,
          through,
        )
        .toArray()
      allowed.addDate(from).addDate(through)
      for (const r of rows) allowed.addCount(r.n)
      const when = periodText(from, through, locale)
      const figures = rows.map((r) => money(figureLabel(r.merchant ?? figureWord('noDescription', locale), when, locale), r.total))
      return { result: rows.map((r) => ({ merchant: r.merchant ?? '(no description)', total_say: formatBaht(r.total), count: r.n })), figures }
    }
    case 'budget_status': {
      const month = input.month
      if (typeof month !== 'string' || !MONTH.test(month)) throw new ToolInputError('month must be YYYY-MM')
      // The summary refuses a month before 1970-01 (parseMonth), where runTool read any YYYY-MM and found no
      // budget; none can exist then, so the answer is runTool's (the 1B-T7 review's m-1).
      if (month < '1970-01') return { result: null, figures: [] }
      const totals = summary(c, { month })
      if (!totals.budget) return { result: null, figures: [] }
      const b = totals.budget
      const when = monthText(month, locale)
      const figures = [
        money(figureLabel(figureWord('budget', locale), when, locale), b.overall_limit_minor),
        money(figureLabel(figureWord('spent', locale), when, locale), b.spent_minor),
        money(figureLabel(figureWord('left', locale), when, locale), b.remaining_minor),
      ]
      const categories = b.categories.map((limit) => {
        figures.push(money(figureLabel(leftOf(categoryShown(names, limit.category_id, locale), locale), when, locale), limit.remaining_minor))
        allowed.addSatang(limit.limit_minor).addSatang(limit.spent_minor)
        return { category: categoryName(names, limit.category_id), limit_say: formatBaht(limit.limit_minor), spent_say: formatBaht(limit.spent_minor), left_say: formatBaht(limit.remaining_minor) }
      })
      return { result: { limit_say: formatBaht(b.overall_limit_minor), spent_say: formatBaht(b.spent_minor), left_say: formatBaht(b.remaining_minor), categories }, figures }
    }
    default:
      throw new ToolInputError(`unknown tool ${name}`)
  }
}

/**
 * One Ask Bun tool on vault SQL (runTool): its result for the model, the
 * figures the phone shows, and every number it allowed for grounding, recorded
 * as runTool's AllowedNumbers calls. A tool input the tool refuses answers
 * `{ error }`, which the service sends to the model as an `is_error` result.
 */
export function aiTool(c: VaultContext, name: string, input: Record<string, unknown>, locale: AiLocale): AiToolReply {
  const allowed = new AllowanceRecorder()
  try {
    const { result, figures } = runVaultTool(c, name, input, categoryNames(c), allowed, locale)
    return { result, figures, allow: allowed.allow }
  } catch (error) {
    if (error instanceof ToolInputError) return { error: error.message }
    throw error
  }
}
