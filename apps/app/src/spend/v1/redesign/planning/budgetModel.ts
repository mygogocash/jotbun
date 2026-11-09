// The Budget screen's view model (R4 Planning, plan §6.2): the month's
// burn-down, the category limits, the average prefill for a first budget,
// and the checks a budget passes before it is sent. Pure: exact BigInt over
// canonical satang strings, Asia/Bangkok calendar dates, and copy as
// `CopyLine`s for the screen's `tc`. The overall pace (per day, on track,
// tight, over) is `budgetPace()`'s; this adds what only the Budget screen
// shows, and words going over kindly, as plain facts.
import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto, Minor, MonthSummary, SetMonthlyBudgetRequest, TransactionDto } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../../storage/types.ts';
import { formatMinor } from '../../money.ts';
import type { MoneyLocale } from '../../money.ts';
import { monthRange, shiftMonth } from '../../viewModels.ts';
import { TIGHT_PACE_PERCENT } from '../budgetPace.ts';
import type { BudgetPace, PacePhase } from '../budgetPace.ts';
import { daysBetween, daysInMonth, moneyGroupOf, unconfirmedDrafts } from '../shared.ts';
import type { CopyLine } from '../shared.ts';

const money = (minor: bigint, locale: MoneyLocale) => formatMinor(minor.toString(), locale);
const sum = (values: Iterable<bigint>) => [...values].reduce((total, value) => total + value, 0n);

// ---------------------------------------------------------------------------
// The month switcher

/**
 * Whether the switcher may go on past `month`: every earlier month can be
 * looked at, and one month after today's, so next month's budget can be set
 * before it starts.
 */
export function canShowNextMonth(month: string, today: string): boolean {
  return month < shiftMonth(today.slice(0, 7), 1);
}

// ---------------------------------------------------------------------------
// Spending by day

/**
 * Money out by day for a month: confirmed expenses (not deleted), plus
 * expense drafts waiting on this device, the same money `budgetPace()` adds
 * to its estimate. Drafts being checked may already be in the confirmed
 * records, so they are never added; refused drafts count nowhere; a draft
 * whose record is confirmed counts once, as the record.
 */
export function dailySpending(input: { month: string; records: readonly TransactionDto[]; outbox?: readonly OutboxCommand[] }): Map<string, Minor> {
  const byDay = new Map<string, bigint>();
  const add = (day: string, amount: string) => byDay.set(day, (byDay.get(day) ?? 0n) + BigInt(amount));
  const confirmedIds = new Set<string>();
  for (const record of input.records) {
    confirmedIds.add(record.id);
    if (record.deleted_at || record.type !== 'expense' || record.occurred_on.slice(0, 7) !== input.month) continue;
    add(record.occurred_on, record.amount_minor);
  }
  for (const command of unconfirmedDrafts(input.outbox ?? [], confirmedIds)) {
    const entry = command.payload;
    if (moneyGroupOf(command.state) !== 'waiting' || entry.type !== 'expense' || entry.occurred_on.slice(0, 7) !== input.month) continue;
    add(entry.occurred_on, entry.amount_minor);
  }
  return new Map([...byDay].map(([day, amount]) => [day, amount.toString()]));
}

// ---------------------------------------------------------------------------
// The burn-down

export type BurnPoint = { readonly day: number; readonly spentMinor: Minor };

/**
 * Cumulative spending through each day of the month so far, against the
 * even pace: `limit × day ÷ daysInMonth`, rounded down to the satang, the
 * same line `budgetPace()` measures "tight" against.
 */
export type BurnDown = {
  readonly month: string;
  readonly phase: PacePhase;
  readonly daysInMonth: number;
  /** The last day drawn: today while the month runs (today counts), the month's last day after it, 0 before it starts. */
  readonly throughDay: number;
  /** Days 1…throughDay, each with spending through the end of that day. */
  readonly points: readonly BurnPoint[];
  readonly limitMinor: Minor;
  /** Spent through `throughDay`. */
  readonly spentMinor: Minor;
  /** The even pace through `throughDay`. */
  readonly evenMinor: Minor;
  /** spent − even: positive when ahead of the even pace. */
  readonly aheadMinor: Minor;
  /** The chart's top: the limit, or the spending when it has gone past the limit. */
  readonly topMinor: Minor;
};

