import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';

import { budgetPace } from '../budgetPace.ts';
import type { CopyLine } from '../shared.ts';
import { BILLS, FOOD, PETS, SALARY, TRAVEL, budget, command, entry, pending, spentSummary, summary, tc } from '../testing/fixtures.ts';
import {
  PREFILL_MONTHS,
  averagePrefill,
  budgetConflictRows,
  burnChart,
  burnDown,
  burnDownCopy,
  canShowNextMonth,
  categoryLimitRows,
  categoryRowCopy,
  checkBudget,
  checkCopy,
  dailySpending,
  editorStart,
  limitCategories,
  prefillCopy,
  prefillMonths,
  sameBudget,
} from './budgetModel.ts';

const say = (line: CopyLine | null) => (line ? tc(line.text, line.values) : null);
const OCT = '2026-10';
const days = (entries: Record<string, string>) => new Map(Object.entries(entries));

// ---------------------------------------------------------------------------
// The month switcher

test('the switcher reaches every earlier month and one month ahead, to plan the next', () => {
  assert.equal(canShowNextMonth('2026-09', '2026-10-19'), true);
  assert.equal(canShowNextMonth('2026-10', '2026-10-19'), true);
  assert.equal(canShowNextMonth('2026-11', '2026-10-19'), false);
  assert.equal(canShowNextMonth('2026-12', '2026-12-31'), true);
  assert.equal(canShowNextMonth('2027-01', '2026-12-31'), false);
});

// ---------------------------------------------------------------------------
// Spending by day

test('spending by day: confirmed expenses of the month, and waiting drafts once', () => {
  const lunch = entry({ amount_minor: '6500', occurred_on: '2026-10-03' });
  const dinner = entry({ amount_minor: '12000', occurred_on: '2026-10-03' });
  const rent = entry({ amount_minor: '1200000', occurred_on: '2026-10-05', category_id: BILLS.id });
  const salary = entry({ type: 'income', amount_minor: '5000000', occurred_on: '2026-10-05', category_id: SALARY.id });
  const gone = entry({ amount_minor: '999', occurred_on: '2026-10-05', deleted_at: '2026-10-06T00:00:00.000Z' });
  const september = entry({ amount_minor: '777', occurred_on: '2026-09-30' });
  const waiting = command(pending({ amount_minor: '4500', occurred_on: '2026-10-07' }), 'unsent');
  const update = command(pending({ amount_minor: '500', occurred_on: '2026-10-07' }), 'paused_upgrade');
  const checking = command(pending({ amount_minor: '3000', occurred_on: '2026-10-07' }), 'sending');
  const refused = command(pending({ amount_minor: '2000', occurred_on: '2026-10-07' }), 'needs_review');
  const income = command(pending({ type: 'income', amount_minor: '2000', occurred_on: '2026-10-07', category_id: SALARY.id }), 'unsent');
  const move = command(pending({ type: 'transfer', occurred_on: '2026-10-07' }), 'unsent');
  // The draft of a confirmed record counts once, as the record.
  const alreadyIn = command({ ...pending({ amount_minor: '6500', occurred_on: '2026-10-03' }), id: lunch.id }, 'unsent');
  const byDay = dailySpending({
    month: OCT,
    records: [lunch, dinner, rent, salary, gone, september],
    outbox: [waiting, update, checking, refused, income, move, alreadyIn],
  });
  assert.deepEqual([...byDay].sort(), [['2026-10-03', '18500'], ['2026-10-05', '1200000'], ['2026-10-07', '5000']]);
  assert.deepEqual([...dailySpending({ month: OCT, records: [] })], []);
});

// ---------------------------------------------------------------------------
// The burn-down

test('the burn-down: cumulative spending through today against the even pace, exact', () => {
  const burn = burnDown({ month: OCT, today: '2026-10-05', limitMinor: '3100000', spentByDay: days({ '2026-10-02': '50000', '2026-10-04': '100001', '2026-10-09': '9999' }) });
  assert.deepEqual([burn.phase, burn.daysInMonth, burn.throughDay], ['during', 31, 5]);
  assert.deepEqual(burn.points, [
    { day: 1, spentMinor: '0' }, { day: 2, spentMinor: '50000' }, { day: 3, spentMinor: '50000' }, { day: 4, spentMinor: '150001' }, { day: 5, spentMinor: '150001' },
  ]);
  // Even pace through the end of day 5: 31,000.00 × 5 ÷ 31 = 5,000.00.
  assert.deepEqual([burn.spentMinor, burn.evenMinor, burn.aheadMinor, burn.topMinor], ['150001', '500000', '-349999', '3100000']);
});

