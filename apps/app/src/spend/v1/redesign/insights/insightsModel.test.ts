import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HistoryPage, TransactionDto } from '@gogospend/contracts';

import { command, entry, pending, tc, transfer } from '../testing/fixtures.ts';
import {
  GOOD_WEEK, HEAT_STEPS, RHYTHM_DAYS, calendarModel, dayFacts, daysLoggedLine, heatStep, readAllPages, rhythmModel, rhythmNeedsOwnRead, rhythmWindow, weekdayOf,
} from './insightsModel.ts';
import type { CalendarDay, InsightsWords } from './insightsModel.ts';

// "Today" is Tuesday 29 September 2026 in Bangkok. September 2026 holds the
// golden month: salary on the 25th, lunch on the 26th, rent on the 27th and a
// move between wallets on the 28th.
const TODAY = '2026-09-29';
const SEP = '2026-09';
const words: InsightsWords = { tc, locale: 'en', fullDate: (date) => `[${date}]` };

const salary = entry({ id: 'salary', type: 'income', amount_minor: '2800000', occurred_on: '2026-09-25' });
const lunch = entry({ id: 'lunch', amount_minor: '18200', occurred_on: '2026-09-26' });
const rent = entry({ id: 'rent', amount_minor: '1226800', occurred_on: '2026-09-27' });
const move = transfer({ id: 'move', amount_minor: '150000', occurred_on: '2026-09-28' });
const GOLDEN: TransactionDto[] = [move, rent, lunch, salary];

const day = (days: readonly CalendarDay[], date: string): CalendarDay => {
  const found = days.find((cell) => cell.date === date);
  assert.ok(found, `no cell for ${date}`);
  return found;
};
const deleted = (record: TransactionDto): TransactionDto => ({ ...record, deleted_at: '2026-09-28T01:00:00.000Z', version: record.version + 1 });

// ---------------------------------------------------------------------------
// Day facts

test("a day's facts: confirmed money out is expenses only, and any entry logs the day", () => {
  const facts = dayFacts([...GOLDEN, entry({ id: 'coffee', amount_minor: '6500', occurred_on: '2026-09-26' })]);
  assert.deepEqual(facts.get('2026-09-26'), { entries: 2, outMinor: '24700', waitingOutMinor: '0', checkingOutMinor: '0', drafts: 0, logged: true });
  assert.equal(facts.get('2026-09-25')?.outMinor, '0', 'income is never money out');
  assert.equal(facts.get('2026-09-25')?.logged, true, 'but it is an entry, so the day is logged');
  assert.equal(facts.get('2026-09-28')?.outMinor, '0', 'a move is neither in nor out');
  assert.equal(facts.get('2026-09-28')?.logged, true);
  assert.equal(facts.get('2026-09-24'), undefined, 'a day with nothing has no facts');
});

test('a deleted entry counts nowhere: neither money nor a logged day', () => {
  const facts = dayFacts([deleted(entry({ id: 'gone', amount_minor: '9900', occurred_on: '2026-09-24' })), rent, deleted(entry({ id: 'gone-too', amount_minor: '100', occurred_on: '2026-09-27' }))]);
  assert.equal(facts.get('2026-09-24'), undefined);
  assert.deepEqual(facts.get('2026-09-27'), { entries: 1, outMinor: '1226800', waitingOutMinor: '0', checkingOutMinor: '0', drafts: 0, logged: true });
});

test("drafts on this device log their day, with their money kept apart from confirmed money", () => {
  const waiting = command(pending({ amount_minor: '6500', occurred_on: TODAY }), 'unsent');
  const paused = command(pending({ amount_minor: '500', occurred_on: TODAY }), 'paused_upgrade');
  const checking = command(pending({ amount_minor: '4000', occurred_on: '2026-09-24' }), 'uncertain');
  const income = command(pending({ type: 'income', amount_minor: '7000', occurred_on: '2026-09-23' }), 'unsent');
  const refused = command(pending({ amount_minor: '999', occurred_on: '2026-09-22' }), 'needs_review');
  const done = command(pending({ amount_minor: '111', occurred_on: '2026-09-21' }), 'acknowledged');
  // The server already has this one: the confirmed record wins, and its draft adds nothing.
  const twin = command(pending({ id: rent.id, amount_minor: rent.amount_minor, occurred_on: rent.occurred_on }), 'sending');
  const facts = dayFacts([rent], [waiting, paused, checking, income, refused, done, twin]);
  assert.deepEqual(facts.get(TODAY), { entries: 0, outMinor: '0', waitingOutMinor: '7000', checkingOutMinor: '0', drafts: 2, logged: true });
  assert.deepEqual(facts.get('2026-09-24'), { entries: 0, outMinor: '0', waitingOutMinor: '0', checkingOutMinor: '4000', drafts: 1, logged: true });
  assert.equal(facts.get('2026-09-23')?.logged, true, 'an income draft logs the day too');
  assert.equal(facts.get('2026-09-23')?.waitingOutMinor, '0');
  assert.equal(facts.get('2026-09-22'), undefined, 'a draft Jotbun refused counts nowhere until it is fixed');
  assert.equal(facts.get('2026-09-21'), undefined, 'an acknowledged command is no longer a draft');
  assert.deepEqual(facts.get('2026-09-27'), { entries: 1, outMinor: '1226800', waitingOutMinor: '0', checkingOutMinor: '0', drafts: 0, logged: true });
});

