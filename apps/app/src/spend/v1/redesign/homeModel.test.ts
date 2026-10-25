import assert from 'node:assert/strict';
import { test } from 'node:test';

import { V1Error } from '../../../api/client.ts';
import type { V1Outcome } from '../../../api/client.ts';
import type { OutboxCommand } from '../../../storage/types.ts';
import type { DiaryView } from '../spendDiary.ts';
import { classifyLoadProblem, earlierWholeDays, homeModel, readWholeDay, waitingMoneyLines } from './homeModel.ts';
import type { HistoryPageReader, HomeData, HomeInput, HomeModel } from './homeModel.ts';
import { addDays } from './shared.ts';
import { BUILTINS, PETS, SALARY, WALLETS, budget, command, entry, marked, pending, spentSummary, tc, transfer } from './testing/fixtures.ts';

const TODAY = '2026-10-18';
const OCT = '2026-10';

function diary(outbox: OutboxCommand[], overrides: Partial<DiaryView> = {}): DiaryView {
  return {
    phase: 'ready', lockReason: null, outcome: null, progress: null, pending: outbox.map((item) => item.payload), outbox, pendingChoices: [],
    wallets: WALLETS.map(({ balance_minor: _balance, ...wallet }) => wallet), categories: [...BUILTINS, PETS], ...overrides,
  };
}

function data(overrides: Partial<HomeData> = {}): HomeData {
  return { wallets: WALLETS, categories: [...BUILTINS, PETS], summary: spentSummary(OCT, '12000'), budget: budget(OCT, '1800000'), records: [], ...overrides };
}

const home = (input: Partial<HomeInput>): HomeModel => homeModel({ today: TODAY, tc, locale: 'en', load: { state: 'loading' }, diary: null, ...input });
function ready(model: HomeModel) {
  assert.equal(model.kind, 'ready');
  if (model.kind !== 'ready') throw new Error('not ready');
  return model;
}

test('loading', () => {
  assert.deepEqual(home({}), { kind: 'loading', label: 'Loading your diary' });
});

test('load problems keep the current screens\' messages and retry rule', () => {
  const table: [V1Outcome | null, string, string, boolean][] = [
    ['upgrade_required', 'upgrade_required', 'Update Jotbun to keep using your diary. Nothing you saved is lost.', false],
    ['policy_required', 'terms_required', 'Review and accept the updated terms to continue.', false],
    ['signed_out', 'signed_out', 'Sign in again to see your diary.', false],
    ['session_changed', 'signed_out', 'Sign in again to see your diary.', false],
    ['unsupported_platform', 'unsupported_platform', 'Your diary is available in the Jotbun app on iOS and Android.', false],
    ['network', 'load_failed', "We couldn't load your diary.", true],
    ['unavailable', 'load_failed', "We couldn't load your diary.", true],
    ['invalid_response', 'load_failed', "We couldn't load your diary.", true],
    [null, 'load_failed', "We couldn't load your diary.", true],
  ];
  for (const [outcome, kind, message, retry] of table) {
    const error = outcome ? new V1Error(outcome, 0, 'X') : new Error('boom');
    assert.deepEqual(classifyLoadProblem(error, tc), { kind, message, retry }, String(outcome));
  }
  assert.equal(classifyLoadProblem(new V1Error('network', 0, 'X'), marked).message, "[We couldn't load your diary.]");
});

test('a load problem without a diary shows only the problem', () => {
  const model = home({ load: { state: 'error', error: new V1Error('upgrade_required', 426, 'CLIENT_UPGRADE_REQUIRED') } });
  assert.equal(model.kind, 'problem');
  if (model.kind !== 'problem') return;
  assert.equal(model.problem.kind, 'upgrade_required');
  assert.equal(model.offline, null);
  assert.equal(model.sync.phase, 'none');
});

