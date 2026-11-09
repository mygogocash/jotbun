import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BudgetDto, MonthSummary } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../storage/types.ts';
import { TIGHT_PACE_PERCENT, budgetPace, paceCopy } from './budgetPace.ts';
import type { BudgetPace, PaceCopy } from './budgetPace.ts';
import type { CopyLine } from './shared.ts';
import { FOOD, HOUSEHOLD, PETS, SALARY, TRAVEL, budget, command, pending, spentSummary, summary, tc } from './testing/fixtures.ts';

const OCT = '2026-10';
const text = (line: CopyLine | null) => (line ? tc(line.text, line.values) : null);
function pace(today: string, limit: string | null, spent: string, extra: { month?: string; outbox?: OutboxCommand[]; budget?: BudgetDto; summary?: MonthSummary } = {}): { pace: BudgetPace; copy: PaceCopy } {
  const month = extra.month ?? OCT;
  const result = budgetPace({
    budget: extra.budget ?? (limit === null ? null : budget(month, limit)),
    summary: extra.summary ?? spentSummary(month, spent),
    today,
    outbox: extra.outbox,
  });
  return { pace: result, copy: paceCopy(result, 'en') };
}

test('the first day of the month: the whole month left, today included', () => {
  const { pace: first, copy } = pace('2026-10-01', '31000', '0');
  assert.deepEqual([first.phase, first.daysInMonth, first.daysLeft, first.daysElapsed], ['during', 31, 31, 1]);
  assert.deepEqual([first.limitMinor, first.leftMinor, first.overByMinor, first.perDayMinor, first.state], ['31000', '31000', '0', '1000', 'on_track']);
  assert.equal(text(copy.total), '฿0.00 of ฿310.00');
  assert.equal(text(copy.headline), '฿10.00 a day left · on track');
  assert.equal(copy.reassurance, null);
  assert.equal(copy.setBudget, null);
});

test('left per day rounds down to whole satang, never up', () => {
  // 3 days left counting today (29, 30, 31 October).
  assert.equal(pace('2026-10-29', '31000', '30000').pace.perDayMinor, '333');
  assert.equal(pace('2026-10-29', '31000', '29999').pace.perDayMinor, '333');
  assert.equal(pace('2026-10-29', '31000', '29998').pace.perDayMinor, '334');
  assert.equal(pace('2026-10-29', '31000', '30998').pace.perDayMinor, '0');
  // 21 days left on 10 November: 19000 / 21 = 904.76…
  assert.equal(pace('2026-11-10', '30000', '11000', { month: '2026-11' }).pace.perDayMinor, '904');
});

test('the tight threshold is more than 10% ahead of the even pace, exactly', () => {
  assert.equal(TIGHT_PACE_PERCENT, 110n);
  // 10 of 30 days gone: the even line is 10000 of 30000, so 11000 is the edge.
  const edge = pace('2026-11-10', '30000', '11000', { month: '2026-11' });
  assert.deepEqual([edge.pace.daysElapsed, edge.pace.daysLeft, edge.pace.state], [10, 21, 'on_track']);
  const ahead = pace('2026-11-10', '30000', '11001', { month: '2026-11' });
  assert.equal(ahead.pace.state, 'tight');
  assert.equal(text(ahead.copy.headline), '฿9.04 a day left · a bit ahead of pace');
  // The first day: a tenth of a 30-day budget is well ahead of one day's share.
  assert.equal(pace('2026-11-01', '30000', '3000', { month: '2026-11' }).pace.state, 'tight');
  assert.equal(pace('2026-11-01', '30000', '1100', { month: '2026-11' }).pace.state, 'on_track');
  assert.equal(pace('2026-11-01', '30000', '1101', { month: '2026-11' }).pace.state, 'tight');
});

test('the last day: one day left, and exactly at the limit is on track', () => {
  const last = pace('2026-10-31', '31000', '30000');
  assert.deepEqual([last.pace.daysLeft, last.pace.daysElapsed, last.pace.perDayMinor, last.pace.state], [1, 31, '1000', 'on_track']);
  assert.equal(text(last.copy.headline), '฿10.00 a day left · on track');
  const exact = pace('2026-10-31', '31000', '31000');
  assert.deepEqual([exact.pace.leftMinor, exact.pace.overByMinor, exact.pace.perDayMinor, exact.pace.state], ['0', '0', '0', 'on_track']);
  assert.equal(text(exact.copy.headline), 'Right at the limit · last day');
});

test('exactly zero left mid-month is not over, but ahead of pace', () => {
  const zero = pace('2026-10-16', '31000', '31000');
  assert.deepEqual([zero.pace.daysLeft, zero.pace.leftMinor, zero.pace.overByMinor, zero.pace.perDayMinor, zero.pace.state], [16, '0', '0', '0', 'tight']);
  assert.equal(text(zero.copy.headline), 'Right at the limit · 16 days to go');
  assert.equal(zero.copy.reassurance, null);
});

