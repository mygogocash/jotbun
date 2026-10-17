import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { AccountDatabase } from '../../storage/accountDatabase.ts';
import { createMemoryKeyStore } from '../../storage/testing/memoryKeys.ts';
import { createTestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import type { TestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, SAVINGS, category, change, draft, wallet } from '../../storage/testing/diaryFixtures.ts';
import { createSyncScheduler } from '../../sync/scheduler.ts';
import { createSyncEngine } from '../../sync/syncEngine.ts';
import { PROBLEMS, createFakeServer } from '../../sync/testing/fakeServer.ts';
import type { DiarySession } from './spendDiary.ts';
import { createSpendDiary } from './spendDiary.ts';

let files: TestDiaryFiles | undefined;
afterEach(() => files?.dispose());

async function setup(initial: DiarySession = { accountId: ACCOUNT_A, epoch: 1 }) {
  files = createTestDiaryFiles();
  const session = { ...initial };
  const keys = createMemoryKeyStore();
  const database = new AccountDatabase({ files, keys, epoch: () => session.epoch });
  const server = createFakeServer();
  server.commitElsewhere([change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' })), change('category', category())]);
  const diary = createSpendDiary({
    open: (accountId) => database.open(accountId),
    session: () => session,
    now: () => Date.now(),
    newId: () => randomUUID(),
    schemaVersion: 1,
    makeSync: (store, onOutcome) => {
      const engine = createSyncEngine({ store, remote: server.remote, now: () => Date.now(), random: () => 0.5, refreshSession: async () => false, reconcile: { newKey: () => randomUUID(), sleep: async () => undefined } });
      const scheduler = createSyncScheduler({
        flush: async (trigger) => {
          const outcome = await engine.flush({ accountId: store.accountId, epoch: session.epoch }, trigger);
          onOutcome(outcome);
          return outcome;
        },
        now: () => Date.now(),
        setTimer: () => null,
        clearTimer: () => undefined,
      });
      return { engine, scheduler };
    },
  });
  await diary.sessionChanged();
  return { diary, session, server, keys, database };
}

test("opens the signed-in account's diary, syncs it, and saves a draft before resolving", async () => {
  const { diary, server } = await setup();
  assert.equal(diary.getView().phase, 'ready');
  let notified = 0;
  diary.subscribe(() => (notified += 1));
  const entry = draft();
  await diary.saveDraft(entry);
  assert.ok(notified > 0);
  // The draft is persisted when saveDraft resolves; the sync it starts sends it.
  await diary.retry();
  assert.equal(server.records().length, 1);
  assert.deepEqual(diary.getView().pending, []);
  assert.equal(diary.getView().outcome?.status, 'synced');
});

test('a remote sign-in refusal locks the diary and keeps its drafts', async () => {
  const { diary, server, session, database } = await setup();
  const entry = draft();
  server.scriptOthers(PROBLEMS.signedOut());
  server.scriptSends(PROBLEMS.signedOut(), PROBLEMS.signedOut());
  await diary.saveDraft(entry);
  await diary.retry();
  const view = diary.getView();
  assert.equal(view.phase, 'locked');
  assert.equal(view.lockReason, 'signed_out');
  await assert.rejects(diary.saveDraft(draft()));
  session.epoch += 1;
  assert.deepEqual((await (await database.open(ACCOUNT_A)).readState()).pending.map((e) => e.id), [entry.id]);
});

test("switching accounts never shows or sends another account's drafts", async () => {
  const { diary, session, server } = await setup();
  // Offline, so A's draft stays waiting on the device.
  server.setOffline(true);
  const forA = draft();
  await diary.saveDraft(forA);
  Object.assign(session, { accountId: ACCOUNT_B, epoch: 2 });
  await diary.sessionChanged();
  assert.equal(diary.getView().phase, 'ready');
  assert.deepEqual(diary.getView().pending, []);
  Object.assign(session, { accountId: ACCOUNT_A, epoch: 3 });
  await diary.sessionChanged();
  assert.deepEqual(diary.getView().pending.map((e) => e.id), [forA.id]);
});

test('signed out means no diary: saving is refused rather than kept somewhere unencrypted', async () => {
  const { diary, session } = await setup();
  Object.assign(session, { accountId: null, epoch: 2 });
  await diary.sessionChanged();
  assert.equal(diary.getView().phase, 'unavailable');
  await assert.rejects(diary.saveDraft(draft()));
});

test('a diary whose key is gone is locked with its reason, never replaced', async () => {
  const { diary, keys, session } = await setup();
  await diary.saveDraft(draft());
  await keys.delete(ACCOUNT_A);
  session.epoch += 1;
  await diary.sessionChanged();
  assert.deepEqual([diary.getView().phase, diary.getView().lockReason], ['locked', 'key_missing']);
});

test('a failed local save is reported and nothing is shown as saved', async () => {
  const { diary } = await setup();
  await assert.rejects(diary.saveDraft(draft({ wallet_id: randomUUID() } as never)));
  assert.deepEqual(diary.getView().pending, []);
  assert.deepEqual(diary.getView().outbox, []);
});
