// Budget pace for the redesigned Home and Budget screens: what is spent and
// left this month, how much is left per day, and whether spending runs ahead
// of an even pace. Exact BigInt over canonical satang strings; dates are
// Asia/Bangkok calendar dates. Copy is kind and factual, never shaming.
import type { BudgetDto, Minor, MonthSummary } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../storage/types.ts';
import { formatMinor } from '../money.ts';
import type { MoneyLocale } from '../money.ts';
import { daysBetween, daysInMonth, moneyGroupOf, unconfirmedDrafts } from './shared.ts';
import type { CopyLine } from './shared.ts';

/**
 * - `on_track`: spending is at or below the even pace (with the tolerance below);
 * - `tight`: not over, but spending is ahead of the even pace;
 * - `over`: spent more than the limit (left is negative);
 * - `no_budget`: the month has no budget.
 */
export type PaceState = 'on_track' | 'tight' | 'over' | 'no_budget';
/** Where today sits relative to the budget's month. */
export type PacePhase = 'before' | 'during' | 'after';

/**
 * The tight threshold, in percent of the even pace. Even pace through the end
 * of today is `limit × daysElapsed ÷ daysInMonth` (today counts as elapsed);
 * spending is "tight" when it is more than this percentage of that line:
 * `spent × daysInMonth × 100 > limit × daysElapsed × TIGHT_PACE_PERCENT`,
 * compared in exact integers. 110 means "more than 10% ahead of even pace".
 * After the month ends nothing is tight: it is over or it is not.
 */
export const TIGHT_PACE_PERCENT = 110n;

export type SpentBreakdown = {
  /** Expenses the server confirmed this month. */
  confirmedMinor: Minor;
  /** Expense drafts waiting to sync this month (unsent, update to send): never committed, so included in the estimate. */
  pendingMinor: Minor;
  /** Expense drafts being checked (sending, uncertain): possibly counted already, so never added. */
  checkingMinor: Minor;
  /** confirmed + pending: what pace, left and per day use. */
  estimatedMinor: Minor;
};

export type CategoryPace = {
  categoryId: string;
  limitMinor: Minor;
  spent: SpentBreakdown;
  /** limit − estimated spent; negative when over. */
  leftMinor: Minor;
  /** How far over (positive), else '0'. */
  overByMinor: Minor;
  state: Exclude<PaceState, 'no_budget'>;
};

export type BudgetPace = {
  month: string;
  state: PaceState;
  phase: PacePhase;
  daysInMonth: number;
  /** Days left in the month counting today (0 once the month is over; the whole month before it starts). */
  daysLeft: number;
  /** Days gone through the end of today (0 before the month, all of it after). */
  daysElapsed: number;
  spent: SpentBreakdown;
  limitMinor: Minor | null;
  /** limit − estimated spent (may be negative); null without a budget. */
  leftMinor: Minor | null;
  /** How far over (positive), '0' when not over; null without a budget. */
  overByMinor: Minor | null;
  /** left ÷ daysLeft rounded down to whole satang; '0' at exactly zero left; null when over, after the month, or without a budget. */
  perDayMinor: Minor | null;
  categories: CategoryPace[];
};

export type BudgetPaceInput = {
  /** The month's budget, or null when it has none. */
  budget: BudgetDto | null;
  /** The same month's summary (its `month` decides the month). */
  summary: MonthSummary;
  /** Today's Bangkok date. */
  today: string;
  /** The device outbox: this month's expense drafts are pending money (waiting) or said apart (checking), by their money group. */
  outbox?: readonly OutboxCommand[];
  /**
   * Ids of records known to be confirmed (Home passes the records it loaded).
   * A draft for one of them counts nowhere: the summary already has it.
   */
  confirmedIds?: ReadonlySet<string>;
};

type Days = { phase: PacePhase; daysInMonth: number; daysLeft: number; daysElapsed: number };

