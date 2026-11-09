import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OUTBOX_STATES } from '../../../storage/types.ts';
import type { OutboxState } from '../../../storage/types.ts';
import { byId, recordView } from '../viewModels.ts';
import { budgetPace } from './budgetPace.ts';
import { waitingMoneyLines } from './homeModel.ts';
import {
  CHECKING_STATES, DRAFT_STATE_TEXT, WAITING_STATES, addDays, canDiscardDraft, canUndoDraft, confirmedRow, countDrafts, dateTagFor, dayLabel, dayNumber,
  dayTotals, daysBetween, daysInMonth, draftRow, draftStateOf, groupDays, longDateLabel, mergeRows, moneyGroupOf, openDrafts, unconfirmedDrafts,
} from './shared.ts';
import type { DraftState, MoneyGroup } from './shared.ts';
import { BANK, CASH, SALARY, WALLETS, budget, command, entry, lookups, marked, pending, spentSummary, tc, transfer } from './testing/fixtures.ts';

const context = { lookups: lookups(), tc, locale: 'en' as const };
const days = { ...context, today: '2026-10-18', dateTag: 'en-GB' as const };

test('Bangkok calendar maths crosses months, years and leap days', () => {
  assert.equal(dayNumber('1970-01-01'), 0);
  assert.equal(dayNumber('1970-01-02'), 1);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(daysBetween('2026-10-01', '2026-10-18'), 17);
  assert.equal(daysBetween('2026-10-18', '2026-10-01'), -17);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2026-10'), 31);
  assert.equal(daysInMonth('2026-11'), 30);
  assert.throws(() => dayNumber('2026-02-30'));
  assert.throws(() => dayNumber('18/10/2026'));
});

test('day labels: today, yesterday, then the short date the current list shows', () => {
  assert.equal(dateTagFor('th'), 'th-TH');
  assert.equal(dateTagFor('en'), 'en-GB');
  assert.equal(dateTagFor('vi'), 'en-GB');
  assert.equal(dayLabel('2026-10-18', '2026-10-18', marked, 'en-GB'), '[Today]');
  assert.equal(dayLabel('2026-10-17', '2026-10-18', marked, 'en-GB'), '[Yesterday]');
  assert.equal(dayLabel('2026-10-13', '2026-10-18', tc, 'en-GB'), '13 Oct 2026');
  const thai = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 13));
  assert.equal(dayLabel('2026-10-13', '2026-10-18', tc, 'th-TH'), thai);
  const long = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 13));
  assert.equal(longDateLabel('2026-10-13', 'en-GB'), long);
  assert.match(long, /Tuesday/);
});

test('every outbox state maps to a draft state; a sending draft may be committed, so it is being checked', () => {
  const expected: Record<OutboxState, string | null> = {
    unsent: 'saving',
    // The sync engine and v1's banner count sending as uncertain (syncEngine summarize, SyncStatus).
    sending: 'checking',
    uncertain: 'checking',
    needs_review: 'needs_look',
    paused_upgrade: 'update_to_send',
    acknowledged: null,
  };
  for (const state of OUTBOX_STATES) assert.equal(draftStateOf(state), expected[state], state);
  assert.deepEqual(DRAFT_STATE_TEXT, { saving: 'Saving…', checking: 'Checking with Jotbun', needs_look: 'Needs a look', update_to_send: 'Update Jotbun to send' });
  // Waiting is queued on the device and never committed; checking may already be counted.
  assert.deepEqual([...WAITING_STATES].sort(), ['paused_upgrade', 'unsent']);
  assert.deepEqual([...CHECKING_STATES].sort(), ['sending', 'uncertain']);
});

test("a draft's label, its money group and every total it joins agree in each state", () => {
  const GROUP: Record<DraftState, MoneyGroup | null> = { saving: 'waiting', update_to_send: 'waiting', checking: 'checking', needs_look: null };
  for (const state of OUTBOX_STATES) {
    const label = draftStateOf(state);
    const group = moneyGroupOf(state);
    assert.equal(group, label === null ? null : GROUP[label], `group ${state}`);
    assert.equal(WAITING_STATES.includes(state), group === 'waiting', `waiting ${state}`);
    assert.equal(CHECKING_STATES.includes(state), group === 'checking', `checking ${state}`);
    const draft = command(pending({ amount_minor: '6500' }), state);
    const waiting = group === 'waiting' ? '6500' : '0';
    const checking = group === 'checking' ? '6500' : '0';
    // The row and its day.
    const rows = mergeRows([], [draft], context);
    assert.deepEqual(rows.map((row) => row.state), label === null ? [] : [label], `row ${state}`);
    const totals = dayTotals(rows, 'en');
    assert.deepEqual([totals.confirmed.outMinor, totals.waiting.outMinor, totals.checking.outMinor], ['0', waiting, checking], `day ${state}`);
    // The budget pace: waiting money is added to the estimate, checking money only said apart.
    const pace = budgetPace({ budget: budget('2026-10', '100000'), summary: spentSummary('2026-10', '0'), today: '2026-10-18', outbox: [draft] });
    assert.deepEqual([pace.spent.pendingMinor, pace.spent.checkingMinor, pace.spent.estimatedMinor], [waiting, checking, waiting], `pace ${state}`);
    // The month's waiting-money lines.
    const lines = [group === 'waiting' ? 'Waiting to sync: money out ฿65.00' : null, group === 'checking' ? 'Checking with Jotbun: money out ฿65.00' : null];
    assert.deepEqual(waitingMoneyLines([draft], '2026-10', tc, 'en'), lines.filter((line) => line !== null), `lines ${state}`);
  }
});