// ---------------------------------------------------------------------------
// Heat

test('heat steps: none without money out, then four steps of the busiest day, exact', () => {
  assert.equal(HEAT_STEPS, 4);
  assert.equal(heatStep('0', '0'), 0);
  assert.equal(heatStep('0', '1000'), 0);
  assert.equal(heatStep('1000', '1000'), 4);
  assert.deepEqual(['1', '250', '251', '500', '501', '750', '751', '999'].map((out) => heatStep(out, '1000')), [1, 1, 2, 2, 3, 3, 4, 4]);
  // Beyond 2^53: still exact satang, never a float.
  assert.equal(heatStep('2251799813685249', '9007199254740993'), 2);
  assert.equal(heatStep('2251799813685248', '9007199254740992'), 1);
});

// ---------------------------------------------------------------------------
// The calendar

test('weekdays are Bangkok calendar dates: Sunday is 0', () => {
  assert.deepEqual(['2026-09-01', '2026-09-06', '2026-09-29', '2024-02-29', '1970-01-01'].map(weekdayOf), [2, 0, 2, 4, 4]);
});

test('a month calendar: Sunday-first weeks, blanks outside the month, each day with its money out', () => {
  const calendar = calendarModel({ month: SEP, today: TODAY, records: GOLDEN, words });
  // 1 September 2026 is a Tuesday: two blanks first; 30 days fill five weeks.
  assert.equal(calendar.weeks.length, 5);
  assert.ok(calendar.weeks.every((week) => week.length === 7));
  assert.deepEqual(calendar.weeks[0].map((cell) => cell?.dayOfMonth ?? null), [null, null, 1, 2, 3, 4, 5]);
  assert.deepEqual(calendar.weeks[4].map((cell) => cell?.dayOfMonth ?? null), [27, 28, 29, 30, null, null, null]);
  assert.equal(calendar.days.length, 30);
  assert.deepEqual(calendar.days.map((cell) => cell.date).slice(0, 2), ['2026-09-01', '2026-09-02']);

  const rentDay = day(calendar.days, '2026-09-27');
  assert.deepEqual([rentDay.outMinor, rentDay.step, rentDay.logged, rentDay.weekday], ['1226800', 4, true, 0]);
  assert.equal(rentDay.label, '[2026-09-27], Money out ฿12,268.00');
  const lunchDay = day(calendar.days, '2026-09-26');
  assert.deepEqual([lunchDay.outMinor, lunchDay.step], ['18200', 1]);
  // Logged, but no money out: a logged day at heat 0, still said with its exact ฿0.00.
  const salaryDay = day(calendar.days, '2026-09-25');
  assert.deepEqual([salaryDay.logged, salaryDay.step, salaryDay.label], [true, 0, '[2026-09-25], Money out ฿0.00']);
  assert.deepEqual([day(calendar.days, '2026-09-28').logged, day(calendar.days, '2026-09-28').step], [true, 0]);
  const quiet = day(calendar.days, '2026-09-24');
  assert.deepEqual([quiet.logged, quiet.step, quiet.label], [false, 0, '[2026-09-24], Nothing logged']);
  assert.equal(calendar.maxOutMinor, '1226800');
  assert.equal(calendar.daysLogged, 4);
  assert.equal(calendar.empty, false);
});

test('today is marked and named; days after today are future and say nothing', () => {
  const calendar = calendarModel({ month: SEP, today: TODAY, records: GOLDEN, words });
  assert.deepEqual(calendar.days.filter((cell) => cell.isToday).map((cell) => cell.date), [TODAY]);
  assert.equal(day(calendar.days, TODAY).label, 'Today, [2026-09-29], Nothing logged');
  assert.deepEqual(calendar.days.filter((cell) => cell.isFuture).map((cell) => cell.date), ['2026-09-30']);
  const future = day(calendar.days, '2026-09-30');
  assert.deepEqual([future.logged, future.step, future.label], [false, 0, '[2026-09-30]']);
});

