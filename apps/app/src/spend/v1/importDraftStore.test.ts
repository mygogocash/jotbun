import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { AccountDatabase } from '../../storage/accountDatabase.ts';
import { ACCOUNT_A, ACCOUNT_B } from '../../storage/testing/diaryFixtures.ts';
import { createMemoryKeyStore } from '../../storage/testing/memoryKeys.ts';
import { createTestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import type { TestDiaryFiles } from '../../storage/testing/nodeSqlite.ts';
import { DiaryLocked, StaleEpochError } from '../../storage/types.ts';
import { IMPORT_DRAFT_KEY_PREFIX, createDiaryDraftStore, createStorageDraftStore, diaryDraftStorage, eraseImportDrafts } from './importDraftStore.ts';
import type { DraftStorage } from './importDraftStore.ts';
import {
  awaitPreview,
  confirmBatches,
  discardImport,
  freezeSelection,
  mapCategory,
  mapWallet,
  markReviewed,
  newJourney,
  progressCounts,
  resumeImport,
  selectRows,
  startUpload,
} from './importReview.ts';
import type { ImportDeps, ImportDraftStore, ImportJourney } from './importReview.ts';
import type { ImportFile } from './imports.ts';
import { JOB_ID, createFakeImportServer, syntheticCandidates } from './testing/fakeImportServer.ts';

const CASH = '0000000a-0000-4000-8000-000000000001';
const BANK = '0000000a-0000-4000-8000-000000000002';
const FOOD = '0000000c-0000-4000-8000-000000000001';
const SALARY = '0000000c-0000-4000-8000-000000000004';
const FILE: ImportFile = { bytes: new TextEncoder().encode('date,amount\n2026-01-02,65\n'), contentType: 'text/csv', name: 'statement.csv' };

/** A key-value port over a Map (AsyncStorage's shape, also the legacy plain-text store). A restart is a new store over the same map. */
function deviceStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  const calls = { failWrites: false };
  const storage: DraftStorage = {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      if (calls.failWrites) throw new Error('disk full');
      map.set(key, value);
    },
    removeItem: async (key) => void map.delete(key),
    getAllKeys: async () => [...map.keys()],
  };
  return { map, storage, calls };
}

let sequence = 0;
const newId = () => `11111111-0000-4000-8000-${(sequence += 1).toString(16).padStart(12, '0')}`;

function setup(count: number, store: ImportDraftStore) {
  const server = createFakeImportServer({ candidates: syntheticCandidates(count), statuses: ['ready'] });
  const deps: ImportDeps = { resources: server.resources, store, newId, sleep: async () => undefined, pollMs: 1, maxPolls: 5 };
  return { server, deps };
}

async function reviewedJourney(deps: ImportDeps): Promise<ImportJourney> {
  let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
  const all = (journey.preview?.candidates ?? []).map((row) => row.source_row_id);
  journey = markReviewed(selectRows(journey, all, true), all);
  journey = mapCategory(mapCategory(mapWallet(mapWallet(journey, 'Cash', CASH), 'Bank', BANK), 'expense', 'food', FOOD), 'income', 'salary', SALARY);
  return journey;
}