test('the even pace rounds down to the satang, and the top grows when spending passes the limit', () => {
  const burn = burnDown({ month: OCT, today: '2026-10-10', limitMinor: '100000', spentByDay: days({ '2026-10-01': '150000' }) });
  // 1,000.00 × 10 ÷ 31 = 322.58064…
  assert.equal(burn.evenMinor, '32258');
  assert.equal(burn.aheadMinor, (150000n - 32258n).toString());
  assert.equal(burn.topMinor, '150000');
});

test('before the month nothing is drawn; after it, the whole month is', () => {
  const before = burnDown({ month: '2026-11', today: '2026-10-19', limitMinor: '3000000', spentByDay: days({}) });
  assert.deepEqual([before.phase, before.throughDay, before.points.length, before.spentMinor, before.evenMinor], ['before', 0, 0, '0', '0']);
  const after = burnDown({ month: '2026-09', today: '2026-10-19', limitMinor: '3000000', spentByDay: days({ '2026-09-30': '100' }) });
  assert.deepEqual([after.phase, after.throughDay, after.points.length, after.spentMinor, after.evenMinor], ['after', 30, 30, '100', '3000000']);
  // The last day is still during: today is drawn in full.
  const last = burnDown({ month: '2026-09', today: '2026-09-30', limitMinor: '3000000', spentByDay: days({ '2026-09-30': '100' }) });
  assert.deepEqual([last.phase, last.throughDay, last.spentMinor, last.evenMinor], ['during', 30, '100', '3000000']);
});

test('the chart is in thousandths: x along the month, y up from the bottom, scaled to the top', () => {
  const burn = burnDown({ month: '2026-09', today: '2026-09-03', limitMinor: '300000', spentByDay: days({ '2026-09-02': '150000' }) });
  const chart = burnChart(burn);
  assert.deepEqual(chart.spent, [[0, 0], [33, 0], [66, 500], [100, 500]]);
  assert.deepEqual(chart.even, [[0, 0], [1000, 1000]]);
  assert.equal(chart.limitY, 1000);
  const over = burnChart(burnDown({ month: '2026-09', today: '2026-09-30', limitMinor: '100000', spentByDay: days({ '2026-09-01': '400000' }) }));
  assert.equal(over.limitY, 250);
  assert.deepEqual(over.even[1], [1000, 250]);
  assert.deepEqual(over.spent.at(-1), [1000, 1000]);
  for (const [x, y] of over.spent) assert.ok(Number.isInteger(x) && Number.isInteger(y));
});

test('the burn-down in words: spent and even pace by today, then how far ahead or under, kindly', () => {
  const ahead = burnDown({ month: OCT, today: '2026-10-05', limitMinor: '3100000', spentByDay: days({ '2026-10-02': '600000' }) });
  assert.deepEqual(burnDownCopy(ahead, 'en').map(say), ['Spent by today: ฿6,000.00', 'Even pace by today: ฿5,000.00', '฿1,000.00 ahead of an even pace']);
  const under = burnDown({ month: OCT, today: '2026-10-05', limitMinor: '3100000', spentByDay: days({ '2026-10-02': '450000' }) });
  assert.equal(say(burnDownCopy(under, 'en')[2]), '฿500.00 under an even pace');
  const even = burnDown({ month: OCT, today: '2026-10-05', limitMinor: '3100000', spentByDay: days({ '2026-10-02': '500000' }) });
  assert.equal(say(burnDownCopy(even, 'en')[2]), 'Right on an even pace');
  const before = burnDown({ month: '2026-11', today: '2026-10-19', limitMinor: '3000000', spentByDay: days({}) });
  assert.deepEqual(burnDownCopy(before, 'en').map(say), ["This month hasn't started yet.", 'An even pace is ฿1,000.00 a day.']);
  const after = burnDown({ month: '2026-09', today: '2026-10-19', limitMinor: '3000000', spentByDay: days({ '2026-09-30': '3100000' }) });
  assert.deepEqual(burnDownCopy(after, 'en').map(say), ['Spent in the month: ฿31,000.00', 'Budget: ฿30,000.00']);
});

