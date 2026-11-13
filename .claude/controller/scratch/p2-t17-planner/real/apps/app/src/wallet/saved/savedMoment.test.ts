// The saved moment's rules (P2-T17; bw-saved, rh-offline, W31, R65, R114,
// Review Focus 4): what a landed save says, what Undo does with the outbox as
// it is now, today's money out after the save, and the toast's words, in Thai
// and English.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SavedEntry } from '../../screens/redesign/entry/entrySave.ts';
import type { QuickAddDraft } from '../../spend/v1/redesign/quickAddModel.ts';
import { BANK, CASH, command, FOOD, lookups, marked, PETS, pending, SALARY, tc } from '../../spend/v1/redesign/testing/fixtures.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import { COMMON_COPY } from '../common/copy.ts';
import { tableT } from '../copy/draftText.ts';
import { COPY } from './copy.ts';
import { noticeOf, todayOutMinor, toastAmount, toastWords, undoPlan } from './savedMoment.ts';
import type { SavedNotice } from './savedMoment.ts';

const TABLE = { ...COMMON_COPY, ...COPY };
const th = tableT(TABLE, 'th');
const en = tableT(TABLE, 'en');
const TODAY = '2026-10-24';
const RECORD_ID = 'r0000000-0000-4000-8000-000000000001';
const COMMAND_ID = 'k0000000-0000-4000-8000-000000000001';

/** A spending draft as the tray saves it: ฿50 of food from cash today, named by nothing the person typed. */
function draft(overrides: Partial<QuickAddDraft> = {}): QuickAddDraft {
  return {
    mode: 'create', recordId: RECORD_ID, commandId: COMMAND_ID, type: 'expense', amountMinor: '5000', occurredOn: TODAY,
    walletId: CASH, categoryByType: { expense: FOOD.id, income: SALARY.id }, fromWalletId: CASH, toWalletId: BANK, note: '', merchant: '', ...overrides,
  };
}
const saved = (overrides: Partial<QuickAddDraft> = {}, via: SavedEntry['via'] = 'device'): SavedEntry => ({ draft: draft(overrides), via, cheer: false, track: null });

/** The notice of a ฿50 spending save kept on this phone, unless told otherwise. */
function notice(overrides: Partial<SavedNotice> = {}): SavedNotice {
  return { recordId: RECORD_ID, commandId: COMMAND_ID, kind: 'expense', title: 'ข้าวมันไก่', walletId: CASH, via: 'device', amountMinor: '5000', offline: false, ...overrides };
}
/** This save's own command in the outbox, in `state`. */
const own = (state: OutboxCommand['state'], overrides: Partial<OutboxCommand> = {}) => command(pending({ id: RECORD_ID, amount_minor: '5000', occurred_on: TODAY }), state, { commandId: COMMAND_ID, ...overrides });

test('a save names itself as confirm does, and a transfer drops into where the money went', () => {
  // Nothing typed: the category's name, through the app's words.
  assert.deepEqual(noticeOf(saved(), lookups(), false, tc), {
    recordId: RECORD_ID, commandId: COMMAND_ID, kind: 'expense', title: 'Food', walletId: CASH, via: 'device', amountMinor: '5000', offline: false,
  });
  assert.equal(noticeOf(saved(), lookups(), false, marked).title, '[Food]');
  // The merchant, else the note, each trimmed; a custom category by its own name.
  assert.equal(noticeOf(saved({ merchant: '  ข้าวมันไก่ ', note: 'lunch' }), lookups(), false, tc).title, 'ข้าวมันไก่');
  assert.equal(noticeOf(saved({ merchant: '   ', note: ' กับเพื่อน ' }), lookups(), false, tc).title, 'กับเพื่อน');
  assert.equal(noticeOf(saved({ categoryByType: { expense: PETS.id, income: null } }), lookups(), false, marked).title, 'Pets');
  // A category the lists do not know: the kind's name.
  assert.equal(noticeOf(saved({ categoryByType: { expense: 'gone', income: null } }), lookups(), false, marked).title, '[Expense]');
  // Income into its wallet, online and offline as the host says.
  assert.deepEqual(noticeOf(saved({ type: 'income', amountMinor: '3500000' }, 'online'), lookups(), true, tc), {
    recordId: RECORD_ID, commandId: COMMAND_ID, kind: 'income', title: 'Salary', walletId: CASH, via: 'online', amountMinor: '3500000', offline: true,
  });
  // A move: its chip drops into the wallet it went to, and it has no category.
  const move = noticeOf(saved({ type: 'transfer', walletId: null, fromWalletId: CASH, toWalletId: BANK }), lookups(), false, marked);
  assert.deepEqual([move.kind, move.walletId, move.title], ['transfer', BANK, '[Transfer]']);
  assert.equal(noticeOf(saved({ type: 'transfer', note: 'ค่าห้อง' }), lookups(), false, tc).title, 'ค่าห้อง');
});

