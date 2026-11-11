// The Bun Wallet Home's card stack (P2-T23; bw-home, rh-offline, W7, W28):
// the kept order drawn back to front, with archived wallets out; each card's
// balance less what waiting drafts take, the waiting drafts that touch it
// still saving, and today's confirmed money out of it, exact.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { WalletDto } from '@gogospend/contracts';

import { command, entry, pending, transfer, walletDto } from '../../spend/v1/redesign/testing/fixtures.ts';
import { derivedLook } from '../looks/walletLooks.ts';
import type { WalletLook } from '../looks/walletLooks.ts';
import { homeWallets } from './homeWallets.ts';

const TODAY = '2026-10-24';
const wallet = (id: string, balanceMinor: string, name = id, archived = false): WalletDto => walletDto(id, name, balanceMinor, archived);

// bw-home's four wallets, front card first: บัญชีหลัก, เงินสด, บัตรเดินทาง, บัตรเครดิต.
const MAIN = wallet('main', '2486000', 'บัญชีหลัก');
const CASH = wallet('cash', '124000', 'เงินสด');
const TRANSIT = wallet('transit', '18600', 'บัตรเดินทาง');
const CARD = wallet('card', '-392000', 'บัตรเครดิต');
const ARCHIVED = wallet('old', '7000', 'กระเป๋าเก่า', true);
const BW_HOME = [CARD, ARCHIVED, MAIN, TRANSIT, CASH];
const KEPT = ['main', 'old', 'cash', 'transit', 'card'];

type Input = Parameters<typeof homeWallets>[0];
const stack = (input: Partial<Input> & Pick<Input, 'wallets'>) => homeWallets({ todayRecords: [], outbox: [], order: [], lookOf: derivedLook, ...input });
/** Each card's figures, by wallet id. */
const figures = (cards: ReturnType<typeof homeWallets>) =>
  Object.fromEntries(cards.map((card) => [card.id, { balance: card.balanceMinor, pending: card.pendingMinor, todayOut: card.todayOutMinor }]));

test('the stack draws the kept order with the front card last, archived wallets out', () => {
  const cards = stack({ wallets: BW_HOME, order: KEPT });
  // CardStack draws its cards in the order given: the back card first, the front card (the kept order's first) last.
  assert.deepEqual(cards.map((card) => card.id), ['card', 'transit', 'cash', 'main']);
  assert.deepEqual(cards.map((card) => card.name), ['บัตรเครดิต', 'บัตรเดินทาง', 'เงินสด', 'บัญชีหลัก']);
  // With no wallets in use, there are no cards.
  assert.deepEqual(stack({ wallets: [ARCHIVED], order: KEPT }), []);
  assert.deepEqual(stack({ wallets: [] }), []);
});

test("front first is the wallets list's order: the kept ids, then the rest by name and then id, drawn back to front", () => {
  // P2-T20's frontFirst cases (walletsList.test.ts), each read back to front.
  const wallets = [
    wallet('w-cash', '0', 'Cash'),
    wallet('w-main', '0', 'Main'),
    wallet('w-card', '0', 'Card'),
    wallet('w-old', '0', 'Old', true),
    wallet('w-b', '0', 'Alpha'),
    wallet('w-a', '0', 'Alpha'),
  ];
  const drawn = (order: readonly string[]) => stack({ wallets, order }).map((card) => card.id);
  // An unknown id, an archived one and one named twice are passed over.
  assert.deepEqual(drawn(['w-card', 'gone', 'w-old', 'w-main', 'w-card']), ['w-cash', 'w-b', 'w-a', 'w-main', 'w-card']);
  // Nothing kept: by name, and the same name by id.
  assert.deepEqual(drawn([]), ['w-main', 'w-cash', 'w-card', 'w-b', 'w-a']);
  assert.deepEqual(drawn(['w-main', 'w-cash', 'w-card', 'w-b', 'w-a']), ['w-a', 'w-b', 'w-card', 'w-cash', 'w-main']);
});

test('a card\'s balance takes off what waiting drafts spend and says how much is still saving', () => {
  // rh-offline: บัญชีหลัก holds ฿24,860 on the server, and a ฿50 expense waits on this phone.
  const outbox = [command(pending({ wallet_id: 'main', amount_minor: '5000', occurred_on: TODAY }), 'unsent')];
  const cards = figures(stack({ wallets: [MAIN, CASH], order: KEPT, outbox }));
  assert.deepEqual(cards.main, { balance: '2481000', pending: '5000', todayOut: '0' });
  assert.deepEqual(cards.cash, { balance: '124000', pending: '0', todayOut: '0' });
});

