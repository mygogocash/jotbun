import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRedesignEnabled } from './featureFlags.ts';

// E2 checkpoint 1 approved the core loop (19 October 2026): it is on unless switched off.
test('an approved area is on by default', () => {
  assert.equal(isRedesignEnabled('core', undefined), true);
  assert.equal(isRedesignEnabled('core', ''), true);
  assert.equal(isRedesignEnabled('core', 'catalogue'), true);
  assert.equal(isRedesignEnabled('core', 'cores'), true);
});

test('off (or 0) switches every area off, and -area switches one off', () => {
  for (const value of ['off', ' OFF ', '0', 'all,off', 'catalogue, off']) {
    assert.equal(isRedesignEnabled('core', value), false, value);
    assert.equal(isRedesignEnabled('catalogue', value), false, value);
  }
  assert.equal(isRedesignEnabled('core', '-core'), false);
  assert.equal(isRedesignEnabled('core', 'catalogue, -core'), false);
  assert.equal(isRedesignEnabled('catalogue', 'catalogue, -core'), true);
  assert.equal(isRedesignEnabled('core', 'all,-core'), false);
});

test('an area not yet approved is on only by name, or all at once', () => {
  assert.equal(isRedesignEnabled('catalogue', undefined), false);
  assert.equal(isRedesignEnabled('catalogue', ''), false);
  assert.equal(isRedesignEnabled('catalogue', 'core'), false);
  assert.equal(isRedesignEnabled('catalogue', ' core , catalogue '), true);
  assert.equal(isRedesignEnabled('catalogue', 'all'), true);
  assert.equal(isRedesignEnabled('catalogue', 'catalog'), false);
  assert.equal(isRedesignEnabled('catalogue', '-catalogue,all'), false);
});

// R4: Planning is built behind its own area until E2 checkpoint 2.
test('planning is opt-in until approved', () => {
  assert.equal(isRedesignEnabled('planning', undefined), false);
  assert.equal(isRedesignEnabled('planning', 'core'), false);
  assert.equal(isRedesignEnabled('planning', 'planning'), true);
  assert.equal(isRedesignEnabled('planning', 'all'), true);
  assert.equal(isRedesignEnabled('planning', 'planning,off'), false);
});

// R5: Insights is built behind its own area until E2 checkpoint 3.
test('insights is opt-in until approved', () => {
  assert.equal(isRedesignEnabled('insights', undefined), false);
  assert.equal(isRedesignEnabled('insights', 'planning'), false);
  assert.equal(isRedesignEnabled('insights', 'insights'), true);
  assert.equal(isRedesignEnabled('insights', 'all'), true);
});

// R6: first run, sign-in, Settings and privacy are built behind their own area until E2 checkpoint 4.
test('account is opt-in until approved', () => {
  assert.equal(isRedesignEnabled('account', undefined), false);
  assert.equal(isRedesignEnabled('account', 'insights'), false);
  assert.equal(isRedesignEnabled('account', 'account'), true);
  assert.equal(isRedesignEnabled('account', 'all'), true);
});

// R7: the import journey and receipts are built behind their own area until E2 checkpoint 5.
test('import is opt-in until approved', () => {
  assert.equal(isRedesignEnabled('import', undefined), false);
  assert.equal(isRedesignEnabled('import', 'account'), false);
  assert.equal(isRedesignEnabled('import', 'import'), true);
  assert.equal(isRedesignEnabled('import', 'all'), true);
});
