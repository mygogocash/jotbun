import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { SYNC_ENTITY_VALIDATORS } from '@gogospend/contracts';
import type { EntityChange } from '@gogospend/contracts';

import { AccountDatabase } from './accountDatabase.ts';
import type { DiaryStore } from './diaryRepository.ts';
import { createMemoryKeyStore } from './testing/memoryKeys.ts';
import { createTestDiaryFiles } from './testing/nodeSqlite.ts';
import type { TestDiaryFiles } from './testing/nodeSqlite.ts';
import { ACCOUNT_A, ACCOUNT_B, FOOD, SAVINGS, WALLET, category, change, draft, expense, group, outbox, references, wallet } from './testing/diaryFixtures.ts';
import { CursorMoved } from './types.ts';

let files: TestDiaryFiles;
afterEach(() => files?.dispose());

async function open(): Promise<DiaryStore> {
  files?.dispose();
  files = createTestDiaryFiles();
  const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => 1 });
  return database.open(ACCOUNT_A);
}

const injected = new Error('injected failure');
const isInjected = (error: unknown) => error === injected;
const invalid = (error: unknown) => error instanceof TypeError || error instanceof RangeError;

/**
 * Fails the n-th statement (BEGIN and COMMIT included) of `write`, for every
 * n until it succeeds, and checks the diary is unchanged after each failure.
 */
async function everyStatementFails(prepare: () => Promise<DiaryStore>, write: (store: DiaryStore) => Promise<void>): Promise<number> {
  for (let n = 1; ; n += 1) {
    const store = await prepare();
    const before = { state: await store.readState(), outbox: await store.readOutbox() };
    let seen = 0;
    files.failWhen(() => {
      if (++seen === n) throw injected;
    });
    const outcome = await write(store).then(() => 'ok', (error: unknown) => error);
    files.failWhen(null);
    if (outcome === 'ok') {
      files.dispose();
      return n - 1;
    }
    assert.equal(outcome, injected);
    assert.deepEqual({ state: await store.readState(), outbox: await store.readOutbox() }, before, `statement ${n} left a partial write`);
    files.dispose();
  }
}

test('a saved draft and its outbox command persist together, or not at all', async () => {
  const store = await open();
  await store.applyChangeGroups([references()], 'c1', null);
  const entry = draft({ amount_minor: '99999999999' });
  const command = outbox(entry);
  await store.savePending(entry, command);
  assert.deepEqual(await store.readOutbox(), [command]);
  assert.deepEqual((await store.readState()).pending, [entry]);
  const statements = await everyStatementFails(async () => {
    const fresh = await open();
    await fresh.applyChangeGroups([references()], 'c1', null);
    return fresh;
  }, async (fresh) => {
    const next = draft();
    await fresh.savePending(next, outbox(next));
  });
  assert.ok(statements >= 4, `saw ${statements} statements`);
});

test('saving the same draft again (a retry after an unknown outcome) is a no-op; a different body under the same ids is refused', async () => {
  const store = await open();
  await store.applyChangeGroups([references()], 'c1', null);
  const entry = draft();
  const command = outbox(entry);
  await store.savePending(entry, command);
  await store.savePending(entry, command);
  assert.equal((await store.readOutbox()).length, 1);
  const changed = { ...entry, amount_minor: '1' };
  await assert.rejects(store.savePending(changed, { ...command, payload: changed }), invalid);
  assert.deepEqual((await store.readState()).pending, [entry]);
});