test('offline, the device still shows its drafts by day, its waiting money, and Add', () => {
  const outbox = [
    command(pending({ amount_minor: '6500', note: 'latte' }), 'unsent'),
    command(pending({ amount_minor: '700', occurred_on: '2026-10-17' }), 'uncertain'),
    command(pending({ amount_minor: '9000' }), 'needs_review'),
  ];
  const model = home({ load: { state: 'error', error: new V1Error('network', 0, 'NETWORK_ERROR') }, diary: diary(outbox) });
  assert.equal(model.kind, 'problem');
  if (model.kind !== 'problem' || !model.offline) throw new Error('expected offline home');
  assert.deepEqual([model.problem.kind, model.problem.retry], ['load_failed', true]);
  assert.deepEqual(model.offline.today.rows.map((row) => row.stateText), ['Saving…', 'Needs a look']);
  assert.deepEqual(model.offline.today.rows.map((row) => [row.canUndo, row.canDiscard]), [[true, false], [false, true]]);
  assert.deepEqual(model.offline.earlier.map((group) => [group.day, group.rows[0].stateText]), [['2026-10-17', 'Checking with Jotbun']]);
  assert.equal(model.offline.today.totalText, null, 'drafts are never confirmed money');
  assert.deepEqual(model.offline.waitingMoney, ['Waiting to sync: money out ฿65.00', 'Checking with Jotbun: money out ฿7.00']);
  assert.equal(model.offline.canAdd, true);
  assert.deepEqual(model.sync.drafts, { saving: 1, checking: 1, needs_look: 1, update_to_send: 0 });
  const noWallets = home({ load: { state: 'error', error: new Error('x') }, diary: diary([], { wallets: [] }) });
  assert.equal(noWallets.kind === 'problem' && noWallets.offline?.canAdd, false);
});

test('a locked diary shows no drafts and says why', () => {
  const locked = diary([], { phase: 'locked', lockReason: 'key_missing', wallets: [], categories: [] });
  const model = home({ load: { state: 'error', error: new Error('x') }, diary: locked });
  assert.equal(model.kind, 'problem');
  if (model.kind !== 'problem') return;
  assert.deepEqual(model.offline?.today.rows, []);
  assert.equal(model.offline?.canAdd, false);
  assert.deepEqual([model.sync.phase, model.sync.lockReason], ['locked', 'key_missing']);
  const fine = ready(home({ load: { state: 'ready', data: data() }, diary: locked }));
  assert.deepEqual([fine.sync.phase, fine.sync.lockReason], ['locked', 'key_missing']);
});

test('first run: no wallet asks for the first one', () => {
  const model = home({ load: { state: 'ready', data: data({ wallets: [] }) } });
  assert.deepEqual(model, {
    kind: 'first_run', reason: 'no_wallet', headline: 'Add your first wallet',
    body: 'A wallet is where money sits, like cash or a bank account. Its opening balance is not income.',
    sync: { phase: 'none', lockReason: null, drafts: { saving: 0, checking: 0, needs_look: 0, update_to_send: 0 } },
  });
});

