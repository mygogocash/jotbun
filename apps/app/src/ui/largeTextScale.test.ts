import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LARGE_TEXT_SCALE, isLargeText } from './largeTextScale.ts';

// iOS: xxxLarge, the largest standard size, is 1.353x; AX1, the first
// accessibility size, is 1.786x and AX5 3.571x. Android's largest is 2x.
test('large text starts at the accessibility sizes, not at the standard ones', () => {
  assert.equal(isLargeText(1), false);
  assert.equal(isLargeText(1.353), false);
  assert.equal(isLargeText(1.786), true);
  assert.equal(isLargeText(3.571), true);
  assert.equal(isLargeText(2), true);
  assert.ok(LARGE_TEXT_SCALE > 1.353 && LARGE_TEXT_SCALE <= 1.786);
});

test('a missing or odd scale is ordinary text', () => {
  assert.equal(isLargeText(0), false);
  assert.equal(isLargeText(Number.NaN), false);
});
