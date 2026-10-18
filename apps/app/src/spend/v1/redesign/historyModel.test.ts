import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TransactionDto } from '@gogospend/contracts';

import type { OutboxCommand } from '../../../storage/types.ts';
import { RECENTLY_DELETED_GAP, foldForSearch, historyModel, matchesSearch, recentlyDeletedModel } from './historyModel.ts';
import type { HistoryInput } from './historyModel.ts';
import { BANK, CASH, COFFEE_TH, FOOD, GIFT, PETS, SALARY, SHOPPING, command, entry, lookups, pending, tc, transfer } from './testing/fixtures.ts';

const TODAY = '2026-10-18';
const OCT = '2026-10';

const a = entry({ id: 'a', category_id: FOOD.id, merchant: 'Starbucks', note: 'Latte', amount_minor: '12000', occurred_on: '2026-10-18' });
const b = entry({ id: 'b', category_id: COFFEE_TH.id, merchant: 'คาเฟ่ อเมซอน', amount_minor: '6500', occurred_on: '2026-10-17' });
const c = entry({ id: 'c', category_id: PETS.id, note: 'เดินป่า', amount_minor: '30000', occurred_on: '2026-10-16' });
const d = entry({ id: 'd', type: 'income', category_id: SALARY.id, wallet_id: BANK, note: 'October pay', amount_minor: '2000000', occurred_on: '2026-10-01' });
const e = transfer({ id: 'e', note: 'coffee fund', amount_minor: '50000', occurred_on: '2026-10-05' });
const f = entry({ id: 'f', category_id: SHOPPING.id, merchant: 'Ｕｎｉｑｌｏ', amount_minor: '99000', occurred_on: '2026-10-05' });
// Stored in canonical (NFC) order: ป + sara uu + mai ek.
const g = entry({ id: 'g', category_id: SHOPPING.id, note: 'ของขวัญ\u0E1B\u0E39\u0E48', amount_minor: '25000', occurred_on: '2026-10-04' });
// Sara am (U+0E33) as one character.
const h = entry({ id: 'h', category_id: FOOD.id, note: 'ค่า\u0E19\u0E49\u0E33', amount_minor: '1500', occurred_on: '2026-10-03' });
const RECORDS: TransactionDto[] = [a, b, c, f, e, g, h, d];

const model = (overrides: Partial<HistoryInput> = {}) =>
  historyModel({ month: OCT, today: TODAY, tc, locale: 'en', dateTag: 'en-GB', records: RECORDS, complete: true, drafts: [], lookups: lookups(), ...overrides });
const found = (overrides: Partial<HistoryInput>) => model(overrides).groups.flatMap((group) => group.rows.map((row) => row.key));

test('a month reads by day, newest first, with each day\'s total', () => {
  const history = model();
  assert.deepEqual(history.groups.map((group) => [group.day, group.label, group.rows.length]), [
    ['2026-10-18', 'Today', 1], ['2026-10-17', 'Yesterday', 1], ['2026-10-16', '16 Oct 2026', 1], ['2026-10-05', '5 Oct 2026', 2],
    ['2026-10-04', '4 Oct 2026', 1], ['2026-10-03', '3 Oct 2026', 1], ['2026-10-01', '1 Oct 2026', 1],
  ]);
  const fifth = history.groups[3];
  assert.deepEqual(fifth.rows.map((row) => row.key), ['f', 'e']);
  assert.equal(fifth.totalText, 'Money out ฿990.00', 'the transfer is neither in nor out');
  assert.equal(history.groups[6].totalText, 'Money in ฿20,000.00');
  assert.deepEqual([history.empty, history.filtered, history.summary, history.emptyText], [false, false, null, null]);
});