test('ready: the budget pace, today\'s receipt with drafts kept apart, and earlier days', () => {
  const lunch = entry({ amount_minor: '12000', merchant: 'Noodle shop' });
  const pay = entry({ type: 'income', category_id: SALARY.id, wallet_id: WALLETS[1].id, amount_minor: '500000' });
  const records = [lunch, pay, entry({ occurred_on: '2026-10-16', amount_minor: '3000' }), transfer({ occurred_on: '2026-10-15' })];
  const outbox = [
    command(pending({ amount_minor: '6500' }), 'unsent', { createdAt: '2026-10-18T05:00:00.000Z' }),
    command(pending({ amount_minor: '700' }), 'uncertain', { createdAt: '2026-10-18T04:00:00.000Z' }),
    command(pending({ amount_minor: '9000' }), 'needs_review', { createdAt: '2026-10-18T03:00:00.000Z' }),
    command(pending({ amount_minor: '500', occurred_on: '2026-10-17' }), 'paused_upgrade'),
    command(pending({ amount_minor: '1000', occurred_on: '2026-10-17' }), 'sending'),
    command(pending({ id: lunch.id, amount_minor: '12000' }), 'acknowledged'),
  ];
  const model = ready(home({ load: { state: 'ready', data: data({ records, summary: spentSummary(OCT, '15000') }) }, diary: diary(outbox) }));
  assert.equal(model.month, OCT);
  assert.equal(model.budget.total, '฿220.00 of ฿18,000.00');
  assert.equal(model.budget.pendingNote, 'Includes ฿70.00 saving on this device');
  assert.equal(model.budget.checkingNote, '฿17.00 more is being checked with Jotbun');
  assert.equal(model.budget.headline, '฿1,270.00 a day left · on track');
  assert.equal(model.budget.pace.state, 'on_track');
  assert.equal(model.today.isToday, true);
  assert.deepEqual(model.today.rows.map((row) => [row.state, row.amountText]), [
    ['saving', '-฿65.00'], ['checking', '-฿7.00'], ['needs_look', '-฿90.00'], ['confirmed', '-฿120.00'], ['confirmed', '+฿5,000.00'],
  ]);
  assert.deepEqual([model.today.totals.confirmed.outMinor, model.today.totals.confirmed.inMinor], ['12000', '500000']);
  assert.deepEqual([model.today.totals.waiting.outMinor, model.today.totals.checking.outMinor], ['6500', '700']);
  assert.equal(model.today.totalText, 'Money out ฿120.00 · Money in ฿5,000.00');
  assert.equal(model.todayEmptyText, null);
  assert.deepEqual(model.earlier.map((group) => [group.day, group.label, group.rows.length]), [['2026-10-17', 'Yesterday', 2], ['2026-10-16', '16 Oct 2026', 1], ['2026-10-15', '15 Oct 2026', 1]]);
  assert.deepEqual(model.earlier[0].rows.map((row) => row.stateText), ['Update Jotbun to send', 'Checking with Jotbun']);
  assert.deepEqual(model.earlier[0].pendingLines, ['Waiting to sync: money out ฿5.00', 'Checking with Jotbun: money out ฿10.00']);
  assert.equal(model.earlier[2].totalText, null, 'a transfer is neither in nor out');
  assert.deepEqual(model.waitingMoney, ['Waiting to sync: money out ฿70.00', 'Checking with Jotbun: money out ฿17.00']);
  assert.deepEqual(model.sync.drafts, { saving: 1, checking: 2, needs_look: 1, update_to_send: 1 });
  // Every open draft, newest first, for the review list and the draft actions.
  assert.deepEqual(model.openDrafts.map((row) => row.commandId), outbox.slice(0, 5).map((draft) => draft.commandId));
  assert.deepEqual([model.today.partial, ...model.earlier.map((group) => group.partial)], [false, false, false, false]);
  assert.equal(model.balance.totalText, '฿51,200.00');
  assert.deepEqual(model.balance.wallets.map((wallet) => [wallet.name, wallet.balanceText]), [['Cash', '฿1,200.00'], ['Bank', '฿50,000.00']]);
  const limited = ready(home({ load: { state: 'ready', data: data({ records }) }, diary: diary(outbox), earlierDays: 2 }));
  assert.deepEqual(limited.earlier.map((group) => group.day), ['2026-10-17', '2026-10-16']);
});

test('an empty today still has its receipt, and drafts show only from an open diary', () => {
  const model = ready(home({ load: { state: 'ready', data: data({ records: [entry({ occurred_on: '2026-10-10' })] }) }, diary: diary([command(pending(), 'unsent')], { phase: 'opening' }) }));
  assert.deepEqual([model.today.day, model.today.rows.length, model.today.label], [TODAY, 0, 'Today']);
  assert.equal(model.todayEmptyText, 'Nothing logged today yet');
  assert.deepEqual(model.earlier.map((group) => group.day), ['2026-10-10']);
  assert.deepEqual(model.waitingMoney, ['Waiting to sync: money out ฿65.00']);
  const web = ready(home({ load: { state: 'ready', data: data() }, diary: null }));
  assert.deepEqual([web.today.rows.length, web.waitingMoney.length, web.sync.phase], [0, 0, 'none']);
});