test("a day's drafts are said after its confirmed money, never added to it", () => {
  const drafts = [
    command(pending({ amount_minor: '6500', occurred_on: TODAY }), 'unsent'),
    command(pending({ amount_minor: '4000', occurred_on: '2026-09-27' }), 'uncertain'),
  ];
  const calendar = calendarModel({ month: SEP, today: TODAY, records: GOLDEN, drafts, words });
  const today = day(calendar.days, TODAY);
  assert.deepEqual([today.logged, today.outMinor, today.step], [true, '0', 0]);
  assert.equal(today.label, 'Today, [2026-09-29], Money out ฿0.00, Waiting to sync: money out ฿65.00');
  const rentDay = day(calendar.days, '2026-09-27');
  assert.deepEqual([rentDay.outMinor, rentDay.step], ['1226800', 4]);
  assert.equal(rentDay.label, '[2026-09-27], Money out ฿12,268.00, Checking with Jotbun: money out ฿40.00');
  assert.equal(calendar.daysLogged, 5);
});

test('an empty month: every day says nothing logged, at heat 0', () => {
  const calendar = calendarModel({ month: '2026-08', today: TODAY, records: [deleted(entry({ occurred_on: '2026-08-10' }))], words });
  assert.equal(calendar.empty, true);
  assert.equal(calendar.daysLogged, 0);
  assert.equal(calendar.maxOutMinor, '0');
  assert.equal(calendar.days.length, 31);
  assert.ok(calendar.days.every((cell) => !cell.logged && cell.step === 0 && cell.label.endsWith(', Nothing logged')));
});

test('a past month has no today and no future: every day can be opened', () => {
  const august = [entry({ amount_minor: '5000', occurred_on: '2026-08-31' }), entry({ amount_minor: '2000', occurred_on: '2026-08-01' }), lunch];
  const calendar = calendarModel({ month: '2026-08', today: TODAY, records: august, words });
  assert.equal(calendar.days.length, 31);
  assert.ok(calendar.days.every((cell) => !cell.isToday && !cell.isFuture));
  // Records outside the month never leak in.
  assert.equal(calendar.daysLogged, 2);
  assert.deepEqual([day(calendar.days, '2026-08-31').step, day(calendar.days, '2026-08-01').step], [4, 2]);
  // 1 August 2026 is a Saturday: six blanks, then six weeks in all.
  assert.deepEqual(calendar.weeks[0].map((cell) => cell?.dayOfMonth ?? null), [null, null, null, null, null, null, 1]);
  assert.equal(calendar.weeks.length, 6);
});

test("the days logged line counts days, never money, and leaves a month with none unsaid", () => {
  const current = { month: SEP, thisMonth: SEP, monthName: 'September 2026', tc };
  assert.equal(daysLoggedLine(12, current), 'Logged 12 days this month');
  assert.equal(daysLoggedLine(1, current), 'Logged 1 day this month');
  assert.equal(daysLoggedLine(0, current), null);
  const past = { month: '2026-08', thisMonth: SEP, monthName: 'August 2026', tc };
  assert.equal(daysLoggedLine(3, past), 'Logged 3 days in August 2026');
  assert.equal(daysLoggedLine(1, past), 'Logged 1 day in August 2026');
  assert.equal(daysLoggedLine(0, past), null);
});

// ---------------------------------------------------------------------------
// The rhythm: the last seven days, forgiving

test('the rhythm is the last seven days up to today, oldest first, across a month end', () => {
  assert.equal(RHYTHM_DAYS, 7);
  assert.deepEqual(rhythmWindow(TODAY), { from: '2026-09-23', through: TODAY });
  assert.deepEqual(rhythmWindow('2026-10-03'), { from: '2026-09-27', through: '2026-10-03' });
  const rhythm = rhythmModel({ today: TODAY, records: GOLDEN, tc });
  assert.deepEqual(rhythm.days.map((item) => [item.date, item.logged, item.isToday]), [
    ['2026-09-23', false, false], ['2026-09-24', false, false], ['2026-09-25', true, false], ['2026-09-26', true, false],
    ['2026-09-27', true, false], ['2026-09-28', true, false], ['2026-09-29', false, true],
  ]);
  assert.deepEqual(rhythm.days.map((item) => item.weekday), [3, 4, 5, 6, 0, 1, 2]);
  assert.equal(rhythm.count, 4);
  assert.equal(rhythm.line, 'Logged on 4 days in the past week');
  const october = rhythmModel({ today: '2026-10-03', records: GOLDEN, tc });
  assert.deepEqual(october.days.filter((item) => item.logged).map((item) => item.date), ['2026-09-27', '2026-09-28']);
});