export function burnDown(input: { month: string; today: string; limitMinor: Minor; spentByDay: ReadonlyMap<string, Minor> }): BurnDown {
  const { month, today } = input;
  const total = daysInMonth(month);
  const intoMonth = daysBetween(`${month}-01`, today);
  const phase: PacePhase = intoMonth < 0 ? 'before' : intoMonth >= total ? 'after' : 'during';
  const throughDay = phase === 'before' ? 0 : phase === 'after' ? total : intoMonth + 1;
  const limit = BigInt(input.limitMinor);
  const points: BurnPoint[] = [];
  let running = 0n;
  for (let day = 1; day <= throughDay; day += 1) {
    running += BigInt(input.spentByDay.get(`${month}-${String(day).padStart(2, '0')}`) ?? '0');
    points.push({ day, spentMinor: running.toString() });
  }
  const even = (limit * BigInt(throughDay)) / BigInt(total);
  return {
    month, phase, daysInMonth: total, throughDay, points, limitMinor: input.limitMinor,
    spentMinor: running.toString(), evenMinor: even.toString(), aheadMinor: (running - even).toString(), topMinor: (running > limit ? running : limit).toString(),
  };
}

/** A point on the chart, in thousandths: x along the month from its start, y up from the bottom. */
export type ChartPoint = readonly [x: number, y: number];
export type BurnChart = {
  /** From the month's start through each day drawn. */
  readonly spent: readonly ChartPoint[];
  /** The even pace, from nothing at the start to the limit at the month's end. */
  readonly even: readonly [ChartPoint, ChartPoint];
  /** Where the limit sits. */
  readonly limitY: number;
};

/** The burn-down as chart coordinates (whole thousandths, rounded down), for drawing only: the numbers are said in words. */
export function burnChart(burn: BurnDown): BurnChart {
  const top = BigInt(burn.topMinor) > 0n ? BigInt(burn.topMinor) : 1n;
  const x = (day: number) => Number((BigInt(day) * 1000n) / BigInt(burn.daysInMonth));
  const y = (minor: Minor) => Number((BigInt(minor) * 1000n) / top);
  const limitY = y(burn.limitMinor);
  return {
    spent: [[0, 0], ...burn.points.map((point): ChartPoint => [x(point.day), y(point.spentMinor)])],
    even: [[0, 0], [1000, limitY]],
    limitY,
  };
}

/** The burn-down in words, beside the chart. Ahead of the pace is said as a fact, never a scolding. */
export function burnDownCopy(burn: BurnDown, locale: MoneyLocale): CopyLine[] {
  if (burn.phase === 'before') {
    return [{ text: "This month hasn't started yet." }, { text: 'An even pace is {amount} a day.', values: { amount: money(BigInt(burn.limitMinor) / BigInt(burn.daysInMonth), locale) } }];
  }
  if (burn.phase === 'after') {
    return [{ text: 'Spent in the month: {amount}', values: { amount: money(BigInt(burn.spentMinor), locale) } }, { text: 'Budget: {amount}', values: { amount: money(BigInt(burn.limitMinor), locale) } }];
  }
  const ahead = BigInt(burn.aheadMinor);
  const pace: CopyLine = ahead > 0n
    ? { text: '{amount} ahead of an even pace', values: { amount: money(ahead, locale) } }
    : ahead < 0n ? { text: '{amount} under an even pace', values: { amount: money(-ahead, locale) } } : { text: 'Right on an even pace' };
  return [
    { text: 'Spent by today: {amount}', values: { amount: money(BigInt(burn.spentMinor), locale) } },
    { text: 'Even pace by today: {amount}', values: { amount: money(BigInt(burn.evenMinor), locale) } },
    pace,
  ];
}

// ---------------------------------------------------------------------------
// Category limits

export type CategoryLimitState = 'on_track' | 'tight' | 'over';

