// R5 Insights (plan §6.3): the month's calendar and the logging rhythm, as a
// pure model. No React, no React Native. Money stays exact (BigInt over
// canonical satang strings); dates are Asia/Bangkok calendar dates
// (`YYYY-MM-DD`), as the server reports them in `occurred_on`.
//
// - Day facts come from confirmed history records and the drafts on this
//   device. A deleted record counts nowhere. Money out is expenses only:
//   income and moves between wallets are entries, so they log their day, but
//   are never money out (the same rule as `dayTotals` in shared.ts).
// - A draft follows its money group (shared.ts): one waiting to sync or being
//   checked logs its day and its money is said apart, never added to the
//   confirmed money. A draft Jotbun refused (needs a look) counts nowhere
//   until it is fixed, and a draft whose record is already confirmed adds
//   nothing.
// - Heat: four steps of the month's busiest day (ceil(4 × out ÷ max)), in
//   exact integers. It is decoration; each day's label carries the amount.
// - The rhythm (decision D5): the days logged in the last seven days up to
//   today. It is forgiving: every logged day counts, a skipped day never
//   resets anything, and no money is in it.
import type { FilteredTotals, HistoryPage, Minor, TransactionDto } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../../storage/types.ts';
import { formatMinor } from '../../money.ts';
import type { MoneyLocale } from '../../money.ts';
import { monthRange } from '../../viewModels.ts';
import { addDays, dayNumber, daysInMonth, moneyGroupOf, unconfirmedDrafts } from '../shared.ts';
import type { Translate } from '../shared.ts';

/** Heat steps above "no money out". */
export const HEAT_STEPS = 4;
/** The rhythm's window: today and the six days before it. */
export const RHYTHM_DAYS = 7;
/** A week the bun may cheer (at full intensity): logged on at least this many of the last seven days. */
export const GOOD_WEEK = 5;

export type HeatStep = 0 | 1 | 2 | 3 | 4;

/** What one day holds. */
export type DayFacts = {
  /** Active confirmed records on the day, of any type. */
  entries: number;
  /** Confirmed money out (expenses), in satang. */
  outMinor: Minor;
  /** Money out in drafts waiting to sync (never committed); kept apart. */
  waitingOutMinor: Minor;
  /** Money out in drafts being checked with Jotbun (maybe committed); kept apart. */
  checkingOutMinor: Minor;
  /** Drafts on this device that log the day. */
  drafts: number;
  /** At least one entry: a confirmed record or a draft that counts. */
  logged: boolean;
};

/** The words a model needs: copy, money and the screen's whole-date label. */
export type InsightsWords = { tc: Translate; locale: MoneyLocale; fullDate: (date: string) => string };

export type CalendarDay = {
  date: string;
  dayOfMonth: number;
  /** 0 = Sunday. */
  weekday: number;
  isToday: boolean;
  /** After today: drawn, never opened. */
  isFuture: boolean;
  logged: boolean;
  /** Confirmed money out. */
  outMinor: Minor;
  step: HeatStep;
  /** "Sunday 27 September 2026, Money out ฿12,268.00", "Today, …, Nothing logged"; a future day is its date alone. */
  label: string;
};

export type CalendarModel = {
  month: string;
  /** Sunday-first weeks of seven cells; null outside the month. */
  weeks: readonly (readonly (CalendarDay | null)[])[];
  /** The month's days in order. */
  days: readonly CalendarDay[];
  /** Days in the month with at least one entry. */
  daysLogged: number;
  /** No day of the month is logged. */
  empty: boolean;
  /** The busiest day's confirmed money out: the top heat step. */
  maxOutMinor: Minor;
};

export type RhythmDay = { date: string; weekday: number; isToday: boolean; logged: boolean };
export type Rhythm = {
  /** The last seven days, oldest first, ending today. */
  days: readonly RhythmDay[];
  /** Logged days among them: every one counts, whatever lies between. */
  count: number;
  /** Five or more: a week the bun may cheer. */
  goodWeek: boolean;
  /** "Logged on 4 days in the past week", or a kind line for none. */
  line: string;
};