test('a draft must match its command and account, be a valid create, and use synced, open references', async () => {
  const store = await open();
  await store.applyChangeGroups([references(), group(2, change('wallet', wallet({ id: '1a000000-0000-4000-8000-0000000000aa', name: 'Old', archived: true })))], 'c2', null);
  const refused = async (entry: Record<string, unknown>, command = outbox(entry as never)) => assert.rejects(store.savePending(entry as never, command), invalid);
  const entry = draft();
  await refused(entry, outbox(draft()));
  await refused(entry, outbox(entry, ACCOUNT_B));
  await refused(entry, { ...outbox(entry), state: 'sending' });
  await refused({ ...entry, occurred_on: '2026-02-30' });
  await refused({ ...entry, occurred_on: '2025-12-31' }); // before the wallet's tracking start
  await refused({ ...entry, extra: true });
  await refused({ ...entry, amount_minor: '0' });
  await refused({ ...entry, note: ' padded ' });
  await refused({ ...entry, wallet_id: '1a000000-0000-4000-8000-0000000000ff' });
  await refused({ ...entry, wallet_id: '1a000000-0000-4000-8000-0000000000aa' }); // archived
  await refused({ ...entry, type: 'income' }); // the category is an expense category
  await refused({ ...entry, category_id: '2c000000-0000-4000-8000-0000000000ff' });
  await refused({ id: entry.id, type: 'transfer', amount_minor: '100', occurred_on: '2026-03-02', source_wallet_id: WALLET, destination_wallet_id: WALLET });
  assert.deepEqual(await store.readOutbox(), []);
  // Absent optional fields may be undefined; a valid transfer is accepted.
  const lunch = draft({ merchant: undefined });
  await store.savePending(lunch, outbox({ ...lunch }));
  const move = { id: crypto.randomUUID(), type: 'transfer', amount_minor: '100', occurred_on: '2026-03-02', source_wallet_id: WALLET, destination_wallet_id: SAVINGS } as const;
  await store.savePending(move, outbox(move));
  assert.equal((await store.readOutbox()).length, 2);
  assert.equal(category().id, FOOD);
});

test('delta records, totals and cursor commit together: a failure at any statement keeps the previous state', async () => {
  const prepare = async () => {
    const fresh = await open();
    await fresh.applyChangeGroups([group(1, change('wallet', wallet())), group(2, change('transaction', expense({ amount_minor: '6500' })))], 'cursor-2', null);
    return fresh;
  };
  const statements = await everyStatementFails(prepare, (store) => store.applyChangeGroups([group(3, change('transaction', expense({ amount_minor: '100' }))), group(4, change('wallet', wallet({ version: 2, name: 'Wallet' })))], 'cursor-4', 'cursor-2'));
  assert.ok(statements >= 6, `saw ${statements} statements`);
  const store = await prepare();
  assert.deepEqual((await store.readState()).walletTotals, { [WALLET]: '93500' });
});

test('a page fetched before the cursor moved is refused, never written back', async () => {
  const store = await open();
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'cursor-1', null);
  await store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 2 }))], cursor: 'snapshot-cursor' }, '5');
  await assert.rejects(store.applyChangeGroups([], 'cursor-1b', 'cursor-1'), (error) => error instanceof CursorMoved);
  await assert.rejects(store.applyChangeGroups([group(6, change('transaction', expense()))], 'cursor-6', 'cursor-1'), (error) => error instanceof CursorMoved);
  const state = await store.readState();
  assert.equal(state.cursor, 'snapshot-cursor');
  assert.equal(state.appliedRevision, '5');
  await store.applyChangeGroups([], 'snapshot-cursor-2', 'snapshot-cursor');
  assert.equal((await store.readState()).cursor, 'snapshot-cursor-2');
});

test('applies versions forward only, keeps tombstones, drops purged data, and recomputes exact totals', async () => {
  const store = await open();
  const coffee = expense({ amount_minor: '6500' });
  const move = { id: crypto.randomUUID(), type: 'transfer', amount_minor: '20000', occurred_on: '2026-03-01', source_wallet_id: WALLET, destination_wallet_id: SAVINGS, note: null, merchant: null, deleted_at: null, version: 1 } as const;
  const salary = expense({ type: 'income', amount_minor: '2800000' } as never);
  await store.applyChangeGroups([
    group(1, change('wallet', wallet()), change('wallet', wallet({ id: SAVINGS, name: 'Savings', opening_minor: '0' }))),
    group(2, change('transaction', coffee), change('transaction', move), change('transaction', salary)),
  ], 'c2', null);
  assert.deepEqual((await store.readState()).walletTotals, { [WALLET]: String(100000 - 6500 - 20000 + 2800000), [SAVINGS]: '20000' });
  await store.applyChangeGroups([group(3, change('transaction', { ...coffee, version: 2, deleted_at: '2026-03-05T00:00:00.000Z' }, 'deleted')), group(4, change('transaction', { ...salary, version: 2 }, 'purged'))], 'c4', 'c2');
  const state = await store.readState();
  assert.deepEqual(state.walletTotals, { [WALLET]: String(100000 - 20000), [SAVINGS]: '20000' });
  assert.deepEqual(state.confirmed.find((e) => e.id === coffee.id), { entity: 'transaction', id: coffee.id, version: 2, state: 'deleted', snapshot: { ...coffee, version: 2, deleted_at: '2026-03-05T00:00:00.000Z' } });
  assert.deepEqual(state.confirmed.find((e) => e.id === salary.id), { entity: 'transaction', id: salary.id, version: 2, state: 'purged', snapshot: null });
  await store.applyChangeGroups([group(5, change('transaction', coffee))], 'c5', 'c4');
  assert.equal((await store.readState()).confirmed.find((e) => e.id === coffee.id)?.version, 2);
});