test('drafts join their days with their state; other months and acknowledged commands stay out', () => {
  const drafts: OutboxCommand[] = [
    command(pending({ merchant: 'Starbucks', amount_minor: '4500', occurred_on: '2026-10-18' }), 'unsent'),
    command(pending({ amount_minor: '800', occurred_on: '2026-10-12' }), 'uncertain'),
    command(pending({ amount_minor: '800', occurred_on: '2026-10-12' }), 'needs_review'),
    command(pending({ amount_minor: '800', occurred_on: '2026-09-30' }), 'unsent'),
    command(pending({ id: 'a', amount_minor: '12000', occurred_on: '2026-10-18' }), 'acknowledged'),
    command(pending({ id: 'b', amount_minor: '6500', occurred_on: '2026-10-17' }), 'uncertain'),
  ];
  const history = model({ drafts });
  assert.deepEqual(history.groups[0].rows.map((row) => [row.key.startsWith('draft:') ? 'draft' : row.key, row.stateText]), [['draft', 'Saving…'], ['a', null]]);
  assert.equal(history.groups[0].totalText, 'Money out ฿120.00');
  assert.deepEqual(history.groups[0].pendingLines, ['Waiting to sync: money out ฿45.00']);
  assert.deepEqual(history.groups[1].rows.map((row) => row.key), ['b'], 'a confirmed record wins over its own draft');
  const twelfth = history.groups.find((group) => group.day === '2026-10-12');
  assert.deepEqual(twelfth?.rows.map((row) => row.stateText), ['Checking with Jotbun', 'Needs a look']);
  assert.equal(twelfth?.totalText, null);
  assert.ok(!history.groups.some((group) => group.day === '2026-09-30'));
});

test('filters: type, wallet (either side of a move) and category, for drafts too', () => {
  const drafts = [command(pending({ amount_minor: '4500' }), 'unsent'), command(pending({ type: 'income', category_id: GIFT.id, wallet_id: BANK, amount_minor: '100' } as never), 'unsent')];
  assert.deepEqual(found({ filters: { type: 'transfer' } }), ['e']);
  assert.deepEqual(found({ filters: { type: 'income' }, drafts }).map((key) => (key.startsWith('draft:') ? 'draft' : key)), ['draft', 'd']);
  assert.deepEqual(found({ filters: { walletId: BANK } }), ['e', 'd']);
  assert.deepEqual(found({ filters: { walletId: CASH } }), ['a', 'b', 'c', 'f', 'e', 'g', 'h']);
  assert.deepEqual(found({ filters: { categoryId: FOOD.id } }), ['a', 'h']);
  assert.deepEqual(found({ filters: { categoryId: FOOD.id, type: 'income' } }), []);
  const bank = model({ filters: { walletId: BANK } });
  assert.equal(bank.filtered, true);
  assert.equal(bank.summary?.text, '2 entries, ฿20,000.00 in');
});

test('search covers the category name, merchant and note, ignoring case and width', () => {
  assert.deepEqual(found({ query: 'STARBUCKS' }), ['a']);
  assert.deepEqual(found({ query: 'ｓｔａｒｂｕｃｋｓ' }), ['a']);
  assert.deepEqual(found({ query: 'uniqlo' }), ['f']);
  assert.deepEqual(found({ query: 'food' }), ['a', 'h']);
  assert.deepEqual(found({ query: 'pets' }), ['c']);
  assert.deepEqual(found({ query: 'กาแฟ' }), ['b']);
  assert.deepEqual(found({ query: 'อเมซอน' }), ['b']);
  assert.deepEqual(found({ query: 'coffee' }), ['e'], 'a move is found by its note');
  assert.deepEqual(found({ query: '  latte   starbucks ' }), ['a'], 'every word must match');
  assert.deepEqual(found({ query: 'latte uniqlo' }), []);
  assert.deepEqual(found({ query: 'İ' }), []);
  const blank = model({ query: '   ' });
  assert.deepEqual([blank.filtered, blank.summary], [false, null]);
});