test('no budget prompts for one; over budget is kind and plain', () => {
  const none = ready(home({ load: { state: 'ready', data: data({ budget: null }) } }));
  assert.equal(none.budget.pace.state, 'no_budget');
  assert.equal(none.budget.total, '฿120.00 spent this month');
  assert.equal(none.budget.headline, 'No budget this month');
  assert.equal(none.budget.setBudget, "Set a monthly budget to see what's left each day");
  const over = ready(home({ load: { state: 'ready', data: data({ budget: budget(OCT, '10000') }) } }));
  assert.equal(over.budget.pace.state, 'over');
  assert.equal(over.budget.headline, '฿20.00 over · 14 days to go');
  assert.equal(over.budget.reassurance, 'It happens.');
});

test('waiting money for the month: waiting and checking apart, sending with checking', () => {
  const outbox = [
    command(pending({ amount_minor: '6500' }), 'unsent'),
    command(pending({ amount_minor: '1000' }), 'sending'),
    command(pending({ type: 'income', category_id: SALARY.id, amount_minor: '2000' } as never), 'paused_upgrade'),
    command(pending({ amount_minor: '700' }), 'uncertain'),
    command(pending({ type: 'income', category_id: SALARY.id, amount_minor: '300' } as never), 'uncertain'),
    command(pending({ amount_minor: '9000' }), 'needs_review'),
    command(pending({ amount_minor: '4000' }), 'acknowledged'),
    command(pending({ type: 'transfer', amount_minor: '5000' }), 'unsent'),
    command(pending({ amount_minor: '3000', occurred_on: '2026-09-30' }), 'unsent'),
  ];
  assert.deepEqual(waitingMoneyLines(outbox, OCT, tc, 'en'), [
    'Waiting to sync: money in ฿20.00', 'Waiting to sync: money out ฿65.00', 'Checking with Jotbun: money in ฿3.00', 'Checking with Jotbun: money out ฿17.00',
  ]);
  // A draft whose record is already confirmed is not waiting money any more.
  const confirmed = new Set([outbox[0].payload.id, outbox[1].payload.id]);
  assert.deepEqual(waitingMoneyLines(outbox, OCT, tc, 'en', confirmed), [
    'Waiting to sync: money in ฿20.00', 'Checking with Jotbun: money in ฿3.00', 'Checking with Jotbun: money out ฿7.00',
  ]);
  assert.deepEqual(waitingMoneyLines([], OCT, tc, 'en'), []);
});

test('Home-3: a sending draft whose record the server already confirmed is counted once, in confirmed money only', () => {
  const lunch = entry({ amount_minor: '12000' });
  const sending = command(pending({ id: lunch.id, amount_minor: '12000' }), 'sending');
  const tenThousand = (records: ReturnType<typeof entry>[], spent: string) => data({ records, summary: spentSummary(OCT, spent), budget: budget(OCT, '1000000') });
  const model = ready(home({ load: { state: 'ready', data: tenThousand([lunch], '12000') }, diary: diary([sending]) }));
  // ฿10,000.00 − ฿120.00: ฿9,880.00 left, not ฿9,760.00.
  assert.equal(model.budget.pace.leftMinor, '988000');
  assert.deepEqual(model.budget.pace.spent, { confirmedMinor: '12000', pendingMinor: '0', checkingMinor: '0', estimatedMinor: '12000' });
  assert.deepEqual([model.budget.pendingNote, model.budget.checkingNote], [null, null]);
  assert.deepEqual(model.waitingMoney, []);
  assert.deepEqual(model.today.rows.map((row) => row.state), ['confirmed']);
  assert.deepEqual([model.today.totals.confirmed.outMinor, model.today.totals.waiting.outMinor, model.today.totals.checking.outMinor], ['12000', '0', '0']);
  // Still an open draft on the device, as the banner counts it: listed, but no total reads the list.
  assert.deepEqual(model.openDrafts.map((row) => [row.commandId, row.state]), [[sending.commandId, 'checking']]);
  assert.equal(model.sync.drafts.checking, 1);
  // Before the record shows up, the sending draft is being checked: never added, said apart, and labelled so.
  const early = ready(home({ load: { state: 'ready', data: tenThousand([], '0') }, diary: diary([sending]) }));
  assert.deepEqual([early.budget.pace.leftMinor, early.budget.pendingNote, early.budget.checkingNote], ['1000000', null, '฿120.00 more is being checked with Jotbun']);
  assert.deepEqual(early.today.rows.map((row) => [row.state, row.stateText]), [['checking', 'Checking with Jotbun']]);
  assert.deepEqual(early.today.pendingLines, ['Checking with Jotbun: money out ฿120.00']);
  assert.deepEqual(early.waitingMoney, ['Checking with Jotbun: money out ฿120.00']);
  assert.deepEqual(early.sync.drafts, { saving: 0, checking: 1, needs_look: 0, update_to_send: 0 });
});