function daysOf(month: string, today: string): Days {
  const total = daysInMonth(month);
  const intoMonth = daysBetween(`${month}-01`, today);
  if (intoMonth < 0) return { phase: 'before', daysInMonth: total, daysLeft: total, daysElapsed: 0 };
  if (intoMonth >= total) return { phase: 'after', daysInMonth: total, daysLeft: 0, daysElapsed: total };
  return { phase: 'during', daysInMonth: total, daysLeft: total - intoMonth, daysElapsed: intoMonth + 1 };
}

/** Expense drafts of the month by category, not yet confirmed: waiting ones and checking ones, apart. */
function draftExpenses(outbox: readonly OutboxCommand[], month: string, confirmedIds: ReadonlySet<string>) {
  const waiting = new Map<string, bigint>();
  const checking = new Map<string, bigint>();
  for (const command of unconfirmedDrafts(outbox, confirmedIds)) {
    const entry = command.payload;
    if (entry.type !== 'expense' || entry.occurred_on.slice(0, 7) !== month) continue;
    const group = moneyGroupOf(command.state);
    const into = group === 'waiting' ? waiting : group === 'checking' ? checking : null;
    if (into) into.set(entry.category_id, (into.get(entry.category_id) ?? 0n) + BigInt(entry.amount_minor));
  }
  const sum = (by: Map<string, bigint>) => [...by.values()].reduce((total, amount) => total + amount, 0n);
  return { waiting, checking, waitingTotal: sum(waiting), checkingTotal: sum(checking) };
}

function breakdown(confirmed: bigint, pending: bigint, checking: bigint): SpentBreakdown {
  return { confirmedMinor: confirmed.toString(), pendingMinor: pending.toString(), checkingMinor: checking.toString(), estimatedMinor: (confirmed + pending).toString() };
}

/** Over, tight or on track for `spent` against `limit` at this point of the month. */
function stateOf(spent: bigint, limit: bigint, days: Days): Exclude<PaceState, 'no_budget'> {
  if (spent > limit) return 'over';
  if (days.phase === 'after') return 'on_track';
  const ahead = spent * BigInt(days.daysInMonth) * 100n > limit * BigInt(days.daysElapsed) * TIGHT_PACE_PERCENT;
  return ahead ? 'tight' : 'on_track';
}

export function budgetPace(input: BudgetPaceInput): BudgetPace {
  const { budget, summary, today } = input;
  const month = summary.month;
  if (budget && budget.month !== month) throw new TypeError(`The budget is for ${budget.month}, the summary for ${month}.`);
  const days = daysOf(month, today);
  const drafts = draftExpenses(input.outbox ?? [], month, input.confirmedIds ?? new Set());
  const confirmed = BigInt(summary.expense_minor);
  const spent = breakdown(confirmed, drafts.waitingTotal, drafts.checkingTotal);
  if (!budget) {
    return { month, state: 'no_budget', ...days, spent, limitMinor: null, leftMinor: null, overByMinor: null, perDayMinor: null, categories: [] };
  }
  const estimated = BigInt(spent.estimatedMinor);
  const limit = BigInt(budget.overall_limit_minor);
  const left = limit - estimated;
  const perDay = left < 0n || days.daysLeft === 0 ? null : (left / BigInt(days.daysLeft)).toString();
  const confirmedByCategory = new Map(summary.categories.filter((total) => total.type === 'expense').map((total) => [total.category_id, BigInt(total.total_minor)]));
  const categories = budget.category_limits.map((categoryLimit): CategoryPace => {
    const id = categoryLimit.category_id;
    const categorySpent = breakdown(confirmedByCategory.get(id) ?? 0n, drafts.waiting.get(id) ?? 0n, drafts.checking.get(id) ?? 0n);
    const categoryLimitMinor = BigInt(categoryLimit.limit_minor);
    const categoryLeft = categoryLimitMinor - BigInt(categorySpent.estimatedMinor);
    return {
      categoryId: id, limitMinor: categoryLimit.limit_minor, spent: categorySpent, leftMinor: categoryLeft.toString(),
      overByMinor: (categoryLeft < 0n ? -categoryLeft : 0n).toString(), state: stateOf(BigInt(categorySpent.estimatedMinor), categoryLimitMinor, days),
    };
  });
  return {
    month, state: stateOf(estimated, limit, days), ...days, spent, limitMinor: budget.overall_limit_minor, leftMinor: left.toString(),
    overByMinor: (left < 0n ? -left : 0n).toString(), perDayMinor: perDay, categories,
  };
}

