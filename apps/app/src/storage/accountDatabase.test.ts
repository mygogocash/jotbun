import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { AccountDatabase } from './accountDatabase.ts';
import { LocalDiaryUnavailable, deviceDiaryFiles as webDiaryFiles } from './database.web.ts';
import { DIARY_MIGRATIONS } from './migrations.ts';
import { createMemoryKeyStore } from './testing/memoryKeys.ts';
import { createTestDiaryFiles } from './testing/nodeSqlite.ts';
import type { TestDiaryFiles } from './testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, WALLET, change, draft, expense, group, outbox, references, wallet } from './testing/diaryFixtures.ts';
import { DiaryLocked, DiarySchemaTooNew, MalformedDiaryKey, StaleEpochError } from './types.ts';
import type { KeyStore } from './types.ts';

let files: TestDiaryFiles;
afterEach(() => files?.dispose());

function setup(keys: KeyStore & Partial<{ keys: Map<string, string> }> = createMemoryKeyStore()) {
  files = createTestDiaryFiles();
  const session = { epoch: 1 };
  const database = new AccountDatabase({ files, keys, epoch: () => session.epoch });
  return { keys, session, database };
}

const lockedFor = (reason: string) => (error: unknown) => error instanceof DiaryLocked && error.reason === reason;
const stale = (error: unknown) => error instanceof StaleEpochError;
const nameOf = (account: string) => `diary-${account}.db`;

test('a new account gets its own keyed, migrated diary that survives a restart', async () => {
  const { keys, database } = setup();
  const store = await database.open(ACCOUNT_A);
  assert.match((await keys.get(ACCOUNT_A)) ?? '', /^[0-9a-f]{64}$/);
  const raw = files.raw(nameOf(ACCOUNT_A));
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, DIARY_MIGRATIONS[DIARY_MIGRATIONS.length - 1].version);
  raw.close();
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1', null);
  await store.lock();
  const reopened = await database.open(ACCOUNT_A);
  const state = await reopened.readState();
  assert.equal(state.cursor, 'cursor-1');
  assert.deepEqual(state.walletTotals, { [WALLET]: '100000' });
});

test('two accounts with the same entity ids never see each other', async () => {
  const { database } = setup();
  const shared = expense({ amount_minor: '100' });
  const a = await database.open(ACCOUNT_A);
  const b = await database.open(ACCOUNT_B);
  await a.applyChangeGroups([group(1, change('wallet', wallet()), change('transaction', shared))], 'a-1', null);
  await b.applyChangeGroups([group(1, change('wallet', wallet({ opening_minor: '0' })), change('transaction', { ...shared, amount_minor: '777' }))], 'b-1', null);
  const [stateA, stateB] = [await a.readState(), await b.readState()];
  assert.equal((stateA.confirmed.find((e) => e.id === shared.id)?.snapshot as { amount_minor: string }).amount_minor, '100');
  assert.equal((stateB.confirmed.find((e) => e.id === shared.id)?.snapshot as { amount_minor: string }).amount_minor, '777');
  assert.deepEqual(stateA.walletTotals, { [WALLET]: '99900' });
  assert.deepEqual(stateB.walletTotals, { [WALLET]: '-777' });
  assert.equal(files.names().length, 2);
});

test('concurrent opens of one account share one store and one key, so nothing saved is lost', async () => {
  const { keys, database } = setup();
  const [first, second] = await Promise.all([database.open(ACCOUNT_A), database.open(ACCOUNT_A)]);
  assert.equal(first, second);
  assert.equal(files.openCount(nameOf(ACCOUNT_A)), 1);
  await first.applyChangeGroups([references()], 'c1', null);
  const entry = draft();
  await first.savePending(entry, outbox(entry));
  await first.lock();
  assert.equal(files.openCount(nameOf(ACCOUNT_A)), 0);
  assert.deepEqual((await (await database.open(ACCOUNT_A)).readState()).pending, [entry]);
  await assert.rejects(keys.create(ACCOUNT_A), /already/);
});

test('a missing key locks the diary instead of creating an empty replacement, until an explicit discard', async () => {
  const { keys, database } = setup();
  const store = await database.open(ACCOUNT_A);
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1', null);
  await store.lock();
  await keys.delete(ACCOUNT_A);
  await assert.rejects(database.open(ACCOUNT_A), lockedFor('key_missing'));
  assert.equal(files.names().length, 1, 'the encrypted diary is kept');
  await database.discard(ACCOUNT_A);
  assert.equal(files.names().length, 0);
  const fresh = await database.open(ACCOUNT_A);
  assert.equal((await fresh.readState()).cursor, null);
});

