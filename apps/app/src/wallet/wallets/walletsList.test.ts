// The wallets list's figures and order (P2-T20; wc-wallets, W28): what the
// summary card adds up, exactly, and the one front-first order the list, the
// reorder tray and Home's stack share.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { WalletDto } from '@gogospend/contracts';

import type { WalletKind } from '../looks/walletLooks.ts';
import { frontFirst, moveWallet, walletsSummary } from './walletsList.ts';

const wallet = (id: string, balanceMinor: string, name = id, archived = false): WalletDto => ({
  id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-09-01', archived, version: 1, balance_minor: balanceMinor,
});
const kinds = (byId: Readonly<Record<string, WalletKind>>) => (id: string): WalletKind | null => byId[id] ?? null;

test('the summary splits money held from credit-card spending', () => {
  // wc-wallets: บัญชีหลัก ฿24,860, เงินสด ฿1,240, a credit card that has spent ฿3,920, and a travel card with ฿186.
  const wallets = [wallet('main', '2486000'), wallet('cash', '124000'), wallet('card', '-392000'), wallet('transit', '18600')];
  const summary = walletsSummary(wallets, kinds({ main: 'bank', cash: 'cash', card: 'credit_card', transit: 'transit' }));
  assert.deepEqual(summary, { activeCount: 4, totalMinor: '2236600', heldMinor: '2628600', creditUsedMinor: '392000' });
});

test('archived wallets count nowhere, a card paid ahead is money held, and a wallet below zero that is not a card counts in the total only', () => {
  const wallets = [
    wallet('ahead', '50000'),
    wallet('overdrawn', '-120000'),
    wallet('unknown-kind', '-30000'),
    wallet('old-card', '-99999', 'old-card', true),
    wallet('old-cash', '7000', 'old-cash', true),
    // Past 2^53: a JS number would round it.
    wallet('big', '9007199254740993'),
  ];
  const summary = walletsSummary(wallets, kinds({ ahead: 'credit_card', overdrawn: 'bank', 'old-card': 'credit_card', big: 'bank' }));
  assert.deepEqual(summary, { activeCount: 4, totalMinor: '9007199254640993', heldMinor: '9007199254790993', creditUsedMinor: '0' });
  assert.deepEqual(walletsSummary([], kinds({})), { activeCount: 0, totalMinor: '0', heldMinor: '0', creditUsedMinor: '0' });
});

test('front first: the kept order, then every wallet it does not name by name; archived and unknown ids are passed over', () => {
  const wallets = [
    wallet('w-cash', '0', 'Cash'),
    wallet('w-main', '0', 'Main'),
    wallet('w-card', '0', 'Card'),
    wallet('w-old', '0', 'Old', true),
    wallet('w-b', '0', 'Alpha'),
    wallet('w-a', '0', 'Alpha'),
  ];
  const ids = (order: readonly string[]) => frontFirst(wallets, order).map((each) => each.id);
  assert.deepEqual(ids(['w-card', 'gone', 'w-old', 'w-main', 'w-card']), ['w-card', 'w-main', 'w-a', 'w-b', 'w-cash']);
  // Nothing kept: by name, and the same name by id.
  assert.deepEqual(ids([]), ['w-a', 'w-b', 'w-card', 'w-cash', 'w-main']);
  assert.deepEqual(ids(['w-main', 'w-cash', 'w-card', 'w-b', 'w-a']), ['w-main', 'w-cash', 'w-card', 'w-b', 'w-a']);
});

test('a move takes one wallet one place, keeps every other in its place, and never changes the order it was given', () => {
  const ids = Object.freeze(['a', 'b', 'c', 'd']);
  assert.deepEqual(moveWallet(ids, 'c', -1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveWallet(ids, 'b', 1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveWallet(ids, 'd', -1), ['a', 'b', 'd', 'c']);
  // At either end, or for an id it does not hold: the same order, in a new array.
  for (const [id, by] of [['a', -1], ['d', 1], ['gone', -1]] as const) {
    const next = moveWallet(ids, id, by);
    assert.deepEqual(next, ['a', 'b', 'c', 'd'], `${id} ${by}`);
    assert.notEqual(next, ids, `${id} ${by}`);
  }
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
});
