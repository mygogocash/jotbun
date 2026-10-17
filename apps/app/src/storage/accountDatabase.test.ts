import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { AccountDatabase } from './accountDatabase.ts';
import { DIARY_MIGRATIONS } from './migrations.ts';
import { createMemoryKeyStore } from './testing/memoryKeys.ts';
import { createTestDiaryFiles } from './testing/nodeSqlite.ts';
import type { TestDiaryFiles } from './testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, change, draft, expense, group, outbox, wallet } from './testing/diaryFixtures.ts';
import { DiaryLocked, DiarySchemaTooNew, StaleEpochError } from './types.ts';

let files: TestDiaryFiles;
afterEach(() => files?.dispose());

function setup() {
  files = createTestDiaryFiles();
  const keys = createMemoryKeyStore();
  const session = { epoch: 1 };
  const database = new AccountDatabase({ files, keys, epoch: () => session.epoch });
  return { keys, session, database };
}

const lockedFor = (reason: string) => (error: unknown) => error instanceof DiaryLocked && error.reason === reason;

test('a new account gets its own keyed, migrated diary that survives a restart', async () => {
  const { keys, database } = setup();
  const store = await database.open(ACCOUNT_A);
  assert.match((await keys.get(ACCOUNT_A)) ?? '', /^[0-9a-f]{64}$/);
  const raw = files.raw(files.names()[0]);
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, DIARY_MIGRATIONS[DIARY_MIGRATIONS.length - 1].version);
  raw.close();
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1');
  await store.lock();
  const reopened = await database.open(ACCOUNT_A);
  const state = await reopened.readState();
  assert.equal(state.cursor, 'cursor-1');
  assert.deepEqual(state.walletTotals, { [wallet().id]: '100000' });
});

test('two accounts with the same entity ids never see each other', async () => {
  const { database } = setup();
  const shared = expense({ amount_minor: '100' });
  const a = await database.open(ACCOUNT_A);
  const b = await database.open(ACCOUNT_B);
  await a.applyChangeGroups([group(1, change('wallet', wallet()), change('transaction', shared))], 'a-1');
  await b.applyChangeGroups([group(1, change('wallet', wallet({ opening_minor: '0' })), change('transaction', { ...shared, amount_minor: '777' }))], 'b-1');
  const [stateA, stateB] = [await a.readState(), await b.readState()];
  assert.equal((stateA.confirmed.find((e) => e.id === shared.id)?.snapshot as { amount_minor: string }).amount_minor, '100');
  assert.equal((stateB.confirmed.find((e) => e.id === shared.id)?.snapshot as { amount_minor: string }).amount_minor, '777');
  assert.deepEqual(stateA.walletTotals, { [wallet().id]: '99900' });
  assert.deepEqual(stateB.walletTotals, { [wallet().id]: '-777' });
  assert.equal(files.names().length, 2);
});

test('a missing key locks the diary instead of creating an empty replacement, until an explicit discard', async () => {
  const { keys, database } = setup();
  const store = await database.open(ACCOUNT_A);
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1');
  await store.lock();
  await keys.delete(ACCOUNT_A);
  await assert.rejects(database.open(ACCOUNT_A), lockedFor('key_missing'));
  assert.equal(files.names().length, 1, 'the encrypted diary is kept');
  await database.discard(ACCOUNT_A);
  assert.equal(files.names().length, 0);
  const fresh = await database.open(ACCOUNT_A);
  assert.equal((await fresh.readState()).cursor, null);
});

test('a rejected key locks the diary', async () => {
  const { keys, database } = setup();
  await (await database.open(ACCOUNT_A)).lock();
  keys.keys.set(ACCOUNT_A, 'f'.repeat(64));
  await assert.rejects(database.open(ACCOUNT_A), lockedFor('key_rejected'));
});

test("a diary recorded for another account refuses to open", async () => {
  const { database } = setup();
  await (await database.open(ACCOUNT_A)).lock();
  const raw = files.raw(files.names()[0]);
  raw.prepare(`UPDATE diary_meta SET value = ? WHERE key = 'account_id'`).run(ACCOUNT_B);
  raw.close();
  await assert.rejects(database.open(ACCOUNT_A), lockedFor('wrong_account'));
});

