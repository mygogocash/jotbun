// Where the wallet shell's bar shows, the inset a screen keeps under it, and
// what /spend/add's link asks the add tray (P2-T18; shellRoutes.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addRequestOf, WALLET_TAB_INSET, WALLET_TAB_INSET_LARGE, walletTab, walletTabInset } from './shellRoutes.ts';

test('the bar shows on /spend and /spend/insights only, selecting their tab', () => {
  assert.deepEqual(walletTab('/spend'), { visible: true, active: 'wallets' });
  assert.deepEqual(walletTab('/spend/'), { visible: true, active: 'wallets' });
  assert.deepEqual(walletTab('/spend/insights'), { visible: true, active: 'insights' });
  assert.deepEqual(walletTab('/spend/insights/'), { visible: true, active: 'insights' });
  for (const hidden of ['/spend/all', '/spend/wallet/x', '/spend/wallets', '/spend/record/x', '/spend/setup', '/spend/budget', '/spend/add', '/spend/insights/x', '/spend/recap/2026-10', '/settings', '/']) {
    assert.deepEqual(walletTab(hidden), { visible: false, active: null }, hidden);
  }
});

test('a screen keeps 84 pt clear of the + under the bar, 96 pt at the largest text sizes, and nothing where the bar is hidden', () => {
  assert.equal(WALLET_TAB_INSET, 84);
  assert.equal(WALLET_TAB_INSET_LARGE, 96);
  assert.equal(walletTabInset(true, false), 84);
  assert.equal(walletTabInset(true, true), 96);
  assert.equal(walletTabInset(false, false), 0);
  assert.equal(walletTabInset(false, true), 0);
});

test("/spend/add's link asks for a known type, a wallet and a record to copy, each only when named", () => {
  assert.deepEqual(addRequestOf({}), {});
  for (const type of ['expense', 'income', 'transfer']) assert.deepEqual(addRequestOf({ type }), { type });
  assert.deepEqual(addRequestOf({ type: 'refund' }), {});
  assert.deepEqual(addRequestOf({ type: ['income'] }), {});
  assert.deepEqual(addRequestOf({ walletId: 'w1', copyOf: 'r1', amount: '5000' }), { walletId: 'w1', copyOf: 'r1' });
  assert.deepEqual(addRequestOf({ type: 'transfer', walletId: 'w1' }), { type: 'transfer', walletId: 'w1' });
  assert.deepEqual(addRequestOf({ walletId: '', copyOf: ['r1', 'r2'] }), {});
});
