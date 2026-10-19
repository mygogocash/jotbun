// The month recap (redesign R5, plan §6.3): what the printed receipt, the
// compare bars and the plain-text share say about one month. Pure TypeScript:
// no React, no React Native. Money stays exact (BigInt over canonical satang
// strings) and every amount is written by `formatMinor`, never rounded.
//
// - Spent and earned are the server's month totals (`summary`), which leave
//   out opening balances and moves between the person's own wallets.
// - Kept is earned minus spent when that is positive; otherwise it is said in
//   kind, plain words, never as a negative "kept".
// - Top categories are money out only, largest first, at most five.
// - Days logged are the distinct days with any confirmed entry (moves too),
//   read across every history page of the month.
// - The compare bars are six months of money out that double as the month
//   picker. They never reach past this month.
// - The share is plain text with exact amounts (decision D6: an image waits
//   for a capture package).
//
// Copy is English for `tc()`. R5 waits for E2 checkpoint 3, so these strings
// are not in the catalogs yet (the catalog guard skips `insights/` folders).
import type { CategoryDto, CategoryTotal, HistoryPage, Minor, MonthSummary } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import type { OutboxCommand } from '../../../../storage/types.ts';
import { monthLabel } from '../../../../ui/dateStep.ts';
import type { DateLocale } from '../../../../ui/dateStep.ts';
import { formatMinor } from '../../money.ts';
import type { MoneyLocale } from '../../money.ts';
import { categoryName, monthOf, shiftMonth } from '../../viewModels.ts';
import { classifyLoadProblem } from '../homeModel.ts';
import type { LoadProblemKind } from '../homeModel.ts';
import { daysInMonth, openDrafts } from '../shared.ts';
import type { Translate } from '../shared.ts';

/** How many months the bars compare. */
export const COMPARE_MONTHS = 6;
/** At most this many top categories. */
export const TOP_CATEGORY_COUNT = 5;
/** History pages (of up to 200 entries) read for the days logged before saying "at least". */
export const RECAP_HISTORY_PAGES = 20;

const money = (minor: bigint | Minor, locale: MoneyLocale) => formatMinor(minor.toString(), locale);

// ---------------------------------------------------------------------------
// Months

export type MonthPhase = 'past' | 'current' | 'future';

/** Where a `YYYY-MM` month sits against Bangkok `today`. */
export function monthPhase(month: string, today: string): MonthPhase {
  const current = monthOf(today);
  if (month < current) return 'past';
  return month === current ? 'current' : 'future';
}

/**
 * The six months the bars compare, oldest first. While the month shown is one
 * of the last six they are always the last six, up to this month, so a tap
 * never moves the other bars. An older month ends them at itself, with the
 * five before it. They never reach past this month, so a month that has not
 * started (a hand-typed link) shows the last six without itself.
 */
export function compareWindow(month: string, today: string): string[] {
  const current = monthOf(today);
  const oldestRecent = shiftMonth(current, -(COMPARE_MONTHS - 1));
  const end = month < oldestRecent ? month : current;
  return Array.from({ length: COMPARE_MONTHS }, (_, index) => shiftMonth(end, index - (COMPARE_MONTHS - 1)));
}

// ---------------------------------------------------------------------------
// Days logged

export type MonthDays = { days: string[]; complete: boolean };
export type HistoryPageReader = (cursor: string | undefined) => Promise<Pick<HistoryPage, 'items' | 'next_cursor'>>;

/**
 * The distinct days of `month` with a confirmed entry, read page by page.
 * It stops when the pages end, or once every day of the month is counted
 * (more pages cannot add one). After `maxPages` it stops with `complete:
 * false`, so the count reads "at least".
 */
export async function readMonthDays(month: string, read: HistoryPageReader, maxPages = RECAP_HISTORY_PAGES): Promise<MonthDays> {
  const seen = new Set<string>();
  const possible = daysInMonth(month);
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const { items, next_cursor: next } = await read(cursor);
    for (const item of items) if (!item.deleted_at && item.occurred_on.startsWith(`${month}-`)) seen.add(item.occurred_on);
    if (next === null || seen.size >= possible) return { days: [...seen].sort(), complete: true };
    cursor = next;
  }
  return { days: [...seen].sort(), complete: false };
}

export type DaysLogged = { count: number; complete: boolean; text: string };

export function daysLoggedOf(days: MonthDays, tc: Translate): DaysLogged {
  const count = days.days.length;
  const text = !days.complete ? tc('At least {count} days', { count }) : count === 1 ? tc('1 day') : tc('{count} days', { count });
  return { count, complete: days.complete, text };
}

// ---------------------------------------------------------------------------
// Top categories, kept and the budget

export type TopCategory = { categoryId: string; name: string; minor: Minor; amountText: string };

/** Money out by category, largest first (ties by name), at most `limit`. Income is never a top category. */
export function topCategories(totals: readonly CategoryTotal[], categories: readonly CategoryDto[], tc: Translate, locale: MoneyLocale, limit = TOP_CATEGORY_COUNT): TopCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return totals
    .filter((total) => total.type === 'expense' && BigInt(total.total_minor) > 0n)
    .map((total) => {
      const category = byId.get(total.category_id);
      return { categoryId: total.category_id, name: category ? categoryName(category, tc) : tc('Category'), minor: total.total_minor, amountText: money(total.total_minor, locale) };
    })
    .sort((a, b) => {
      const difference = BigInt(b.minor) - BigInt(a.minor);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
      return a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId);
    })
    .slice(0, limit);
}