test('refuses out-of-order or already-applied groups and invalid changes, applying nothing', async () => {
  const store = await open();
  await store.applyChangeGroups([group(1, change('wallet', wallet()))], 'c1', null);
  const before = await store.readState();
  await assert.rejects(store.applyChangeGroups([group(1, change('transaction', expense()))], 'again', 'c1'), invalid);
  await assert.rejects(store.applyChangeGroups([group(3, change('transaction', expense())), group(2, change('transaction', expense()))], 'swapped', 'c1'), invalid);
  await assert.rejects(store.applyChangeGroups([group(2, { ...change('transaction', expense()), snapshot: { amount_minor: 65 } })], 'bad', 'c1'), invalid);
  assert.deepEqual(await store.readState(), before);
});

test('failed_snapshot_swap_preserves_cursor_and_outbox', async () => {
  const prepare = async () => {
    const fresh = await open();
    await fresh.applyChangeGroups([references(), group(2, change('transaction', expense()))], 'cursor-2', null);
    const entry = draft();
    await fresh.savePending(entry, outbox(entry));
    return fresh;
  };
  const store = await prepare();
  const before = { cursor: (await store.readState()).cursor, outbox: await store.readOutbox() };
  let inserts = 0;
  files.failWhen((sql) => {
    if (/INSERT INTO confirmed_entities/i.test(sql) && ++inserts === 2) throw injected;
  });
  await assert.rejects(store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 2, name: 'Wallet' })), change('transaction', expense()), change('transaction', expense())], cursor: 'snapshot-cursor' }, '9'), isInjected);
  files.failWhen(null);
  const after = { cursor: (await store.readState()).cursor, outbox: await store.readOutbox() };
  assert.equal(after.cursor, before.cursor);
  assert.deepEqual(after.outbox, before.outbox);
  files.dispose();
  // And at every other statement of the swap.
  const statements = await everyStatementFails(prepare, (fresh) => fresh.replaceConfirmed({ entities: [change('wallet', wallet({ version: 2 })), change('transaction', expense())], cursor: 'snapshot-cursor' }, '9'));
  assert.ok(statements >= 5, `saw ${statements} statements`);
});

test('a confirmed replacement swaps the confirmed state but never removes unresolved outbox commands or drafts', async () => {
  const store = await open();
  await store.applyChangeGroups([references(), group(2, change('transaction', expense()))], 'cursor-2', null);
  const entry = draft();
  await store.savePending(entry, outbox(entry));
  // S3 marks a transmitted command uncertain; the swap must keep it.
  const raw = files.raw(`diary-${ACCOUNT_A}.db`);
  raw.prepare(`UPDATE outbox SET state = 'uncertain', first_transmission_at = '2026-03-02T05:00:01.000Z'`).run();
  raw.close();
  const fresh = expense({ amount_minor: '1000' });
  await store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 3, opening_minor: '50000' })), change('transaction', fresh)], cursor: 'snapshot-cursor' }, '40');
  const state = await store.readState();
  assert.equal(state.cursor, 'snapshot-cursor');
  assert.equal(state.appliedRevision, '40');
  assert.deepEqual(state.confirmed.map((e) => e.id).sort(), [WALLET, fresh.id].sort());
  assert.deepEqual(state.walletTotals, { [WALLET]: '49000' });
  assert.deepEqual(state.pending, [entry]);
  assert.deepEqual((await store.readOutbox()).map((c) => [c.commandId, c.state]), [[(await store.readOutbox())[0].commandId, 'uncertain']]);
  await store.applyChangeGroups([group(41, change('transaction', expense({ amount_minor: '1' })))], 'cursor-41', 'snapshot-cursor');
  assert.deepEqual((await store.readState()).walletTotals, { [WALLET]: '48999' });
});

