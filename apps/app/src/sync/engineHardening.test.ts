// S3 review fixes: frozen bodies, committed commands always resolve, one
// backoff decision per run, no error escapes a flush, restores never delete
// drafts, and the scheduler survives a failing flush.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { V1Error, createV1Transport } from '../api/client.ts';
import { createSyncResources } from '../spend/v1/resources.ts';
import { ACCOUNT_A, SAVINGS, category, change, wallet } from '../storage/testing/diaryFixtures.ts';
import { pendingAdjustmentMinor, reconcile } from './reconcile.ts';
import { createSyncScheduler } from './scheduler.ts';
import { PROBLEMS, createFakeServer } from './testing/fakeServer.ts';
import { SALARY, START, bench } from './testing/harness.ts';
import type { Bench } from './testing/harness.ts';
import type { SyncOutcome, SyncRemote } from './types.ts';

let b: Bench | undefined;
afterEach(() => b?.dispose());

const opts = () => ({ newKey: () => crypto.randomUUID(), sleep: async () => undefined, maxSnapshotPolls: 3 });
const amountOnServer = (bench: Bench, id: string) => (bench.server.head(id)?.snapshot as { amount_minor?: string } | null)?.amount_minor;

test('an edit made before a draft is transmitted is exactly what gets sent and committed', async () => {
  b = await bench();
  await b.save({ amount_minor: '100' });
  await b.save({ amount_minor: '200' });
  const third = await b.save({ amount_minor: '300' });
  const original = b.server.remote.sendCreate;
  let edited = false;
  b.server.remote.sendCreate = async (command) => {
    if (!edited) {
      edited = true;
      await b!.store.editPending(third.commandId, { ...third.payload, amount_minor: '999' });
    }
    return original(command);
  };
  assert.equal((await b.flush('write')).status, 'synced');
  assert.equal(amountOnServer(b, third.payload.id), '999');
  assert.equal(JSON.parse(b.server.sent.find((s) => s.commandId === third.commandId)!.body).amount_minor, '999');
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('a draft removed before its turn is skipped; the flush still finishes and nothing is sent after it', async () => {
  b = await bench();
  const drafts: Awaited<ReturnType<Bench['save']>>[] = [];
  for (let i = 0; i < 6; i += 1) drafts.push(await b.save({ amount_minor: String(i + 1) }));
  const original = b.server.remote.sendCreate;
  let removed = false;
  let settled = false;
  const late: string[] = [];
  b.server.remote.sendCreate = async (command) => {
    if (!removed) {
      removed = true;
      await b!.store.removePending(drafts[2].commandId);
    }
    if (settled) late.push(command.commandId);
    return original(command);
  };
  const outcome = await b.flush('write');
  settled = true;
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(outcome.status, 'synced');
  assert.deepEqual(late, []);
  assert.equal(b.server.records().length, 5);
  assert.ok(!b.server.sent.some((s) => s.commandId === drafts[2].commandId));
});

test('a failure in one worker is not erased by a success in the other', async () => {
  b = await bench();
  await b.save();
  await b.save();
  b.server.scriptSends({ kind: 'network_before' });
  const outcome = await b.flush('timer');
  assert.equal(outcome.status, 'waiting');
  assert.ok((outcome.nextAttemptAt ?? 0) >= b.clock.now + 500);
  const sends = b.server.sent.length;
  assert.equal((await b.flush('timer')).status, 'waiting');
  assert.equal(b.server.sent.length, sends);
});

test('outbox sends make exactly one attempt per request (no hidden transport resend)', async () => {
  let calls = 0;
  const transport = createV1Transport({
    baseUrl: 'http://127.0.0.1:9',
    client: { platform: 'ios', version: '1.0.0' },
    credentials: { getAccessToken: async () => 'token', getSessionSnapshot: () => ({ binding: 'A'.repeat(43), epoch: 1 }) },
    fetchImpl: (async () => {
      calls += 1;
      throw new TypeError('Network request failed');
    }) as typeof fetch,
  });
  const remote = createSyncResources(transport, { sha256Hex: async () => '' });
  const payload = { id: crypto.randomUUID(), type: 'expense', amount_minor: '1', occurred_on: '2026-03-01', wallet_id: crypto.randomUUID(), category_id: crypto.randomUUID() } as never;
  const error = await remote.sendCreate({ commandId: crypto.randomUUID(), accountId: ACCOUNT_A, schemaVersion: 1, kind: 'transaction.create', payload, state: 'sending', firstTransmissionAt: 'x', createdAt: 'x', ackedRevision: null }).catch((caught: unknown) => caught);
  assert.equal((error as V1Error).outcome, 'network');
  assert.equal(calls, 1);
});

test('a command that committed resolves whatever its local state (refused, unsent or needs review)', async () => {
  b = await bench();
  const command = await b.save();
  const original = b.server.remote.sendCreate;
  let once = true;
  b.server.remote.sendCreate = async (c) => {
    if (once) {
      once = false;
      await original(c);
      throw new V1Error('rate_limited', 429, 'RATE_LIMITED', { retryAfterSeconds: 10 });
    }
    return original(c);
  };
  await b.flush('write');
  b.server.commitElsewhere([change('wallet', wallet({ version: 2, archived: true }))]);
  b.clock.now += 61_000;
  await b.flush('manual');
  assert.deepEqual(await b.store.readOutbox(), []);
  assert.deepEqual((await b.store.readState()).pending, []);
  assert.ok((await b.store.readState()).confirmed.some((e) => e.id === command.payload.id && e.state === 'active'));
});

test('"id already used" refusals (409/410) are uncertain, not needs-review, and resolve', async () => {
  b = await bench();
  const command = await b.save();
  await b.store.beginTransmission(command.commandId, new Date(START).toISOString());
  await b.server.remote.sendCreate((await b.store.readOutbox())[0]);
  await b.store.setCommandState(command.commandId, ['sending'], 'unsent');
  b.server.scriptOthers({ kind: 'network_before' });
  b.server.scriptSends({ kind: 'problem', outcome: 'conflict', status: 409, code: 'VERSION_CONFLICT' });
  await b.flush('manual');
  assert.notEqual((await b.store.readOutbox())[0]?.state, 'needs_review');
  await b.flush('manual');
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('after a server restore, an acknowledged command missing from the confirmed state is resent, never deleted', async () => {
  b = await bench();
  const command = await b.save({ amount_minor: '4321' });
  await b.store.beginTransmission(command.commandId, new Date(START).toISOString());
  const ack = await b.server.remote.sendCreate((await b.store.readOutbox())[0]);
  await b.store.setCommandState(command.commandId, ['sending'], 'acknowledged', ack.committed_revision);
  const restored = createFakeServer({ now: () => b!.clock.now });
  restored.commitElsewhere([change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' })), change('category', category())]);
  restored.commitElsewhere([change('wallet', wallet({ version: 2, name: 'Renamed' }))]);
  const outcome = await reconcile(b.store, restored.remote, opts());
  assert.equal(outcome.resolved, 0);
  assert.deepEqual((await b.store.readState()).pending.map((e) => e.id), [command.payload.id]);
  assert.equal((await b.store.readOutbox())[0].state, 'uncertain');
});

test('a resent uncertain command that is paced keeps its uncertain mark', async () => {
  b = await bench();
  await b.save();
  b.server.scriptSends({ kind: 'network_before' });
  const first = await b.flush();
  b.clock.now = first.nextAttemptAt as number;
  b.server.scriptSends(PROBLEMS.rateLimited(30));
  assert.equal((await b.flush()).status, 'rate_limited');
  assert.equal((await b.store.readOutbox())[0].state, 'uncertain');
});

test('426 on a send pauses the unsent commands and stops sending', async () => {
  b = await bench();
  const first = await b.save();
  await b.save();
  const third = await b.save();
  b.server.scriptSends(PROBLEMS.upgrade());
  assert.equal((await b.flush()).status, 'upgrade_required');
  const states = Object.fromEntries((await b.store.readOutbox()).map((c) => [c.commandId, c.state]));
  // The second was already in flight beside the first and may have been acknowledged.
  assert.deepEqual([states[first.commandId], states[third.commandId]], ['paused_upgrade', 'paused_upgrade']);
  assert.ok(!b.server.sent.some((s) => s.commandId === third.commandId));
});

test('a known command status acknowledges the command even if the next pull fails', async () => {
  b = await bench();
  await b.save();
  b.server.scriptSends({ kind: 'network_after' });
  const first = await b.flush();
  b.clock.now = first.nextAttemptAt as number;
  b.server.scriptOthers({ kind: 'network_after' }, { kind: 'network_before' });
  await b.flush();
  assert.equal((await b.store.readOutbox())[0].state, 'acknowledged');
  assert.equal(b.server.sent.length, 1);
});

test('a status answer that does not match the command is refused', async () => {
  b = await bench();
  const command = await b.save();
  b.server.scriptSends({ kind: 'network_before' });
  const first = await b.flush();
  b.clock.now = first.nextAttemptAt as number;
  const honest = b.server.remote.commandStatus;
  b.server.remote.commandStatus = async (ids) => ids.map((id) => ({ command_id: id, state: 'known' as const, ack: { command_id: id, entity_id: crypto.randomUUID(), version: 1, committed_revision: '9', outcome: 'created' as const, entity_state: 'active' as const } }));
  await b.flush();
  assert.equal((await b.store.readOutbox())[0].state, 'uncertain');
  b.server.remote.commandStatus = honest;
  assert.equal(command.commandId, (await b.store.readOutbox())[0].commandId);
});

test('stale uncertain commands are reviewed, not resent', async () => {
  b = await bench();
  const old = await b.save({}, { createdAt: new Date(START - 31 * 86_400_000).toISOString() });
  await b.store.beginTransmission(old.commandId, new Date(START - 31 * 86_400_000).toISOString());
  await b.store.setCommandState(old.commandId, ['sending'], 'uncertain');
  await b.flush('manual');
  assert.equal((await b.store.readOutbox())[0].state, 'needs_review');
  assert.equal(b.server.sent.length, 0);
});

test('a write during a running flush is sent by one follow-up run', async () => {
  b = await bench();
  await b.save();
  const original = b.server.remote.sendCreate;
  let late = false;
  b.server.remote.sendCreate = async (c) => {
    if (!late) {
      late = true;
      await b!.save({ amount_minor: '777' });
      void b!.flush('write');
    }
    return original(c);
  };
  await b.flush('write');
  for (let i = 0; i < 20 && (await b.store.readOutbox()).length > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(await b.store.readOutbox(), []);
  assert.equal(b.server.records().length, 2);
});

test('pending adjustment counts unconfirmed expenses only', async () => {
  b = await bench();
  await b.save({ amount_minor: '500' });
  await b.save({ type: 'income', amount_minor: '9000', category_id: SALARY } as never);
  assert.equal(pendingAdjustmentMinor(await b.store.readState()), '500');
});

test('410 without a problem body, and a refused cursor, both lead to a full resync', async () => {
  b = await bench();
  b.server.commitElsewhere([change('wallet', wallet({ version: 2 }))]);
  for (const error of [new V1Error('invalid', 410, 'HTTP_410'), new V1Error('invalid', 422, 'VALIDATION_FAILED', { fields: { cursor: 'The cursor is malformed.' } })]) {
    let thrown = false;
    const remote: SyncRemote = {
      ...b.server.remote,
      async changes(cursor, limit) {
        if (!thrown) {
          thrown = true;
          throw error;
        }
        return b!.server.remote.changes(cursor, limit);
      },
    };
    assert.equal((await reconcile(b.store, remote, opts())).status, 'synced');
  }
});

test('a chunk from another snapshot is refused and the diary is left as it was', async () => {
  b = await bench();
  b.server.commitElsewhere([change('wallet', wallet({ version: 2 }))]);
  b.server.prune(2);
  const before = await b.store.readState();
  const remote: SyncRemote = { ...b.server.remote, snapshotChunk: async (grant) => ({ ...(await b!.server.remote.snapshotChunk(grant)), high_water: '999' }) };
  await assert.rejects(reconcile(b.store, remote, opts()));
  assert.deepEqual(await b.store.readState(), before);
});

test('an expired chunk grant is renewed before the download', async () => {
  b = await bench();
  b.server.commitElsewhere([change('wallet', wallet({ version: 2 }))]);
  b.server.prune(2);
  let statusCalls = 0;
  const remote: SyncRemote = {
    ...b.server.remote,
    async requestSnapshot(key) {
      const dto = await b!.server.remote.requestSnapshot(key);
      return dto.status === 'ready' ? { ...dto, chunks: dto.chunks.map((chunk) => ({ ...chunk, grant_expires_at: new Date(0).toISOString() })) } : dto;
    },
    async snapshotStatus(id) {
      statusCalls += 1;
      return b!.server.remote.snapshotStatus(id);
    },
  };
  assert.equal((await reconcile(b.store, remote, opts())).status, 'synced');
  assert.ok(statusCalls >= 1);
});

test('the scheduler survives a failing flush, re-arms its timer, and marks launch as foreground', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const timers: { fn: () => void; ms: number }[] = [];
  let fail = false;
  const synced: SyncOutcome = { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };
  const scheduler = createSyncScheduler({
    flush: async () => {
      if (fail) throw new TypeError('store error');
      return synced;
    },
    now: () => 0,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => undefined,
  });
  await scheduler.launch();
  assert.equal(timers.length, 1, 'launch is in the foreground');
  fail = true;
  timers[0].fn();
  await new Promise((resolve) => setTimeout(resolve, 20));
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
  assert.equal(timers.length, 2, 'a failed flush still re-arms the timer');
  scheduler.background();
  await scheduler.written();
  assert.equal(timers.length, 2, 'no timer while in the background');
});

test('every run reports its outcome, including a flush that failed outright', async () => {
  const reported: string[] = [];
  let fail = false;
  const scheduler = createSyncScheduler({
    flush: async () => {
      if (fail) throw new TypeError('store error');
      return { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };
    },
    now: () => 0,
    setTimer: () => null,
    clearTimer: () => undefined,
    onOutcome: (outcome) => reported.push(outcome.status),
  });
  await scheduler.launch();
  fail = true;
  await scheduler.manual();
  assert.deepEqual(reported, ['synced', 'waiting']);
  scheduler.stop();
  await scheduler.manual();
  assert.deepEqual(reported, ['synced', 'waiting'], 'nothing is reported after a stop');
});
