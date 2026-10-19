import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { AccountDatabase } from '../../storage/accountDatabase.ts';
import { deviceDiaryFiles as webDiaryFiles } from '../../storage/database.web.ts';
import { createMemoryKeyStore } from '../../storage/testing/memoryKeys.ts';
import { createTestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import type { TestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, SAVINGS, category, change, draft, wallet } from '../../storage/testing/diaryFixtures.ts';
import { createSyncScheduler } from '../../sync/scheduler.ts';
import { createSyncEngine } from '../../sync/syncEngine.ts';
import { PROBLEMS, createFakeServer } from '../../sync/testing/fakeServer.ts';
import type { DiaryStore } from '../../storage/diaryRepository.ts';
import { DiarySchemaTooNew } from '../../storage/types.ts';
import type { SyncSession } from '../../sync/types.ts';
import { newJourney } from './importReview.ts';
import type { ImportJourney } from './importReview.ts';
import type { DiarySession } from './spendDiary.ts';
import { createSpendDiary } from './spendDiary.ts';

let files: TestDiaryFiles | undefined;
afterEach(() => files?.dispose());

async function setup(initial: DiarySession = { accountId: ACCOUNT_A, epoch: 1 }, options: { seed?: boolean } = {}) {
  files = createTestDiaryFiles();
  const session = { ...initial };
  // The installation-wide epoch follows the session unless a test moves it on its own.
  const installation: { epoch: number | null } = { epoch: null };
  const keys = createMemoryKeyStore();
  const database = new AccountDatabase({ files, keys, epoch: () => installation.epoch ?? session.epoch });
  const server = createFakeServer();
  if (options.seed !== false) server.commitElsewhere([change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' })), change('category', category())]);
  const record = { opens: 0, flushedAs: [] as SyncSession[], timers: [] as number[], erasedWithDiary: [] as string[], legacyErased: [] as string[] };
  const diary = createSpendDiary({
    open: (accountId, epoch) => {
      record.opens += 1;
      return database.open(accountId, epoch);
    },
    discard: (accountId) => database.discard(accountId),
    eraseWithDiary: async (accountId) => void record.erasedWithDiary.push(accountId),
    eraseLegacyImportDraft: async (accountId) => void record.legacyErased.push(accountId),
    session: () => session,
    now: () => Date.now(),
    newId: () => randomUUID(),
    schemaVersion: 1,
    makeSync: (store, current, report) => {
      const engine = createSyncEngine({
        store, remote: server.remote, now: () => Date.now(), random: () => 0.5, refreshSession: async () => false,
        reconcile: { newKey: () => randomUUID(), sleep: async () => undefined }, onProgress: report.progress,
      });
      const scheduler = createSyncScheduler({
        flush: (trigger) => {
          record.flushedAs.push(current);
          return engine.flush(current, trigger);
        },
        now: () => Date.now(),
        setTimer: (_fn, ms) => (record.timers.push(ms), null),
        clearTimer: () => undefined,
        onOutcome: report.outcome,
      });
      return { engine, scheduler };
    },
  });
  await diary.sessionChanged();
  return { diary, session, installation, server, keys, database, record };
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

// S4 review fixes.

test('a session notification for the same identity keeps the open diary and its sync', async () => {
  const { diary, record, server } = await setup();
  await diary.saveDraft(draft());
  await diary.sessionChanged(); // e.g. a token refresh: same account, same epoch
  assert.equal(record.opens, 1);
  assert.equal(diary.getView().phase, 'ready');
  await diary.retry();
  assert.equal(server.records().length, 1);
});

test('a diary opens and flushes only for the session epoch it belongs to', async () => {
  const { diary, installation, record } = await setup();
  assert.deepEqual(record.flushedAs.at(-1), { accountId: ACCOUNT_A, epoch: 1 });
  // Another identity signs in (installation epoch 2) while the controller still names A at epoch 1.
  installation.epoch = 2;
  await diary.close();
  await diary.sessionChanged();
  assert.notEqual(diary.getView().phase, 'ready');
  await assert.rejects(diary.saveDraft(draft()));
});

test('a superseded session change never overwrites the newer view', async () => {
  let opened = 0;
  const fakeStore = (): DiaryStore => ({
    accountId: ACCOUNT_A,
    lock: () => new Promise<void>((resolve) => setTimeout(resolve, opened === 1 ? 30 : 0)),
    readState: async () => ({ cursor: null, appliedRevision: '0', confirmed: [], pending: [], walletTotals: {} }),
    readOutbox: async () => [],
  }) as unknown as DiaryStore;
  let epoch = 1;
  const diary = createSpendDiary({
    open: async () => ((opened += 1), fakeStore()),
    discard: async () => undefined,
    session: () => ({ accountId: ACCOUNT_A, epoch }),
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: () => ({ engine: { flush: async () => ({}) } as never, scheduler: { launch: async () => undefined, stop: () => undefined } as never }),
  });
  await diary.sessionChanged();
  epoch = 2;
  const older = diary.sessionChanged(); // closes store 1 slowly
  epoch = 3;
  const newer = diary.sessionChanged();
  await newer;
  await older;
  assert.equal(diary.getView().phase, 'ready');
});

test("a superseded open of another account's diary is closed", async () => {
  const locked: string[] = [];
  let release: () => void = () => undefined;
  let session: DiarySession = { accountId: ACCOUNT_A, epoch: 1 };
  const diary = createSpendDiary({
    open: async (accountId) => {
      if (accountId === ACCOUNT_A) await new Promise<void>((resolve) => (release = resolve));
      return { accountId, lock: async () => void locked.push(accountId), readState: async () => ({ cursor: null, appliedRevision: '0', confirmed: [], pending: [], walletTotals: {} }), readOutbox: async () => [] } as unknown as DiaryStore;
    },
    discard: async () => undefined,
    session: () => session,
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: () => ({ engine: { flush: async () => ({}) } as never, scheduler: { launch: async () => undefined, stop: () => undefined } as never }),
  });
  const forA = diary.sessionChanged();
  await new Promise((resolve) => setTimeout(resolve, 0)); // A's open is under way
  session = { accountId: ACCOUNT_B, epoch: 2 };
  await diary.sessionChanged();
  release();
  await forA;
  assert.deepEqual(locked, [ACCOUNT_A]);
  assert.equal(diary.getView().phase, 'ready');
});

test('a diary written by a newer app version is locked with that reason', async () => {
  const diary = createSpendDiary({
    open: async () => {
      throw new DiarySchemaTooNew();
    },
    discard: async () => undefined,
    session: () => ({ accountId: ACCOUNT_A, epoch: 1 }),
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: () => {
      throw new Error('never synced');
    },
  });
  await diary.sessionChanged();
  assert.deepEqual([diary.getView().phase, diary.getView().lockReason], ['locked', 'schema_too_new']);
});

test('synced wallets and categories are in the view, for forms that work offline', async () => {
  const { diary } = await setup();
  assert.deepEqual(diary.getView().wallets.map((w) => w.name).sort(), ['Cash', 'Savings']);
  assert.deepEqual(diary.getView().categories.map((c) => c.type), ['expense']);
});

test('a wallet created online moments ago is pulled once before a device save', async () => {
  const { diary, server } = await setup(undefined, { seed: false });
  server.commitElsewhere([change('wallet', wallet()), change('category', category())]);
  const entry = draft();
  await diary.saveDraft(entry);
  assert.deepEqual(diary.getView().pending.map((e) => e.id), [entry.id]);
});

test('saving the same draft twice under one command id saves it once', async () => {
  const { diary, server } = await setup();
  server.setOffline(true);
  const entry = draft();
  const commandId = randomUUID();
  await diary.saveDraft(entry, commandId);
  await diary.saveDraft(entry, commandId);
  assert.deepEqual(diary.getView().outbox.map((c) => c.commandId), [commandId]);
});

test('an unsent draft can be undone on the device; a needs-review draft can be discarded', async () => {
  const { diary, server } = await setup();
  server.setOffline(true);
  await diary.saveDraft(draft());
  await diary.removeDraft(diary.getView().outbox[0].commandId);
  assert.deepEqual([diary.getView().pending, diary.getView().outbox], [[], []]);
  server.setOffline(false);
  server.scriptSends(PROBLEMS.invalid());
  await diary.saveDraft(draft());
  await diary.retry();
  const [reviewed] = diary.getView().outbox;
  assert.equal(reviewed.state, 'needs_review');
  await diary.discardDraft(reviewed.commandId);
  assert.deepEqual([diary.getView().pending, diary.getView().outbox], [[], []]);
});

test('a locked diary can be discarded and starts over from the synced diary', async () => {
  const { diary, keys, session } = await setup();
  await keys.delete(ACCOUNT_A);
  session.epoch += 1;
  await diary.sessionChanged();
  assert.equal(diary.getView().lockReason, 'key_missing');
  await diary.discardDiary();
  assert.equal(diary.getView().phase, 'ready');
  assert.equal(diary.getView().wallets.length, 2);
});

test("an explicit sign-out erases only this account's diary on the device", async () => {
  const { diary, session, server, database, installation } = await setup();
  server.setOffline(true);
  await diary.saveDraft(draft());
  Object.assign(session, { accountId: ACCOUNT_B, epoch: 2 });
  await diary.sessionChanged();
  server.setOffline(false);
  await diary.retry();
  server.setOffline(true);
  const forB = draft();
  await diary.saveDraft(forB);
  Object.assign(session, { accountId: ACCOUNT_A, epoch: 3 });
  await diary.sessionChanged();
  await diary.eraseForSignOut();
  assert.equal(diary.getView().phase, 'unavailable');
  installation.epoch = 4;
  assert.deepEqual((await (await database.open(ACCOUNT_A)).readState()).pending, []);
  assert.deepEqual((await (await database.open(ACCOUNT_B)).readState()).pending.map((e) => e.id), [forB.id]);
});

test("an explicit sign-out also erases the account's other on-device copies (the import draft); a diary discard does not", async () => {
  const { diary, record } = await setup();
  await diary.discardDiary();
  assert.deepEqual(record.erasedWithDiary, []);
  await diary.eraseForSignOut();
  assert.deepEqual(record.erasedWithDiary, [ACCOUNT_A]);
});

test('a sync run reports live n-of-m progress, then clears it', async () => {
  const { diary, server } = await setup();
  server.setOffline(true);
  for (let i = 0; i < 3; i += 1) await diary.saveDraft(draft());
  server.setOffline(false);
  const seen: string[] = [];
  diary.subscribe(() => {
    const progress = diary.getView().progress;
    if (progress) seen.push(`${progress.sent}/${progress.total}`);
  });
  await diary.retry();
  assert.ok(seen.includes('1/3') && seen.includes('3/3'), `progress seen: ${seen.join(', ')}`);
  assert.equal(diary.getView().progress, null);
});

test('after launch a foreground timer is armed even when the first flush waits', async () => {
  files = createTestDiaryFiles();
  const timers: number[] = [];
  const server = createFakeServer();
  server.setOffline(true);
  const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => 1 });
  const diary = createSpendDiary({
    open: (accountId, epoch) => database.open(accountId, epoch),
    discard: (accountId) => database.discard(accountId),
    session: () => ({ accountId: ACCOUNT_A, epoch: 1 }),
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: (store, current, report) => {
      const engine = createSyncEngine({ store, remote: server.remote, now: () => Date.now(), random: () => 0.5, refreshSession: async () => false, reconcile: { newKey: () => randomUUID(), sleep: async () => undefined } });
      const scheduler = createSyncScheduler({ flush: (trigger) => engine.flush(current, trigger), now: () => Date.now(), setTimer: (_fn, ms) => (timers.push(ms), null), clearTimer: () => undefined, onOutcome: report.outcome });
      return { engine, scheduler };
    },
  });
  await diary.sessionChanged();
  assert.equal(diary.getView().outcome?.status, 'waiting');
  assert.equal(timers.length, 1);
});

// Decision 7: the import review draft lives in the open account's diary.

const IMPORT_JOB = '3a000000-0000-4000-8000-000000000001';
const reviewing = (): ImportJourney => ({ ...newJourney(), stage: 'review', jobId: IMPORT_JOB });

test("the import draft store is the open account's, inside its diary, and follows the session", async () => {
  const { diary, session, record } = await setup();
  const forA = diary.importDraftStore();
  assert.ok(forA);
  assert.equal(diary.importDraftStore(), forA, 'one store while the same diary is open');
  await forA.save(reviewing());
  // Its first use removed A's plain-text copy from an older build.
  assert.deepEqual(record.legacyErased, [ACCOUNT_A]);

  Object.assign(session, { accountId: ACCOUNT_B, epoch: 2 });
  await diary.sessionChanged();
  const forB = diary.importDraftStore();
  assert.ok(forB);
  assert.notEqual(forB, forA);
  assert.equal(await forB.load(), null);
  // A's store, held from before the switch, never reads or writes B's diary.
  await assert.rejects(forA.load());
  await assert.rejects(forA.save(newJourney()));
  assert.equal(await forB.load(), null);

  Object.assign(session, { accountId: ACCOUNT_A, epoch: 3 });
  await diary.sessionChanged();
  assert.equal((await diary.importDraftStore()?.load())?.jobId, IMPORT_JOB);
});

test('no import draft store while no diary is open: opening, locked, signed out, or no local diary (web)', async () => {
  let release: () => void = () => undefined;
  const opening = createSpendDiary({
    open: async (accountId) => {
      await new Promise<void>((resolve) => (release = resolve));
      return { accountId, lock: async () => undefined, readState: async () => ({ cursor: null, appliedRevision: '0', confirmed: [], pending: [], walletTotals: {} }), readOutbox: async () => [] } as unknown as DiaryStore;
    },
    discard: async () => undefined,
    session: () => ({ accountId: ACCOUNT_A, epoch: 1 }),
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: () => ({ engine: { flush: async () => ({}) } as never, scheduler: { launch: async () => undefined, stop: () => undefined } as never }),
  });
  const opened = opening.sessionChanged();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(opening.getView().phase, 'opening');
  assert.equal(opening.importDraftStore(), null);
  release();
  await opened;
  assert.ok(opening.importDraftStore());

  const { diary, keys, session } = await setup();
  await keys.delete(ACCOUNT_A);
  session.epoch += 1;
  await diary.sessionChanged();
  assert.equal(diary.getView().phase, 'locked');
  assert.equal(diary.importDraftStore(), null);
  Object.assign(session, { accountId: null, epoch: session.epoch + 1 });
  await diary.sessionChanged();
  assert.equal(diary.importDraftStore(), null);

  const web = createSpendDiary({
    open: (accountId, epoch) => new AccountDatabase({ files: webDiaryFiles(), keys: createMemoryKeyStore(), epoch: () => 1 }).open(accountId, epoch),
    discard: async () => undefined,
    session: () => ({ accountId: ACCOUNT_A, epoch: 1 }),
    now: () => Date.now(), newId: () => randomUUID(), schemaVersion: 1,
    makeSync: () => {
      throw new Error('never synced');
    },
  });
  await web.sessionChanged();
  assert.equal(web.getView().phase, 'unavailable');
  assert.equal(web.importDraftStore(), null);
});

test("the explicit sign-out erase takes the diary's import draft with it", async () => {
  const { diary, session, record } = await setup();
  await diary.importDraftStore()?.save(reviewing());
  await diary.eraseForSignOut();
  assert.equal(diary.importDraftStore(), null);
  // An older build's plain-text copy is erased with the diary too (eraseWithDiary).
  assert.deepEqual(record.erasedWithDiary, [ACCOUNT_A]);
  session.epoch += 1;
  await diary.sessionChanged();
  assert.equal(diary.getView().phase, 'ready');
  assert.equal(await diary.importDraftStore()?.load(), null);
});