/** `kept`: earned minus spent, positive. `even`: they matched. `short`: more went out than came in. */
export type Kept = { kind: 'kept' | 'even' | 'short'; minor: Minor; text: string };

export function keptOf(earned: Minor, spent: Minor, tc: Translate, locale: MoneyLocale): Kept {
  const difference = BigInt(earned) - BigInt(spent);
  if (difference > 0n) return { kind: 'kept', minor: difference.toString(), text: money(difference, locale) };
  if (difference === 0n) return { kind: 'even', minor: '0', text: tc('Earned and spent matched') };
  return { kind: 'short', minor: difference.toString(), text: tc('{amount} more went out than came in', { amount: money(-difference, locale) }) };
}

export type RecapBudget = {
  spentMinor: Minor;
  limitMinor: Minor;
  over: boolean;
  /** How far over the limit; "0" when not over. */
  overMinor: Minor;
  /** "฿13,962.51 of ฿18,000.00", or "฿3,962.51 over". */
  value: string;
  /** Over only: "It happens. ฿13,962.51 of ฿10,000.00 spent." */
  note: string | null;
};

/** The month's budget in one line, or null when the month had none. Over is stated plainly and kindly. */
export function budgetLine(budget: MonthSummary['budget'], tc: Translate, locale: MoneyLocale): RecapBudget | null {
  if (!budget) return null;
  const spent = BigInt(budget.spent_minor);
  const limit = BigInt(budget.overall_limit_minor);
  const overBy = spent - limit;
  const words = { spent: money(spent, locale), limit: money(limit, locale) };
  if (overBy > 0n) {
    return {
      spentMinor: budget.spent_minor, limitMinor: budget.overall_limit_minor, over: true, overMinor: overBy.toString(),
      value: tc('{amount} over', { amount: money(overBy, locale) }),
      note: tc('It happens. {spent} of {limit} spent.', words),
    };
  }
  return { spentMinor: budget.spent_minor, limitMinor: budget.overall_limit_minor, over: false, overMinor: '0', value: tc('{spent} of {limit}', words), note: null };
}

// ---------------------------------------------------------------------------
// The compare bars

export type MonthSpend = { month: string; expenseMinor: Minor };
export type CompareBar = {
  month: string;
  minor: Minor;
  amountText: string;
  /** "August 2026", or "September 2026 so far" for this month. */
  label: string;
  /** "August 2026, ฿13,962.51". */
  spoken: string;
  /** The bar's length against the largest month, 0–1000 (exact integer maths). */
  permille: number;
  /** The month shown on the screen. */
  selected: boolean;
  /** This month, still going. */
  current: boolean;
};
export type BarContext = { shown: string; today: string; tc: Translate; locale: MoneyLocale; dateLocale: DateLocale };

export function compareBars(months: readonly MonthSpend[], { shown, today, tc, locale, dateLocale }: BarContext): CompareBar[] {
  const largest = months.reduce((top, { expenseMinor }) => (BigInt(expenseMinor) > top ? BigInt(expenseMinor) : top), 0n);
  const thisMonth = monthOf(today);
  return months.map(({ month, expenseMinor }) => {
    const amountText = money(expenseMinor, locale);
    const current = month === thisMonth;
    const name = monthLabel(month, dateLocale);
    const label = current ? tc('{month} so far', { month: name }) : name;
    return {
      month,
      minor: expenseMinor,
      amountText,
      label,
      spoken: tc('{label}, {value}', { label, value: amountText }),
      permille: largest === 0n ? 0 : Number((BigInt(expenseMinor) * 1000n) / largest),
      selected: month === shown,
      current,
    };
  });
}

// ---------------------------------------------------------------------------
// Drafts and load problems

/** The recap holds confirmed money only, so entries still on this device for the month are mentioned. */
export function waitingNote(outbox: readonly OutboxCommand[], month: string, tc: Translate): string | null {
  const waiting = openDrafts(outbox).some((command) => command.payload.occurred_on.startsWith(`${month}-`));
  return waiting ? tc("Entries still on this device aren't in this recap yet.") : null;
}

export type RecapProblem = { title: string; message: string; retry: boolean };

/** Home's headings for the same problems (literal `tc()` calls, so the catalog guard sees them). */
const PROBLEM_TITLE: Readonly<Record<LoadProblemKind, (tc: Translate) => string>> = {
  upgrade_required: (tc) => tc('Update Jotbun'),
  terms_required: (tc) => tc('Updated terms'),
  signed_out: (tc) => tc('Signed out'),
  unsupported_platform: (tc) => tc('Use the Jotbun app'),
  load_failed: (tc) => tc('Diary not loaded'),
};