// ---------------------------------------------------------------------------
// Category limits

test('category rows: the server’s spending plus waiting drafts, against each limit, in the categories’ order', () => {
  const month = OCT;
  const set = budget(month, '3100000', [{ category_id: FOOD.id, limit_minor: '300000' }, { category_id: BILLS.id, limit_minor: '1000000' }, { category_id: TRAVEL.id, limit_minor: '200000' }]);
  const usage = {
    overall_limit_minor: '3100000', spent_minor: '1300000', remaining_minor: '1800000',
    categories: [
      { category_id: FOOD.id, limit_minor: '300000', spent_minor: '50000', remaining_minor: '250000' },
      { category_id: BILLS.id, limit_minor: '1000000', spent_minor: '1250000', remaining_minor: '-250000' },
      { category_id: TRAVEL.id, limit_minor: '200000', spent_minor: '0', remaining_minor: '200000' },
    ],
  };
  const waiting = command(pending({ amount_minor: '10000', occurred_on: '2026-10-09', category_id: FOOD.id }), 'unsent');
  const pace = budgetPace({ budget: set, summary: summary(month, { expense_minor: '1300000', budget: usage }), today: '2026-10-10', outbox: [waiting] });
  const rows = categoryLimitRows({ budget: set, usage, pace, categories: [FOOD, TRAVEL, BILLS, PETS] });
  assert.deepEqual(rows.map((row) => row.categoryId), [FOOD.id, TRAVEL.id, BILLS.id]);
  const [food, travel, bills] = rows;
  assert.deepEqual([food.category, food.limitMinor, food.spentMinor, food.pendingMinor, food.leftMinor, food.overByMinor, food.state, food.spentPermille], [FOOD, '300000', '60000', '10000', '240000', '0', 'on_track', 200]);
  assert.deepEqual([travel.spentMinor, travel.state, travel.spentPermille], ['0', 'on_track', 0]);
  assert.deepEqual([bills.spentMinor, bills.leftMinor, bills.overByMinor, bills.state, bills.spentPermille], ['1250000', '-250000', '250000', 'over', 1000]);
  const foodCopy = categoryRowCopy(food, 'en');
  assert.deepEqual([say(foodCopy.amounts), say(foodCopy.status), foodCopy.reassurance], ['฿600.00 of ฿3,000.00', '฿2,400.00 left', null]);
  const billsCopy = categoryRowCopy(bills, 'en');
  assert.deepEqual([say(billsCopy.amounts), say(billsCopy.status), say(billsCopy.reassurance)], ['฿12,500.00 of ฿10,000.00', '฿2,500.00 over', 'It happens.']);
});

test('a category ahead of the even pace is tight; after the month nothing is tight; an unknown category comes last', () => {
  const unknown = 'c0000000-0000-4000-8000-0000000000ff';
  const set = budget(OCT, '1000000', [{ category_id: unknown, limit_minor: '100000' }, { category_id: FOOD.id, limit_minor: '310000' }]);
  // 10 of 31 days gone: the even line for 3,100.00 is 1,000.00; 1,100.01 is more than 10% ahead.
  const usage = (spent: string) => ({
    overall_limit_minor: '1000000', spent_minor: spent, remaining_minor: '0',
    categories: [{ category_id: FOOD.id, limit_minor: '310000', spent_minor: spent, remaining_minor: '0' }, { category_id: unknown, limit_minor: '100000', spent_minor: '0', remaining_minor: '100000' }],
  });
  const rowsOn = (today: string, spent: string) => categoryLimitRows({ budget: set, usage: usage(spent), pace: budgetPace({ budget: set, summary: spentSummary(OCT, spent), today }), categories: [FOOD] });
  assert.deepEqual(rowsOn('2026-10-10', '110000').map((row) => [row.categoryId, row.category === null, row.state]), [[FOOD.id, false, 'on_track'], [unknown, true, 'on_track']]);
  assert.equal(rowsOn('2026-10-10', '110001')[0].state, 'tight');
  assert.equal(rowsOn('2026-11-02', '300000')[0].state, 'on_track');
  // Without the server's usage the summary's own category totals stand in.
  const fallback = categoryLimitRows({ budget: set, usage: null, pace: budgetPace({ budget: set, summary: spentSummary(OCT, '5000'), today: '2026-10-10' }), categories: [FOOD] });
  assert.equal(fallback[0].spentMinor, '5000');
});

