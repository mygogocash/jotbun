import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { ACCOUNT_A, ACCOUNT_B, FOOD, WALLET, category, change, expense, wallet } from '../storage/testing/diaryFixtures.ts';
import { INITIAL_RETRY, afterFailure, afterPacing, afterSuccess, gate } from './retryPolicy.ts';
import { createSyncScheduler } from './scheduler.ts';
import { PROBLEMS } from './testing/fakeServer.ts';
import { START, bench } from './testing/harness.ts';
import type { Bench } from './testing/harness.ts';
import type { PendingChoice } from '../storage/types.ts';
import type { FlushTrigger, SyncOutcome } from './types.ts';

let b: Bench | undefined;
afterEach(() => b?.dispose());

const states = async (bench: Bench) => (await bench.store.readOutbox()).map((command) => command.state);

test('sends drafts once, in order, and resolves them only from the confirmed state', async () => {
  b = await bench();
  const saved = [await b.save({ amount_minor: '100' }), await b.save({ amount_minor: '200' }), await b.save({ amount_minor: '300' })];
  const outcome = await b.flush('launch');
  assert.equal(outcome.status, 'synced');
  assert.deepEqual(outcome.progress, { sent: 3, total: 3 });
  assert.deepEqual(b.server.sent.map((s) => s.commandId), saved.map((c) => c.commandId));
  assert.deepEqual(await b.store.readOutbox(), []);
  const state = await b.store.readState();
  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.confirmed.filter((e) => e.entity === 'transaction').map((e) => e.id).sort(), saved.map((c) => c.payload.id).sort());
  assert.equal(state.walletTotals[WALLET], String(100000 - 600));
});

test('airplane mode: an unreachable server leaves the command uncertain and frozen; the retry checks status, then resends the same command', async () => {
  b = await bench();
  const command = await b.save();
  b.server.scriptSends({ kind: 'network_before' });
  const first = await b.flush();
  assert.equal(first.status, 'waiting');
  assert.ok((first.nextAttemptAt ?? 0) > START);
  const [uncertain] = await b.store.readOutbox();
  assert.equal(uncertain.state, 'uncertain');
  assert.notEqual(uncertain.firstTransmissionAt, null);
  assert.equal((await b.store.readState()).pending.length, 1);
  assert.equal((await b.flush()).status, 'waiting', 'no retry before the backoff ends');
  assert.equal(b.server.sent.length, 1);
  b.clock.now = first.nextAttemptAt as number;
  assert.equal((await b.flush()).status, 'synced');
  assert.equal(b.server.sent.length, 2);
  assert.deepEqual(b.server.sent[0], b.server.sent[1]);
  assert.equal(b.server.records().length, 1);
  assert.equal(command.commandId, b.server.sent[1].commandId);
});