test('income adds and a transfer moves money between its wallets, each still saving; drafts being checked, refused or acknowledged count nowhere', () => {
  const outbox = [
    command(pending({ type: 'income', wallet_id: 'cash', amount_minor: '20000' }), 'unsent'),
    // Waiting for an app update is still waiting: never sent, so not yet in the server's balance.
    command(pending({ type: 'transfer', source_wallet_id: 'main', destination_wallet_id: 'transit', amount_minor: '30000' }), 'paused_upgrade'),
    // Being checked may already be in the server's balance; refused is not money; acknowledged is in it.
    command(pending({ wallet_id: 'main', amount_minor: '1000' }), 'sending'),
    command(pending({ wallet_id: 'cash', amount_minor: '2000' }), 'uncertain'),
    command(pending({ wallet_id: 'transit', amount_minor: '4000' }), 'needs_review'),
    command(pending({ wallet_id: 'card', amount_minor: '8000' }), 'acknowledged'),
    // A draft for a wallet the list does not hold moves nothing.
    command(pending({ wallet_id: 'gone', amount_minor: '9000' }), 'unsent'),
  ];
  const cards = figures(stack({ wallets: BW_HOME, order: KEPT, outbox }));
  assert.deepEqual(cards, {
    main: { balance: '2456000', pending: '30000', todayOut: '0' },
    cash: { balance: '144000', pending: '20000', todayOut: '0' },
    transit: { balance: '48600', pending: '30000', todayOut: '0' },
    card: { balance: '-392000', pending: '0', todayOut: '0' },
  });
});

test("today's spending counts confirmed expenses only", () => {
  const todayRecords = [
    entry({ wallet_id: 'main', amount_minor: '4700', occurred_on: TODAY }),
    entry({ wallet_id: 'main', amount_minor: '1250', occurred_on: TODAY }),
    entry({ type: 'income', wallet_id: 'main', amount_minor: '500000', occurred_on: TODAY }),
    transfer({ source_wallet_id: 'main', destination_wallet_id: 'cash', amount_minor: '30000', occurred_on: TODAY }),
    entry({ wallet_id: 'cash', amount_minor: '8500', occurred_on: TODAY }),
  ];
  // A waiting draft today is still saving, not spent.
  const outbox = [command(pending({ wallet_id: 'main', amount_minor: '900', occurred_on: TODAY }), 'unsent')];
  // The server's balances already hold today's records; only the draft comes off.
  assert.deepEqual(figures(stack({ wallets: BW_HOME, order: KEPT, todayRecords, outbox })), {
    main: { balance: '2485100', pending: '900', todayOut: '5950' },
    cash: { balance: '124000', pending: '0', todayOut: '8500' },
    transit: { balance: '18600', pending: '0', todayOut: '0' },
    card: { balance: '-392000', pending: '0', todayOut: '0' },
  });
});

test('each card wears its wallet\'s look, and money stays exact past 2^53', () => {
  const kept: Readonly<Record<string, WalletLook>> = { big: { kind: 'bank', material: 'sky', face: 'wink' } };
  const asked: string[] = [];
  const lookOf = (id: string): WalletLook => {
    asked.push(id);
    return kept[id] ?? derivedLook(id);
  };
  // A JS number would round each of these.
  const big = wallet('big', '9007199254740993', 'ออมทรัพย์');
  const outbox = [
    command(pending({ wallet_id: 'big', amount_minor: '1' }), 'unsent'),
    command(pending({ type: 'income', wallet_id: 'big', amount_minor: '9007199254740993' }), 'unsent'),
  ];
  const todayRecords = [entry({ wallet_id: 'big', amount_minor: '9007199254740993', occurred_on: TODAY }), entry({ wallet_id: 'big', amount_minor: '2', occurred_on: TODAY })];
  const cards = stack({ wallets: [big, CASH], order: ['big'], outbox, todayRecords, lookOf });
  assert.deepEqual(figures(cards).big, { balance: '18014398509481985', pending: '9007199254740994', todayOut: '9007199254740995' });
  assert.deepEqual(cards.map((card) => card.look), [derivedLook('cash'), kept.big]);
  assert.deepEqual(asked, ['cash', 'big']);
});