test('a failing migration rolls back, leaving the diary usable at its previous version', async () => {
  const { keys, session } = setup();
  const v1 = new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: DIARY_MIGRATIONS.slice(0, 1) });
  const store = await v1.open(ACCOUNT_A);
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1');
  await store.lock();
  const broken = [...DIARY_MIGRATIONS.slice(0, 1), { version: 2, statements: ['CREATE TABLE half_done (x TEXT)', 'THIS IS NOT SQL'] }];
  await assert.rejects(new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: broken }).open(ACCOUNT_A));
  const raw = files.raw(files.names()[0]);
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
  assert.equal(raw.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'half_done'`).get()?.n, 0);
  raw.close();
  assert.equal((await (await v1.open(ACCOUNT_A)).readState()).cursor, 'cursor-1');
});

test('a diary from a newer app version is refused, not downgraded', async () => {
  const { database } = setup();
  await (await database.open(ACCOUNT_A)).lock();
  const raw = files.raw(files.names()[0]);
  raw.exec('PRAGMA user_version = 999');
  raw.close();
  await assert.rejects(database.open(ACCOUNT_A), (error) => error instanceof DiarySchemaTooNew);
});

test('a locked store refuses every operation; data stays for the next unlock', async () => {
  const { database } = setup();
  const store = await database.open(ACCOUNT_A);
  const entry = draft();
  await store.savePending(entry, outbox(entry));
  await store.lock();
  await assert.rejects(store.readOutbox(), lockedFor('locked'));
  const another = draft();
  await assert.rejects(store.savePending(another, outbox(another)), lockedFor('locked'));
  await assert.rejects(store.applyChangeGroups([], 'c'), lockedFor('locked'));
  assert.equal((await (await database.open(ACCOUNT_A)).readOutbox()).length, 1);
});

test("erase drops only that account's diary and key", async () => {
  const { keys, database } = setup();
  const a = await database.open(ACCOUNT_A);
  const b = await database.open(ACCOUNT_B);
  const entry = draft();
  await a.savePending(entry, outbox(entry));
  await a.eraseAfterConfirmation();
  assert.equal(await keys.get(ACCOUNT_A), null);
  assert.notEqual(await keys.get(ACCOUNT_B), null);
  assert.equal(files.names().length, 1);
  await assert.rejects(a.readOutbox(), lockedFor('locked'));
  assert.deepEqual(await (await database.open(ACCOUNT_A)).readOutbox(), []);
  assert.deepEqual(await b.readOutbox(), []);
});

test('a write from an older session epoch is refused, including A -> B -> A', async () => {
  const { session, database } = setup();
  const oldA = await database.open(ACCOUNT_A);
  session.epoch = 2; // switched to B
  await database.open(ACCOUNT_B);
  session.epoch = 3; // back to A
  const newA = await database.open(ACCOUNT_A);
  const late = draft();
  await assert.rejects(oldA.savePending(late, outbox(late)), (error) => error instanceof StaleEpochError);
  await assert.rejects(oldA.applyChangeGroups([group(1, change('wallet', wallet()))], 'late'), (error) => error instanceof StaleEpochError);
  const current = draft();
  await newA.savePending(current, outbox(current));
  assert.deepEqual((await newA.readOutbox()).map((c) => c.payload.id), [current.id]);
  assert.equal((await newA.readState()).cursor, null);
});

test('a write in flight when the epoch moves is rolled back', async () => {
  const { session, database } = setup();
  const store = await database.open(ACCOUNT_A);
  files.failWhen((sql) => {
    // The epoch moves while the transaction is writing.
    if (/INSERT INTO outbox/i.test(sql)) session.epoch += 1;
  });
  const entry = draft();
  await assert.rejects(store.savePending(entry, outbox(entry)), (error) => error instanceof StaleEpochError);
  files.failWhen(null);
  session.epoch += 1;
  const reopened = await database.open(ACCOUNT_A);
  assert.deepEqual(await reopened.readOutbox(), []);
  assert.deepEqual((await reopened.readState()).pending, []);
});
