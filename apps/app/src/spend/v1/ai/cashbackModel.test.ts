import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUILTIN_CASHBACK_BRANDS } from '@gogospend/contracts';
import type { TransactionDto } from '@gogospend/contracts';

import { cashbackView, countCashbackPurchases } from './cashbackModel.ts';

const W = '11111111-1111-4111-8111-111111111111';
const C = '33333333-3333-4333-8333-333333333333';
let n = 0;
const expense = (merchant: string | null, note: string | null = null, extra: Partial<TransactionDto> = {}): TransactionDto =>
  ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, type: 'expense', amount_minor: '29900', occurred_on: '2026-10-11', wallet_id: W, category_id: C, merchant, note, deleted_at: null, version: 1, ...extra }) as TransactionDto;

test('counts the month’s purchases at cashback shops, by merchant or note, busiest first', () => {
  const records = [
    expense('Shopee 11.11'),
    expense(null, 'ซื้อเสื้อ ช้อปปี้'),
    expense('Lazada'),
    expense('ข้าวมันไก่'),
    expense('Shopee', null, { deleted_at: '2026-10-12T00:00:00Z' }),
    { ...expense('Agoda'), type: 'income' } as TransactionDto,
  ];
  assert.deepEqual(countCashbackPurchases(records, BUILTIN_CASHBACK_BRANDS), {
    count: 3,
    brands: [{ key: 'shopee', name: 'Shopee', count: 2 }, { key: 'lazada', name: 'Lazada', count: 1 }],
  });
});

test('nothing shows before 7 logged days, without purchases, or while preferences are unknown', () => {
  assert.equal(cashbackView({ tipsOn: true, declined: false, daysLogged: 6, count: 3 }), null);
  assert.equal(cashbackView({ tipsOn: true, declined: false, daysLogged: 7, count: 0 }), null);
  assert.equal(cashbackView({ tipsOn: null, declined: false, daysLogged: 20, count: 3 }), null);
});

test('asks once, then shows tips only when the person said yes', () => {
  assert.equal(cashbackView({ tipsOn: false, declined: false, daysLogged: 7, count: 2 }), 'ask');
  assert.equal(cashbackView({ tipsOn: false, declined: true, daysLogged: 7, count: 2 }), null);
  assert.equal(cashbackView({ tipsOn: true, declined: true, daysLogged: 7, count: 2 }), 'tips');
});
