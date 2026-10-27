import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TransactionDto } from '@gogospend/contracts';

import type { PendingChoice } from '../../../storage/types.ts';
import { choiceAgainst, choiceSettled, draftFromChoice, resendForChoice } from './pendingChoice.ts';
import { editDraftFrom } from './recordModel.ts';
import { BANK, TRAVEL, entry } from './testing/fixtures.ts';

// A lunch the person edited (amount and note) while the server had moved on to version 4.
const original = entry({ amount_minor: '6500', note: null, merchant: 'Noodle shop', version: 3 });
const choice: PendingChoice = {
  recordId: original.id,
  original,
  changes: { amount_minor: '7500', note: 'Lunch with the team' },
  server: { ...original, version: 4, merchant: 'Noodle house' },
  editedAt: '2026-10-18T04:00:00.000Z',
  refusedAt: '2026-10-18T04:00:01.000Z',
};

test("the draft shows the person's change over the record they opened", () => {
  assert.deepEqual(draftFromChoice(choice), { ...editDraftFrom(original), amountMinor: '7500', note: 'Lunch with the team' });
  // A changed wallet and category apply the same way, and a cleared merchant becomes an empty field.
  const moved = draftFromChoice({ ...choice, changes: { wallet_id: BANK, category_id: TRAVEL.id, merchant: null } });
  assert.deepEqual([moved.walletId, moved.categoryByType, moved.merchant, moved.amountMinor], [BANK, { expense: TRAVEL.id, income: null }, '', '6500']);
});

test("use yours resends the same changes on the server's current version", () => {
  assert.deepEqual(resendForChoice(choice, { ...choice.server, version: 7 }), { id: choice.recordId, version: 7, changes: choice.changes });
  assert.throws(() => resendForChoice(choice, entry()), TypeError);
});

test('a fresh server record wins over the stored one', () => {
  const fresh: TransactionDto = { ...choice.server, version: 6, note: 'Changed again' };
  assert.deepEqual(choiceAgainst(choice, fresh), fresh);
  assert.deepEqual(choiceAgainst(choice, null), choice.server);
  assert.throws(() => choiceAgainst(choice, entry()), TypeError);
});

test('a choice the server already holds is settled', () => {
  const held: TransactionDto = { ...choice.server, version: 5, amount_minor: '7500', note: 'Lunch with the team' };
  assert.equal(choiceSettled(choice, held), true);
  // Only the fields the person changed decide it.
  assert.equal(choiceSettled(choice, { ...held, merchant: 'Elsewhere' }), true);
  assert.equal(choiceSettled(choice, { ...held, amount_minor: '6500' }), false);
  assert.equal(choiceSettled(choice, { ...held, note: 'Lunch' }), false);
});