export type CategoryLimitRow = {
  readonly categoryId: string;
  /** Null when the category is not among those loaded. */
  readonly category: CategoryDto | null;
  readonly limitMinor: Minor;
  /** The server's spending for the category (its budget usage) plus expense drafts waiting on this device. */
  readonly spentMinor: Minor;
  /** The waiting drafts' part of `spentMinor`. */
  readonly pendingMinor: Minor;
  /** limit − spent; negative when over. */
  readonly leftMinor: Minor;
  /** How far over, else '0'. */
  readonly overByMinor: Minor;
  readonly state: CategoryLimitState;
  /** Spent as thousandths of the limit, capped at 1000: the bar's length. */
  readonly spentPermille: number;
};

/** The same rule as the month's: over the limit, else more than TIGHT_PACE_PERCENT of the even pace so far; nothing is tight once the month is over. */
function limitState(spent: bigint, limit: bigint, pace: BudgetPace): CategoryLimitState {
  if (spent > limit) return 'over';
  if (pace.phase === 'after') return 'on_track';
  return spent * BigInt(pace.daysInMonth) * 100n > limit * BigInt(pace.daysElapsed) * TIGHT_PACE_PERCENT ? 'tight' : 'on_track';
}

/**
 * One row per category limit, in the order of `categories` (a limit on a
 * category not among them comes last). The confirmed spending is the
 * server's budget usage for the category; without it, the summary's own
 * category total that `pace` was worked out from.
 */
export function categoryLimitRows(input: { budget: BudgetDto; usage: MonthSummary['budget']; pace: BudgetPace; categories: readonly CategoryDto[] }): CategoryLimitRow[] {
  const { budget, usage, pace, categories } = input;
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const rows = budget.category_limits.map((limitOf): CategoryLimitRow => {
    const id = limitOf.category_id;
    const fromPace = pace.categories.find((category) => category.categoryId === id);
    const used = usage?.categories.find((category) => category.category_id === id);
    const confirmed = BigInt(used ? used.spent_minor : fromPace?.spent.confirmedMinor ?? '0');
    const pending = BigInt(fromPace?.spent.pendingMinor ?? '0');
    const spent = confirmed + pending;
    const limit = BigInt(limitOf.limit_minor);
    const left = limit - spent;
    const share = limit === 0n ? 1000n : spent <= 0n ? 0n : (spent * 1000n) / limit;
    return {
      categoryId: id,
      category: categories.find((category) => category.id === id) ?? null,
      limitMinor: limitOf.limit_minor,
      spentMinor: spent.toString(),
      pendingMinor: pending.toString(),
      leftMinor: left.toString(),
      overByMinor: (left < 0n ? -left : 0n).toString(),
      state: limitState(spent, limit, pace),
      spentPermille: Number(share > 1000n ? 1000n : share),
    };
  });
  const rank = (row: CategoryLimitRow) => order.get(row.categoryId) ?? categories.length;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index).map(({ row }) => row);
}

export type CategoryRowCopy = {
  /** "{spent} of {limit}". */
  readonly amounts: CopyLine;
  /** "{amount} left" or "{amount} over". */
  readonly status: CopyLine;
  /** Over only: a kind word, never a scolding. */
  readonly reassurance: CopyLine | null;
};

export function categoryRowCopy(row: CategoryLimitRow, locale: MoneyLocale): CategoryRowCopy {
  const over = row.state === 'over';
  return {
    amounts: { text: '{spent} of {limit}', values: { spent: money(BigInt(row.spentMinor), locale), limit: money(BigInt(row.limitMinor), locale) } },
    status: over ? { text: '{amount} over', values: { amount: money(BigInt(row.overByMinor), locale) } } : { text: '{amount} left', values: { amount: money(BigInt(row.leftMinor), locale) } },
    reassurance: over ? { text: 'It happens.' } : null,
  };
}

// ---------------------------------------------------------------------------
// The average prefill

/** At most this many earlier months are averaged. */
export const PREFILL_MONTHS = 3;