describe('the import draft store over a key-value port', () => {
  test('is empty until something is saved', async () => {
    const { storage } = deviceStorage();
    assert.equal(await createStorageDraftStore(storage, ACCOUNT_A).load(), null);
  });

  test('saves the whole journey and loads it back exactly', async () => {
    const { storage, map } = deviceStorage();
    const store = createStorageDraftStore(storage, ACCOUNT_A);
    const { deps } = setup(6, store);
    const journey = await freezeSelection(await reviewedJourney(deps), deps);
    await store.save(journey);
    assert.deepEqual(await store.load(), journey);
    // One key per account; the envelope names the account and the job.
    assert.deepEqual([...map.keys()], [`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`]);
    const envelope = JSON.parse(map.get(`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`) as string) as { version: number; account_id: string; job_id: string };
    assert.deepEqual([envelope.version, envelope.account_id, envelope.job_id], [1, ACCOUNT_A, JOB_ID]);
  });

  test('survives a restart: a new store over the same storage resumes and resolves the pending batch first', async () => {
    const { storage, map } = deviceStorage();
    const first = setup(700, createStorageDraftStore(storage, ACCOUNT_A));
    let journey = await freezeSelection(await reviewedJourney(first.deps), first.deps);
    first.server.script('confirm', { kind: 'network_after' });
    journey = await confirmBatches(journey, first.deps);
    const pending = journey.pendingBatch;
    assert.ok(pending);
    assert.equal(journey.problem?.kind, 'unconfirmed');

    // The app restarts: nothing but the device's storage is left.
    const restarted = createStorageDraftStore(storage, ACCOUNT_A);
    const resumed = await resumeImport({ store: restarted });
    assert.deepEqual(resumed?.pendingBatch, pending);
    assert.deepEqual(resumed?.selection, journey.selection);
    assert.deepEqual(resumed?.selected, journey.selected);
    assert.deepEqual(resumed?.mapping, journey.mapping);
    assert.deepEqual(resumed?.reviewed, journey.reviewed);
    // The same server saw the committed batch; resending the same key replays it and the rest follows.
    const done = await confirmBatches(resumed as ImportJourney, { ...first.deps, store: restarted });
    assert.equal(done.stage, 'done');
    assert.equal(first.server.callsOf('confirm')[1].key, pending.key);
    assert.equal(first.server.transactions().length, 700);
    assert.deepEqual(progressCounts(done), { selected: 700, committed: 700, remaining: 0, conflicted: 0 });
    // Finished: every outcome known, so the draft is cleared.
    assert.equal(map.size, 0);
    assert.equal(await restarted.load(), null);
  });

  test('a journey that is discarded, or finished, leaves nothing on the device', async () => {
    const { storage, map } = deviceStorage();
    const store = createStorageDraftStore(storage, ACCOUNT_A);
    const { deps } = setup(3, store);
    await reviewedJourney(deps);
    assert.equal(map.size, 1);
    await discardImport(deps);
    assert.equal(map.size, 0);
    assert.equal(await store.load(), null);
  });

  test("an account's draft is its own: another account loads nothing, and clearing one leaves the other", async () => {
    const { storage, map } = deviceStorage();
    const a = createStorageDraftStore(storage, ACCOUNT_A);
    const b = createStorageDraftStore(storage, ACCOUNT_B);
    await a.save({ ...newJourney(), stage: 'review', jobId: JOB_ID });
    assert.equal(await b.load(), null);
    await b.save({ ...newJourney(), stage: 'failed' });
    assert.equal((await a.load())?.stage, 'review');
    await b.clear();
    assert.equal(await b.load(), null);
    assert.equal((await a.load())?.jobId, JOB_ID);
    assert.equal(map.size, 1);
    // The envelope under A's key naming B is never resumed as A's (and is removed).
    map.set(`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`, JSON.stringify({ version: 1, account_id: ACCOUNT_B, job_id: null, journey: newJourney() }));
    assert.equal(await a.load(), null);
    assert.equal(map.size, 0);
  });

  test('sign-out erase removes the account draft only; erasing every draft keeps unrelated keys', async () => {
    const { storage, map } = deviceStorage({ 'gogospend.reminder.v1': '{"enabled":true,"localTime":"20:00"}' });
    await createStorageDraftStore(storage, ACCOUNT_A).save(newJourney());
    await createStorageDraftStore(storage, ACCOUNT_B).save(newJourney());
    await eraseImportDrafts(storage, ACCOUNT_A);
    assert.deepEqual([...map.keys()].sort(), [`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_B}`, 'gogospend.reminder.v1'].sort());
    await eraseImportDrafts(storage);
    assert.deepEqual([...map.keys()], ['gogospend.reminder.v1']);
    await assert.rejects(eraseImportDrafts(storage, 'not-an-account'), RangeError);
  });

  test('a draft that cannot be trusted is no draft: corrupt text and a wrong shape are dropped', async () => {
    const { storage, map } = deviceStorage();
    const key = `${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`;
    const store = createStorageDraftStore(storage, ACCOUNT_A);
    map.set(key, '{not json');
    assert.equal(await store.load(), null);
    assert.equal(map.has(key), false);
    map.set(key, JSON.stringify({ version: 1, account_id: ACCOUNT_A, job_id: null, journey: { stage: 'bogus' } }));
    assert.equal(await store.load(), null);
    assert.equal(map.has(key), false);
    map.set(key, JSON.stringify({ version: 1, account_id: ACCOUNT_A, job_id: null, journey: { ...newJourney(), pendingBatch: { key: 1 } } }));
    assert.equal(await store.load(), null);
  });

  test("a newer app's draft is left in place, not read and not deleted", async () => {
    const { storage, map } = deviceStorage();
    const key = `${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`;
    const future = JSON.stringify({ version: 2, account_id: ACCOUNT_A, job_id: null, journey: { anything: true } });
    map.set(key, future);
    assert.equal(await createStorageDraftStore(storage, ACCOUNT_A).load(), null);
    assert.equal(map.get(key), future);
  });

  test('a device that cannot store rejects the save, so the journey never claims a draft it does not have', async () => {
    const { storage, calls } = deviceStorage();
    const store = createStorageDraftStore(storage, ACCOUNT_A);
    calls.failWrites = true;
    await assert.rejects(store.save(newJourney()), /disk full/);
    assert.equal(await store.load(), null);
  });

  test('refuses a store for anything but an account id', () => {
    assert.throws(() => createStorageDraftStore(deviceStorage().storage, '../escape'), RangeError);
  });
});