test('Thai search is mark-safe: canonical order and sara am match, and marks are never dropped', () => {
  // Tone mark typed before the lower vowel (non-canonical order).
  assert.deepEqual(found({ query: 'ปู่' }), ['g']);
  assert.deepEqual(found({ query: 'ปู่' }), ['g']);
  // Sara am typed as nikhahit + sara aa.
  assert.deepEqual(found({ query: 'น้ํา' }), ['h']);
  assert.deepEqual(found({ query: 'ป่า' }), ['c']);
  assert.deepEqual(found({ query: 'ปา' }), [], 'without its tone mark it is another word');
  assert.equal(foldForSearch('ปู่'), foldForSearch('ปู่'));
  assert.equal(foldForSearch('ำ'), foldForSearch('ํา'));
  assert.equal(foldForSearch('กาแฟ'), 'กาแฟ');
  assert.equal(foldForSearch('ＡＢＣ  def\tG'), 'abc def g');
  assert.equal(matchesSearch([null, undefined, 'Café'], 'CAFÉ'), true, 'decomposed and composed forms match');
  assert.equal(matchesSearch(['anything'], ''), true);
  assert.equal(matchesSearch([null], 'x'), false);
});

test('a search says how many entries and how much, drafts counted apart', () => {
  const drafts = [command(pending({ merchant: 'STARBUCKS reserve', amount_minor: '4500' }), 'unsent')];
  const one = model({ query: 'starbucks', drafts });
  assert.deepEqual(one.summary, { count: 1, draftCount: 1, outMinor: '12000', inMinor: '0', text: '1 entry, ฿120.00 out', draftText: '1 more saved on this device', partial: false });
  const both = model({ records: [a, d, e], query: 'o' });
  assert.equal(both.summary?.text, '3 entries, ฿120.00 out, ฿20,000.00 in', 'a move counts as an entry, neither in nor out');
  assert.equal(model({ records: [e], query: 'fund' }).summary?.text, '1 entry');
  assert.equal(model({ records: [a, b, c], query: '', filters: { type: 'expense' } }).summary?.text, '3 entries, ฿485.00 out');
  const many = model({ filters: { type: 'expense' }, drafts: [...drafts, command(pending(), 'uncertain')] });
  assert.equal(many.summary?.draftText, '2 more saved on this device');
  const none = model({ query: 'nothing like this' });
  assert.deepEqual([none.empty, none.emptyText, none.summary?.text, none.summary?.count], [true, 'No entries match', 'No entries match', 0]);
  assert.equal(model({ query: 'starbucks', complete: false }).summary?.partial, true);
});

test('an empty month says so', () => {
  const empty = model({ records: [] });
  assert.deepEqual([empty.empty, empty.emptyText, empty.groups], [true, 'No entries in this month', []]);
});

test('recently deleted: restorable for 30 days by the server\'s rule, newest first', () => {
  const now = new Date('2026-10-18T05:00:00.000Z');
  const deleted = (id: string, at: string | null, version = 3) => entry({ id, deleted_at: at, version, amount_minor: '6500' });
  const records = [
    deleted('x', '2026-10-17T05:00:00.000Z'),
    deleted('y', '2026-09-18T05:00:00.000Z'),
    deleted('z', '2026-09-18T04:59:59.999Z'),
    deleted('w', '2026-10-18T04:00:00.000Z', 7),
    deleted('active', null),
  ];
  const view = recentlyDeletedModel({ records, now, lookups: lookups(), tc, locale: 'en' });
  assert.deepEqual(view.rows.map((row) => [row.recordId, row.daysLeft, row.daysLeftText]), [
    ['w', 30, '30 days left to restore'],
    ['x', 29, '29 days left to restore'],
    ['y', 1, 'Last day to restore'],
  ]);
  assert.deepEqual([view.rows[0].version, view.rows[0].title, view.rows[0].amountText, view.rows[0].restorableUntil], [7, 'Food', '-฿65.00', '2026-11-17T04:00:00.000Z']);
  assert.equal(view.emptyText, null);
  assert.equal(view.gap, RECENTLY_DELETED_GAP);
  assert.equal(RECENTLY_DELETED_GAP.source, 'none');
  const nothing = recentlyDeletedModel({ records: [deleted('active', null)], now, lookups: lookups(), tc, locale: 'en' });
  assert.deepEqual([nothing.rows, nothing.emptyText], [[], 'Nothing deleted in the last 30 days']);
});
