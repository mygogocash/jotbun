import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetWords } from './budgetWords.ts';
import type { BudgetPace } from './budgetWords.ts';

// The English copy as the catalogue would return it, placeholders filled.
const tc = (english: string, values: Readonly<Record<string, string | number>> = {}) =>
  english.replace(/\{(\w+)\}/g, (token, key: string) => (values[key] === undefined ? token : String(values[key])));

const pace = (overrides: Partial<BudgetPace>): BudgetPace => ({
  state: 'on_track', spentMinor: '1200000', limitMinor: '1800000', leftMinor: '600000', perDayMinor: '42000', daysLeft: 10, ...overrides,
});

test('on track leads with the daily pace and says so in words', () => {
  const words = budgetWords(pace({}), tc, 'en');
  assert.equal(words.headline, '฿420.00 a day left');
  assert.equal(words.detail, 'On track · ฿6,000.00 left · 10 days to go');
  assert.equal(words.spoken, '฿420.00 a day left, On track, ฿6,000.00 left, 10 days to go');
  assert.equal(words.tone, 'under');
  assert.equal(words.spentPermille, 666);
  assert.deepEqual([words.figure, words.figureWord, words.days], ['฿420.00', 'a day left', '10 days to go']);
});

test('tight is still under budget, and the word says it is tight', () => {
  const words = budgetWords(pace({ state: 'tight', spentMinor: '1680000', leftMinor: '120000', perDayMinor: '12000' }), tc, 'en');
  assert.equal(words.headline, '฿120.00 a day left');
  assert.equal(words.detail, 'Tight · ฿1,200.00 left · 10 days to go');
  assert.equal(words.tone, 'under');
  assert.equal(words.spentPermille, 933);
});

test('over budget is kind and factual, never colour alone', () => {
  const words = budgetWords(pace({ state: 'over', spentMinor: '1812000', leftMinor: '-12000', perDayMinor: null, daysLeft: 9 }), tc, 'en');
  assert.equal(words.headline, '฿120.00 over · 9 days to go');
  assert.equal(words.detail, 'It happens. ฿18,120.00 of ฿18,000.00 spent.');
  assert.match(words.spoken, /over/);
  assert.equal(words.tone, 'over');
  assert.equal(words.spentPermille, 1000);
  assert.deepEqual([words.figure, words.figureWord, words.days], ['฿120.00', 'over', '9 days to go']);
  for (const harsh of [/fail/i, /bad/i, /!/, /overspent/i, /warning/i]) assert.doesNotMatch(`${words.headline} ${words.detail}`, harsh);
});

test('no budget says so and still shows what was spent', () => {
  const words = budgetWords(pace({ state: 'no_budget', limitMinor: null, leftMinor: null, perDayMinor: null }), tc, 'en');
  assert.equal(words.headline, 'No budget this month');
  assert.equal(words.detail, '฿12,000.00 spent so far');
  assert.equal(words.tone, 'none');
  assert.equal(words.spentPermille, null);
  assert.deepEqual([words.figure, words.figureWord], ['฿12,000.00', 'spent']);
});

test('the last day and the end of the month read naturally', () => {
  assert.equal(budgetWords(pace({ daysLeft: 1, perDayMinor: '600000' }), tc, 'en').detail, 'On track · ฿6,000.00 left · Last day');
  const ended = budgetWords(pace({ daysLeft: 0, perDayMinor: null }), tc, 'en');
  assert.equal(ended.headline, '฿6,000.00 left');
  assert.equal(ended.detail, 'On track');
  assert.deepEqual([ended.figure, ended.figureWord, ended.days], ['฿6,000.00', 'left', null]);
  assert.equal(budgetWords(pace({ state: 'over', leftMinor: '-1', perDayMinor: null, daysLeft: 1 }), tc, 'en').headline, '฿0.01 over · Last day');
});

test('a finished month reads as a plain result, never a pace', () => {
  const PACE_WORDS = /On track|Tight|a day left|days to go|Last day/;
  const under = budgetWords(pace({ phase: 'after', spentMinor: '1200000', leftMinor: '600000', perDayMinor: null, daysLeft: 0 }), tc, 'en');
  assert.deepEqual([under.headline, under.detail, under.days], ['฿6,000.00 under budget', '฿12,000.00 of ฿18,000.00', null]);
  assert.deepEqual([under.figure, under.figureWord, under.tone, under.spentPermille], ['฿6,000.00', 'under budget', 'under', 666]);
  assert.equal(under.spoken, '฿6,000.00 under budget, ฿12,000.00 of ฿18,000.00');

  // A tight month that has ended is just under budget: the phase wins over the old pace state.
  const tight = budgetWords(pace({ phase: 'after', state: 'tight', leftMinor: '100', perDayMinor: null, daysLeft: 0 }), tc, 'en');
  assert.equal(tight.headline, '฿1.00 under budget');

  const exact = budgetWords(pace({ phase: 'after', spentMinor: '1800000', leftMinor: '0', perDayMinor: null, daysLeft: 0 }), tc, 'en');
  assert.deepEqual([exact.headline, exact.figure, exact.tone], ['Right on budget', '฿0.00', 'under']);

  const over = budgetWords(pace({ phase: 'after', state: 'over', spentMinor: '1812000', leftMinor: '-12000', perDayMinor: null, daysLeft: 0 }), tc, 'en');
  assert.deepEqual([over.headline, over.figure, over.figureWord, over.tone, over.days], ['฿120.00 over', '฿120.00', 'over', 'over', null]);
  assert.equal(over.detail, 'It happens. ฿18,120.00 of ฿18,000.00 spent.');

  const none = budgetWords(pace({ phase: 'after', state: 'no_budget', limitMinor: null, leftMinor: null, perDayMinor: null, daysLeft: 0 }), tc, 'en');
  assert.equal(none.headline, 'No budget this month');

  for (const words of [under, tight, exact, over, none]) assert.doesNotMatch(`${words.headline} ${words.detail} ${words.figureWord} ${words.spoken}`, PACE_WORDS);
  // During the month (and before it), the pace words stay.
  assert.equal(budgetWords(pace({ phase: 'during' }), tc, 'en').detail, 'On track · ฿6,000.00 left · 10 days to go');
  assert.equal(budgetWords(pace({ phase: 'before', daysLeft: 30 }), tc, 'en').detail, 'On track · ฿6,000.00 left · 30 days to go');
});

test('amounts stay exact and the fill never passes the limit', () => {
  const words = budgetWords(pace({ spentMinor: '99999999999', limitMinor: '99999999999', leftMinor: '0', perDayMinor: '0' }), tc, 'th');
  assert.equal(words.spentPermille, 1000);
  assert.equal(words.headline, '฿0.00 a day left');
  assert.equal(budgetWords(pace({ spentMinor: '1', limitMinor: '99999999999' }), tc, 'en').spentPermille, 0);
  assert.equal(budgetWords(pace({ spentMinor: '0', limitMinor: '0', leftMinor: '0' }), tc, 'en').spentPermille, 1000);
});
