import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRedesignEnabled } from './featureFlags.ts';

test('the redesign is off unless switched on', () => {
  assert.equal(isRedesignEnabled('core', undefined), false);
  assert.equal(isRedesignEnabled('core', ''), false);
  assert.equal(isRedesignEnabled('core', '0'), false);
});

test('areas switch on by name, or all at once', () => {
  assert.equal(isRedesignEnabled('core', 'core'), true);
  assert.equal(isRedesignEnabled('catalogue', 'core'), false);
  assert.equal(isRedesignEnabled('catalogue', ' core , catalogue '), true);
  assert.equal(isRedesignEnabled('core', 'all'), true);
  assert.equal(isRedesignEnabled('catalogue', 'all'), true);
  assert.equal(isRedesignEnabled('core', 'cores'), false);
});
