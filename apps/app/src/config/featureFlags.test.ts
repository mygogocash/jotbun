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

// E2 checkpoints 2–5 approved Planning (R4), Insights (R5), Account (R6) and
// Import (R7) on 19 October 2026: each is on unless switched off. The catalogue
// stays opt-in.
for (const area of ['planning', 'insights', 'account', 'import'] as const) {
  test(`${area} is on by default since its approval, and -${area} or off switches it off`, () => {
    assert.equal(isRedesignEnabled(area, undefined), true);
    assert.equal(isRedesignEnabled(area, ''), true);
    assert.equal(isRedesignEnabled(area, 'core'), true);
    assert.equal(isRedesignEnabled(area, `-${area}`), false);
    assert.equal(isRedesignEnabled(area, `core,-${area}`), false);
    assert.equal(isRedesignEnabled(area, 'off'), false);
  });
}

// The companion area is on at the owner's request (24 October 2026), with
// its E2 screenshots still to come; -companion switches it off.
test('companion is on by default, and -companion or off switches it off', () => {
  assert.equal(isRedesignEnabled('companion', undefined), true);
  assert.equal(isRedesignEnabled('companion', '-companion'), false);
  assert.equal(isRedesignEnabled('companion', 'core,-companion'), false);
  assert.equal(isRedesignEnabled('companion', 'off'), false);
});

test('the catalogue is still opt-in', () => {
  assert.equal(isRedesignEnabled('catalogue', 'planning,insights,account,import'), false);
});

// 1D-T9: C16's choice flow waits for its E2 screenshots (decided, Q9), so it is on only when named.
test('conflict is off by default, on when named, and on with all', () => {
  assert.equal(isRedesignEnabled('conflict', undefined), false);
  assert.equal(isRedesignEnabled('conflict', ''), false);
  assert.equal(isRedesignEnabled('conflict', 'core,planning,insights,account,import,companion'), false);
  assert.equal(isRedesignEnabled('conflict', 'conflict'), true);
  assert.equal(isRedesignEnabled('conflict', ' core , conflict '), true);
  assert.equal(isRedesignEnabled('conflict', 'all'), true);
  assert.equal(isRedesignEnabled('conflict', 'all,-conflict'), false);
  assert.equal(isRedesignEnabled('conflict', 'conflict,off'), false);
});

// The Bun Wallet area (phase 2, W1) is off until the owner approves its E2
// screenshots (P2-T38): only `wallet` or `all` switches it on.
test('the wallet area is off unless named', () => {
  for (const value of [undefined, '', 'core', 'catalogue,companion', 'wallets', 'wallet,-wallet', '-wallet,all', 'off', 'wallet, off']) {
    assert.equal(isRedesignEnabled('wallet', value), false, String(value));
  }
  for (const value of ['wallet', ' WALLET ', 'catalogue, wallet', 'all']) {
    assert.equal(isRedesignEnabled('wallet', value), true, value);
  }
});