/**
 * The earlier months a first budget may be prefilled from, most recent
 * first: of the PREFILL_MONTHS before `month`, those that have ended (their
 * last day is before today) and were tracked from their first day, so each
 * is a whole month of records. `trackingStart` is the earliest wallet's;
 * null (no wallets) means no records at all.
 */
export function prefillMonths(input: { month: string; today: string; trackingStart: string | null }): string[] {
  const { month, today, trackingStart } = input;
  if (trackingStart === null) return [];
  const months: string[] = [];
  for (let back = 1; back <= PREFILL_MONTHS; back += 1) {
    const earlier = shiftMonth(month, -back);
    if (monthRange(earlier).through < today && trackingStart <= `${earlier}-01`) months.push(earlier);
  }
  return months;
}

export type Prefill = {
  /** The average monthly spending, rounded down to the satang. */
  readonly averageMinor: Minor;
  /** The months it averages, most recent first. */
  readonly months: readonly string[];
};

/**
 * The average monthly spending of the months that have any, or null when
 * none has (a month of income only says nothing about spending). Never more
 * than a budget may be.
 */
export function averagePrefill(summaries: readonly Pick<MonthSummary, 'month' | 'expense_minor'>[]): Prefill | null {
  const spending = summaries.filter((summary) => BigInt(summary.expense_minor) > 0n);
  if (spending.length === 0) return null;
  const average = sum(spending.map((summary) => BigInt(summary.expense_minor))) / BigInt(spending.length);
  if (average > MINOR_AMOUNT_MAX) return null;
  return { averageMinor: average.toString(), months: spending.map((summary) => summary.month) };
}

/** Where the prefilled total came from, with the amount. */
export function prefillCopy(prefill: Prefill, monthName: (month: string) => string, locale: MoneyLocale): CopyLine {
  const amount = money(BigInt(prefill.averageMinor), locale);
  return prefill.months.length === 1
    ? { text: 'Filled in from what you spent in {month}: {amount}', values: { month: monthName(prefill.months[0]), amount } }
    : { text: 'Filled in from your average spending over {count} months: {amount}', values: { count: prefill.months.length, amount } };
}

// ---------------------------------------------------------------------------
// Setting a budget

/** A category's limit as typed: null (or zero) is no limit. */
export type LimitEntry = { readonly categoryId: string; readonly limitMinor: Minor | null };

export type BudgetCheck =
  | {
    readonly ok: true;
    /** What PUT /v1/budgets/:month sends: the total and the limits above zero, sorted by category id. */
    readonly request: SetMonthlyBudgetRequest;
    readonly limitsMinor: Minor;
    /** What the total leaves for categories without a limit. */
    readonly leftMinor: Minor;
  }
  | { readonly ok: false; readonly problem: 'no_total' | 'limits_over_total'; readonly limitsMinor: Minor; readonly overByMinor: Minor };

/**
 * A budget needs a total above zero. Limits are optional, one per category
 * (the last entry wins), and together may reach the total but never pass it,
 * as the server requires (`category_limits`). The request always names its
 * limits, so a replace that drops them all clears them.
 */
export function checkBudget(totalMinor: Minor | null, limits: readonly LimitEntry[]): BudgetCheck {
  const byCategory = new Map<string, bigint>();
  for (const entry of limits) {
    if (entry.limitMinor === null || BigInt(entry.limitMinor) <= 0n) byCategory.delete(entry.categoryId);
    else byCategory.set(entry.categoryId, BigInt(entry.limitMinor));
  }
  const limitsTotal = sum(byCategory.values());
  const total = totalMinor === null ? 0n : BigInt(totalMinor);
  if (total <= 0n) return { ok: false, problem: 'no_total', limitsMinor: limitsTotal.toString(), overByMinor: '0' };
  if (limitsTotal > total) return { ok: false, problem: 'limits_over_total', limitsMinor: limitsTotal.toString(), overByMinor: (limitsTotal - total).toString() };
  const categoryLimits = [...byCategory]
    .map(([category_id, limit]) => ({ category_id, limit_minor: limit.toString() }))
    .sort((a, b) => a.category_id.localeCompare(b.category_id));
  return { ok: true, request: { overall_limit_minor: total.toString(), category_limits: categoryLimits }, limitsMinor: limitsTotal.toString(), leftMinor: (total - limitsTotal).toString() };
}

