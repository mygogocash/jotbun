import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { AccountDatabase } from './accountDatabase.ts';
import { createMemoryKeyStore } from './testing/memoryKeys.ts';
import { createTestDiaryFiles } from './testing/nodeSqlite.ts';
import type { TestDiaryFiles } from './testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, SAVINGS, WALLET, change, draft, expense, group, outbox, wallet } from './testing/diaryFixtures.ts';

let files: TestDiaryFiles;
afterEach(() => files?.dispose());

async function open() {
  files = createTestDiaryFiles();
  const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => 1 });
  return database.open(ACCOUNT_A);
}

const injected = new Error('injected failure');
const failOn = (pattern: RegExp) => (sql: string) => {
  if (pattern.test(sql)) throw injected;
};

test('a saved draft and its outbox command persist together, or not at all', async () => {
  const store = await open();
  const entry = draft({ amount_minor: '99999999999' });
  const command = outbox(entry);
  await store.savePending(entry, command);
  assert.deepEqual(await store.readOutbox(), [command]);
  assert.deepEqual((await store.readState()).pending, [entry]);
  files.failWhen(failOn(/INSERT INTO outbox/i));
  const second = draft();
  await assert.rejects(store.savePending(second, outbox(second)), injected);
  files.failWhen(null);
  assert.deepEqual((await store.readState()).pending, [entry]);
  assert.deepEqual(await store.readOutbox(), [command]);
});

test('a draft must match its command and account', async () => {
  const store = await open();
  const entry = draft();
  await assert.rejects(store.savePending(entry, outbox(draft())));
  await assert.rejects(store.savePending(entry, outbox(entry, ACCOUNT_B)));
  await assert.rejects(store.savePending(entry, { ...outbox(entry), state: 'sending' }));
  assert.deepEqual(await store.readOutbox(), []);
});

test('delta records, totals and cursor commit together; a failure halfway keeps the previous state', async () => {
  const store = await open();
  const coffee = expense({ amount_minor: '6500' });
  await store.applyChangeGroups([group(1, change('wallet', wallet())), group(2, change('transaction', coffee))], 'cursor-2');
  const before = await store.readState();
  assert.deepEqual(before.walletTotals, { [WALLET]: '93500' });
  assert.equal(before.appliedRevision, '2');
  // Fails on the cursor write, after the records were applied in the same transaction.
  files.failWhen(failOn(/INSERT INTO diary_meta/i));
  await assert.rejects(store.applyChangeGroups([group(3, change('transaction', expense({ amount_minor: '100' })))], 'cursor-3'), injected);
  files.failWhen(null);
  assert.deepEqual(await store.readState(), before);
});

test('applies versions forward only, keeps tombstones, drops purged data, and recomputes exact totals', async () => {
  const store = await open();
  const coffee = expense({ amount_minor: '6500' });
  const move = { id: crypto.randomUUID(), type: 'transfer', amount_minor: '20000', occurred_on: '2026-03-01', source_wallet_id: WALLET, destination_wallet_id: SAVINGS, note: null, merchant: null, deleted_at: null, version: 1 } as const;
  const salary = expense({ type: 'income', amount_minor: '2800000' } as never);
  await store.applyChangeGroups([
    group(1, change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' }))),
    group(2, change('transaction', coffee), change('transaction', move), change('transaction', salary)),
  ], 'c2');
  assert.deepEqual((await store.readState()).walletTotals, { [WALLET]: String(100000 - 6500 - 20000 + 2800000), [SAVINGS]: '20000' });
  // The coffee is deleted; the salary purged.
  await store.applyChangeGroups([group(3, change('transaction', { ...coffee, version: 2, deleted_at: '2026-03-05T00:00:00.000Z' }, 'deleted')), group(4, change('transaction', { ...salary, version: 2 }, 'purged'))], 'c4');
  const state = await store.readState();
  assert.deepEqual(state.walletTotals, { [WALLET]: String(100000 - 20000), [SAVINGS]: '20000' });
  assert.deepEqual(state.confirmed.find((e) => e.id === coffee.id), { entity: 'transaction', id: coffee.id, version: 2, state: 'deleted', snapshot: { ...coffee, version: 2, deleted_at: '2026-03-05T00:00:00.000Z' } });
  assert.deepEqual(state.confirmed.find((e) => e.id === salary.id), { entity: 'transaction', id: salary.id, version: 2, state: 'purged', snapshot: null });
  // An older version never overwrites a newer one.
  await store.applyChangeGroups([group(5, change('transaction', coffee))], 'c5');
  assert.equal((await store.readState()).confirmed.find((e) => e.id === coffee.id)?.version, 2);
});

test('refuses out-of-order or already-applied groups and invalid changes, applying nothing', async () => {
  const store = await open();
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'c1');
  const before = await store.readState();
  await assert.rejects(store.applyChangeGroups([group(1, change('transaction', expense()))], 'again'));
  await assert.rejects(store.applyChangeGroups([group(3, change('transaction', expense())), group(2, change('transaction', expense()))], 'swapped'));
  await assert.rejects(store.applyChangeGroups([group(2, { ...change('transaction', expense()), snapshot: { amount_minor: 65 } })], 'bad'));
  assert.deepEqual(await store.readState(), before);
});