test('Home-1: every open draft is listed with its row, whatever its date, for Review and the draft actions', () => {
  // One record a day from 4 to 17 October: Home's five earlier days are 13–17 October.
  const records = Array.from({ length: 14 }, (_, index) => entry({ occurred_on: addDays('2026-10-17', -index), amount_minor: '1000' }));
  const old = command(pending({ occurred_on: '2026-10-05', amount_minor: '4200' }), 'needs_review', { createdAt: '2026-10-05T03:00:00.000Z' });
  const lastMonth = command(pending({ occurred_on: '2026-09-02', amount_minor: '100' }), 'unsent', { createdAt: '2026-09-02T03:00:00.000Z' });
  const sending = command(pending({ occurred_on: '2026-10-01' }), 'sending', { createdAt: '2026-10-01T03:00:00.000Z' });
  const ahead = command(pending({ occurred_on: '2026-10-20' }), 'paused_upgrade', { createdAt: '2026-10-18T06:00:00.000Z' });
  const unsure = command(pending({ occurred_on: '2026-10-16' }), 'uncertain', { createdAt: '2026-10-16T03:00:00.000Z' });
  const done = command(pending(), 'acknowledged');
  const outbox = [old, lastMonth, sending, ahead, unsure, done];
  const model = ready(home({ load: { state: 'ready', data: data({ records }) }, diary: diary(outbox), earlierDays: 5 }));
  assert.deepEqual(model.earlier.map((group) => group.day), ['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13']);
  const shown = new Set([model.today, ...model.earlier].flatMap((group) => group.rows).map((row) => row.commandId));
  assert.ok(!shown.has(old.commandId), 'the draft is older than the days Home shows');
  assert.deepEqual(model.openDrafts.map((row) => row.commandId), [ahead, unsure, old, sending, lastMonth].map((draft) => draft.commandId));
  const review = model.openDrafts.filter((row) => row.state === 'needs_look');
  assert.deepEqual(review.map((row) => [row.key, row.canDiscard, row.canUndo, row.amountText, row.occurredOn]), [[`draft:${old.commandId}`, true, false, '-฿42.00', '2026-10-05']]);
  assert.equal(review.length, model.sync.drafts.needs_look, 'Review lists every draft the banner counts');
  assert.deepEqual(model.openDrafts.filter((row) => row.canUndo).map((row) => row.commandId), [lastMonth.commandId]);
  // Offline, too.
  const offline = home({ load: { state: 'error', error: new V1Error('network', 0, 'NETWORK_ERROR') }, diary: diary(outbox) });
  assert.equal(offline.kind, 'problem');
  if (offline.kind !== 'problem' || !offline.offline) throw new Error('expected offline home');
  assert.deepEqual(offline.offline.openDrafts.map((row) => row.commandId), model.openDrafts.map((row) => row.commandId));
  // Drafts show only from an open diary.
  assert.deepEqual(ready(home({ load: { state: 'ready', data: data({ records }) }, diary: diary(outbox, { phase: 'opening' }) })).openDrafts, []);
  assert.deepEqual(ready(home({ load: { state: 'ready', data: data({ records }) }, diary: null })).openDrafts, []);
});