test('a draft whose record is already confirmed is left out of the open drafts that count', () => {
  const echo = command(pending({ id: 'r-1' }), 'sending');
  const fresh = command(pending({ id: 'r-2' }), 'unsent');
  const done = command(pending({ id: 'r-3' }), 'acknowledged');
  assert.deepEqual(unconfirmedDrafts([echo, fresh, done], new Set(['r-1'])).map((draft) => draft.payload.id), ['r-2']);
  assert.deepEqual(unconfirmedDrafts([echo, fresh, done], new Set()).map((draft) => draft.payload.id), ['r-1', 'r-2']);
});

test('undo only for a draft never transmitted; discard only for one that needs review', () => {
  for (const state of OUTBOX_STATES) {
    const draft = command(pending(), state);
    assert.equal(canUndoDraft(draft), state === 'unsent', `undo ${state}`);
    assert.equal(canDiscardDraft(draft), state === 'needs_review', `discard ${state}`);
  }
  assert.equal(canUndoDraft(command(pending(), 'unsent', { firstTransmissionAt: '2026-10-18T03:00:01.000Z' })), false, 'a transmitted draft cannot be undone');
  const outbox = OUTBOX_STATES.map((state) => command(pending(), state));
  assert.equal(openDrafts(outbox).length, 5);
  assert.deepEqual(countDrafts(outbox), { saving: 1, checking: 2, needs_look: 1, update_to_send: 1 });
});

test('a confirmed row reads exactly as the current record view', () => {
  const view = { wallets: byId(WALLETS), categories: context.lookups.categories };
  for (const record of [entry(), entry({ type: 'income', category_id: SALARY.id, wallet_id: BANK }), entry({ category_id: 'missing' }), transfer()]) {
    const row = confirmedRow(record, context);
    const old = recordView(record, view, tc, 'en');
    assert.deepEqual([row.title, row.detail, row.amountText, row.amountLabel], [old.title, old.detail, old.amountText, old.amountLabel]);
    assert.equal(row.accessibilityLabel, `${old.title}, ${old.amountLabel}`);
    assert.deepEqual([row.key, row.recordId, row.version, row.state, row.stateText, row.commandId], [record.id, record.id, record.version, 'confirmed', null, null]);
    assert.equal(row.canEdit, true);
  }
  const moved = confirmedRow(transfer(), context);
  assert.deepEqual([moved.title, moved.detail, moved.amountText], ['Transfer', 'Cash → Bank', '฿500.00']);
});

test('a draft row says its state in words and never looks confirmed', () => {
  const expected: Record<Exclude<OutboxState, 'acknowledged'>, string> = {
    unsent: 'Saving…', sending: 'Checking with Jotbun', uncertain: 'Checking with Jotbun', needs_review: 'Needs a look', paused_upgrade: 'Update Jotbun to send',
  };
  for (const [state, text] of Object.entries(expected) as [Exclude<OutboxState, 'acknowledged'>, string][]) {
    const draft = command(pending({ note: 'latte' }), state);
    const row = draftRow(draft, context);
    assert.ok(row, state);
    assert.equal(row.stateText, text);
    assert.equal(row.accessibilityLabel, `Food, Expense ฿65.00, ${text}`);
    assert.deepEqual([row.key, row.commandId, row.recordId, row.version, row.outboxState], [`draft:${draft.commandId}`, draft.commandId, draft.payload.id, null, state]);
    assert.notEqual(row.state, 'confirmed');
    assert.equal(row.canEdit, false);
    assert.equal(row.note, 'latte');
  }
  assert.equal(draftRow(command(pending(), 'acknowledged'), context), null);
  // HomeScreen's fallback title for a draft whose category is not on the device.
  assert.equal(draftRow(command(pending({ type: 'income', category_id: 'gone' } as never)), context)?.title, 'Income');
  assert.equal(draftRow(command(pending({ type: 'transfer' })), context)?.detail, 'Cash → Bank');
});