// Decision 7: the same store and envelope, over the encrypted diary's draft rows.
describe('the import draft store inside the encrypted diary', () => {
  let files: TestDiaryFiles | undefined;
  afterEach(() => files?.dispose());

  async function openDiary() {
    files?.dispose();
    files = createTestDiaryFiles();
    const session = { epoch: 1 };
    const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => session.epoch });
    const diary = await database.open(ACCOUNT_A);
    return { database, diary, session, rows: diaryDraftStorage(diary) };
  }
  const key = `${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_A}`;

  test('keeps the whole journey in the diary, and a restart resumes it', async () => {
    const { database, diary, rows } = await openDiary();
    const store = createDiaryDraftStore(diary);
    const { deps } = setup(6, store);
    const journey = await freezeSelection(await reviewedJourney(deps), deps);
    await store.save(journey);
    assert.deepEqual(await rows.getAllKeys(), [key]);
    const envelope = JSON.parse((await rows.getItem(key)) as string) as { version: number; account_id: string; job_id: string };
    assert.deepEqual([envelope.version, envelope.account_id, envelope.job_id], [1, ACCOUNT_A, JOB_ID]);
    await diary.lock();
    const restarted = createDiaryDraftStore(await database.open(ACCOUNT_A));
    assert.deepEqual(await restarted.load(), journey);
    await restarted.clear();
    assert.equal(await restarted.load(), null);
  });

  test('a draft naming another account is never returned, and is removed', async () => {
    const { diary, rows } = await openDiary();
    await rows.setItem(key, JSON.stringify({ version: 1, account_id: ACCOUNT_B, job_id: null, journey: newJourney() }));
    assert.equal(await createDiaryDraftStore(diary).load(), null);
    assert.deepEqual(await rows.getAllKeys(), []);
  });

  test('a corrupt draft is removed', async () => {
    const { diary, rows } = await openDiary();
    const store = createDiaryDraftStore(diary);
    await rows.setItem(key, '{not json');
    assert.equal(await store.load(), null);
    assert.equal(await rows.getItem(key), null);
    await rows.setItem(key, JSON.stringify({ version: 1, account_id: ACCOUNT_A, job_id: null, journey: { stage: 'bogus' } }));
    assert.equal(await store.load(), null);
    assert.equal(await rows.getItem(key), null);
  });

  test("a newer app's draft is left alone", async () => {
    const { diary, rows } = await openDiary();
    const future = JSON.stringify({ version: 2, account_id: ACCOUNT_A, job_id: null, journey: { anything: true } });
    await rows.setItem(key, future);
    assert.equal(await createDiaryDraftStore(diary).load(), null);
    assert.equal(await rows.getItem(key), future);
  });

  test('a locked or superseded diary refuses, so the journey never claims a draft it does not have', async () => {
    const { database, diary, session } = await openDiary();
    const store = createDiaryDraftStore(diary);
    await diary.lock();
    await assert.rejects(store.save(newJourney()), (error) => error instanceof DiaryLocked);
    await assert.rejects(store.load(), (error) => error instanceof DiaryLocked);
    const current = createDiaryDraftStore(await database.open(ACCOUNT_A));
    session.epoch = 2;
    await assert.rejects(current.save(newJourney()), (error) => error instanceof StaleEpochError);
  });

  test('the sign-out and device-reset erases work over the diary rows too', async () => {
    const { diary, rows } = await openDiary();
    await createDiaryDraftStore(diary).save(newJourney());
    await rows.setItem(`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_B}`, '{}');
    await eraseImportDrafts(rows, ACCOUNT_A);
    assert.deepEqual(await rows.getAllKeys(), [`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_B}`]);
    await eraseImportDrafts(rows);
    assert.deepEqual(await rows.getAllKeys(), []);
  });

  test("its first use removes the account's leftover plain-text (AsyncStorage) draft, and only that account's", async () => {
    const { diary } = await openDiary();
    const legacy = deviceStorage({ 'gogospend.reminder.v1': '{"enabled":true,"localTime":"20:00"}' });
    await createStorageDraftStore(legacy.storage, ACCOUNT_A).save({ ...newJourney(), stage: 'review', jobId: JOB_ID });
    await createStorageDraftStore(legacy.storage, ACCOUNT_B).save(newJourney());
    const erased: string[] = [];
    const store = createDiaryDraftStore(diary, async (accountId) => {
      erased.push(accountId);
      await eraseImportDrafts(legacy.storage, accountId);
    });
    // The plain-text draft is not carried over: the diary has none, and the old copy is gone.
    assert.equal(await store.load(), null);
    assert.deepEqual(erased, [ACCOUNT_A]);
    assert.deepEqual([...legacy.map.keys()].sort(), [`${IMPORT_DRAFT_KEY_PREFIX}${ACCOUNT_B}`, 'gogospend.reminder.v1'].sort());
    // Once is enough while this diary is open.
    await store.save(newJourney());
    await store.load();
    assert.deepEqual(erased, [ACCOUNT_A]);
  });

  test('a leftover draft that cannot be removed yet never blocks the diary draft, and is tried again', async () => {
    const { diary } = await openDiary();
    let failures = 1;
    const erased: string[] = [];
    const store = createDiaryDraftStore(diary, async (accountId) => {
      erased.push(accountId);
      if (failures-- > 0) throw new Error('storage busy');
    });
    await store.save({ ...newJourney(), stage: 'failed' });
    assert.equal((await store.load())?.stage, 'failed');
    assert.deepEqual(erased, [ACCOUNT_A, ACCOUNT_A]);
  });
});