/** Offline says the records are safe; everything else keeps the load-problem words and retry rule. */
export function recapProblem(error: unknown, tc: Translate): RecapProblem {
  if (error instanceof V1Error && error.outcome === 'network') {
    return { title: tc('We could not load this month'), message: tc('Your records are safe. This is a connection problem, not an empty month.'), retry: true };
  }
  const problem = classifyLoadProblem(error, tc);
  return { title: PROBLEM_TITLE[problem.kind](tc), message: problem.message, retry: problem.retry };
}

// ---------------------------------------------------------------------------
// The whole recap

export type RecapData = {
  /** The month's totals; null for a month that has not started (nothing of it is read). */
  summary: MonthSummary | null;
  categories: CategoryDto[];
  days: MonthDays;
  /** Money out of each compare month, oldest first (`compareWindow`). */
  compare: MonthSpend[];
};
/** The same shape as `useLoad`'s result. */
export type RecapLoad = { state: 'loading' } | { state: 'ready'; data: RecapData } | { state: 'error'; error: unknown };
export type RecapInput = {
  month: string;
  today: string;
  load: RecapLoad;
  /** The device diary's outbox (empty without a diary). */
  outbox: readonly OutboxCommand[];
  tc: Translate;
  locale: MoneyLocale;
  dateLocale: DateLocale;
};

/** The stage: the screen's name, the month (so far, for this month) and, on a recap, the money out as the hero. */
export type RecapHeader = { title: string; subtitle: string; hero: string | null };

export type RecapFacts = {
  monthTitle: string;
  spentText: string;
  earnedText: string;
  budget: RecapBudget | null;
  top: TopCategory[];
  days: DaysLogged;
  kept: Kept;
};

export type RecapView =
  | { kind: 'loading'; header: RecapHeader; label: string }
  | { kind: 'problem'; header: RecapHeader; problem: RecapProblem }
  | { kind: 'empty'; header: RecapHeader; phase: MonthPhase; title: string; body: string; canAdd: boolean; bars: CompareBar[]; waiting: string | null }
  | { kind: 'recap'; header: RecapHeader; phase: MonthPhase; facts: RecapFacts; bars: CompareBar[]; waiting: string | null; share: string };

/**
 * The recap in plain words, in the receipt's order, one fact per line with
 * its exact amount. This month's heading says "so far".
 */
export function shareText(facts: RecapFacts, phase: MonthPhase, tc: Translate): string {
  const line = (label: string, value: string) => tc('{label}: {value}', { label, value });
  const month = phase === 'current' ? tc('{month} so far', { month: facts.monthTitle }) : facts.monthTitle;
  const lines = [tc('{month} in Jotbun', { month }), line(tc('Spent'), facts.spentText)];
  if (facts.budget) {
    lines.push(line(tc('Budget'), facts.budget.value));
    if (facts.budget.note) lines.push(facts.budget.note);
  }
  lines.push(line(tc('Earned'), facts.earnedText));
  if (facts.top.length > 0) {
    lines.push(tc('Top categories'));
    for (const category of facts.top) lines.push(line(category.name, category.amountText));
  }
  lines.push(line(tc('Days logged'), facts.days.text), line(tc('Kept'), facts.kept.text));
  return lines.join('\n');
}

export function recapView({ month, today, load, outbox, tc, locale, dateLocale }: RecapInput): RecapView {
  const phase = monthPhase(month, today);
  const monthTitle = monthLabel(month, dateLocale);
  const header = (hero: string | null): RecapHeader => ({
    title: tc('Month recap'),
    subtitle: phase === 'current' ? tc('{month} so far', { month: monthTitle }) : monthTitle,
    hero,
  });

  if (load.state === 'loading') return { kind: 'loading', header: header(null), label: tc('Loading your diary') };
  if (load.state === 'error') return { kind: 'problem', header: header(null), problem: recapProblem(load.error, tc) };

  const { summary, categories, days, compare } = load.data;
  const bars = compareBars(compare, { shown: month, today, tc, locale, dateLocale });
  const waiting = waitingNote(outbox, month, tc);
  const nothing = !summary || (days.days.length === 0 && BigInt(summary.income_minor) === 0n && BigInt(summary.expense_minor) === 0n);
  if (nothing) {
    return {
      kind: 'empty', header: header(null), phase, bars, waiting,
      title: tc('No entries in this month'),
      body: phase === 'future' ? tc("This month hasn't started yet.") : tc('Entries you add for this month show up here.'),
      // Adding lands on today, so only an empty current month offers it.
      canAdd: phase === 'current',
    };
  }

  const spentText = money(summary.expense_minor, locale);
  const facts: RecapFacts = {
    monthTitle,
    spentText,
    earnedText: money(summary.income_minor, locale),
    budget: budgetLine(summary.budget, tc, locale),
    top: topCategories(summary.categories, categories, tc, locale),
    days: daysLoggedOf(days, tc),
    kept: keptOf(summary.income_minor, summary.expense_minor, tc, locale),
  };
  const hero = phase === 'current' ? tc('{amount} spent so far', { amount: spentText }) : tc('{amount} spent', { amount: spentText });
  return { kind: 'recap', header: header(hero), phase, facts, bars, waiting, share: shareText(facts, phase, tc) };
}
