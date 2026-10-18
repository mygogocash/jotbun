import assert from 'node:assert/strict';
import { test } from 'node:test';

import { V1Error } from '../../../api/client.ts';
import type { V1Outcome } from '../../../api/client.ts';
import type { OutboxCommand } from '../../../storage/types.ts';
import type { DiaryView } from '../spendDiary.ts';
import { classifyLoadProblem, homeModel, waitingMoneyLines } from './homeModel.ts';
import type { HomeData, HomeInput, HomeModel } from './homeModel.ts';
import { BUILTINS, PETS, SALARY, WALLETS, budget, command, entry, marked, pending, spentSummary, tc, transfer } from './testing/fixtures.ts';

const TODAY = '2026-10-18';
const OCT = '2026-10';

function diary(outbox: OutboxCommand[], overrides: Partial<DiaryView> = {}): DiaryView {
  return {
    phase: 'ready', lockReason: null, outcome: null, progress: null, pending: outbox.map((item) => item.payload), outbox,
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
  assert.equal(model.budget.total, '฿230.00 of ฿18,000.00');
  assert.equal(model.budget.pendingNote, 'Includes ฿80.00 saving on this device');
  assert.equal(model.budget.checkingNote, '฿7.00 more is being checked with Jotbun');
  assert.equal(model.budget.headline, '฿1,269.28 a day left · on track');
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
  assert.deepEqual(model.earlier[0].rows.map((row) => row.stateText), ['Update Jotbun to send', 'Saving…']);
  assert.equal(model.earlier[2].totalText, null, 'a transfer is neither in nor out');
  assert.deepEqual(model.waitingMoney, ['Waiting to sync: money out ฿80.00', 'Checking with Jotbun: money out ฿7.00']);
  assert.deepEqual(model.sync.drafts, { saving: 2, checking: 1, needs_look: 1, update_to_send: 1 });
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

test('waiting money for the month follows the current Home groups exactly', () => {
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
    'Waiting to sync: money in ฿20.00', 'Waiting to sync: money out ฿75.00', 'Checking with Jotbun: money in ฿3.00', 'Checking with Jotbun: money out ฿7.00',
  ]);
  assert.deepEqual(waitingMoneyLines([], OCT, tc, 'en'), []);
});
