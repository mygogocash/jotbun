import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TransactionDto } from '@gogospend/contracts';

import { OUTBOX_STATES } from '../../../storage/types.ts';
import { buildQuickAdd } from './quickAddModel.ts';
import { buildEditChanges, conflictModel, duplicateDraft, editDraftFrom, rebaseEdit, recordDetail } from './recordModel.ts';
import type { EditDraft } from './recordModel.ts';
import { longDateLabel } from './shared.ts';
import { BANK, CASH, FOOD, OLD, OLD_HOBBY, PETS, SALARY, WALLETS, command, entry, lookups, pending, tc, transfer, uuid, walletDto } from './testing/fixtures.ts';

const TODAY = '2026-10-18';
const context = { lookups: lookups([...WALLETS, walletDto(OLD, 'Old wallet', '0', true)]), tc, locale: 'en' as const, dateTag: 'en-GB' as const };
const lunch = entry({ category_id: FOOD.id, merchant: 'Noodle shop', note: 'Lunch with the team', amount_minor: '12000', occurred_on: '2026-10-13', version: 3 });

test('the receipt of a confirmed expense: amount, type, category, wallet, date, merchant and note', () => {
  const detail = recordDetail({ kind: 'confirmed', record: lunch }, context);
  assert.deepEqual(detail.rows.map((row) => [row.key, row.label, row.value]), [
    ['amount', 'Amount', '฿120.00'],
    ['type', 'Type', 'Expense'],
    ['category', 'Category', 'Food'],
    ['wallet', 'Wallet', 'Cash'],
    ['date', 'Date', longDateLabel('2026-10-13', 'en-GB')],
    ['merchant', 'Merchant', 'Noodle shop'],
    ['note', 'Note', 'Lunch with the team'],
  ]);
  assert.deepEqual([detail.recordId, detail.version, detail.commandId, detail.title, detail.amountText, detail.amountLabel], [lunch.id, 3, null, 'Food', '-฿120.00', 'Expense ฿120.00']);
  assert.deepEqual([detail.state, detail.stateText, detail.accessibilityLabel], ['confirmed', null, 'Food, Expense ฿120.00']);
  assert.deepEqual(detail.actions, { edit: true, copy: true, delete: true, undo: false, discard: false });
});

test('a move shows From → To and no category; empty merchant and note are left out', () => {
  const moved = recordDetail({ kind: 'confirmed', record: transfer({ amount_minor: '50000' }) }, context);
  assert.deepEqual(moved.rows.map((row) => [row.key, row.label, row.value]), [
    ['amount', 'Amount', '฿500.00'], ['type', 'Type', 'Transfer'], ['from_to', 'From → To', 'Cash → Bank'], ['date', 'Date', longDateLabel(TODAY, 'en-GB')],
  ]);
  const pay = recordDetail({ kind: 'confirmed', record: entry({ type: 'income', category_id: SALARY.id, wallet_id: BANK }) }, context);
  assert.deepEqual(pay.rows.slice(1, 4).map((row) => row.value), ['Income', 'Salary', 'Bank']);
  assert.equal(pay.amountText, '+฿65.00');
});

test('a draft\'s receipt says its sync state and offers only what the device allows', () => {
  for (const state of OUTBOX_STATES.filter((value) => value !== 'acknowledged')) {
    const draft = command(pending({ note: 'latte' }), state);
    const detail = recordDetail({ kind: 'draft', command: draft }, context);
    const status = detail.rows.find((row) => row.key === 'status');
    assert.ok(status, state);
    assert.equal(status.value, detail.stateText);
    assert.notEqual(detail.state, 'confirmed');
    assert.deepEqual([detail.commandId, detail.version], [draft.commandId, null]);
    assert.deepEqual(detail.actions, { edit: false, copy: true, delete: false, undo: state === 'unsent', discard: state === 'needs_review' });
    assert.equal(detail.accessibilityLabel, `Food, Expense ฿65.00, ${detail.stateText}`);
  }
});