/** Every page of one history range. */
export type RangeRead = { records: TransactionDto[]; summary: FilteredTotals; refreshSuggested: boolean };

const ZERO: Minor = '0';

type Sums = { entries: number; out: bigint; waiting: bigint; checking: bigint; drafts: number };

/** Each day's facts from confirmed records and this device's drafts. Days with nothing have no entry. */
export function dayFacts(records: readonly TransactionDto[], drafts: readonly OutboxCommand[] = []): ReadonlyMap<string, DayFacts> {
  const sums = new Map<string, Sums>();
  const on = (day: string): Sums => {
    let sum = sums.get(day);
    if (!sum) {
      sum = { entries: 0, out: 0n, waiting: 0n, checking: 0n, drafts: 0 };
      sums.set(day, sum);
    }
    return sum;
  };
  const active = records.filter((record) => record.deleted_at === null);
  for (const record of active) {
    const sum = on(record.occurred_on);
    sum.entries += 1;
    if (record.type === 'expense') sum.out += BigInt(record.amount_minor);
  }
  for (const command of unconfirmedDrafts(drafts, new Set(active.map((record) => record.id)))) {
    const group = moneyGroupOf(command.state);
    if (group === null) continue;
    const entry = command.payload;
    const sum = on(entry.occurred_on);
    sum.drafts += 1;
    if (entry.type !== 'expense') continue;
    if (group === 'waiting') sum.waiting += BigInt(entry.amount_minor);
    else sum.checking += BigInt(entry.amount_minor);
  }
  const facts = new Map<string, DayFacts>();
  for (const [day, sum] of sums) {
    facts.set(day, {
      entries: sum.entries,
      outMinor: sum.out.toString(),
      waitingOutMinor: sum.waiting.toString(),
      checkingOutMinor: sum.checking.toString(),
      drafts: sum.drafts,
      logged: sum.entries + sum.drafts > 0,
    });
  }
  return facts;
}

/** 0 with no money out; otherwise 1 to 4, the ceiling of four times the day's share of the busiest day. */
export function heatStep(outMinor: Minor, maxOutMinor: Minor): HeatStep {
  const out = BigInt(outMinor);
  const max = BigInt(maxOutMinor);
  if (out <= 0n || max <= 0n) return 0;
  const steps = BigInt(HEAT_STEPS);
  const step = (steps * out + max - 1n) / max;
  return Number(step > steps ? steps : step) as HeatStep;
}