test('Home-2: a draft dated before the oldest whole day loaded does not bring back a day without its confirmed money', () => {
  // The earlier page ended inside 15 October, so Home left that day out: 16 October is the oldest whole day.
  const records = [entry({ occurred_on: '2026-10-17', amount_minor: '100' }), entry({ occurred_on: '2026-10-16', amount_minor: '100' })];
  const cut = command(pending({ occurred_on: '2026-10-15', amount_minor: '6500' }), 'unsent');
  const kept = command(pending({ occurred_on: '2026-10-16', amount_minor: '700' }), 'unsent');
  const model = ready(home({ load: { state: 'ready', data: data({ records, oldestWholeDay: '2026-10-16' }) }, diary: diary([cut, kept]) }));
  assert.deepEqual(model.earlier.map((group) => [group.day, group.rows.length, group.totalText]), [['2026-10-17', 1, 'Money out ฿1.00'], ['2026-10-16', 2, 'Money out ฿1.00']]);
  assert.ok(model.openDrafts.some((row) => row.commandId === cut.commandId), 'still listed with the open drafts');
  // The month's money still counts it: it is this month's, only its day is not loaded.
  assert.deepEqual(model.waitingMoney, ['Waiting to sync: money out ฿72.00']);
  assert.equal(model.budget.pace.spent.pendingMinor, '7200');
  // Nothing was cut: every record is loaded, so a day with only a draft is a real day.
  for (const oldestWholeDay of [null, undefined]) {
    const whole = ready(home({ load: { state: 'ready', data: data({ records, oldestWholeDay }) }, diary: diary([cut, kept]) }));
    assert.deepEqual(whole.earlier.map((group) => group.day), ['2026-10-17', '2026-10-16', '2026-10-15'], String(oldestWholeDay));
  }
});

test('earlier records are cut back to whole days, naming the oldest whole day', () => {
  const page = (items: ReturnType<typeof entry>[], next: string | null) => ({ items, next_cursor: next });
  const [a, b, c, d] = [entry({ occurred_on: '2026-10-17' }), entry({ occurred_on: '2026-10-16' }), entry({ occurred_on: '2026-10-15' }), entry({ occurred_on: '2026-10-15' })];
  assert.deepEqual(earlierWholeDays(page([a, b, c, d], 'more')), { records: [a, b], oldestWholeDay: '2026-10-16' });
  assert.deepEqual(earlierWholeDays(page([a, b, c, d], null)), { records: [a, b, c, d], oldestWholeDay: null });
  // A page all on one day: that day goes on, so only the days after it are whole.
  assert.deepEqual(earlierWholeDays(page([c, d], 'more')), { records: [], oldestWholeDay: '2026-10-16' });
  assert.deepEqual(earlierWholeDays(page([], null)), { records: [], oldestWholeDay: null });
});

test('a day with more records than Home reads is marked partial instead of failing', async () => {
  const pages = [[entry(), entry()], [entry(), entry()], [entry()]];
  const reader = (): { read: HistoryPageReader; cursors: (string | undefined)[] } => {
    const cursors: (string | undefined)[] = [];
    const read: HistoryPageReader = async (cursor) => {
      cursors.push(cursor);
      const index = cursor === undefined ? 0 : Number(cursor);
      return { items: pages[index], next_cursor: index + 1 < pages.length ? String(index + 1) : null };
    };
    return { read, cursors };
  };
  const all = reader();
  const whole = await readWholeDay(all.read, 3);
  assert.deepEqual([whole.records.length, whole.complete, all.cursors], [5, true, [undefined, '1', '2']]);
  const capped = reader();
  const cut = await readWholeDay(capped.read, 2);
  assert.deepEqual([cut.records, cut.complete, capped.cursors], [[...pages[0], ...pages[1]], false, [undefined, '1']]);
  // Home shows what it read, with today marked partial; earlier days are whole by construction.
  const records = [...cut.records, entry({ occurred_on: '2026-10-17' })];
  const model = ready(home({ load: { state: 'ready', data: data({ records, todayComplete: false }) } }));
  assert.deepEqual([model.today.rows.length, model.today.partial, model.earlier.map((group) => group.partial)], [4, true, [false]]);
  assert.equal(ready(home({ load: { state: 'ready', data: data({ records }) } })).today.partial, false);
});