/** Under the limits, live: what is left for the rest, or why the limits don't fit. Null without a total (the keypad says why). */
export function checkCopy(check: BudgetCheck, totalMinor: Minor | null, locale: MoneyLocale): CopyLine | null {
  if (check.ok) return { text: 'Left for everything else: {amount}', values: { amount: money(BigInt(check.leftMinor), locale) } };
  if (check.problem === 'no_total' || totalMinor === null) return null;
  return {
    text: 'The limits add up to {limits}, more than the total of {total}.',
    values: { limits: money(BigInt(check.limitsMinor), locale), total: money(BigInt(totalMinor), locale) },
  };
}

/**
 * The categories a limit can be set for: expense categories in use, and any
 * archived one this budget already limits (the server keeps those), in the
 * given order.
 */
export function limitCategories(categories: readonly CategoryDto[], existing: BudgetDto | null): CategoryDto[] {
  const limited = new Set(existing?.category_limits.map((limit) => limit.category_id) ?? []);
  return categories.filter((category) => category.type === 'expense' && (!category.archived || limited.has(category.id)));
}

export type EditorStart = {
  readonly totalMinor: Minor | null;
  readonly limits: ReadonlyMap<string, Minor>;
  /** The total came from the average. */
  readonly prefilled: boolean;
};

/** Changing a budget starts from it; a first budget from the average when there is one; otherwise from nothing. */
export function editorStart(input: { existing: BudgetDto | null; prefill: Prefill | null }): EditorStart {
  const { existing, prefill } = input;
  if (existing) return { totalMinor: existing.overall_limit_minor, limits: new Map(existing.category_limits.map((limit) => [limit.category_id, limit.limit_minor])), prefilled: false };
  if (prefill) return { totalMinor: prefill.averageMinor, limits: new Map(), prefilled: true };
  return { totalMinor: null, limits: new Map(), prefilled: false };
}

const limitsOf = (limits: readonly { category_id: string; limit_minor: Minor }[] | undefined) =>
  [...(limits ?? [])].map((limit) => `${limit.category_id}=${BigInt(limit.limit_minor).toString()}`).sort().join(',');

/**
 * Whether the budget Jotbun holds has exactly these figures: then a create
 * refused because the month already has a budget (an earlier attempt of the
 * same save, or the same figures from another device) changes nothing.
 */
export function sameBudget(server: BudgetDto, mine: SetMonthlyBudgetRequest): boolean {
  return BigInt(server.overall_limit_minor) === BigInt(mine.overall_limit_minor) && limitsOf(server.category_limits) === limitsOf(mine.category_limits);
}

export type BudgetConflictRow = {
  /** 'total', or the category id. */
  readonly key: string;
  readonly categoryId: string | null;
  /** Null: no limit on that side. */
  readonly yoursMinor: Minor | null;
  readonly serverMinor: Minor | null;
  readonly differs: boolean;
};

/**
 * Yours against Jotbun's, figure by figure: the total, then each category
 * that either side limits, in `order` (category ids), any others after.
 */
export function budgetConflictRows(mine: SetMonthlyBudgetRequest, server: BudgetDto, order: readonly string[]): BudgetConflictRow[] {
  const yours = new Map((mine.category_limits ?? []).map((limit) => [limit.category_id, limit.limit_minor]));
  const theirs = new Map(server.category_limits.map((limit) => [limit.category_id, limit.limit_minor]));
  const ids = [...new Set([...yours.keys(), ...theirs.keys()])];
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const row = (key: string, categoryId: string | null, a: Minor | null, b: Minor | null): BudgetConflictRow => ({
    key, categoryId, yoursMinor: a, serverMinor: b, differs: (a === null ? null : BigInt(a)) !== (b === null ? null : BigInt(b)),
  });
  return [
    row('total', null, mine.overall_limit_minor, server.overall_limit_minor),
    ...ids.map((id) => row(id, id, yours.get(id) ?? null, theirs.get(id) ?? null)),
  ];
}