test('rows merge drafts first, newest first, and a draft already confirmed shows once', () => {
  const confirmedEntry = entry({ id: 'r-1' });
  const echoed = command(pending({ id: 'r-1' }), 'acknowledged');
  const uncertainEcho = command(pending({ id: 'r-1' }), 'uncertain');
  const older = command(pending(), 'unsent', { createdAt: '2026-10-18T01:00:00.000Z' });
  const newer = command(pending(), 'sending', { createdAt: '2026-10-18T05:00:00.000Z' });
  const rows = mergeRows([confirmedEntry, entry({ id: 'r-2' })], [older, echoed, uncertainEcho, newer], context);
  assert.deepEqual(rows.map((row) => row.key), [`draft:${newer.commandId}`, `draft:${older.commandId}`, 'r-1', 'r-2']);
});

test('day totals: out and in apart, transfers neither, drafts never in confirmed money', () => {
  const rows = mergeRows(
    [entry({ amount_minor: '6500' }), entry({ amount_minor: '99999999999' }), entry({ type: 'income', category_id: SALARY.id, amount_minor: '2800000' }), transfer({ amount_minor: '100000' })],
    [
      command(pending({ amount_minor: '1000' }), 'unsent'),
      command(pending({ amount_minor: '2000' }), 'paused_upgrade'),
      command(pending({ type: 'income', category_id: SALARY.id, amount_minor: '3000' } as never), 'sending'),
      command(pending({ amount_minor: '4000' }), 'uncertain'),
      command(pending({ amount_minor: '8000' }), 'needs_review'),
      command(pending({ type: 'transfer', amount_minor: '16000' }), 'unsent'),
    ],
    context,
  );
  const totals = dayTotals(rows, 'en');
  assert.deepEqual([totals.confirmed.outMinor, totals.confirmed.inMinor], [String(6500n + 99999999999n), '2800000']);
  assert.deepEqual([totals.waiting.outMinor, totals.waiting.inMinor], ['3000', '0']);
  assert.deepEqual([totals.checking.outMinor, totals.checking.inMinor], ['4000', '3000'], 'a sending draft is being checked');
  assert.equal(totals.confirmed.outText, '฿1,000,000,064.99');
  const onlyTransfer = dayTotals(mergeRows([transfer()], [], context), 'en');
  assert.deepEqual([onlyTransfer.confirmed.outMinor, onlyTransfer.confirmed.inMinor], ['0', '0']);
});

test('days group newest first with their totals and kept-apart draft money', () => {
  const rows = mergeRows(
    [entry({ occurred_on: '2026-10-18', amount_minor: '12000' }), entry({ occurred_on: '2026-10-16', type: 'income', category_id: SALARY.id, amount_minor: '5000' }), transfer({ occurred_on: '2026-10-17' })],
    [command(pending({ occurred_on: '2026-10-17', amount_minor: '6500' }), 'unsent'), command(pending({ occurred_on: '2026-10-17', amount_minor: '700' }), 'uncertain')],
    context,
  );
  const groups = groupDays(rows, days);
  assert.deepEqual(groups.map((group) => [group.day, group.label, group.isToday, group.rows.length]), [
    ['2026-10-18', 'Today', true, 1], ['2026-10-17', 'Yesterday', false, 3], ['2026-10-16', '16 Oct 2026', false, 1],
  ]);
  assert.equal(groups[0].totalText, 'Money out ฿120.00');
  assert.equal(groups[0].accessibilityLabel, 'Today, Money out ฿120.00');
  assert.equal(groups[1].totalText, null, 'a transfer and drafts are not confirmed money in or out');
  assert.deepEqual(groups[1].pendingLines, ['Waiting to sync: money out ฿65.00', 'Checking with Jotbun: money out ฿7.00']);
  assert.equal(groups[1].accessibilityLabel, 'Yesterday');
  assert.equal(groups[2].totalText, 'Money in ฿50.00');
});

test('a transfer row in the day is shown but unsigned', () => {
  const [group] = groupDays(mergeRows([transfer({ source_wallet_id: BANK, destination_wallet_id: CASH, amount_minor: '1' })], [], context), days);
  assert.equal(group.rows[0].amountText, '฿0.01');
  assert.equal(group.rows[0].detail, 'Bank → Cash');
  assert.deepEqual([group.totals.confirmed.outMinor, group.totals.confirmed.inMinor, group.totalText], ['0', '0', null]);
});
