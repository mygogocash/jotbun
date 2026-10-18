import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BudgetDto, MonthSummary } from '@gogospend/contracts';

import type { OutboxCommand } from '../storage/types.ts';
import { budgetPace } from '../spend/v1/redesign/budgetPace.ts';
import type { BudgetPace as LogicPace } from '../spend/v1/redesign/budgetPace.ts';
import { budget, command, pending, spentSummary, tc } from '../spend/v1/redesign/testing/fixtures.ts';
import { budgetWords } from './budgetWords.ts';
import { toKitPace } from './paceAdapter.ts';

// The logic's own output, so the adapter is tested on what screens will pass it.
function logic(today: string, limit: string | null, spent: string, extra: { month?: string; outbox?: OutboxCommand[]; budget?: BudgetDto; summary?: MonthSummary } = {}): LogicPace {
  const month = extra.month ?? '2026-10';
  return budgetPace({ budget: limit === null ? null : budget(month, limit), summary: spentSummary(month, spent), today, outbox: extra.outbox });
}
const words = (pace: LogicPace) => budgetWords(toKitPace(pace), tc, 'en');

test('mid-month on track: the state and every amount carry over exactly', () => {
  // 16 October: 16 days left counting today; 18,000.00 of 31,000.00 spent.
  const pace = logic('2026-10-16', '3100000', '1500000');
  assert.equal(pace.state, 'on_track');
  assert.deepEqual(toKitPace(pace), { state: 'on_track', spentMinor: '1500000', limitMinor: '3100000', leftMinor: '1600000', perDayMinor: '100000', daysLeft: 16 });
  const said = words(pace);
  assert.equal(said.headline, '฿1,000.00 a day left');
  assert.equal(said.detail, 'On track · ฿16,000.00 left · 16 days to go');
});

test('ahead of pace stays tight, not over', () => {
  const pace = logic('2026-11-10', '30000', '11001', { month: '2026-11' });
  assert.equal(pace.state, 'tight');
  const kit = toKitPace(pace);
  assert.deepEqual([kit.state, kit.leftMinor, kit.perDayMinor, kit.daysLeft], ['tight', '18999', '904', 21]);
  assert.equal(words(pace).detail, 'Tight · ฿189.99 left · 21 days to go');
});

test('pending money: confirmed spending plus waiting drafts; checking and refused drafts are left out', () => {
  const outbox = [
    command(pending({ amount_minor: '1000' }), 'unsent'),
    command(pending({ amount_minor: '2000' }), 'sending'),
    command(pending({ amount_minor: '500' }), 'paused_upgrade'),
    command(pending({ amount_minor: '700' }), 'uncertain'),
    command(pending({ amount_minor: '9000' }), 'needs_review'),
  ];
  const pace = logic('2026-10-16', '31000', '20000', { outbox });
  assert.deepEqual([pace.spent.confirmedMinor, pace.spent.pendingMinor, pace.spent.checkingMinor, pace.spent.estimatedMinor], ['20000', '3500', '700', '23500']);
  const kit = toKitPace(pace);
  assert.equal(kit.spentMinor, '23500');
  assert.equal(kit.leftMinor, '7500');
  assert.equal(BigInt(kit.limitMinor ?? '0') - BigInt(kit.spentMinor), BigInt(kit.leftMinor ?? 'x'));
  // The state was decided on the same estimate, so the words and the state agree.
  assert.deepEqual([pace.state, kit.state, kit.perDayMinor], ['tight', 'tight', '468']);
  assert.equal(words(pace).detail, 'Tight · ฿75.00 left · 16 days to go');
});

test('zero: nothing spent on the first day, and exactly nothing left', () => {
  const fresh = toKitPace(logic('2026-10-01', '31000', '0'));
  assert.deepEqual(fresh, { state: 'on_track', spentMinor: '0', limitMinor: '31000', leftMinor: '31000', perDayMinor: '1000', daysLeft: 31 });
  assert.equal(budgetWords(fresh, tc, 'en').spentPermille, 0);

  const atLimit = logic('2026-10-16', '31000', '31000');
  assert.deepEqual(toKitPace(atLimit), { state: 'tight', spentMinor: '31000', limitMinor: '31000', leftMinor: '0', perDayMinor: '0', daysLeft: 16 });
  const said = words(atLimit);
  assert.equal(said.headline, '฿0.00 a day left');
  assert.equal(said.tone, 'under');
  assert.equal(said.spentPermille, 1000);
});

