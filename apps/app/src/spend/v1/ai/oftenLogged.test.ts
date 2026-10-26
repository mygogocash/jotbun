import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TransactionDto } from '@gogospend/contracts';

import { OFTEN_LOGGED_TOP, bahtWords, oftenLogged } from './oftenLogged.ts';

const CASH = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';
const FOOD = '33333333-3333-4333-8333-333333333333';
const TRAVEL = '44444444-4444-4444-8444-444444444444';
const wallets = [{ id: CASH, archived: false }, { id: OLD, archived: true }];
const categories = [{ id: FOOD, archived: false }, { id: TRAVEL, archived: false }];

let n = 0;
function entry(merchant: string | null, amount: string, on: string, extra: Partial<TransactionDto> = {}): TransactionDto {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    type: 'expense',
    amount_minor: amount,
    occurred_on: on,
    wallet_id: CASH,
    category_id: FOOD,
    merchant,
    note: null,
    version: 1,
    deleted_at: null,
    ...extra,
  } as TransactionDto;
}

const often = (records: TransactionDto[]) => oftenLogged({ records, today: '2026-10-24', wallets, categories });

test('an entry repeated at least twice becomes a draft dated today, with nothing guessed', () => {
  const [chip, ...rest] = often([entry('ข้าวมันไก่', '5000', '2026-10-20'), entry('ข้าวมันไก่', '5000', '2026-10-22'), entry('ร้านป้าแดง', '8000', '2026-10-21')]);
  assert.deepEqual(rest, []);
  assert.equal(chip.label, 'ข้าวมันไก่ 50');
  assert.deepEqual(chip.draft, { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', category_id: FOOD, wallet_id: CASH, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] });
});

test('the most repeated come first, then the most recent, and only a few are shown', () => {
  const records = [
    ...['10-01', '10-02', '10-03'].map((day) => entry('BTS', '4400', `2026-${day}`, { category_id: TRAVEL })),
    ...['10-04', '10-05'].map((day) => entry('7-Eleven', '6500', `2026-${day}`)),
    ...['10-20', '10-21'].map((day) => entry('Grab', '12000', `2026-${day}`, { category_id: TRAVEL })),
    ...['10-06', '10-07'].map((day) => entry('กาแฟ', '4550', `2026-${day}`)),
  ];
  assert.deepEqual(often(records).map((chip) => chip.label), ['BTS 44', 'Grab 120', 'กาแฟ 45.50']);
  assert.equal(OFTEN_LOGGED_TOP, 3);
});

test('the same place at another amount, category or wallet is another entry', () => {
  assert.deepEqual(often([entry('Grab', '12000', '2026-10-20'), entry('Grab', '9000', '2026-10-21'), entry('Grab', '12000', '2026-10-22', { category_id: TRAVEL })]), []);
});

test('places differing only in letter case or spaces count together, named as last written', () => {
  assert.deepEqual(often([entry(' starbucks ', '14500', '2026-10-20'), entry('Starbucks', '14500', '2026-10-21')]).map((chip) => chip.label), ['Starbucks 145']);
  assert.deepEqual(often([entry('Starbucks', '14500', '2026-10-20'), entry(' starbucks ', '14500', '2026-10-21')]).map((chip) => chip.label), ['starbucks 145']);
});

test('transfers, deleted records, records without a place and archived wallets never count', () => {
  const transfer = { ...entry('ATM', '100000', '2026-10-20'), type: 'transfer', source_wallet_id: CASH, destination_wallet_id: OLD } as unknown as TransactionDto;
  assert.deepEqual(often([
    transfer, transfer,
    entry('ข้าวมันไก่', '5000', '2026-10-20', { deleted_at: '2026-10-21T00:00:00.000Z' } as Partial<TransactionDto>), entry('ข้าวมันไก่', '5000', '2026-10-21', { deleted_at: '2026-10-21T00:00:00.000Z' } as Partial<TransactionDto>),
    entry(null, '5000', '2026-10-20'), entry(null, '5000', '2026-10-21'),
    entry('ตลาด', '20000', '2026-10-20', { wallet_id: OLD }), entry('ตลาด', '20000', '2026-10-21', { wallet_id: OLD }),
  ]), []);
});

test('amounts read the way people type them', () => {
  assert.equal(bahtWords('5000'), '50');
  assert.equal(bahtWords('4550'), '45.50');
  assert.equal(bahtWords('5'), '0.05');
  assert.equal(bahtWords('1234500'), '12345');
});
