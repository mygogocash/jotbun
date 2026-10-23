import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiDraft } from '@gogospend/contracts';

import type { EntryFields } from '../redesign/quickAddModel.ts';
import { applyDraft, draftHints, localDrafts, moreDraftsLine } from './tellBun.ts';

const CASH = '11111111-1111-4111-8111-111111111111';
const BANK = '22222222-2222-4222-8222-222222222222';
const FOOD = '33333333-3333-4333-8333-333333333333';
const SALARY = '44444444-4444-4444-8444-444444444444';
const ctx = {
  today: '2026-10-24',
  wallets: [{ id: CASH, archived: false }],
  categories: [
    { id: FOOD, type: 'expense' as const, builtin_key: 'food' as const, archived: false },
    { id: SALARY, type: 'income' as const, builtin_key: 'salary' as const, archived: false },
  ],
};
const tc = (english: string, values?: Record<string, string | number>) => english.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ''));

const fields = (over: Partial<EntryFields> = {}): EntryFields => ({
  type: 'expense',
  amountMinor: '',
  occurredOn: '2026-10-24',
  walletId: BANK,
  categoryByType: { expense: null, income: SALARY },
  fromWalletId: null,
  toWalletId: null,
  note: 'keep me',
  merchant: '',
  ...over,
});

test('the phone answers a sentence on its own, offline', () => {
  assert.deepEqual(localDrafts('ข้าวมันไก่ 50 เมื่อวาน', ctx), [
    { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-23', category_id: FOOD, wallet_id: CASH, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] },
  ]);
  assert.deepEqual(localDrafts('   ', ctx), []);
});

test('a draft fills the fields it knows and keeps the rest', () => {
  const draft: AiDraft = { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-23', category_id: FOOD, wallet_id: null, merchant: 'ข้าวมันไก่', note: null, confidence: 'medium', flags: ['wallet_guessed'] };
  const applied = applyDraft(fields(), draft);
  assert.equal(applied.amountMinor, '5000');
  assert.deepEqual(applied.fields, fields({ occurredOn: '2026-10-23', merchant: 'ข้าวมันไก่', categoryByType: { expense: FOOD, income: SALARY } }));
});

test('an income draft switches the type and keeps the other type’s category', () => {
  const draft: AiDraft = { type: 'income', amount_minor: null, occurred_on: null, category_id: null, wallet_id: CASH, merchant: null, note: 'June', confidence: 'low', flags: ['amount_unclear', 'category_guessed'] };
  const applied = applyDraft(fields({ categoryByType: { expense: FOOD, income: SALARY } }), draft);
  assert.equal(applied.amountMinor, null);
  assert.deepEqual(applied.fields, fields({ type: 'income', walletId: CASH, note: 'June', categoryByType: { expense: FOOD, income: SALARY } }));
});

test('what Bun could not tell is said plainly, in order', () => {
  const draft: AiDraft = { type: 'expense', amount_minor: null, occurred_on: '2026-10-24', category_id: null, wallet_id: null, merchant: null, note: null, confidence: 'low', flags: ['amount_unclear', 'category_guessed', 'wallet_guessed'] };
  assert.deepEqual(draftHints(draft, tc), ["Bun couldn't read the amount. Type it in.", "Bun wasn't sure of the category. Pick one.", 'Choose which wallet paid.']);
  assert.equal(moreDraftsLine(1, tc), null);
  assert.equal(moreDraftsLine(2, tc), 'Bun found 2 entries. The first one is ready; save it, then tell Bun the next.');
});