test('a timeout after the commit resolves through command status, without a resend', async () => {
  b = await bench();
  await b.save();
  b.server.scriptSends({ kind: 'network_after' });
  const first = await b.flush();
  assert.deepEqual(await states(b), ['uncertain']);
  b.clock.now = first.nextAttemptAt as number;
  assert.equal((await b.flush()).status, 'synced');
  assert.equal(b.server.sent.length, 1);
  assert.equal(b.server.records().length, 1);
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('an app killed after the commit but before the local acknowledgement recovers on the next launch', async () => {
  b = await bench();
  const command = await b.save();
  await b.store.beginTransmission(command.commandId, new Date(START).toISOString());
  await b.server.remote.sendCreate((await b.store.readOutbox())[0]);
  // The process dies here; a new engine starts.
  const outcome = await b.newEngine().flush({ accountId: ACCOUNT_A, epoch: 1 }, 'launch');
  assert.equal(outcome.status, 'synced');
  assert.equal(b.server.sent.length, 1);
  assert.equal(b.server.records().length, 1);
  assert.deepEqual(await b.store.readOutbox(), []);
  assert.deepEqual((await b.store.readState()).pending, []);
});

test('a response that arrives after a session change is dropped; the next session resolves the command', async () => {
  b = await bench();
  await b.save();
  b.server.scriptSends({ kind: 'session_changed_after' });
  assert.equal((await b.flush()).status, 'session_changed');
  assert.deepEqual(await states(b), ['sending']);
  b.session.epoch = 2;
  const store = await b.database.open(ACCOUNT_A);
  const outcome = await b.newEngine(store).flush({ accountId: ACCOUNT_A, epoch: 2 }, 'launch');
  assert.equal(outcome.status, 'synced');
  assert.equal(b.server.records().length, 1);
  assert.deepEqual(await store.readOutbox(), []);
});

test('an expired token is refreshed once and the same command resent; a second refusal stops with drafts kept', async () => {
  b = await bench();
  await b.save();
  b.server.scriptSends(PROBLEMS.signedOut());
  assert.equal((await b.flush()).status, 'synced');
  assert.equal(b.refreshes.count, 1);
  assert.equal(b.server.sent.length, 2);
  assert.deepEqual(b.server.sent[0], b.server.sent[1]);
  const second = await b.save();
  b.server.scriptSends(PROBLEMS.signedOut(), PROBLEMS.signedOut());
  assert.equal((await b.flush()).status, 'signed_out');
  assert.equal(b.refreshes.count, 2, 'one refresh for this failed request');
  const [kept] = await b.store.readOutbox();
  assert.equal(kept.commandId, second.commandId);
  assert.equal(kept.state, 'unsent');
  assert.notEqual(kept.firstTransmissionAt, null, 'frozen after its first transmission');
});

test('a denied account stops the flush without losing drafts', async () => {
  b = await bench();
  await b.save();
  b.refreshes.result = false;
  b.server.scriptSends(PROBLEMS.accountUnavailable());
  assert.equal((await b.flush()).status, 'signed_out');
  assert.equal(b.refreshes.count, 1);
  assert.equal((await b.store.readState()).pending.length, 1);
  assert.equal((await b.store.readOutbox()).length, 1);
});

test('429 is pacing (Retry-After, no failure count); a 5xx may have committed, so it is uncertain and counts', async () => {
  b = await bench();
  await b.save();
  for (let i = 0; i < 6; i += 1) {
    b.server.scriptSends(PROBLEMS.rateLimited(30));
    const outcome = await b.flush('timer');
    assert.equal(outcome.status, 'rate_limited');
    assert.equal(outcome.nextAttemptAt, b.clock.now + 30_000);
    b.clock.now = outcome.nextAttemptAt as number;
  }
  assert.deepEqual(await states(b), ['unsent']);
  b.server.scriptSends(PROBLEMS.unavailable());
  const failed = await b.flush('timer');
  assert.equal(failed.status, 'waiting');
  assert.deepEqual(await states(b), ['uncertain']);
});

test('five transport failures in a row pause the engine until the app comes to the foreground or the user retries', async () => {
  b = await bench();
  await b.save();
  let outcome: SyncOutcome | undefined;
  b.server.setOffline(true);
  for (let i = 0; i < 5; i += 1) {
    outcome = await b.flush('timer');
    b.clock.now = Math.max(b.clock.now, outcome.nextAttemptAt ?? b.clock.now) + 1;
  }
  assert.equal(outcome?.status, 'paused');
  const sends = b.server.sent.length;
  b.clock.now += 3_600_000;
  assert.equal((await b.flush('timer')).status, 'paused');
  assert.equal(b.server.sent.length, sends);
  b.server.setOffline(false);
  assert.equal((await b.flush('foreground')).status, 'synced');
  assert.equal(b.server.records().length, 1);
});

test('validation refusals need review instead of retrying forever; others still go', async () => {
  b = await bench();
  await b.save();
  await b.save();
  const third = await b.save();
  // (A 409 on a create means the id may already be committed: uncertain, see engineHardening.)
  b.server.scriptSends(PROBLEMS.invalid(), PROBLEMS.invalid());
  const outcome = await b.flush();
  assert.equal(outcome.needsReview, 2);
  assert.deepEqual((await b.store.readOutbox()).map((c) => c.state), ['needs_review', 'needs_review']);
  assert.equal(b.server.records().map((r) => r.id).includes(third.payload.id), true);
  const sends = b.server.sent.length;
  await b.flush('manual');
  assert.equal(b.server.sent.length, sends, 'needs-review commands are not resent');
  assert.equal((await b.store.readState()).pending.length, 2, 'drafts are kept');
});

test('426 pauses unsent commands for an upgrade, keeps uncertain ones uncertain, and stops all sending', async () => {
  b = await bench();
  const uncertain = await b.save();
  b.server.scriptSends({ kind: 'network_before' });
  const first = await b.flush();
  b.clock.now = first.nextAttemptAt as number;
  const unsent = await b.save();
  b.server.scriptOthers({ kind: 'problem', outcome: 'upgrade_required', status: 426, code: 'CLIENT_UPGRADE_REQUIRED' });
  const outcome = await b.flush();
  assert.equal(outcome.status, 'upgrade_required');
  const byId = Object.fromEntries((await b.store.readOutbox()).map((c) => [c.commandId, c]));
  assert.equal(byId[uncertain.commandId].state, 'uncertain');
  assert.equal(byId[unsent.commandId].state, 'paused_upgrade');
  assert.deepEqual(byId[unsent.commandId].payload, unsent.payload);
  const sends = b.server.sent.length;
  assert.equal((await b.flush('manual')).status, 'upgrade_required');
  assert.equal(b.server.sent.length, sends);
});

test('an unsupported command schema needs review and keeps its draft; the rest are sent', async () => {
  b = await bench();
  const refused = await b.save();
  const fine = await b.save();
  b.server.scriptSends(PROBLEMS.schema());
  await b.flush();
  const [left] = await b.store.readOutbox();
  assert.deepEqual([left.commandId, left.state], [refused.commandId, 'needs_review']);
  assert.ok(b.server.records().some((r) => r.id === fine.payload.id));
  assert.equal((await b.store.readState()).pending.length, 1);
});

test('a 200-draft backlog drains at the write limit with progress, never pausing and never sending twice at once', async () => {
  b = await bench({ writesPerMinute: 60 });
  for (let i = 0; i < 200; i += 1) await b.save({ amount_minor: String(i + 1) });
  let acknowledged = 0;
  let runs = 0;
  for (;;) {
    const outcome = await b.flush('timer');
    runs += 1;
    assert.notEqual(outcome.status, 'paused');
    assert.ok(outcome.progress.sent <= outcome.progress.total);
    acknowledged += outcome.progress.sent;
    if (outcome.status === 'synced') break;
    assert.equal(outcome.status, 'rate_limited');
    b.clock.now = outcome.nextAttemptAt as number;
    assert.ok(runs < 50);
  }
  assert.equal(acknowledged, 200);
  assert.equal(b.server.records().length, 200);
  assert.equal(b.server.receipts.size, 200);
  // Fixed one-minute windows of 60 writes: 200 writes need at least three window changes.
  assert.ok(b.clock.now - START >= 120_000, `took ${(b.clock.now - START) / 1000}s`);
  assert.equal(b.server.maxInFlight, 2);
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('one flush at a time per account: a call during a run waits and runs once after it', async () => {
  b = await bench();
  for (let i = 0; i < 4; i += 1) await b.save();
  const [first, second] = await Promise.all([b.flush(), b.flush(), b.flush()]);
  assert.equal(first.status, 'synced');
  assert.equal(second.status, 'synced');
  assert.equal(b.server.sent.length, 4);
  assert.equal(new Set(b.server.sent.map((s) => s.commandId)).size, 4);
});

test('archived or deleted references, and drafts older than 30 days, need review without data loss', async () => {
  b = await bench();
  const toArchived = await b.save();
  const stale = await b.save({}, { createdAt: new Date(START - 31 * 86_400_000).toISOString() });
  b.server.commitElsewhere([change('wallet', wallet({ version: 2, archived: true }))]);
  const outcome = await b.flush('manual');
  assert.equal(outcome.needsReview, 2);
  const byId = Object.fromEntries((await b.store.readOutbox()).map((c) => [c.commandId, c.state]));
  assert.deepEqual([byId[toArchived.commandId], byId[stale.commandId]], ['needs_review', 'needs_review']);
  assert.equal(b.server.sent.length, 0);
  assert.equal((await b.store.readState()).pending.length, 2);
  assert.equal(category().id, FOOD);
});

test('a flush for another account or session does nothing', async () => {
  b = await bench();
  await b.save();
  assert.equal((await b.engine.flush({ accountId: ACCOUNT_B, epoch: 1 })).status, 'session_changed');
  b.session.epoch = 2;
  assert.equal((await b.flush()).status, 'session_changed');
  assert.equal(b.server.sent.length, 0);
});

test('retry delays start at 1 s, double with jitter to 60 s, honour Retry-After, and pause after five failures', () => {
  let state = INITIAL_RETRY;
  const delays: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    state = afterFailure(state, 0, 1);
    delays.push(state.notBefore);
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  let low = INITIAL_RETRY;
  for (let i = 0; i < 3; i += 1) low = afterFailure(low, 0, 0);
  assert.equal(low.notBefore, 2000, 'jitter keeps at least half the delay');
  let capped = { ...INITIAL_RETRY, failures: 3 };
  capped = afterFailure({ ...capped, failures: 10 }, 0, 1);
  assert.equal(capped.notBefore, 60_000);
  assert.equal(afterFailure(INITIAL_RETRY, 0, 1, 120).notBefore, 120_000, 'Retry-After on a 503 wins');
  state = afterFailure(state, 0, 1);
  assert.equal(state.paused, true);
  assert.equal(gate(state, 10 ** 9, 'timer').wait, 'paused');
  assert.equal(gate(state, 0, 'foreground').go, true);
  const paced = afterPacing(INITIAL_RETRY, 0, 30);
  assert.deepEqual([paced.failures, paced.paceUntil], [0, 30_000]);
  assert.deepEqual(gate(paced, 1, 'manual'), { go: false, state: paced, wait: 'rate_limited', until: 30_000 });
  assert.equal(afterSuccess(state).failures, 0);
});

test('the scheduler keeps at most one 60-second foreground timer and tears it down on background or switch', async () => {
  const flushed: FlushTrigger[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  let result: SyncOutcome = { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };
  const scheduler = createSyncScheduler({
    flush: async (trigger) => (flushed.push(trigger), result),
    now: () => 1_000,
    setTimer: (fn, ms) => (timers.set(++next, { fn, ms }), next),
    clearTimer: (handle) => void timers.delete(handle as number),
  });
  await scheduler.launch();
  await scheduler.foreground();
  await scheduler.foreground();
  assert.deepEqual(flushed, ['launch', 'foreground', 'foreground']);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 60_000);
  result = { ...result, status: 'rate_limited', nextAttemptAt: 31_000 };
  await scheduler.written();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 30_000, 'pacing re-arms the one timer for Retry-After');
  result = { ...result, status: 'paused', nextAttemptAt: null };
  await scheduler.manual();
  assert.equal(timers.size, 0, 'a paused engine waits for foreground or manual');
  result = { ...result, status: 'synced' };
  await scheduler.foreground();
  assert.equal(timers.size, 1);
  scheduler.background();
  assert.equal(timers.size, 0);
  await scheduler.foreground();
  scheduler.stop();
  assert.equal(timers.size, 0);
  await scheduler.foreground();
  assert.equal(timers.size, 0, 'a stopped scheduler stays stopped');
  assert.deepEqual(flushed, ['launch', 'foreground', 'foreground', 'write', 'manual', 'foreground', 'foreground']);
});

test('a pending choice is never sent by the sync engine', async () => {
  b = await bench();
  const record = expense({ amount_minor: '6500' });
  const kept: PendingChoice = {
    recordId: record.id, original: record, changes: { amount_minor: '7000' }, server: { ...record, version: 2, amount_minor: '8000' },
    editedAt: '2026-03-02T05:00:30.000Z', refusedAt: '2026-03-02T05:01:00.000Z',
  };
  await b.store.keepChoice(kept);
  const saved = await b.save({ amount_minor: '100' });
  const outcome = await b.flush();
  assert.equal(outcome.status, 'synced');
  // Exactly one create went out: the draft. The choice's record never did.
  assert.deepEqual(b.server.sent.map((sent) => sent.commandId), [saved.commandId]);
  assert.ok(b.server.sent.every((sent) => !sent.body.includes(record.id)));
  assert.deepEqual(await b.store.readChoices(), [kept]);
});
