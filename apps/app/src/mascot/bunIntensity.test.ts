import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUN_INTENSITIES,
  DEFAULT_BUN_INTENSITY,
  parseBunIntensity,
  resolveBunIntensity,
  showsBubble,
  showsBun,
} from './bunIntensity.ts';

test('the bun is at full intensity until the person chooses otherwise', () => {
  assert.equal(DEFAULT_BUN_INTENSITY, 'full');
  assert.deepEqual([...BUN_INTENSITIES], ['full', 'quiet', 'off']);
});

test('only the three stored words parse', () => {
  for (const intensity of ['full', 'quiet', 'off'] as const) {
    assert.equal(parseBunIntensity(intensity), intensity);
  }
  for (const junk of ['Full', ' quiet', 'off ', 'loud', '', 'system', null, undefined, 0, 1, true, {}, ['full']]) {
    assert.equal(parseBunIntensity(junk), null, `${JSON.stringify(junk)} must not parse`);
  }
});

test('a missing or damaged stored value falls back to full', () => {
  assert.equal(resolveBunIntensity(null), 'full');
  assert.equal(resolveBunIntensity('QUIET'), 'full');
  assert.equal(resolveBunIntensity('quiet'), 'quiet');
  assert.equal(resolveBunIntensity('off'), 'off');
});

test('off hides every bun, quiet keeps the bun but drops the bubble', () => {
  const table = BUN_INTENSITIES.map((intensity) => [intensity, showsBun(intensity), showsBubble(intensity)]);
  assert.deepEqual(table, [
    ['full', true, true],
    ['quiet', true, false],
    ['off', false, false],
  ]);
});
