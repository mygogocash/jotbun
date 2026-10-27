import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loggedOn, streakCount } from './loggedDays.ts';

test('the streak counts every logged day; a skipped day pauses it and never lowers it', () => {
  const days = ['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'];
  assert.equal(streakCount(days, '2026-10-24'), 4);
  assert.equal(streakCount(days, '2026-10-26'), 4);
});

test('a day dated in the future does not count yet, and repeats count once', () => {
  assert.equal(streakCount(['2026-10-24', '2026-10-24', '2026-10-25'], '2026-10-24'), 1);
});

test('loggedOn finds a day', () => {
  assert.equal(loggedOn(['2026-10-24'], '2026-10-24'), true);
  assert.equal(loggedOn(['2026-10-23'], '2026-10-24'), false);
});