test('a rejected or malformed key locks the diary; a failing key store is only temporarily unavailable', async () => {
  const { keys, database } = setup();
  await (await database.open(ACCOUNT_A)).lock();
  keys.keys?.set(ACCOUNT_A, 'f'.repeat(64));
  await assert.rejects(database.open(ACCOUNT_A), lockedFor('key_rejected'));
  const malformed: KeyStore = { get: async () => { throw new MalformedDiaryKey(); }, create: async () => '', delete: async () => undefined };
  await assert.rejects(new AccountDatabase({ files, keys: malformed, epoch: () => 1 }).open(ACCOUNT_A), lockedFor('key_rejected'));
  const unavailable: KeyStore = { get: async () => { throw new Error('User interaction is not allowed'); }, create: async () => '', delete: async () => undefined };
  await assert.rejects(new AccountDatabase({ files, keys: unavailable, epoch: () => 1 }).open(ACCOUNT_B), lockedFor('key_unavailable'));
});

test('a diary recorded for another account is refused before any migration', async () => {
  const { keys, session } = setup();
  const v1 = new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: DIARY_MIGRATIONS.slice(0, 1) });
  await (await v1.open(ACCOUNT_A)).lock();
  const raw = files.raw(nameOf(ACCOUNT_A));
  raw.prepare(`UPDATE diary_meta SET value = ? WHERE key = 'account_id'`).run(ACCOUNT_B);
  raw.close();
  const v2 = [...DIARY_MIGRATIONS.slice(0, 1), { version: 2, statements: ['CREATE TABLE later (x TEXT) STRICT'] }];
  await assert.rejects(new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: v2 }).open(ACCOUNT_A), lockedFor('wrong_account'));
  const check = files.raw(nameOf(ACCOUNT_A));
  assert.equal((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
  check.close();
  assert.equal(files.openCount(nameOf(ACCOUNT_A)), 0);
});

