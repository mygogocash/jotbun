import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetLevel, celebrateGoodWeek, crossedLevel, isoWeek } from './milestones.ts';

test('budget levels: under 80%, from 80%, from 100%, none without a limit', () => {
  assert.equal(budgetLevel('0', '1000000'), 0);
  assert.equal(budgetLevel('799999', '1000000'), 0);
  assert.equal(budgetLevel('800000', '1000000'), 80);
  assert.equal(budgetLevel('999999', '1000000'), 80);
  assert.equal(budgetLevel('1000000', '1000000'), 100);
  assert.equal(budgetLevel('5000000', '1000000'), 100);
  assert.equal(budgetLevel('5000', null), 0);
  assert.equal(budgetLevel('5000', '0'), 0);
});

test('a crossing is only upward, within one month, and never the first reading', () => {
  assert.equal(crossedLevel(null, { month: '2026-10', level: 100 }), null);
  assert.equal(crossedLevel({ month: '2026-10', level: 0 }, { month: '2026-10', level: 80 }), 80);
  assert.equal(crossedLevel({ month: '2026-10', level: 80 }, { month: '2026-10', level: 100 }), 100);
  assert.equal(crossedLevel({ month: '2026-10', level: 0 }, { month: '2026-10', level: 100 }), 100);
  assert.equal(crossedLevel({ month: '2026-10', level: 100 }, { month: '2026-10', level: 80 }), null);
  assert.equal(crossedLevel({ month: '2026-10', level: 80 }, { month: '2026-10', level: 80 }), null);
  assert.equal(crossedLevel({ month: '2026-09', level: 0 }, { month: '2026-10', level: 100 }), null);
});

test('ISO weeks start on Monday and roll over the year correctly', () => {
  assert.equal(isoWeek('2026-10-24'), '2026-W43'); // a Saturday
  assert.equal(isoWeek('2026-10-25'), '2026-W43'); // Sunday ends the week
  assert.equal(isoWeek('2026-10-26'), '2026-W44'); // Monday starts the next
  assert.equal(isoWeek('2026-12-31'), '2026-W53');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2027-01-04'), '2027-W01');
});

test('a good week is celebrated once per week', () => {
  assert.equal(celebrateGoodWeek(true, '2026-10-24', null), true);
  assert.equal(celebrateGoodWeek(true, '2026-10-25', '2026-W43'), false);
  assert.equal(celebrateGoodWeek(true, '2026-10-26', '2026-W43'), true);
  assert.equal(celebrateGoodWeek(false, '2026-10-26', null), false);
});
