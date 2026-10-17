import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { change, expense } from '../storage/testing/diaryFixtures.ts';
import { pendingAdjustmentMinor, reconcile } from './reconcile.ts';
import { START, bench } from './testing/harness.ts';
import type { Bench } from './testing/harness.ts';
import type { SyncRemote } from './types.ts';

let b: Bench | undefined;
afterEach(() => b?.dispose());

const options = (polls = 3) => ({ newKey: () => randomUUID(), sleep: async () => undefined, maxSnapshotPolls: polls });

/** Sends a saved command and records its acknowledgement locally, without pulling changes. */
async function acknowledge(bench: Bench, commandId: string): Promise<string> {
  await bench.store.beginTransmission(commandId, new Date(START).toISOString());
  const ack = await bench.server.remote.sendCreate((await bench.store.readOutbox()).find((c) => c.commandId === commandId)!);
  await bench.store.setCommandState(commandId, ['sending'], 'acknowledged', ack.committed_revision);
  return ack.committed_revision;
}

const confirmedIds = async (bench: Bench) => (await bench.store.readState()).confirmed.filter((e) => e.entity === 'transaction' && e.state === 'active').map((e) => e.id);

test('an acknowledgement alone never becomes confirmed state; every delta page is pulled, then the command resolves', async () => {
  b = await bench();
  const command = await b.save({ amount_minor: '4000' });
  await acknowledge(b, command.commandId);
  assert.deepEqual(await confirmedIds(b), []);
  assert.equal((await b.store.readState()).pending.length, 1);
  for (let i = 0; i < 250; i += 1) b.server.commitElsewhere([change('transaction', expense({ amount_minor: '1' }))]);
  const outcome = await reconcile(b.store, b.server.remote, options());
  assert.deepEqual(outcome, { status: 'synced', resolved: 1 });
  const state = await b.store.readState();
  assert.equal(state.appliedRevision, String(b.server.groups.length));
  assert.ok((await confirmedIds(b)).includes(command.payload.id));
  assert.deepEqual(state.pending, []);
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('a cursor behind retention gets a full snapshot, then deltas; unresolved commands survive the swap', async () => {
  b = await bench();
  const unsent = await b.save();
  const uncertain = await b.save();
  await b.store.beginTransmission(uncertain.commandId, new Date(START).toISOString());
  await b.store.setCommandState(uncertain.commandId, ['sending'], 'uncertain');
  for (let i = 0; i < 5; i += 1) b.server.commitElsewhere([change('transaction', expense({ amount_minor: '10' }))]);
  b.server.prune(4);
  b.server.snapshotPendingFor(2);
  const outcome = await reconcile(b.store, b.server.remote, options());
  assert.equal(outcome.status, 'synced');
  const state = await b.store.readState();
  assert.equal(state.appliedRevision, String(b.server.groups.length));
  assert.equal((await confirmedIds(b)).length, 5);
  assert.deepEqual((await b.store.readOutbox()).map((c) => [c.commandId, c.state]).sort(), [[unsent.commandId, 'unsent'], [uncertain.commandId, 'uncertain']].sort());
  assert.equal(state.pending.length, 2);
});

test('a snapshot that is not ready in time leaves the diary as it was', async () => {
  b = await bench();
  b.server.commitElsewhere([change('transaction', expense())]);
  b.server.prune(2);
  b.server.snapshotPendingFor(10);
  const before = await b.store.readState();
  assert.equal((await reconcile(b.store, b.server.remote, options(2))).status, 'resync_pending');
  assert.deepEqual(await b.store.readState(), before);
});

test('purged_ack_does_not_resurrect_original_draft', async () => {
  b = await bench();
  const command = await b.save({ amount_minor: '6500' });
  await acknowledge(b, command.commandId);
  const purgedId = command.payload.id;
  // Purged on the server (privacy deletion) before this device pulled the change.
  b.server.commitElsewhere([{ entity: 'transaction', id: purgedId, version: 2, state: 'purged', snapshot: null }]);
  await reconcile(b.store, b.server.remote, options());
  const state = await b.store.readState();
  assert.ok(!(await confirmedIds(b)).includes(purgedId));
  assert.equal(pendingAdjustmentMinor(state), '0');
  assert.deepEqual(state.pending, []);
  assert.deepEqual(await b.store.readOutbox(), []);
});

test('a committed draft deleted elsewhere drops its pending effect and is never re-inserted', async () => {
  b = await bench();
  const command = await b.save({ amount_minor: '6500' });
  await b.store.beginTransmission(command.commandId, new Date(START).toISOString());
  await b.server.remote.sendCreate((await b.store.readOutbox())[0]);
  await b.store.setCommandState(command.commandId, ['sending'], 'uncertain');
  const snapshot = b.server.head(command.payload.id)!.snapshot as Record<string, unknown>;
  b.server.commitElsewhere([{ entity: 'transaction', id: command.payload.id, version: 2, state: 'deleted', snapshot: { ...snapshot, version: 2, deleted_at: '2026-03-03T00:00:00.000Z' } }]);
  await reconcile(b.store, b.server.remote, options());
  const state = await b.store.readState();
  assert.deepEqual(state.confirmed.find((e) => e.id === command.payload.id)?.state, 'deleted');
  assert.deepEqual(state.pending, []);
  assert.deepEqual(await b.store.readOutbox(), []);
  assert.equal(pendingAdjustmentMinor(state), '0');
});

test('pending expenses not yet confirmed are an exact separate adjustment', async () => {
  b = await bench();
  await b.save({ amount_minor: '6500' });
  await b.save({ amount_minor: '99999999999' });
  await b.save({ type: 'income', category_id: undefined } as never).catch(() => undefined);
  assert.equal(pendingAdjustmentMinor(await b.store.readState()), '100000006499');
});

test('if the cursor moves while a page is in flight, the pull continues from the new cursor', async () => {
  b = await bench();
  for (let i = 0; i < 3; i += 1) b.server.commitElsewhere([change('transaction', expense())]);
  let moved = false;
  const racing: SyncRemote = {
    ...b.server.remote,
    async changes(cursor, limit) {
      const page = await b!.server.remote.changes(cursor, limit);
      if (!moved) {
        moved = true;
        // Another pull applied the next group meanwhile.
        await b!.store.applyChangeGroups(b!.server.groups.slice(1, 2), 'cursor-2', 'cursor-1');
      }
      return page;
    },
  };
  assert.equal((await reconcile(b.store, racing, options())).status, 'synced');
  assert.equal((await b.store.readState()).appliedRevision, String(b.server.groups.length));
});