// ---------------------------------------------------------------------------
// The average prefill

test('prefill months: up to three earlier months that have ended and were tracked from their first day', () => {
  assert.equal(PREFILL_MONTHS, 3);
  assert.deepEqual(prefillMonths({ month: '2026-10', today: '2026-10-19', trackingStart: '2026-01-01' }), ['2026-09', '2026-08', '2026-07']);
  // Tracking began on 1 August: July was never a whole month of records.
  assert.deepEqual(prefillMonths({ month: '2026-10', today: '2026-10-19', trackingStart: '2026-08-01' }), ['2026-09', '2026-08']);
  // Tracking began mid-August: August is partial, so only September counts.
  assert.deepEqual(prefillMonths({ month: '2026-10', today: '2026-10-19', trackingStart: '2026-08-15' }), ['2026-09']);
  // The first month of the diary: nothing earlier.
  assert.deepEqual(prefillMonths({ month: '2026-10', today: '2026-10-19', trackingStart: '2026-10-01' }), []);
  // Planning next month: this month has not ended, so it is not complete.
  assert.deepEqual(prefillMonths({ month: '2026-11', today: '2026-10-19', trackingStart: '2026-01-01' }), ['2026-09', '2026-08']);
  // On a month's last day it has not ended yet.
  assert.deepEqual(prefillMonths({ month: '2026-11', today: '2026-10-31', trackingStart: '2026-01-01' }), ['2026-09', '2026-08']);
  // No wallets, no records.
  assert.deepEqual(prefillMonths({ month: '2026-10', today: '2026-10-19', trackingStart: null }), []);
});

test('the average: months with spending only, rounded down to the satang; none, no prefill', () => {
  const month = (name: string, spent: string) => ({ month: name, expense_minor: spent });
  assert.deepEqual(averagePrefill([month('2026-09', '1400050'), month('2026-08', '1000000')]), { averageMinor: '1200025', months: ['2026-09', '2026-08'] });
  assert.deepEqual(averagePrefill([month('2026-09', '100'), month('2026-08', '0'), month('2026-07', '201')]), { averageMinor: '150', months: ['2026-09', '2026-07'] });
  assert.deepEqual(averagePrefill([month('2026-09', '10'), month('2026-08', '10'), month('2026-07', '11')]), { averageMinor: '10', months: ['2026-09', '2026-08', '2026-07'] });
  assert.equal(averagePrefill([month('2026-09', '0')]), null);
  assert.equal(averagePrefill([]), null);
  // A budget can't go above the amount cap, so neither can a prefill.
  assert.equal(averagePrefill([month('2026-09', (MINOR_AMOUNT_MAX + 1n).toString())]), null);
  const name = (value: string) => ({ '2026-09': 'September 2026' })[value] ?? value;
  assert.equal(say(prefillCopy({ averageMinor: '1200025', months: ['2026-09', '2026-08'] }, name, 'en')), 'Filled in from your average spending over 2 months: ฿12,000.25');
  assert.equal(say(prefillCopy({ averageMinor: '150', months: ['2026-09'] }, name, 'en')), 'Filled in from what you spent in September 2026: ฿1.50');
});

// ---------------------------------------------------------------------------
// Setting a budget

test('a budget needs a total; limits are optional and must not add up to more than it', () => {
  assert.deepEqual(checkBudget(null, []), { ok: false, problem: 'no_total', limitsMinor: '0', overByMinor: '0' });
  assert.equal(checkBudget('0', []).ok, false);
  const fits = checkBudget('1000000', [
    { categoryId: TRAVEL.id, limitMinor: '200000' }, { categoryId: FOOD.id, limitMinor: '800000' }, { categoryId: BILLS.id, limitMinor: null }, { categoryId: PETS.id, limitMinor: '0' },
  ]);
  // Exactly at the total is fine; no limit and zero send nothing; limits go sorted by category id.
  assert.deepEqual(fits, {
    ok: true,
    request: { overall_limit_minor: '1000000', category_limits: [{ category_id: FOOD.id, limit_minor: '800000' }, { category_id: TRAVEL.id, limit_minor: '200000' }] },
    limitsMinor: '1000000',
    leftMinor: '0',
  });
  assert.equal(say(checkCopy(fits, '1000000', 'en')), 'Left for everything else: ฿0.00');
  const over = checkBudget('1000000', [{ categoryId: FOOD.id, limitMinor: '800000' }, { categoryId: TRAVEL.id, limitMinor: '200001' }]);
  assert.deepEqual(over, { ok: false, problem: 'limits_over_total', limitsMinor: '1000001', overByMinor: '1' });
  assert.equal(say(checkCopy(over, '1000000', 'en')), 'The limits add up to ฿10,000.01, more than the total of ฿10,000.00.');
  assert.equal(checkCopy(checkBudget(null, []), null, 'en'), null);
  // One limit per category: the last entry for a category wins.
  const twice = checkBudget('1000000', [{ categoryId: FOOD.id, limitMinor: '900000' }, { categoryId: FOOD.id, limitMinor: '100000' }]);
  assert.deepEqual(twice.ok && twice.request.category_limits, [{ category_id: FOOD.id, limit_minor: '100000' }]);
  // Without limits the request still says so: a replace clears them.
  const plain = checkBudget('500000', []);
  assert.deepEqual(plain.ok && plain.request, { overall_limit_minor: '500000', category_limits: [] });
});

