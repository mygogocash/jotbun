// A record event's properties (1D-T7): its kind and its category key, never a name.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CategoryDto, TransactionDto } from '@gogospend/contracts';

import { categoryKeyOf, recordEventOf } from './recordProps.ts';

const category = (n: number, patch: Partial<CategoryDto>): CategoryDto => ({
  id: `0000000c-0000-4000-8000-${String(n).padStart(12, '0')}`, type: 'expense', builtin_key: null, label: null, color: null, archived: false, version: 1, ...patch,
});
const FOOD = category(1, { builtin_key: 'food' });
const MERIT = category(2, { label: 'ทำบุญ' });
const TUTORING = category(3, { label: 'ค่าเรียนพิเศษ' });
const CATEGORIES: readonly CategoryDto[] = [FOOD, MERIT, TUTORING];
const UNKNOWN = '0000000c-0000-4000-8000-000000000099';

test('a category is its built-in key, its pack key or custom; no category is null', () => {
  assert.equal(categoryKeyOf(FOOD.id, CATEGORIES), 'food');
  assert.equal(categoryKeyOf(MERIT.id, CATEGORIES), 'merit');
  assert.equal(categoryKeyOf(TUTORING.id, CATEGORIES), 'custom');
  assert.equal(categoryKeyOf(UNKNOWN, CATEGORIES), 'custom');
  assert.equal(categoryKeyOf(null, CATEGORIES), null);
  assert.equal(categoryKeyOf(undefined, CATEGORIES), null);
  // Any iterable of categories will do.
  assert.equal(categoryKeyOf(MERIT.id, new Map(CATEGORIES.map((item) => [item.id, item])).values()), 'merit');
});

test("a record event carries the record's kind and category key, an edit's new category, and never a name", () => {
  const lunch = {
    id: '0000000b-0000-4000-8000-000000000101', type: 'expense', amount_minor: '4500', occurred_on: '2026-09-29', note: 'ข้าวมันไก่', merchant: 'ร้านป้า',
    deleted_at: null, version: 1, wallet_id: '0000000a-0000-4000-8000-000000000001', category_id: FOOD.id,
  } as TransactionDto;
  assert.deepEqual(recordEventOf(lunch, CATEGORIES), { kind: 'expense', categoryKey: 'food' });
  assert.deepEqual(recordEventOf(lunch, CATEGORIES, { category_id: MERIT.id }), { kind: 'expense', categoryKey: 'merit' });
  assert.deepEqual(recordEventOf(lunch, CATEGORIES, {}), { kind: 'expense', categoryKey: 'food' });
  const move = {
    id: '0000000b-0000-4000-8000-000000000102', type: 'transfer', amount_minor: '150000', occurred_on: '2026-09-29', note: null, merchant: null,
    deleted_at: null, version: 1, source_wallet_id: '0000000a-0000-4000-8000-000000000001', destination_wallet_id: '0000000a-0000-4000-8000-000000000002',
  } as TransactionDto;
  assert.deepEqual(recordEventOf(move, CATEGORIES), { kind: 'transfer', categoryKey: null });
});