export type PaceCopy = {
  /** Stage header: "{spent} of {limit}", or "{spent} spent this month" without a budget. */
  total: CopyLine;
  /** The pace line: "{amount} a day left · on track", "{amount} over · {days} days to go", … */
  headline: CopyLine;
  /** When drafts are included: "Includes {amount} saving on this device". */
  pendingNote: CopyLine | null;
  /** When drafts are being checked: "{amount} more is being checked with Jotbun". */
  checkingNote: CopyLine | null;
  /** Over budget only: a kind word before the facts. */
  reassurance: CopyLine | null;
  /** No budget only: the prompt to set one. */
  setBudget: CopyLine | null;
  /** Per category limit, by category id: "{amount} left" or "{amount} over". */
  categories: Readonly<Record<string, CopyLine>>;
};

function headline(pace: BudgetPace, money: (minor: Minor) => string): CopyLine {
  if (pace.state === 'no_budget' || pace.leftMinor === null || pace.overByMinor === null) return { text: 'No budget this month' };
  const left = BigInt(pace.leftMinor);
  if (pace.phase === 'after') {
    if (pace.state === 'over') return { text: '{amount} over this month', values: { amount: money(pace.overByMinor) } };
    if (left === 0n) return { text: 'Right on budget this month' };
    return { text: '{amount} left this month', values: { amount: money(pace.leftMinor) } };
  }
  const lastDay = pace.daysLeft === 1;
  if (pace.state === 'over') {
    return lastDay
      ? { text: '{amount} over · last day', values: { amount: money(pace.overByMinor) } }
      : { text: '{amount} over · {days} days to go', values: { amount: money(pace.overByMinor), days: pace.daysLeft } };
  }
  if (left === 0n) return lastDay ? { text: 'Right at the limit · last day' } : { text: 'Right at the limit · {days} days to go', values: { days: pace.daysLeft } };
  const amount = money(pace.perDayMinor ?? '0');
  return pace.state === 'tight'
    ? { text: '{amount} a day left · a bit ahead of pace', values: { amount } }
    : { text: '{amount} a day left · on track', values: { amount } };
}

export function paceCopy(pace: BudgetPace, locale: MoneyLocale): PaceCopy {
  const money = (minor: Minor) => formatMinor(minor, locale);
  const budgeted = pace.limitMinor !== null;
  const categories: Record<string, CopyLine> = {};
  for (const category of pace.categories) {
    categories[category.categoryId] = category.state === 'over'
      ? { text: '{amount} over', values: { amount: money(category.overByMinor) } }
      : { text: '{amount} left', values: { amount: money(category.leftMinor) } };
  }
  return {
    total: budgeted
      ? { text: '{spent} of {limit}', values: { spent: money(pace.spent.estimatedMinor), limit: money(pace.limitMinor as Minor) } }
      : { text: '{spent} spent this month', values: { spent: money(pace.spent.estimatedMinor) } },
    headline: headline(pace, money),
    pendingNote: pace.spent.pendingMinor === '0' ? null : { text: 'Includes {amount} saving on this device', values: { amount: money(pace.spent.pendingMinor) } },
    checkingNote: pace.spent.checkingMinor === '0' ? null : { text: '{amount} more is being checked with Jotbun', values: { amount: money(pace.spent.checkingMinor) } },
    reassurance: pace.state === 'over' ? { text: 'It happens.' } : null,
    setBudget: budgeted ? null : { text: "Set a monthly budget to see what's left each day" },
    categories,
  };
}