test('limits are for expense categories in use, and for archived ones the budget already limits', () => {
  const archived = { ...TRAVEL, archived: true };
  const oldPets = { ...PETS, archived: true };
  const all = [FOOD, archived, BILLS, SALARY, oldPets];
  assert.deepEqual(limitCategories(all, null), [FOOD, BILLS]);
  assert.deepEqual(limitCategories(all, budget(OCT, '100000', [{ category_id: TRAVEL.id, limit_minor: '100' }])), [FOOD, archived, BILLS]);
});

test('the editor starts from the budget being changed, else from the average, else empty', () => {
  const existing = budget(OCT, '1800000', [{ category_id: FOOD.id, limit_minor: '300000' }]);
  const prefill = { averageMinor: '1200025', months: ['2026-09'] };
  const editing = editorStart({ existing, prefill });
  assert.deepEqual([editing.totalMinor, [...editing.limits], editing.prefilled], ['1800000', [[FOOD.id, '300000']], false]);
  const fresh = editorStart({ existing: null, prefill });
  assert.deepEqual([fresh.totalMinor, [...fresh.limits], fresh.prefilled], ['1200025', [], true]);
  const first = editorStart({ existing: null, prefill: null });
  assert.deepEqual([first.totalMinor, [...first.limits], first.prefilled], [null, [], false]);
});

test('a budget Jotbun already holds is the same as yours only when every figure is', () => {
  const server = budget(OCT, '1000000', [{ category_id: FOOD.id, limit_minor: '300000' }]);
  assert.equal(sameBudget(server, { overall_limit_minor: '1000000', category_limits: [{ category_id: FOOD.id, limit_minor: '300000' }] }), true);
  assert.equal(sameBudget(server, { overall_limit_minor: '1000001', category_limits: [{ category_id: FOOD.id, limit_minor: '300000' }] }), false);
  assert.equal(sameBudget(server, { overall_limit_minor: '1000000', category_limits: [] }), false);
  assert.equal(sameBudget(server, { overall_limit_minor: '1000000', category_limits: [{ category_id: FOOD.id, limit_minor: '300001' }] }), false);
  assert.equal(sameBudget(budget(OCT, '1000000'), { overall_limit_minor: '1000000' }), true);
});

test('a conflict, figure by figure: the total, then each category either side limits', () => {
  const server = budget(OCT, '2000000', [{ category_id: FOOD.id, limit_minor: '300000' }, { category_id: TRAVEL.id, limit_minor: '100000' }]);
  const mine = { overall_limit_minor: '1800000', category_limits: [{ category_id: BILLS.id, limit_minor: '500000' }, { category_id: FOOD.id, limit_minor: '300000' }] };
  assert.deepEqual(budgetConflictRows(mine, server, [FOOD.id, TRAVEL.id, BILLS.id]), [
    { key: 'total', categoryId: null, yoursMinor: '1800000', serverMinor: '2000000', differs: true },
    { key: FOOD.id, categoryId: FOOD.id, yoursMinor: '300000', serverMinor: '300000', differs: false },
    { key: TRAVEL.id, categoryId: TRAVEL.id, yoursMinor: null, serverMinor: '100000', differs: true },
    { key: BILLS.id, categoryId: BILLS.id, yoursMinor: '500000', serverMinor: null, differs: true },
  ]);
});