test('a skipped day never breaks anything: every logged day in the week still counts', () => {
  // Logged every day but yesterday: six days, not a streak of one.
  const week = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', TODAY].map((date, index) => entry({ id: `d${index}`, occurred_on: date }));
  const rhythm = rhythmModel({ today: TODAY, records: week, tc });
  assert.equal(rhythm.count, 6);
  assert.equal(rhythm.goodWeek, true);
  assert.equal(rhythm.line, 'Logged on 6 days in the past week');
  assert.deepEqual(rhythm.days.map((item) => item.logged), [true, true, true, true, true, false, true]);
  // Two days far apart are two days, whatever lies between them.
  const sparse = rhythmModel({ today: TODAY, records: [entry({ occurred_on: '2026-09-23' }), entry({ occurred_on: TODAY })], tc });
  assert.equal(sparse.count, 2);
});

test('a good week is five logged days or more; one day and none read kindly', () => {
  assert.equal(GOOD_WEEK, 5);
  const days = (count: number) => Array.from({ length: count }, (_, index) => entry({ occurred_on: `2026-09-${String(29 - index).padStart(2, '0')}` }));
  assert.deepEqual([4, 5, 7].map((count) => rhythmModel({ today: TODAY, records: days(count), tc }).goodWeek), [false, true, true]);
  assert.equal(rhythmModel({ today: TODAY, records: days(1), tc }).line, 'Logged on 1 day in the past week');
  const none = rhythmModel({ today: TODAY, records: [], tc });
  assert.equal(none.count, 0);
  assert.equal(none.goodWeek, false);
  assert.equal(none.line, 'Your diary is here whenever you are.');
});

test('the rhythm skips deleted entries and counts drafts on this device', () => {
  const rhythm = rhythmModel({
    today: TODAY,
    records: [deleted(entry({ occurred_on: '2026-09-24' })), entry({ occurred_on: '2026-09-23' }), entry({ occurred_on: '2026-09-01' })],
    drafts: [command(pending({ occurred_on: TODAY }), 'unsent'), command(pending({ occurred_on: '2026-09-26' }), 'needs_review')],
    tc,
  });
  assert.deepEqual(rhythm.days.filter((item) => item.logged).map((item) => item.date), ['2026-09-23', TODAY]);
});

test('the rhythm needs its own read only when its week is not inside the month shown', () => {
  assert.equal(rhythmNeedsOwnRead(SEP, TODAY), false);
  assert.equal(rhythmNeedsOwnRead('2026-10', '2026-10-03'), true);
  assert.equal(rhythmNeedsOwnRead('2026-08', TODAY), true);
  assert.equal(rhythmNeedsOwnRead('2026-10', '2026-10-07'), false);
});

// ---------------------------------------------------------------------------
// Reading a range: every page

const TOTALS = { income_minor: '0', expense_minor: '300', balance_minor: '-300', by_wallet: {}, count: 3 };
const page = (items: TransactionDto[], next: string | null, refresh = false): HistoryPage => ({ items, next_cursor: next, as_of_revision: '7', refresh_suggested: refresh, summary: TOTALS });

test('reads every page of a range, in order, with the whole range totals', async () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => entry({ id, amount_minor: '100' }));
  const asked: (string | undefined)[] = [];
  const pages: Record<string, HistoryPage> = { first: page([a], 'p2'), p2: page([b], 'p3'), p3: page([c], null) };
  const result = await readAllPages(async (cursor) => {
    asked.push(cursor);
    return pages[cursor ?? 'first'];
  });
  assert.deepEqual(asked, [undefined, 'p2', 'p3']);
  assert.deepEqual(result.records.map((record) => record.id), ['a', 'b', 'c']);
  assert.deepEqual(result.summary, TOTALS);
  assert.equal(result.refreshSuggested, false);
});

test('a page saying the diary changed meanwhile is passed on, and a cursor that repeats is refused', async () => {
  const changed = await readAllPages(async (cursor) => (cursor ? page([], null, true) : page([], 'p2')));
  assert.equal(changed.refreshSuggested, true);
  await assert.rejects(readAllPages(async () => page([], 'same')), /cursor/);
});