test('the edit draft keeps the record\'s fields and its version', () => {
  const draft = editDraftFrom(lunch);
  assert.deepEqual(draft, {
    mode: 'edit', recordId: lunch.id, baseVersion: 3, original: lunch, type: 'expense', amountMinor: '12000', occurredOn: '2026-10-13', walletId: CASH,
    categoryByType: { expense: FOOD.id, income: null }, fromWalletId: null, toWalletId: null, note: 'Lunch with the team', merchant: 'Noodle shop',
  });
  const moved = transfer({ version: 2 });
  const moveDraft = editDraftFrom(moved);
  assert.deepEqual([moveDraft.fromWalletId, moveDraft.toWalletId, moveDraft.walletId, moveDraft.baseVersion, moveDraft.note], [CASH, BANK, null, 2, '']);
});

test('an edit sends only what changed, with the version as If-Match', () => {
  const draft = editDraftFrom(lunch);
  assert.deepEqual(buildEditChanges(draft, { today: TODAY, tc }), { ok: true, id: lunch.id, version: 3, changes: {}, unchanged: true });
  assert.deepEqual(buildEditChanges({ ...draft, note: '  Lunch with the team  ' }, { today: TODAY, tc }), { ok: true, id: lunch.id, version: 3, changes: {}, unchanged: true });
  const changed = buildEditChanges({ ...draft, amountMinor: '13000', note: '', merchant: 'Noodle Shop', occurredOn: '2026-10-12', walletId: BANK, categoryByType: { expense: PETS.id, income: null } }, { today: TODAY, tc });
  assert.deepEqual(changed, {
    ok: true, id: lunch.id, version: 3, unchanged: false,
    changes: { amount_minor: '13000', occurred_on: '2026-10-12', note: null, merchant: 'Noodle Shop', wallet_id: BANK, category_id: PETS.id },
  });
  const moved = transfer({ version: 5 });
  assert.deepEqual(buildEditChanges({ ...editDraftFrom(moved), toWalletId: OLD }, { today: TODAY, tc }), { ok: true, id: moved.id, version: 5, changes: { destination_wallet_id: OLD }, unchanged: false });
});

test('an edit runs the quick-add checks', () => {
  const draft = editDraftFrom(lunch);
  assert.deepEqual(buildEditChanges({ ...draft, amountMinor: '0', occurredOn: '2026-10-19' }, { today: TODAY, tc }), {
    ok: false, errors: { amount_minor: 'Enter an amount above zero', occurred_on: 'This date is in the future.' },
  });
  assert.deepEqual(buildEditChanges({ ...draft, categoryByType: { expense: null, income: null } }, { today: TODAY, tc }), { ok: false, errors: { category_id: 'Choose a category' } });
  const moved = editDraftFrom(transfer());
  assert.deepEqual(buildEditChanges({ ...moved, toWalletId: CASH }, { today: TODAY, tc }), { ok: false, errors: { wallets: 'Choose two different wallets' } });
  assert.throws(() => buildEditChanges({ ...draft, type: 'income' } as EditDraft, { today: TODAY, tc }), TypeError);
});

test('"Apply my change" after a conflict sends the same changes on the server\'s version', () => {
  const original = entry({ amount_minor: '6500', version: 1 });
  const server: TransactionDto = { ...original, note: 'from my phone', version: 2 };
  const mine = { ...editDraftFrom(original), amountMinor: '7000' };
  const rebased = rebaseEdit(mine, server);
  assert.deepEqual([rebased.baseVersion, rebased.original, rebased.amountMinor], [2, original, '7000']);
  assert.deepEqual(buildEditChanges(rebased, { today: TODAY, tc }), { ok: true, id: original.id, version: 2, changes: { amount_minor: '7000' }, unchanged: false });
  assert.throws(() => rebaseEdit(mine, { ...server, id: uuid() }), TypeError);
});