test('over by one satang: over, left is minus the over amount, no per day', () => {
  const pace = logic('2026-10-16', '31000', '31001');
  assert.deepEqual([pace.leftMinor, pace.overByMinor], ['-1', '1']);
  assert.deepEqual(toKitPace(pace), { state: 'over', spentMinor: '31001', limitMinor: '31000', leftMinor: '-1', perDayMinor: null, daysLeft: 16 });
  const said = words(pace);
  assert.equal(said.headline, '฿0.01 over · 16 days to go');
  assert.deepEqual([said.figure, said.figureWord, said.tone], ['฿0.01', 'over', 'over']);
  assert.equal(said.detail, 'It happens. ฿310.01 of ฿310.00 spent.');
});

test('over with a left figure of zero: the over amount comes from overByMinor', () => {
  const pace: LogicPace = { ...logic('2026-10-16', '31000', '31005'), leftMinor: '0', overByMinor: '5' };
  const kit = toKitPace(pace);
  assert.deepEqual([kit.state, kit.leftMinor], ['over', '-5']);
  assert.equal(words(pace).headline, '฿0.05 over · 16 days to go');
});

test('no budget: no limit, left or per day, and spent still counts waiting drafts', () => {
  const pace = logic('2026-10-16', null, '12000', { outbox: [command(pending({ amount_minor: '500' }), 'unsent')] });
  assert.deepEqual(toKitPace(pace), { state: 'no_budget', spentMinor: '12500', limitMinor: null, leftMinor: null, perDayMinor: null, daysLeft: 16 });
  const said = words(pace);
  assert.equal(said.headline, 'No budget this month');
  assert.equal(said.detail, '฿125.00 spent so far');
  assert.deepEqual([said.tone, said.spentPermille], ['none', null]);
});

test('the last day: one day left, read as "Last day", over or not', () => {
  const last = logic('2026-10-31', '31000', '30000');
  assert.deepEqual(toKitPace(last), { state: 'on_track', spentMinor: '30000', limitMinor: '31000', leftMinor: '1000', perDayMinor: '1000', daysLeft: 1 });
  assert.equal(words(last).detail, 'On track · ฿10.00 left · Last day');
  const overLast = logic('2026-10-31', '31000', '31001');
  assert.equal(toKitPace(overLast).leftMinor, '-1');
  assert.equal(words(overLast).headline, '฿0.01 over · Last day');
});

test('phases: before the month reads like its first day; after it, no days and no per day', () => {
  const before = logic('2026-10-18', '30000', '0', { month: '2026-11' });
  assert.equal(before.phase, 'before');
  assert.deepEqual(toKitPace(before), { state: 'on_track', spentMinor: '0', limitMinor: '30000', leftMinor: '30000', perDayMinor: '1000', daysLeft: 30 });
  assert.equal(words(before).detail, 'On track · ฿300.00 left · 30 days to go');

  const after = logic('2026-11-02', '31000', '30000');
  assert.equal(after.phase, 'after');
  assert.deepEqual(toKitPace(after), { state: 'on_track', spentMinor: '30000', limitMinor: '31000', leftMinor: '1000', perDayMinor: null, daysLeft: 0 });
  const said = words(after);
  assert.deepEqual([said.headline, said.detail, said.days], ['฿10.00 left', 'On track', null]);

  const overAfter = logic('2026-11-02', '31000', '31500');
  assert.deepEqual(toKitPace(overAfter), { state: 'over', spentMinor: '31500', limitMinor: '31000', leftMinor: '-500', perDayMinor: null, daysLeft: 0 });
  assert.equal(words(overAfter).headline, '฿5.00 over');
});

test('every state the logic gives is one the kit takes, word for word', () => {
  const cases = [logic('2026-10-16', '3100000', '1500000'), logic('2026-11-10', '30000', '11001', { month: '2026-11' }), logic('2026-10-16', '31000', '31001'), logic('2026-10-16', null, '0')];
  assert.deepEqual(cases.map((pace) => toKitPace(pace).state), ['on_track', 'tight', 'over', 'no_budget']);
  for (const pace of cases) assert.equal(toKitPace(pace).state, pace.state);
});