test('stores exact integer strings and no credentials', async () => {
  const store = await open();
  await store.applyChangeGroups([references()], 'c1', null);
  const entry = draft({ amount_minor: '99999999999' });
  await store.savePending(entry, outbox(entry));
  assert.equal((await store.readOutbox())[0].payload.amount_minor, '99999999999');
  const raw = files.raw(`diary-${ACCOUNT_A}.db`);
  const columns = (raw.prepare(`SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'`).all() as { tbl: string; col: string }[]).map((row) => `${row.tbl}.${row.col}`);
  raw.close();
  assert.ok(columns.length > 0);
  assert.deepEqual(columns.filter((name) => /token|binding|auth|password|secret/i.test(name)), []);
});

// An app built before P3 has no validators for the import entity types. A
// server that has them must never stall that app's sync: a change of an
// entity this build does not know is skipped, its cursor and revision still
// advance, and everything it does know is applied.
const { import_review: _review, import_selection: _selection, ...BEFORE_IMPORTS } = SYNC_ENTITY_VALIDATORS;

async function openWith(validators: typeof SYNC_ENTITY_VALIDATORS): Promise<DiaryStore> {
  files?.dispose();
  files = createTestDiaryFiles();
  const database = new AccountDatabase({ files, keys: createMemoryKeyStore(), epoch: () => 1, validators });
  return database.open(ACCOUNT_A);
}

const JOB = '3d000000-0000-4000-8000-000000000001';
const importReview = (version = 1): EntityChange => ({ entity: 'import_review', id: JOB, version, state: 'active', snapshot: { id: JOB, review_revision: String(version + 1) } });
const importSelection = (): EntityChange => {
  const id = randomUUID();
  return { entity: 'import_selection', id, version: 1, state: 'active', snapshot: { id, job_id: JOB, frozen_revision: '1', row_count: 2, committed_count: 0 } };
};

test('a build without the import validators skips import changes, applies the rest and advances the cursor', async () => {
  const store = await openWith(BEFORE_IMPORTS);
  const spent = expense({ amount_minor: '4200' });
  await store.applyChangeGroups([references()], 'c1', null);
  await store.applyChangeGroups([group(2, importReview()), group(3, importSelection(), change('transaction', spent)), group(4, importReview(2))], 'c4', 'c1');
  const state = await store.readState();
  assert.equal(state.cursor, 'c4');
  assert.equal(state.appliedRevision, '4');
  assert.deepEqual(state.confirmed.map((entity) => entity.entity).sort(), ['category', 'transaction', 'wallet', 'wallet']);
  assert.deepEqual(state.walletTotals[WALLET], '95800');
  // A later page continues from the advanced cursor.
  await store.applyChangeGroups([group(5, change('transaction', expense({ amount_minor: '100' })))], 'c5', 'c4');
  assert.equal((await store.readState()).appliedRevision, '5');
});

test('a snapshot with import entities replaces the confirmed state without them for a build that does not know them', async () => {
  const store = await openWith(BEFORE_IMPORTS);
  await store.replaceConfirmed({ entities: [change('wallet', wallet({ version: 2 })), importReview(), importSelection()], cursor: 'snapshot-cursor' }, '9');
  const state = await store.readState();
  assert.equal(state.cursor, 'snapshot-cursor');
  assert.equal(state.appliedRevision, '9');
  assert.deepEqual(state.confirmed.map((entity) => entity.entity), ['wallet']);
});

test('a known entity that does not match its validator, and an unknown entity that is not an entity change at all, still refuse the page', async () => {
  const store = await openWith(BEFORE_IMPORTS);
  await store.applyChangeGroups([references()], 'c1', null);
  const before = await store.readState();
  await assert.rejects(store.applyChangeGroups([group(2, importReview(), { ...change('transaction', expense()), snapshot: { amount_minor: 65 } })], 'bad', 'c1'), invalid);
  await assert.rejects(store.applyChangeGroups([group(2, { ...importReview(), id: 'not-a-uuid' })], 'bad', 'c1'), invalid);
  await assert.rejects(store.applyChangeGroups([group(2, { ...importReview(), extra: true } as EntityChange)], 'bad', 'c1'), invalid);
  assert.deepEqual(await store.readState(), before);
});

test('a build that knows the import entities stores them', async () => {
  const store = await open();
  await store.applyChangeGroups([references(), group(2, importReview())], 'c2', null);
  assert.ok((await store.readState()).confirmed.some((entity) => entity.entity === 'import_review'));
});
