// The month recap's biggest day (P2-T32): the most confirmed money out, the
// earlier day on a tie whatever order the records come in, and payday only on
// a live income in the built-in salary category.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CategoryDto, TransactionDto } from '@gogospend/contracts';
import { biggestDay } from './biggestDay.ts';

const FOOD_ID = '0000000c-0000-4000-8000-000000000001';
const GIFT: CategoryDto = { id: '0000000c-0000-4000-8000-000000000005', type: 'income', builtin_key: 'gift', label: null, color: '#F291C4', archived: false, version: 1 };
const SALARY: CategoryDto = { id: '0000000c-0000-4000-8000-000000000004', type: 'income', builtin_key: 'salary', label: null, color: '#A8CC4A', archived: false, version: 1 };
// The gift comes first, so only the salary's built-in key can pick the salary out.
const CATEGORIES = [GIFT, SALARY];

let next = 0;
const id = () => `0000000b-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;

function entry(type: 'expense' | 'income', occurred_on: string, amount_minor: string, more: { category_id?: string; deleted_at?: string } = {}): TransactionDto {
  return {
    id: id(), type, amount_minor, occurred_on, wallet_id: 'w1', category_id: more.category_id ?? FOOD_ID,
    note: null, merchant: null, deleted_at: more.deleted_at ?? null, version: 1,
  } as TransactionDto;
}

function move(occurred_on: string, amount_minor: string): TransactionDto {
  return {
    id: id(), type: 'transfer', amount_minor, occurred_on, source_wallet_id: 'w1', destination_wallet_id: 'w2',
    note: null, merchant: null, deleted_at: null, version: 1,
  } as TransactionDto;
}

test('the biggest day is the most money out, the earlier day on a tie', () => {
  // Newest first, as history lists them.
  const records = [
    move('2026-10-28', '900000'), // a move between the person's own wallets is never money out
    entry('income', '2026-10-20', '800000', { category_id: GIFT.id }), // nor is income
    entry('expense', '2026-10-15', '900000', { deleted_at: '2026-10-16T00:00:00.000Z' }), // deleted
    entry('expense', '2026-10-12', '300000'),
    entry('expense', '2026-10-05', '200000'),
    entry('expense', '2026-10-05', '100000'), // the 5th ties the 12th at ฿3,000, and wins
    entry('expense', '2026-10-02', '150000'),
    entry('expense', '2026-09-30', '900000'), // another month
  ];
  assert.deepEqual(biggestDay(records, '2026-10', CATEGORIES), { date: '2026-10-05', outMinor: '300000', payday: false });

  // Exact past Number's safe range: satang through BigInt only.
  const huge = [entry('expense', '2026-11-03', '9007199254740993'), entry('expense', '2026-11-03', '9007199254740993')];
  assert.deepEqual(biggestDay(huge, '2026-11', CATEGORIES), { date: '2026-11-03', outMinor: '18014398509481986', payday: false });
});

test('payday is said only when that day holds a salary income', () => {
  const spending = [entry('expense', '2026-10-25', '250000'), entry('expense', '2026-10-02', '1000')];
  const on25 = (more: TransactionDto[]) => biggestDay([...more, ...spending], '2026-10', CATEGORIES);

  assert.deepEqual(on25([entry('income', '2026-10-25', '3500000', { category_id: SALARY.id })]), { date: '2026-10-25', outMinor: '250000', payday: true });
  // A deleted salary, a salary on another day, and another income on the day are no payday.
  assert.equal(on25([entry('income', '2026-10-25', '3500000', { category_id: SALARY.id, deleted_at: '2026-10-26T00:00:00.000Z' })])?.payday, false);
  assert.equal(on25([entry('income', '2026-10-26', '3500000', { category_id: SALARY.id })])?.payday, false);
  assert.equal(on25([entry('income', '2026-10-25', '100000', { category_id: GIFT.id })])?.payday, false);
  // With no built-in salary category, no day is a payday.
  const salaried = [entry('income', '2026-10-25', '3500000', { category_id: SALARY.id }), ...spending];
  assert.equal(biggestDay(salaried, '2026-10', [GIFT])?.payday, false);
});

test('a month with no money out has no biggest day', () => {
  const records = [
    entry('income', '2026-10-25', '3500000', { category_id: SALARY.id }),
    move('2026-10-26', '50000'),
    entry('expense', '2026-11-01', '1000'),
  ];
  assert.equal(biggestDay(records, '2026-10', CATEGORIES), null);
  assert.equal(biggestDay([], '2026-10', CATEGORIES), null);
});