/** Day of the week of a calendar date, 0 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOf(date: string): number {
  return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

const NOTHING: DayFacts = { entries: 0, outMinor: ZERO, waitingOutMinor: ZERO, checkingOutMinor: ZERO, drafts: 0, logged: false };

function dayLabel(date: string, facts: DayFacts, isToday: boolean, isFuture: boolean, words: InsightsWords): string {
  const { tc, locale } = words;
  const name = isToday ? `${tc('Today')}, ${words.fullDate(date)}` : words.fullDate(date);
  if (isFuture) return name;
  if (!facts.logged) return `${name}, ${tc('Nothing logged')}`;
  const parts = [name, `${tc('Money out')} ${formatMinor(facts.outMinor, locale)}`];
  if (facts.waitingOutMinor !== ZERO) parts.push(tc('Waiting to sync: money out {amount}', { amount: formatMinor(facts.waitingOutMinor, locale) }));
  if (facts.checkingOutMinor !== ZERO) parts.push(tc('Checking with Jotbun: money out {amount}', { amount: formatMinor(facts.checkingOutMinor, locale) }));
  return parts.join(', ');
}

/** The month as a Sunday-first calendar, each day with its money out, heat and label. */
export function calendarModel(input: { month: string; today: string; records: readonly TransactionDto[]; drafts?: readonly OutboxCommand[]; words: InsightsWords }): CalendarModel {
  const { month, today, words } = input;
  const facts = dayFacts(input.records, input.drafts);
  const count = daysInMonth(month);
  const dates = Array.from({ length: count }, (_, index) => addDays(`${month}-01`, index));
  const max = dates.reduce((top, date) => {
    const out = BigInt(facts.get(date)?.outMinor ?? ZERO);
    return out > top ? out : top;
  }, 0n).toString();
  const days = dates.map((date, index): CalendarDay => {
    const fact = facts.get(date) ?? NOTHING;
    const isToday = date === today;
    const isFuture = date > today;
    return {
      date, dayOfMonth: index + 1, weekday: weekdayOf(date), isToday, isFuture,
      logged: !isFuture && fact.logged,
      outMinor: isFuture ? ZERO : fact.outMinor,
      step: isFuture ? 0 : heatStep(fact.outMinor, max),
      label: dayLabel(date, fact, isToday, isFuture, words),
    };
  });
  const cells: (CalendarDay | null)[] = [...Array.from({ length: days[0].weekday }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  const daysLogged = days.filter((day) => day.logged).length;
  return { month, weeks, days, daysLogged, empty: daysLogged === 0, maxOutMinor: max };
}

/**
 * "Logged 12 days this month", or "… in August 2026" for a month gone by.
 * Days only, never money. A month with none logged says nothing here: the
 * screen's empty state speaks for it, and zero is never counted at anyone.
 */
export function daysLoggedLine(count: number, context: { month: string; thisMonth: string; monthName: string; tc: Translate }): string | null {
  const { tc } = context;
  if (count <= 0) return null;
  if (context.month === context.thisMonth) return count === 1 ? tc('Logged 1 day this month') : tc('Logged {count} days this month', { count });
  return count === 1 ? tc('Logged 1 day in {month}', { month: context.monthName }) : tc('Logged {count} days in {month}', { count, month: context.monthName });
}

/** The rhythm's days: today and the six before it. */
export function rhythmWindow(today: string): { from: string; through: string } {
  return { from: addDays(today, -(RHYTHM_DAYS - 1)), through: today };
}

/** The last seven days, logged or open. Every logged day counts; a skipped day never breaks anything. */
export function rhythmModel(input: { today: string; records: readonly TransactionDto[]; drafts?: readonly OutboxCommand[]; tc: Translate }): Rhythm {
  const { today, tc } = input;
  const facts = dayFacts(input.records, input.drafts);
  const { from } = rhythmWindow(today);
  const days = Array.from({ length: RHYTHM_DAYS }, (_, index): RhythmDay => {
    const date = addDays(from, index);
    return { date, weekday: weekdayOf(date), isToday: date === today, logged: facts.get(date)?.logged ?? false };
  });
  const count = days.filter((day) => day.logged).length;
  const line = count === 0
    ? tc('Your diary is here whenever you are.')
    : count === 1 ? tc('Logged on 1 day in the past week') : tc('Logged on {count} days in the past week', { count });
  return { days, count, goodWeek: count >= GOOD_WEEK, line };
}

/** Whether the rhythm's week falls outside the month shown, so it needs its own read. */
export function rhythmNeedsOwnRead(month: string, today: string): boolean {
  const { from, through } = monthRange(month);
  const week = rhythmWindow(today);
  return week.from < from || week.through > through;
}

/**
 * Every page of one history range, in order. The totals are the first
 * page's (they cover the whole range). A page that says the diary changed
 * since the first is passed on, so the screen can offer a refresh. A cursor
 * that comes back again is refused rather than read forever.
 */
export async function readAllPages(read: (cursor?: string) => Promise<HistoryPage>): Promise<RangeRead> {
  const first = await read();
  const records = [...first.items];
  let refreshSuggested = first.refresh_suggested;
  const seen = new Set<string>();
  let cursor = first.next_cursor;
  while (cursor !== null) {
    if (seen.has(cursor)) throw new Error(`History returned the same cursor twice: ${cursor}`);
    seen.add(cursor);
    const page = await read(cursor);
    records.push(...page.items);
    refreshSuggested ||= page.refresh_suggested;
    cursor = page.next_cursor;
  }
  return { records, summary: first.summary, refreshSuggested };
}