test('failed_snapshot_swap_preserves_cursor_and_outbox', async () => {
  const store = await open();
  await store.applyChangeGroups([group(1, change('wallet', wallet())), group(2, change('transaction', expense()))], 'cursor-2');
  const entry = draft();
  await store.savePending(entry, outbox(entry));
  const before = { cursor: (await store.readState()).cursor, outbox: await store.readOutbox(), state: await store.readState() };
  let inserts = 0;
  files.failWhen((sql) => {
    if (/INSERT INTO confirmed_entities/i.test(sql) && ++inserts === 2) throw injected;
  });
  await assert.rejects(store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 2, name: 'Wallet' })), change('transaction', expense()), change('transaction', expense())], cursor: 'snapshot-cursor' }, '9'), injected);
  files.failWhen(null);
  const after = { cursor: (await store.readState()).cursor, outbox: await store.readOutbox(), state: await store.readState() };
  assert.equal(after.cursor, before.cursor);
  assert.deepEqual(after.outbox, before.outbox);
  assert.deepEqual(after.state, before.state);
});

test('a confirmed replacement swaps the confirmed state but never removes unresolved outbox commands or drafts', async () => {
  const store = await open();
  await store.applyChangeGroups([group(1, change('wallet', wallet())), group(2, change('transaction', expense()))], 'cursor-2');
  const entry = draft();
  const command = outbox(entry, ACCOUNT_A, { state: 'uncertain', firstTransmissionAt: '2026-03-02T05:00:01.000Z' });
  await store.savePending(entry, { ...command, state: 'unsent', firstTransmissionAt: null });
  const fresh = expense({ amount_minor: '1000' });
  await store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 3, opening_minor: '50000' })), change('transaction', fresh)], cursor: 'snapshot-cursor' }, '40');
  const state = await store.readState();
  assert.equal(state.cursor, 'snapshot-cursor');
  assert.equal(state.appliedRevision, '40');
  assert.deepEqual(state.confirmed.map((e) => e.id).sort(), [WALLET, fresh.id].sort());
  assert.deepEqual(state.walletTotals, { [WALLET]: '49000' });
  assert.deepEqual(state.pending, [entry]);
  assert.equal((await store.readOutbox()).length, 1);
  // Deltas continue from the snapshot.
  await store.applyChangeGroups([group(41, change('transaction', expense({ amount_minor: '1' })))], 'cursor-41');
  assert.deepEqual((await store.readState()).walletTotals, { [WALLET]: '48999' });
});

test('stores exact integer strings and no credentials', async () => {
  const store = await open();
  const entry = draft({ amount_minor: '99999999999' });
  await store.savePending(entry, outbox(entry));
  assert.equal((await store.readOutbox())[0].payload.amount_minor, '99999999999');
  const raw = files.raw(files.names()[0]);
  const columns = (raw.prepare(`SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'`).all() as { tbl: string; col: string }[]).map((row) => `${row.tbl}.${row.col}`);
  raw.close();
  assert.ok(columns.length > 0);
  assert.deepEqual(columns.filter((name) => /token|binding|auth|password|secret/i.test(name)), []);
});
