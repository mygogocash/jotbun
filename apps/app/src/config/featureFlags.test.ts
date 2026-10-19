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