test('a failing migration rolls back, leaving the diary usable at its previous version', async () => {
  const { keys, session } = setup();
  const v1 = new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: DIARY_MIGRATIONS.slice(0, 1) });
  const store = await v1.open(ACCOUNT_A);
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1', null);
  await store.lock();
  const broken = [...DIARY_MIGRATIONS.slice(0, 1), { version: 2, statements: ['CREATE TABLE half_done (x TEXT)', 'THIS IS NOT SQL'] }];
  await assert.rejects(new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: broken }).open(ACCOUNT_A), /syntax error/);
  const raw = files.raw(nameOf(ACCOUNT_A));
  assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
  assert.equal(raw.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'half_done'`).get()?.n, 0);
  raw.close();
  assert.equal((await (await v1.open(ACCOUNT_A)).readState()).cursor, 'cursor-1');
});

test('a diary from a newer app version is refused, not downgraded', async () => {
  const { database } = setup();
  await (await database.open(ACCOUNT_A)).lock();
  const raw = files.raw(nameOf(ACCOUNT_A));
  raw.exec('PRAGMA user_version = 999');
  raw.close();
  await assert.rejects(database.open(ACCOUNT_A), (error) => error instanceof DiarySchemaTooNew);
});

test('a locked store refuses every operation; data stays for the next unlock', async () => {
  const { database } = setup();
  const store = await database.open(ACCOUNT_A);
  await store.applyChangeGroups([references()], 'c1', null);
  const entry = draft();
  await store.savePending(entry, outbox(entry));
  await store.lock();
  await assert.rejects(store.readOutbox(), lockedFor('locked'));
  const another = draft();
  await assert.rejects(store.savePending(another, outbox(another)), lockedFor('locked'));
  await assert.rejects(store.applyChangeGroups([], 'c', 'c1'), lockedFor('locked'));
  assert.equal((await (await database.open(ACCOUNT_A)).readOutbox()).length, 1);
});

test("erase drops only that account's diary and key", async () => {
  const { keys, database } = setup();
  const a = await database.open(ACCOUNT_A);
  const b = await database.open(ACCOUNT_B);
  await a.applyChangeGroups([references()], 'c1', null);
  const entry = draft();
  await a.savePending(entry, outbox(entry));
  await a.eraseAfterConfirmation();
  assert.equal(await keys.get(ACCOUNT_A), null);
  assert.notEqual(await keys.get(ACCOUNT_B), null);
  assert.deepEqual(files.names(), [nameOf(ACCOUNT_B)]);
  await assert.rejects(a.readOutbox(), lockedFor('locked'));
  assert.deepEqual(await (await database.open(ACCOUNT_A)).readOutbox(), []);
  assert.deepEqual(await b.readOutbox(), []);
});

test('discard deletes the key first and can always be retried', async () => {
  const memory = createMemoryKeyStore();
  let failures = 1;
  const flaky: KeyStore = { ...memory, delete: async (account) => { if (failures-- > 0) throw new Error('keychain busy'); await memory.delete(account); } };
  const { database } = setup(flaky);
  await database.open(ACCOUNT_A);
  // A live store is closed first; a failed key delete leaves nothing half-done.
  await assert.rejects(database.discard(ACCOUNT_A), /keychain busy/);
  assert.notEqual(await memory.get(ACCOUNT_A), null);
  await database.discard(ACCOUNT_A);
  assert.equal(await memory.get(ACCOUNT_A), null);
  assert.deepEqual(files.names(), []);
  // A key without a file, or nothing at all, still discards cleanly.
  await memory.create(ACCOUNT_B);
  await database.discard(ACCOUNT_B);
  await database.discard(ACCOUNT_B);
  assert.equal(await memory.get(ACCOUNT_B), null);
});

test('a write from an older session epoch is refused, including A -> B -> A', async () => {
  const { session, database } = setup();
  const oldA = await database.open(ACCOUNT_A);
  await oldA.applyChangeGroups([references()], 'c1', null);
  session.epoch = 2; // switched to B
  await database.open(ACCOUNT_B);
  session.epoch = 3; // back to A
  const newA = await database.open(ACCOUNT_A);
  assert.notEqual(newA, oldA);
  assert.equal(files.openCount(nameOf(ACCOUNT_A)), 1, 'the stale store was closed');
  const late = draft();
  await assert.rejects(oldA.savePending(late, outbox(late)), stale);
  await assert.rejects(oldA.applyChangeGroups([group(2, change('wallet', wallet({ version: 2 })))], 'late', 'c1'), stale);
  await assert.rejects(oldA.readState(), stale);
  const current = draft();
  await newA.savePending(current, outbox(current));
  assert.deepEqual((await newA.readOutbox()).map((c) => c.payload.id), [current.id]);
});

test('a store from an older session can never erase the account', async () => {
  const { session, keys, database } = setup();
  const oldA = await database.open(ACCOUNT_A);
  session.epoch = 2;
  const newA = await database.open(ACCOUNT_A);
  await newA.applyChangeGroups([references()], 'c1', null);
  const entry = draft();
  await newA.savePending(entry, outbox(entry));
  await assert.rejects(oldA.eraseAfterConfirmation(), stale);
  assert.notEqual(await keys.get(ACCOUNT_A), null);
  assert.deepEqual((await newA.readState()).pending, [entry]);
});

test('a write in flight when the epoch moves is rolled back', async () => {
  const { session, database } = setup();
  const store = await database.open(ACCOUNT_A);
  await store.applyChangeGroups([references()], 'c1', null);
  files.failWhen((sql) => {
    // The epoch moves while the transaction is writing.
    if (/INSERT INTO outbox/i.test(sql)) session.epoch += 1;
  });
  const entry = draft();
  await assert.rejects(store.savePending(entry, outbox(entry)), stale);
  files.failWhen(null);
  const reopened = await database.open(ACCOUNT_A);
  assert.deepEqual(await reopened.readOutbox(), []);
  assert.deepEqual((await reopened.readState()).pending, []);
});

test('a read is one consistent view, and one racing a session change returns nothing', async () => {
  const { session, database } = setup();
  const store = await database.open(ACCOUNT_A);
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1', null);
  const [state] = await Promise.all([store.readState(), store.applyChangeGroups([group(2, change('transaction', expense({ amount_minor: '500' })))], 'cursor-2', 'cursor-1')]);
  const consistent = (state.cursor === 'cursor-1' && state.walletTotals[WALLET] === '100000' && state.confirmed.length === 1) || (state.cursor === 'cursor-2' && state.walletTotals[WALLET] === '99500' && state.confirmed.length === 2);
  assert.ok(consistent, `mixed view: ${JSON.stringify({ cursor: state.cursor, total: state.walletTotals[WALLET], rows: state.confirmed.length })}`);
  files.failWhen((sql) => {
    if (/FROM confirmed_entities/i.test(sql)) session.epoch += 1;
  });
  await assert.rejects(store.readState(), stale);
  files.failWhen(null);
});

test('a session change while a diary is opening leaves no store and no open connection', async () => {
  const { session, database } = setup();
  files.failWhen((sql) => {
    if (/PRAGMA user_version/i.test(sql)) session.epoch += 1;
  });
  await assert.rejects(database.open(ACCOUNT_A), stale);
  files.failWhen(null);
  assert.equal(files.openCount(nameOf(ACCOUNT_A)), 0);
});

test('on the web there is no local diary, before any key is read', async () => {
  const keys: KeyStore = { get: async () => { throw new Error('SecureStore is not available on web'); }, create: async () => '', delete: async () => undefined };
  await assert.rejects(new AccountDatabase({ files: webDiaryFiles(), keys, epoch: () => 1 }).open(ACCOUNT_A), (error) => error instanceof LocalDiaryUnavailable);
});