test('a draft never sent is removed by Undo', () => {
  assert.deepEqual(undoPlan(notice(), [command(pending(), 'unsent'), own('unsent')]), { kind: 'remove_draft', commandId: COMMAND_ID });
});

test('a draft being sent or checked offers no Undo', () => {
  for (const state of ['sending', 'uncertain', 'needs_review', 'paused_upgrade'] as const) {
    assert.deepEqual(undoPlan(notice(), [own(state)]), { kind: 'none' }, state);
  }
  // Unsent again after a transmission (it may have reached Jotbun): no Undo either.
  assert.deepEqual(undoPlan(notice(), [own('unsent', { firstTransmissionAt: '2026-10-24T03:00:00.000Z' })]), { kind: 'none' });
});

test('a record the server holds is deleted at version 1', () => {
  const deleted = { kind: 'delete_record', recordId: RECORD_ID, version: 1 };
  // An online save: no command of its in the outbox.
  assert.deepEqual(undoPlan(notice({ via: 'online' }), [command(pending(), 'unsent')]), deleted);
  // A save kept on this phone whose command has left the outbox (Review Focus 4), or that Jotbun has acknowledged.
  assert.deepEqual(undoPlan(notice(), []), deleted);
  assert.deepEqual(undoPlan(notice(), [own('acknowledged')]), deleted);
});

test("today's money out adds waiting drafts once", () => {
  const waiting = command(pending({ amount_minor: '5000', occurred_on: TODAY }), 'unsent');
  const confirmed = command(pending({ amount_minor: '7000', occurred_on: TODAY }), 'sending');
  const out = todayOutMinor({ summaryExpenseMinor: '13200', confirmedIds: new Set([confirmed.payload.id]), outbox: [waiting, confirmed], today: TODAY });
  assert.equal(out, '18200');
});

test("today's money out counts a draft sent or acknowledged while the read does not list it, never a refused one, another day's or other kinds", () => {
  const today = (state: OutboxCommand['state'], amount: string) => command(pending({ amount_minor: amount, occurred_on: TODAY }), state);
  const outbox = [
    today('sending', '100'), today('uncertain', '200'), today('paused_upgrade', '400'), today('acknowledged', '800'),
    today('needs_review', '1600'),
    command(pending({ amount_minor: '3200', occurred_on: '2026-10-23' }), 'unsent'),
    command(pending({ type: 'income', amount_minor: '6400', occurred_on: TODAY, category_id: SALARY.id }), 'unsent'),
    command(pending({ type: 'transfer', amount_minor: '12800', occurred_on: TODAY }), 'unsent'),
  ];
  assert.equal(todayOutMinor({ summaryExpenseMinor: '0', confirmedIds: new Set(), outbox, today: TODAY }), '1500');
  // Exact past a JS number (2^53 + 1 satang, which a number rounds): satang strings through BigInt only.
  assert.equal(todayOutMinor({ summaryExpenseMinor: '9007199254740993', confirmedIds: new Set(), outbox: [today('unsent', '1')], today: TODAY }), '9007199254740994');
});

test('the toast follows bw-saved, and hides the amount in private mode', () => {
  assert.deepEqual(toastWords(notice(), '18200', false, th), { text: 'บันทึกแล้ว · วันนี้ ฿182', spoken: 'บันทึกแล้ว · วันนี้ 182 บาท' });
  assert.deepEqual(toastWords(notice(), '18250', false, en), { text: 'Saved · Today ฿182.50', spoken: 'Saved · Today 182 baht 50 satang' });
  assert.deepEqual(toastWords(notice(), '18200', true, th), { text: 'บันทึกแล้ว · วันนี้ ฿••••', spoken: 'บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่' });
  assert.deepEqual(toastWords(notice(), '18200', true, en), { text: 'Saved · Today ฿••••', spoken: 'Saved · Today Amount hidden' });
  assert.deepEqual([toastAmount('18200', false), toastAmount('18200', true)], ['฿182', '฿••••']);
  // Offline (rh-offline): no total, whatever is known.
  const offline = 'เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์';
  assert.deepEqual(toastWords(notice({ offline: true }), '18200', false, th), { text: offline, spoken: offline });
  assert.deepEqual(toastWords(notice({ offline: true }), null, true, th), { text: offline, spoken: offline });
  // The total not known yet.
  assert.deepEqual(toastWords(notice(), null, false, th), { text: 'บันทึกแล้ว', spoken: 'บันทึกแล้ว' });
  assert.deepEqual(toastWords(notice(), null, true, en), { text: 'Saved', spoken: 'Saved' });
  // The words quote nothing the person typed (R114): not the title.
  for (const words of [toastWords(notice(), '18200', false, th), toastWords(notice(), null, false, th), toastWords(notice({ offline: true }), null, false, th)]) {
    assert.equal(words.text.includes('ข้าวมันไก่') || words.spoken.includes('ข้าวมันไก่'), false);
  }
});
