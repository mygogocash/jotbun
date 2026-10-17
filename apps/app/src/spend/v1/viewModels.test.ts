import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CategoryDto, TransactionDto, WalletDto } from '@gogospend/contracts';

import { byId, categoryName, groupByDay, monthRange, recordView, shiftMonth, todayInBangkok, walletsTotal } from './viewModels.ts';

const tc = (english: string) => `[${english}]`;
const wallet = (id: string, name: string, balance: string): WalletDto => ({ id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-09-01', archived: false, version: 1, balance_minor: balance });
const food: CategoryDto = { id: 'c1', type: 'expense', builtin_key: 'food', label: null, color: '#F0A868', archived: false, version: 1 };
const pets: CategoryDto = { id: 'c2', type: 'expense', builtin_key: null, label: 'Pets', color: null, archived: false, version: 1 };

test('category names use the custom label, else the translated built-in name', () => {
  assert.equal(categoryName(food, tc), '[Food]');
  assert.equal(categoryName(pets, tc), 'Pets');
  assert.equal(categoryName({ ...food, label: 'Meals' }, tc), 'Meals');
});

test('the golden wallets total exactly, beyond JavaScript numbers too', () => {
  assert.equal(walletsTotal([wallet('a', 'Cash', '235000'), wallet('b', 'Daily', '1870000')]), '2105000');
  assert.equal(walletsTotal([wallet('a', 'A', '9007199254740993'), wallet('b', 'B', '-1')]), '9007199254740992');
  assert.equal(walletsTotal([]), '0');
});

test('records read as signed amounts with their wallet and category', () => {
  const lookups = { wallets: byId([wallet('w1', 'Cash', '0'), wallet('w2', 'Daily', '0')]), categories: byId([food]) };
  const common = { id: 't', amount_minor: '6500', occurred_on: '2026-09-20', note: null, merchant: null, deleted_at: null, version: 2 };
  const expense = recordView({ ...common, type: 'expense', wallet_id: 'w1', category_id: 'c1' } as TransactionDto, lookups, tc, 'en');
  assert.deepEqual([expense.title, expense.detail, expense.amountText, expense.amountLabel], ['[Food]', 'Cash', '-฿65.00', '[Expense] ฿65.00']);
  const income = recordView({ ...common, type: 'income', wallet_id: 'w2', category_id: 'missing' } as TransactionDto, lookups, tc, 'en');
  assert.deepEqual([income.title, income.amountText], ['[Category]', '+฿65.00']);
  const transfer = recordView({ ...common, type: 'transfer', source_wallet_id: 'w1', destination_wallet_id: 'w2' } as TransactionDto, lookups, tc, 'en');
  assert.deepEqual([transfer.title, transfer.detail, transfer.amountText], ['[Transfer]', 'Cash → Daily', '฿65.00']);
});

test('months and Bangkok dates', () => {
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', through: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', through: '2028-02-29' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  // 2026-09-30 17:30 UTC is already 1 October in Bangkok.
  assert.equal(todayInBangkok(new Date('2026-09-30T17:30:00Z')), '2026-10-01');
});

test('rows group by day in order', () => {
  const groups = groupByDay([{ occurredOn: '2026-09-28' }, { occurredOn: '2026-09-28' }, { occurredOn: '2026-09-27' }]);
  assert.deepEqual(groups.map((group) => [group.day, group.rows.length]), [['2026-09-28', 2], ['2026-09-27', 1]]);
});