test('over by one satang is over, stated plainly with the days to go', () => {
  const over = pace('2026-10-16', '31000', '31001');
  assert.deepEqual([over.pace.state, over.pace.leftMinor, over.pace.overByMinor, over.pace.perDayMinor], ['over', '-1', '1', null]);
  assert.equal(text(over.copy.headline), '฿0.01 over · 16 days to go');
  assert.equal(text(over.copy.reassurance), 'It happens.');
  assert.equal(text(pace('2026-10-31', '31000', '31001').copy.headline), '฿0.01 over · last day');
});

test('after the month ends: no days left, no per day, never tight', () => {
  const kept = pace('2026-11-02', '31000', '20000');
  assert.deepEqual([kept.pace.phase, kept.pace.daysLeft, kept.pace.daysElapsed, kept.pace.perDayMinor, kept.pace.state], ['after', 0, 31, null, 'on_track']);
  assert.equal(text(kept.copy.headline), '฿110.00 left this month');
  assert.equal(pace('2026-11-02', '31000', '30999').pace.state, 'on_track');
  assert.equal(text(pace('2026-11-02', '31000', '31000').copy.headline), 'Right on budget this month');
  const over = pace('2027-01-15', '31000', '31500');
  assert.deepEqual([over.pace.state, over.pace.overByMinor], ['over', '500']);
  assert.equal(text(over.copy.headline), '฿5.00 over this month');
});

test('before the month starts, the whole month is ahead', () => {
  const early = pace('2026-09-30', '31000', '0');
  assert.deepEqual([early.pace.phase, early.pace.daysLeft, early.pace.daysElapsed, early.pace.perDayMinor, early.pace.state], ['before', 31, 0, '1000', 'on_track']);
});

test('no budget: spent only, and a prompt to set one', () => {
  const none = pace('2026-10-18', null, '12000');
  assert.deepEqual([none.pace.state, none.pace.limitMinor, none.pace.leftMinor, none.pace.overByMinor, none.pace.perDayMinor], ['no_budget', null, null, null, null]);
  assert.equal(none.pace.spent.confirmedMinor, '12000');
  assert.equal(none.pace.daysLeft, 14);
  assert.deepEqual(none.pace.categories, []);
  assert.equal(text(none.copy.total), '฿120.00 spent this month');
  assert.equal(text(none.copy.headline), 'No budget this month');
  assert.equal(text(none.copy.setBudget), "Set a monthly budget to see what's left each day");
});

test('money stays exact beyond JavaScript numbers', () => {
  const big = pace('2026-10-16', '99999999999', '99999999998');
  assert.equal(big.pace.leftMinor, '1');
  assert.equal(big.pace.perDayMinor, '0');
  assert.equal(text(big.copy.total), '฿999,999,999.98 of ฿999,999,999.99');
  const huge = budgetPace({ budget: budget(OCT, '99999999999'), summary: spentSummary(OCT, '9007199254740993'), today: '2026-10-16' });
  assert.equal(huge.overByMinor, String(9007199254740993n - 99999999999n));
});

test('drafts waiting to sync count as pending; sending and uncertain drafts are checked apart; refused ones never count', () => {
  const outbox = [
    command(pending({ amount_minor: '1000' }), 'unsent'),
    command(pending({ amount_minor: '2000' }), 'sending'),
    command(pending({ amount_minor: '500' }), 'paused_upgrade'),
    command(pending({ amount_minor: '700' }), 'uncertain'),
    command(pending({ amount_minor: '9000' }), 'needs_review'),
    command(pending({ amount_minor: '8000' }), 'acknowledged'),
    command(pending({ type: 'income', category_id: SALARY.id, amount_minor: '5000' } as never), 'unsent'),
    command(pending({ type: 'transfer', amount_minor: '5000' }), 'unsent'),
    command(pending({ amount_minor: '5000', occurred_on: '2026-09-30' }), 'unsent'),
  ];
  const { pace: withDrafts, copy } = pace('2026-10-16', '31000', '30000', { outbox });
  // A sending draft may already be committed (and in the summary), so it is checked, never added.
  assert.deepEqual(withDrafts.spent, { confirmedMinor: '30000', pendingMinor: '1500', checkingMinor: '2700', estimatedMinor: '31500' });
  assert.deepEqual([withDrafts.state, withDrafts.leftMinor, withDrafts.overByMinor], ['over', '-500', '500']);
  assert.equal(text(copy.total), '฿315.00 of ฿310.00');
  assert.equal(text(copy.pendingNote), 'Includes ฿15.00 saving on this device');
  assert.equal(text(copy.checkingNote), '฿27.00 more is being checked with Jotbun');
  const none = pace('2026-10-16', '31000', '30000');
  assert.equal(none.copy.pendingNote, null);
  assert.equal(none.copy.checkingNote, null);
});

