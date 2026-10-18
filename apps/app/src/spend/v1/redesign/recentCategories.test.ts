import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CategoryDto, TransactionDto } from '@gogospend/contracts';

import type { PendingEntry } from '../../../storage/types.ts';
import { RECENT_TOP, RECENT_WINDOW_DAYS, rankRecentCategories } from './recentCategories.ts';
import { ART, BILLS, BONUS, BUILTINS, FOOD, FUN, GIFT, HOUSEHOLD, OLD_HOBBY, PETS, SALARY, SHOPPING, SIDE_JOB, TRAVEL, entry, pending } from './testing/fixtures.ts';

const TODAY = '2026-10-18';
const ALL = [PETS, ...BUILTINS, OLD_HOBBY, ART];
const ids = (categories: readonly CategoryDto[]) => categories.map((category) => category.id);
const use = (category: CategoryDto, occurred_on: string, extra: Partial<TransactionDto> = {}) => entry({ category_id: category.id, type: category.type, occurred_on, ...extra } as never);
const rank = (records: TransactionDto[], drafts: PendingEntry[] = [], type: 'expense' | 'income' = 'expense', top?: number) =>
  rankRecentCategories({ type, categories: ALL, records, drafts, today: TODAY, top });

test('with nothing logged, the built-in order fills the top and the rest keeps the default order', () => {
  assert.equal(RECENT_TOP, 3);
  assert.equal(RECENT_WINDOW_DAYS, 60);
  const fresh = rank([]);
  assert.deepEqual(ids(fresh.top), ids([FOOD, TRAVEL, HOUSEHOLD]));
  assert.deepEqual(ids(fresh.rest), ids([BILLS, SHOPPING, FUN, ART, PETS]));
  const income = rank([], [], 'income');
  assert.deepEqual(ids(income.top), ids([SALARY, BONUS, SIDE_JOB]));
  assert.deepEqual(ids(income.rest), ids([GIFT]));
});

test('frequency and recency both count', () => {
  // Three uses 50 days ago weigh 3 × 10; one use today weighs 60.
  const records = [use(BILLS, '2026-08-29'), use(BILLS, '2026-08-29'), use(BILLS, '2026-08-29'), use(PETS, TODAY)];
  const ranked = rank(records);
  assert.deepEqual(ids(ranked.top), ids([PETS, BILLS, FOOD]));
  assert.equal(ranked.scores.get(PETS.id), 60);
  assert.equal(ranked.scores.get(BILLS.id), 30);
  // Seven old uses outweigh one today.
  const many = rank([...Array.from({ length: 7 }, () => use(BILLS, '2026-08-29')), use(PETS, TODAY)]);
  assert.deepEqual(ids(many.top).slice(0, 2), ids([BILLS, PETS]));
  // The rest keeps the stable order, whatever was used.
  assert.deepEqual(ids(ranked.rest), ids([TRAVEL, HOUSEHOLD, SHOPPING, FUN, ART]));
});

test('the window is the last 60 days counting today', () => {
  const edge = rank([use(FUN, '2026-08-20')]);
  assert.equal(edge.scores.get(FUN.id), 1, '59 days ago still counts, weight 1');
  assert.deepEqual(ids(edge.top), ids([FUN, FOOD, TRAVEL]));
  const outside = rank([use(FUN, '2026-08-19'), use(SHOPPING, '2026-10-19')]);
  assert.equal(outside.scores.get(FUN.id), 0, '60 days ago is outside');
  assert.equal(outside.scores.get(SHOPPING.id), 0, 'a future date does not count');
  assert.deepEqual(ids(outside.top), ids([FOOD, TRAVEL, HOUSEHOLD]));
});

test('ties fall back to the built-in order, then the label; custom categories after built-ins', () => {
  const tied = rank([use(SHOPPING, TODAY), use(TRAVEL, TODAY), use(PETS, TODAY), use(ART, TODAY)], [], 'expense', 4);
  assert.deepEqual(ids(tied.top), ids([TRAVEL, SHOPPING, ART, PETS]));
});

test('archived categories and other types are left out, even when used', () => {
  const ranked = rank([use(OLD_HOBBY, TODAY), use(OLD_HOBBY, TODAY), use(SALARY, TODAY)]);
  assert.ok(!ids([...ranked.top, ...ranked.rest]).includes(OLD_HOBBY.id));
  assert.ok(!ids([...ranked.top, ...ranked.rest]).includes(SALARY.id));
  assert.deepEqual(ids(ranked.top), ids([FOOD, TRAVEL, HOUSEHOLD]));
});

test('drafts count, a confirmed draft counts once, and deleted records do not count', () => {
  const confirmed = use(HOUSEHOLD, TODAY);
  const echo = pending({ id: confirmed.id, category_id: HOUSEHOLD.id });
  const ranked = rank([confirmed, use(BILLS, TODAY, { deleted_at: '2026-10-18T03:00:00.000Z' })], [echo, pending({ category_id: FUN.id }), pending({ type: 'transfer' })]);
  assert.equal(ranked.scores.get(HOUSEHOLD.id), 60);
  assert.equal(ranked.scores.get(FUN.id), 60);
  assert.equal(ranked.scores.get(BILLS.id), 0);
  assert.deepEqual(ids(ranked.top), ids([HOUSEHOLD, FUN, FOOD]));
});

test('top N is configurable and never repeats a category in the rest', () => {
  const ranked = rank([use(PETS, TODAY)], [], 'expense', 1);
  assert.deepEqual(ids(ranked.top), ids([PETS]));
  assert.equal(ranked.rest.length, 7);
  assert.ok(!ids(ranked.rest).includes(PETS.id));
  const everything = rank([], [], 'expense', 20);
  assert.equal(everything.top.length, 8);
  assert.deepEqual(everything.rest, []);
});
