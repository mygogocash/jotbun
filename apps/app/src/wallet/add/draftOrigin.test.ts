// The add tray's draft origin (P3-T13): the fields a draft review compares,
// read from the tray's draft and the amount its keypad settles on.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';
import { draftFieldsOf } from './draftOrigin.ts';

const CASH = '0000000a-0000-4000-8000-000000000002';
const MAIN = '0000000a-0000-4000-8000-000000000001';
const FOOD = '0000000c-0000-4000-8000-000000000001';
const SALARY = '0000000c-0000-4000-8000-000000000004';

/** ฿65 at the motorbike taxi from cash, with a note; the keypad holds the amount, so the draft's own is stale. */
const DRAFT: QuickAddDraft = {
  mode: 'create', recordId: '0000000b-0000-4000-8000-0000000000a1', commandId: '0000000b-0000-4000-8000-0000000000a2', type: 'expense',
  amountMinor: '999', occurredOn: '2026-11-12', walletId: CASH, categoryByType: { expense: FOOD, income: SALARY },
  fromWalletId: MAIN, toWalletId: CASH, note: 'ค่าข้าวกับพี่', merchant: 'วิน',
};

test("draftFieldsOf reads the draft's fields and the settled amount", () => {
  // Spending: the amount passed (never the draft's own), its category, the wallet it is paid from, the place and the note.
  assert.deepEqual(draftFieldsOf(DRAFT, '6500'), {
    type: 'expense', amountMinor: '6500', occurredOn: '2026-11-12', categoryId: FOOD, walletId: CASH, merchant: 'วิน', note: 'ค่าข้าวกับพี่',
  });
  // Income: income's own category.
  assert.deepEqual(draftFieldsOf({ ...DRAFT, type: 'income' }, '3000000'), {
    type: 'income', amountMinor: '3000000', occurredOn: '2026-11-12', categoryId: SALARY, walletId: CASH, merchant: 'วิน', note: 'ค่าข้าวกับพี่',
  });
  // A move: no category, and the wallet it leaves.
  assert.deepEqual(draftFieldsOf({ ...DRAFT, type: 'transfer' }, '50000'), {
    type: 'transfer', amountMinor: '50000', occurredOn: '2026-11-12', categoryId: null, walletId: MAIN, merchant: 'วิน', note: 'ค่าข้าวกับพี่',
  });
  // A keypad that settles on no amount is none; empty words stay as the draft holds them (the review counts '' as none).
  assert.deepEqual(draftFieldsOf({ ...DRAFT, note: '', merchant: '', categoryByType: { expense: null, income: null }, walletId: null }, null), {
    type: 'expense', amountMinor: null, occurredOn: '2026-11-12', categoryId: null, walletId: null, merchant: '', note: '',
  });
});