test('the conflict view puts yours beside what is on the server', () => {
  const original = entry({ amount_minor: '6500', merchant: 'Cafe', version: 1 });
  const server: TransactionDto = { ...original, amount_minor: '6000', note: 'from my phone', version: 2 };
  const mine = { ...editDraftFrom(original), amountMinor: '7000', merchant: 'Café Amazon' };
  const view = conflictModel(mine, server, context);
  assert.equal(view.kind, 'changed');
  if (view.kind !== 'changed') return;
  assert.deepEqual([view.message, view.yoursLabel, view.serverLabel, view.keepMine, view.useServer], ['This entry changed on another device.', 'Yours', 'On the server', 'Apply my change', "Keep what's on the server"]);
  assert.deepEqual(view.rows.map((row) => [row.key, row.yours, row.server, row.youChanged, row.differs]), [
    ['amount', '฿70.00', '฿60.00', true, true],
    ['category', 'Food', 'Food', false, false],
    ['wallet', 'Cash', 'Cash', false, false],
    ['date', longDateLabel(TODAY, 'en-GB'), longDateLabel(TODAY, 'en-GB'), false, false],
    ['merchant', 'Café Amazon', 'Cafe', true, true],
    ['note', 'from my phone', 'from my phone', false, false],
  ]);
  const same = conflictModel({ ...editDraftFrom(original), amountMinor: '6000' }, server, context);
  assert.ok(same.kind === 'changed' && same.rows[0].youChanged && !same.rows[0].differs, 'your change already matches the server');
  assert.deepEqual(conflictModel(mine, { ...server, deleted_at: '2026-10-18T03:00:00.000Z' }, context), { kind: 'deleted', message: 'This entry was deleted on another device.' });
});

test('Copy makes a new draft dated today with new ids, never the source\'s', () => {
  const ids = [uuid(), uuid()];
  let next = 0;
  const copy = duplicateDraft(lunch, { newId: () => ids[next++], today: TODAY });
  assert.deepEqual(copy, {
    mode: 'create', recordId: ids[0], commandId: ids[1], type: 'expense', amountMinor: '12000', occurredOn: TODAY, walletId: CASH,
    categoryByType: { expense: FOOD.id, income: null }, fromWalletId: null, toWalletId: null, note: 'Lunch with the team', merchant: 'Noodle shop',
  });
  assert.notEqual(copy.recordId, lunch.id);
  const saved = buildQuickAdd(copy, { today: TODAY, tc });
  assert.ok(saved.ok);
  assert.deepEqual([saved.input.id, saved.input.occurred_on], [ids[0], TODAY]);
  assert.throws(() => duplicateDraft(lunch, { newId: () => lunch.id, today: TODAY }), /id/);
  const same = uuid();
  assert.throws(() => duplicateDraft(lunch, { newId: () => same, today: TODAY }), /id/);
  // Every copy is new: copying twice never repeats an id.
  const first = duplicateDraft(lunch, { newId: uuid, today: TODAY });
  const second = duplicateDraft(lunch, { newId: uuid, today: TODAY });
  assert.equal(new Set([lunch.id, first.recordId, first.commandId, second.recordId, second.commandId]).size, 5);
});

test('Copy leaves a closed wallet or category unchosen, and copies drafts and moves too', () => {
  const old = entry({ wallet_id: OLD, category_id: OLD_HOBBY.id });
  const copy = duplicateDraft(old, { newId: uuid, today: TODAY, wallets: WALLETS, categories: [FOOD, PETS, { ...OLD_HOBBY }] });
  assert.deepEqual([copy.walletId, copy.categoryByType.expense], [null, null]);
  assert.deepEqual(buildQuickAdd({ ...copy }, { today: TODAY, tc }), { ok: false, errors: { category_id: 'Choose a category', wallet_id: 'Choose a wallet' } });
  const moved = duplicateDraft(transfer({ source_wallet_id: OLD, destination_wallet_id: BANK }), { newId: uuid, today: TODAY, wallets: WALLETS });
  assert.deepEqual([moved.type, moved.fromWalletId, moved.toWalletId], ['transfer', null, BANK]);
  const fromDraft = duplicateDraft(pending({ note: undefined, merchant: undefined, amount_minor: '4200' }), { newId: uuid, today: TODAY });
  assert.deepEqual([fromDraft.amountMinor, fromDraft.note, fromDraft.merchant, fromDraft.categoryByType.expense], ['4200', '', '', FOOD.id]);
});