test('Home-3: a draft whose record is already confirmed is never counted again, waiting or checking', () => {
  const lunch = 'r0000000-0000-4000-8000-00000000lunch';
  const sent = 'r0000000-0000-4000-8000-0000000000sent';
  const outbox = [
    command(pending({ id: lunch, amount_minor: '12000' }), 'sending'),
    command(pending({ id: sent, amount_minor: '3000' }), 'unsent'),
    command(pending({ amount_minor: '1000' }), 'unsent'),
    command(pending({ amount_minor: '700' }), 'uncertain'),
  ];
  const categoryBudget = budget(OCT, '1000000', [{ category_id: FOOD.id, limit_minor: '50000' }]);
  const result = budgetPace({ budget: categoryBudget, summary: spentSummary(OCT, '15000'), today: '2026-10-18', outbox, confirmedIds: new Set([lunch, sent]) });
  assert.deepEqual(result.spent, { confirmedMinor: '15000', pendingMinor: '1000', checkingMinor: '700', estimatedMinor: '16000' });
  assert.equal(result.leftMinor, '984000');
  assert.deepEqual(result.categories[0].spent, { confirmedMinor: '15000', pendingMinor: '1000', checkingMinor: '700', estimatedMinor: '16000' });
  // The probe: ฿10,000.00 budget, the ฿120.00 lunch confirmed while its create is still sending.
  const probe = budgetPace({ budget: budget(OCT, '1000000'), summary: spentSummary(OCT, '12000'), today: '2026-10-18', outbox: outbox.slice(0, 1), confirmedIds: new Set([lunch]) });
  assert.deepEqual([probe.leftMinor, probe.spent.pendingMinor, probe.spent.checkingMinor], ['988000', '0', '0']);
  // Even without the confirmed ids, a sending draft is never added to the estimate.
  const unknown = budgetPace({ budget: budget(OCT, '1000000'), summary: spentSummary(OCT, '12000'), today: '2026-10-18', outbox: outbox.slice(0, 1) });
  assert.deepEqual([unknown.leftMinor, unknown.spent.pendingMinor, unknown.spent.checkingMinor], ['988000', '0', '12000']);
});

test('each category limit gets its own left and state', () => {
  const categoryBudget = budget(OCT, '100000', [
    { category_id: FOOD.id, limit_minor: '10000' },
    { category_id: TRAVEL.id, limit_minor: '5000' },
    { category_id: HOUSEHOLD.id, limit_minor: '10000' },
    { category_id: PETS.id, limit_minor: '3000' },
  ]);
  const month = spentSummary(OCT, '21000', { [FOOD.id]: '9000', [TRAVEL.id]: '6000', [HOUSEHOLD.id]: '6000' });
  const outbox = [command(pending({ amount_minor: '1500', category_id: FOOD.id }), 'unsent')];
  const { pace: result, copy } = pace('2026-10-16', null, '0', { budget: categoryBudget, summary: month, outbox });
  const byId = new Map(result.categories.map((category) => [category.categoryId, category]));
  assert.deepEqual(result.categories.map((category) => category.categoryId), [FOOD.id, TRAVEL.id, HOUSEHOLD.id, PETS.id]);
  assert.deepEqual([byId.get(FOOD.id)?.spent.estimatedMinor, byId.get(FOOD.id)?.leftMinor, byId.get(FOOD.id)?.overByMinor, byId.get(FOOD.id)?.state], ['10500', '-500', '500', 'over']);
  assert.deepEqual([byId.get(TRAVEL.id)?.leftMinor, byId.get(TRAVEL.id)?.state], ['-1000', 'over']);
  assert.deepEqual([byId.get(HOUSEHOLD.id)?.leftMinor, byId.get(HOUSEHOLD.id)?.state], ['4000', 'tight']);
  assert.deepEqual([byId.get(PETS.id)?.leftMinor, byId.get(PETS.id)?.state], ['3000', 'on_track']);
  assert.equal(text(copy.categories[FOOD.id]), '฿5.00 over');
  assert.equal(text(copy.categories[PETS.id]), '฿30.00 left');
});

test('a budget for another month than the summary is refused', () => {
  assert.throws(() => budgetPace({ budget: budget('2026-09', '1000'), summary: summary(OCT), today: '2026-10-18' }), TypeError);
});

test('pace copy is kind and factual in every state', () => {
  const lines: (string | null)[] = [];
  for (const [today, spent] of [['2026-10-01', '0'], ['2026-10-16', '20000'], ['2026-10-16', '31000'], ['2026-10-16', '40000'], ['2026-10-31', '40000'], ['2026-11-05', '40000'], ['2026-11-05', '100']] as const) {
    const { copy } = pace(today, '31000', spent);
    lines.push(text(copy.headline), text(copy.total), text(copy.reassurance));
  }
  lines.push(text(pace('2026-10-16', null, '100').copy.headline));
  for (const line of lines.filter((value): value is string => value !== null)) {
    assert.doesNotMatch(line, /!|bad|fail|warning|careful|too much|overspen|blew|oops|sorry|should|must|stop/i, line);
  }
});
