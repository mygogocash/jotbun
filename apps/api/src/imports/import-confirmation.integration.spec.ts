import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { IMPORT_CONFIRM_BATCH_MAX_ROWS, isImportPreview, isImportReviewSnapshot, isImportSelectionSnapshot } from '@gogospend/contracts';
import type { CommandAck, ConfirmImportBatchResult, ImportJobDto, ImportMapping, ImportPreview, ImportSelectionProgress } from '@gogospend/contracts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import request from 'supertest';

import { CommandExecutor } from '../commands/command-executor';
import { derivedUuid } from '../commands/derived-id';
import { LeasedAccountRead } from '../database/leased-account-read';
import { importRowProgress, importSelectionRows, importSelections } from '../database/schema';
import { buildHandlers } from '../jobs/handlers';
import type { WorkerDeps } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { defaultPrivacySteps } from '../privacy/privacy-steps';
import { ObjectPublicationService } from '../storage/object-publication.service';
import type { MemoryObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';
import { csv, imageWithMetadata } from './fixtures/synthetic-parse';

// P3: explicit, resumable confirmation of a parsed import, against the real
// v1 app, the real parser child and a disposable PostgreSQL.

let db: TestDatabase;
let issuer: JwksFixture;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let server: Server;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let jobsPool: Pool;
let worker: JobWorker;

async function startApp(): Promise<void> {
  process.env.IMPORT_UPLOADS_ENABLED = '1';
  try {
    v1 = await startV1App(db, issuer);
  } finally {
    delete process.env.IMPORT_UPLOADS_ENABLED;
  }
  server = v1.app.getHttpServer() as Server;
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  const store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  const jobs = new JobRepository(jobsPool);
  const deps: WorkerDeps = { jobs, reader: new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2)), store, publication: new ObjectPublicationService(jobsPool, store), pool: jobsPool };
  worker = new JobWorker(jobs, buildHandlers(deps));
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  fx = authFixtures(issuer, await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 4));
  await publishPolicies(db);
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  await startApp();
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const adminRows = async <T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> =>
  (await db.admin((client) => client.query<T>(text, values))).rows;

async function count(table: string, accountId?: string): Promise<number> {
  const [row] = await adminRows<{ n: string }>(`SELECT count(*) AS n FROM ${table}${accountId ? ' WHERE account_id = $1' : ''}`, accountId ? [accountId] : []);
  return Number(row.n);
}

// ---------------------------------------------------------------------------
// Synthetic files: a generic layout with two wallet labels, two expense and
// one income category label, and exact two-decimal amounts.
// ---------------------------------------------------------------------------

type FileRow = { id: string; date: string; type: 'expense' | 'income'; category: string; minor: bigint; note: string; merchant: string; wallet: string };

function fileRows(n: number, options: { note?: (i: number) => string; merchant?: (i: number) => string } = {}): FileRow[] {
  const rows: FileRow[] = [];
  for (let i = 0; i < n; i += 1) {
    const income = i % 7 === 3;
    const minor = BigInt(((i * 7919) % 9_999_999) + 1);
    rows.push({
      // The header is row 1, so the i-th data row is row i + 2.
      id: `row:${i + 2}`,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      type: income ? 'income' : 'expense',
      category: income ? 'salary' : i % 2 === 0 ? 'food' : 'travel',
      minor,
      note: options.note ? options.note(i) : `row ${i + 1}`,
      merchant: options.merchant ? options.merchant(i) : `shop ${i % 13}`,
      wallet: i % 3 === 0 ? 'Bank' : 'Cash',
    });
  }
  return rows;
}

const money2 = (minor: bigint) => `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
const fileOf = (rows: readonly FileRow[]) =>
  csv(['date,type,category,amount,note,merchant,wallet', ...rows.map((row) => [row.date, row.type, row.category, money2(row.minor), row.note, row.merchant, row.wallet].join(','))]);

async function sessionHeaders(user: SignedUp): Promise<Record<string, string>> {
  return { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`, 'x-gogospend-session': user.binding };
}

async function upload(user: SignedUp, body: Buffer, file: { type: string; name: string } = { type: 'text/csv', name: 'statement.csv' }): Promise<ImportJobDto> {
  const res = await request(server)
    .post('/v1/imports')
    .set(await sessionHeaders(user))
    .set('idempotency-key', randomUUID())
    .set('content-type', file.type)
    .set('x-gogospend-file-name', encodeURIComponent(file.name))
    .send(body);
  if (res.status !== 202) throw new Error(`upload refused: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as ImportJobDto;
}

async function runParse(jobId: string): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const [job] = await adminRows<{ status: string }>('SELECT status FROM jobs WHERE id = $1', [jobId]);
    if (job.status !== 'queued' && job.status !== 'leased') return;
    if ((await worker.runOnce()) === 'idle') return;
  }
}

async function previewOf(user: SignedUp, jobId: string): Promise<ImportPreview> {
  const res = await as(user).get(`/v1/imports/${jobId}/preview`);
  expect(res.status).toBe(200);
  expect(isImportPreview(res.body)).toBe(true);
  return res.body as ImportPreview;
}

type Setup = { user: SignedUp; jobId: string; rows: FileRow[]; wallets: { cash: string; bank: string }; mapping: ImportMapping };

/** A member with Cash and Bank wallets and a parsed import of `rows`. */
async function parsedImport(rows: FileRow[], user?: SignedUp): Promise<Setup> {
  const owner = user ?? (await money.member());
  const wallets = { cash: await money.wallet(owner, { name: 'Cash' }), bank: await money.wallet(owner, { name: 'Bank' }) };
  const accepted = await upload(owner, fileOf(rows));
  await runParse(accepted.job_id);
  if (rows.length <= 100) {
    const preview = await previewOf(owner, accepted.job_id);
    expect([preview.status, preview.candidates.length]).toEqual(['ready', rows.length]);
  } else {
    // Large files: readiness from the table itself. P2b's preview route can time out on
    // 5,000 rows under stale planner statistics (reported to its fix; not P3's code).
    const [preview] = await adminRows<{ status: string; candidate_count: number }>('SELECT status, candidate_count FROM import_previews WHERE job_id = $1', [accepted.job_id]);
    expect(preview).toEqual({ status: 'ready', candidate_count: rows.length });
  }
  const mapping: ImportMapping = {
    wallets: { Cash: wallets.cash, Bank: wallets.bank },
    categories: { expense: { food: builtinId(owner, 'food'), travel: builtinId(owner, 'travel') }, income: { salary: builtinId(owner, 'salary') } },
  };
  return { user: owner, jobId: accepted.job_id, rows, wallets, mapping };
}

async function freeze(setup: Setup, ids: readonly string[], options: { revision?: string; key?: string; mapping?: ImportMapping } = {}) {
  return as(setup.user).post(`/v1/imports/${setup.jobId}/selections`, { review_revision: options.revision ?? '1', selected_row_ids: ids, mapping: options.mapping ?? setup.mapping }, { key: options.key });
}

async function frozen(setup: Setup, ids: readonly string[], options: { revision?: string; mapping?: ImportMapping } = {}): Promise<string> {
  const res = await freeze(setup, ids, options);
  expect([res.status, res.body.code]).toEqual([201, undefined]);
  return (res.body as CommandAck).entity_id;
}

function confirm(setup: Setup, selectionId: string, ids: readonly string[], options: { frozenRevision?: string; key?: string; receipt?: unknown } = {}) {
  const body = { selection_id: selectionId, frozen_revision: options.frozenRevision ?? '1', batch_row_ids: ids, ...(options.receipt === undefined ? {} : { receipt: options.receipt }) };
  return as(setup.user).post(`/v1/imports/${setup.jobId}/confirmations`, body, { key: options.key });
}

async function confirmed(setup: Setup, selectionId: string, ids: readonly string[], options: { frozenRevision?: string; key?: string; receipt?: unknown } = {}): Promise<ConfirmImportBatchResult> {
  const res = await confirm(setup, selectionId, ids, options);
  expect([res.status, res.body.code]).toEqual([200, undefined]);
  return res.body as ConfirmImportBatchResult;
}

const patchRows = (setup: Setup, revision: number, rows: unknown[], key?: string) =>
  as(setup.user).patch(`/v1/imports/${setup.jobId}/rows`, { rows }, { ifMatch: revision, key });

const transactionId = (setup: Setup, sourceRowId: string) => derivedUuid(setup.user.accountId, 'import-transaction', setup.jobId, sourceRowId);
const ids = (rows: readonly FileRow[]) => rows.map((row) => row.id);
const chunks = <T>(items: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function importTransactions(setup: Setup): Promise<{ id: string; type: string; amount_minor: string; occurred_on: string; wallet_id: string; category_id: string; note: string | null; merchant: string | null; version: number }[]> {
  return adminRows(
    `SELECT t.id, t.type, t.amount_minor::text AS amount_minor, to_char(t.occurred_on, 'YYYY-MM-DD') AS occurred_on, t.wallet_id, t.category_id, t.note, t.merchant, t.version
       FROM transactions t JOIN import_row_progress g ON g.account_id = t.account_id AND g.transaction_id = t.id
      WHERE g.job_id = $1 ORDER BY t.id`,
    [setup.jobId],
  );
}

/** Archives a wallet that already holds records: its opening balance is corrected so the derived balance is zero (a wallet archives only at zero). */
async function archiveWalletWithRecords(setup: Setup, walletId: string): Promise<void> {
  const [row] = await adminRows<{ opening: string; delta: string }>(
    `SELECT w.opening_minor::text AS opening,
            coalesce((SELECT sum(CASE t.type WHEN 'income' THEN t.amount_minor ELSE -t.amount_minor END) FROM transactions t WHERE t.wallet_id = w.id AND t.deleted_at IS NULL), 0)::text AS delta
       FROM wallets w WHERE w.id = $1`,
    [walletId],
  );
  const opening = (BigInt(row.opening) - BigInt(row.delta)).toString();
  const wallet = await as(setup.user).get(`/v1/wallets/${walletId}`);
  const version = (wallet.body as { version: number }).version;
  const corrected = await as(setup.user).patch(`/v1/wallets/${walletId}`, { opening_minor: opening, correction_reason: 'balance_reconciliation' }, { ifMatch: version });
  expect(corrected.status).toBe(200);
  const archived = await as(setup.user).post(`/v1/wallets/${walletId}/archive`, {}, { ifMatch: version + 1 });
  expect([archived.status, archived.body.code]).toEqual([200, undefined]);
}

/** Kills the request after the executor committed: the client never hears back. */
function killAfterCommitOnce(): void {
  const executor = v1.app.get(CommandExecutor);
  const original = executor.run.bind(executor);
  jest.spyOn(executor, 'run').mockImplementationOnce(async (...args: Parameters<CommandExecutor['run']>) => {
    await original(...args);
    throw new Error('process killed after commit');
  });
}

describe('nothing is saved before a confirmation batch commits', () => {
  it('parse, corrections and the freeze alone save no transaction', async () => {
    const before = await count('transactions');
    const setup = await parsedImport(fileRows(6));
    expect(await count('transactions')).toBe(before);
    const patched = await patchRows(setup, 1, [{ source_row_id: 'row:2', note: 'checked by hand' }]);
    expect([patched.status, patched.body.review_revision]).toEqual([200, '2']);
    const selectionId = await frozen(setup, ids(setup.rows), { revision: '2' });
    expect(await count('transactions')).toBe(before);
    expect(await count('import_row_progress', setup.user.accountId)).toBe(0);
    expect(await count('import_selection_rows', setup.user.accountId)).toBe(6);
    // The change log has the correction revision and the selection, and nothing financial.
    const changes = await adminRows<{ entity: string; snapshot: unknown }>('SELECT entity, snapshot FROM entity_changes WHERE account_id = $1 AND entity LIKE $2 ORDER BY revision', [setup.user.accountId, 'import%']);
    expect(changes.map((change) => change.entity)).toEqual(['import_review', 'import_selection']);
    expect(isImportReviewSnapshot(changes[0].snapshot)).toBe(true);
    expect(changes[1].snapshot).toEqual({ id: selectionId, job_id: setup.jobId, frozen_revision: '2', row_count: 6, committed_count: 0 });
    expect(await adminRows(`SELECT 1 FROM entity_changes WHERE account_id = $1 AND entity = 'transaction'`, [setup.user.accountId])).toEqual([]);
  });

  it('progress shows a frozen selection with every row remaining', async () => {
    const setup = await parsedImport(fileRows(3));
    const selectionId = await frozen(setup, ids(setup.rows));
    const res = await as(setup.user).get(`/v1/imports/${setup.jobId}/selections/${selectionId}`);
    expect(res.status).toBe(200);
    expect(res.body as ImportSelectionProgress).toEqual({ selection_id: selectionId, job_id: setup.jobId, frozen_revision: '1', row_count: 3, status: 'open', committed: [], remaining: ids(setup.rows) });
  });
});

describe('foreign jobs, selections and rows', () => {
  it('another account cannot correct, freeze, confirm or read an import, and a foreign row or wallet is refused', async () => {
    const setup = await parsedImport(fileRows(4));
    const own = await parsedImport(fileRows(2));
    const intruder = own.user;
    const intruderWallet = own.wallets.cash;
    const theirs: Setup = { ...setup, user: intruder };
    expect((await patchRows(theirs, 1, [{ source_row_id: 'row:2', note: 'mine now' }])).status).toBe(404);
    expect((await freeze(theirs, ['row:2'])).status).toBe(404);
    const selectionId = await frozen(setup, ['row:2', 'row:3']);
    expect((await confirm(theirs, selectionId, ['row:2'])).status).toBe(404);
    expect((await as(intruder).get(`/v1/imports/${setup.jobId}/selections/${selectionId}`)).status).toBe(404);
    // The intruder's own import cannot name the owner's selection either.
    expect((await confirm(own, selectionId, ['row:2'])).status).toBe(404);
    expect((await as(setup.user).get(`/v1/imports/${own.jobId}/selections/${selectionId}`)).status).toBe(404);
    // A row the preview does not have, and a wallet the owner does not own.
    const unknown = await freeze(setup, ['row:2', 'row:99']);
    expect([unknown.status, unknown.body.code]).toEqual([422, 'VALIDATION_FAILED']);
    const foreignWallet = await freeze(setup, ['row:2'], { mapping: { ...setup.mapping, wallets: { Cash: intruderWallet, Bank: intruderWallet } } });
    expect([foreignWallet.status, foreignWallet.body.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect(await count('transactions', setup.user.accountId)).toBe(0);
    expect(await count('import_row_progress', intruder.accountId)).toBe(0);
  });

  it('the app login cannot write selections or candidates directly, nor record progress that is not its frozen row', async () => {
    const setup = await parsedImport(fileRows(2));
    const selectionId = await frozen(setup, ['row:2']);
    const other = await money.record(setup.user, { type: 'expense', amount_minor: '100', occurred_on: '2026-02-01', wallet_id: setup.wallets.cash, category_id: builtinId(setup.user, 'food') });
    const app = await db.loginPool(['gogospend_app'], 1);
    const client = await app.connect();
    const asOwner = async (sql: string, values: unknown[]) => {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [setup.user.accountId]);
      try {
        return await client.query(sql, values);
      } finally {
        await client.query('ROLLBACK');
      }
    };
    try {
      await expect(asOwner('UPDATE import_candidates SET note = $2 WHERE job_id = $1', [setup.jobId, 'x'])).rejects.toMatchObject({ code: '42501' });
      await expect(asOwner('INSERT INTO import_selections (account_id, selection_id, job_id, frozen_revision, row_count, expires_at) VALUES ($1, gen_random_uuid(), $2, 1, 1, now() + interval \'1 day\')', [setup.user.accountId, setup.jobId])).rejects.toMatchObject({ code: '42501' });
      await expect(asOwner('DELETE FROM import_row_progress WHERE account_id = $1', [setup.user.accountId])).rejects.toMatchObject({ code: '42501' });
      // A hand-made record is not the frozen row: the guard refuses it.
      await expect(asOwner(
        'INSERT INTO import_row_progress (account_id, job_id, source_row_id, selection_id, transaction_id, command_id) VALUES ($1, $2, $3, $4, $5, gen_random_uuid())',
        [setup.user.accountId, setup.jobId, 'row:2', selectionId, other],
      )).rejects.toMatchObject({ code: '23514' });
    } finally {
      client.release();
    }
  });
});

describe('the frozen selection and its batches', () => {
  it('a 5,000-row frozen selection succeeds, but a 501-row confirmation batch is rejected', async () => {
    const setup = await parsedImport(fileRows(5_000));
    const res = await freeze(setup, ids(setup.rows));
    expect(res.status).toBe(201);
    const ack = res.body as CommandAck;
    expect(ack).toMatchObject({ outcome: 'created', entity_state: 'active', version: 1 });
    expect(await count('import_selection_rows', setup.user.accountId)).toBe(5_000);
    const key = randomUUID();
    const tooMany = await confirm(setup, ack.entity_id, ids(setup.rows).slice(0, IMPORT_CONFIRM_BATCH_MAX_ROWS + 1), { key });
    expect([tooMany.status, tooMany.body.code, tooMany.body.fields]).toEqual([422, 'VALIDATION_FAILED', { batch_row_ids: 'VALIDATION_FAILED' }]);
    expect(await count('transactions', setup.user.accountId)).toBe(0);
    expect(await adminRows('SELECT 1 FROM command_receipts WHERE command_id = $1', [key])).toEqual([]);
    const first = await confirmed(setup, ack.entity_id, ids(setup.rows).slice(0, IMPORT_CONFIRM_BATCH_MAX_ROWS));
    expect(first.committed).toHaveLength(500);
    expect(first.remaining).toHaveLength(4_500);
    expect(await count('transactions', setup.user.accountId)).toBe(500);
  });

  // Ten 500-row confirms against a 5,000-row freeze; under a busy suite the
  // default 30 s timeout can trip even when each confirm is healthy.
  it('second_batch_uses_same_frozen_selection', async () => {
    const setup = await parsedImport(fileRows(5_000));
    const selectionId = await frozen(setup, ids(setup.rows));
    const results: ConfirmImportBatchResult[] = [];
    let remaining = ids(setup.rows);
    while (remaining.length > 0) {
      const result = await confirmed(setup, selectionId, remaining.slice(0, 500));
      results.push(result);
      remaining = result.remaining;
    }
    const [first, second] = results;
    const committedRowIds = results.flatMap((result) => result.committed);
    expect(first.selection_id).toBe(second.selection_id);
    expect(new Set(committedRowIds).size).toBe(5000);
    expect(results).toHaveLength(10);
    expect(new Set(results.map((result) => result.selection_id))).toEqual(new Set([selectionId]));
    expect(results.every((result) => result.conflicted.length === 0 && result.frozen_revision === '1')).toBe(true);
    // One version per batch on the selection, and one record per row.
    expect(results.map((result) => result.ack.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(await count('transactions', setup.user.accountId)).toBe(5_000);
    expect(await count('import_row_progress', setup.user.accountId)).toBe(5_000);
  }, 120_000);

  it('a changed frozen revision, a stale selection and rows outside the selection conflict, and committed rows are never rewritten', async () => {
    const setup = await parsedImport(fileRows(6));
    const selectionId = await frozen(setup, ['row:2', 'row:3', 'row:4', 'row:5']);
    const wrongRevision = await confirm(setup, selectionId, ['row:2'], { frozenRevision: '2' });
    expect([wrongRevision.status, wrongRevision.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT']);
    const outside = await confirm(setup, selectionId, ['row:2', 'row:6']);
    expect([outside.status, outside.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT']);
    expect(await count('transactions', setup.user.accountId)).toBe(0);

    const first = await confirmed(setup, selectionId, ['row:2', 'row:3']);
    expect(first.committed).toEqual(['row:2', 'row:3']);
    const before = await importTransactions(setup);

    // A correction after the freeze makes the selection stale; a committed row cannot be corrected.
    const committedRow = await patchRows(setup, 1, [{ source_row_id: 'row:2', amount_minor: '1' }]);
    expect([committedRow.status, committedRow.body.code]).toEqual([409, 'IMPORT_ROW_COMMITTED']);
    const corrected = await patchRows(setup, 1, [{ source_row_id: 'row:4', note: 'corrected after the freeze' }]);
    expect([corrected.status, corrected.body.review_revision]).toEqual([200, '2']);
    const stale = await confirm(setup, selectionId, ['row:4']);
    expect([stale.status, stale.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT']);
    expect(await count('transactions', setup.user.accountId)).toBe(2);
    const staleFreeze = await freeze(setup, ['row:4'], { revision: '1' });
    expect([staleFreeze.status, staleFreeze.body.code, staleFreeze.body.current]).toEqual([409, 'VERSION_CONFLICT', { review_revision: '2' }]);

    // A new selection at revision 2, mapping Cash to the Bank wallet: rows
    // already committed are acknowledged as they were, untouched.
    const remapped: ImportMapping = { ...setup.mapping, wallets: { Cash: setup.wallets.bank, Bank: setup.wallets.bank } };
    const next = await frozen(setup, ['row:2', 'row:3', 'row:4', 'row:5'], { revision: '2', mapping: remapped });
    const result = await confirmed(setup, next, ['row:2', 'row:3', 'row:4', 'row:5'], { frozenRevision: '2' });
    expect(result.committed).toEqual(['row:2', 'row:3', 'row:4', 'row:5']);
    const after = await importTransactions(setup);
    expect(after).toHaveLength(4);
    for (const record of before) expect(after).toContainEqual(record);
    const row4 = after.find((record) => record.id === transactionId(setup, 'row:4'));
    expect(row4).toMatchObject({ note: 'corrected after the freeze', wallet_id: setup.wallets.bank, version: 1 });
  });

  it('overlapping retries acknowledge committed rows and continue the untouched ones', async () => {
    const setup = await parsedImport(fileRows(10));
    const selectionId = await frozen(setup, ids(setup.rows));
    const all = ids(setup.rows);
    const key = randomUUID();
    const first = await confirmed(setup, selectionId, all.slice(0, 5), { key });
    // The same command again replays; an overlapping new command saves only what is new.
    const replay = await confirmed(setup, selectionId, all.slice(0, 5), { key });
    expect(replay).toEqual(first);
    const overlap = await confirmed(setup, selectionId, all.slice(2, 8));
    expect(overlap.committed).toEqual(all.slice(2, 8));
    expect(overlap.remaining).toEqual(all.slice(8));
    expect(await count('transactions', setup.user.accountId)).toBe(8);
    // Two overlapping commands at once: every row once.
    const [a, b] = await Promise.all([confirm(setup, selectionId, all.slice(6, 10)), confirm(setup, selectionId, all.slice(8, 10))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((a.body as ConfirmImportBatchResult).committed).toEqual(all.slice(6, 10));
    expect((b.body as ConfirmImportBatchResult).committed).toEqual(all.slice(8, 10));
    const records = await importTransactions(setup);
    expect(records.map((record) => record.id).sort()).toEqual(all.map((row) => transactionId(setup, row)).sort());
    expect(await count('import_row_progress', setup.user.accountId)).toBe(10);
    // The same key with another body is a mismatch, never a second save.
    const mismatch = await confirm(setup, selectionId, all.slice(0, 4), { key });
    expect([mismatch.status, mismatch.body.code]).toEqual([409, 'IDEMPOTENCY_MISMATCH']);
  });

  it('a record id already used is never written again, even if its progress row were lost', async () => {
    const setup = await parsedImport(fileRows(3));
    const selectionId = await frozen(setup, ids(setup.rows));
    await confirmed(setup, selectionId, ['row:2']);
    // Simulated loss of the progress row: the record (and its head) remain.
    await db.admin((client) => client.query(`DELETE FROM import_row_progress WHERE job_id = $1 AND source_row_id = 'row:2'`, [setup.jobId]));
    const again = await confirmed(setup, selectionId, ['row:2', 'row:3']);
    expect([again.committed, again.conflicted]).toEqual([['row:3'], ['row:2']]);
    expect(await count('transactions', setup.user.accountId)).toBe(2);
  });

  it('a kill after commit and before the response, retried with the original key and body, has the same outcome', async () => {
    const setup = await parsedImport(fileRows(8));
    const selectionId = await frozen(setup, ids(setup.rows));
    const key = randomUUID();
    killAfterCommitOnce();
    const lost = await confirm(setup, selectionId, ids(setup.rows).slice(0, 5), { key });
    expect(lost.status).toBe(500);
    expect(await count('transactions', setup.user.accountId)).toBe(5);
    const retried = await confirmed(setup, selectionId, ids(setup.rows).slice(0, 5), { key });
    const again = await confirmed(setup, selectionId, ids(setup.rows).slice(0, 5), { key });
    expect(retried).toEqual(again);
    expect(retried.committed).toEqual(ids(setup.rows).slice(0, 5));
    expect(retried.remaining).toEqual(ids(setup.rows).slice(5));
    const [receipt] = await adminRows<{ entity_id: string; entity_version: number; revision: string }>('SELECT entity_id, entity_version, revision::text AS revision FROM command_receipts WHERE command_id = $1', [key]);
    expect(retried.ack).toMatchObject({ command_id: key, entity_id: receipt.entity_id, version: receipt.entity_version, committed_revision: receipt.revision });
    expect(await count('transactions', setup.user.accountId)).toBe(5);
  });

  it('a batch over the change-group budget is refused before commit, and smaller batches with new keys save it', async () => {
    const long = (i: number) => `${'💸'.repeat(498)}${String(i % 100).padStart(2, '0')}`;
    const setup = await parsedImport(fileRows(500, { note: long, merchant: () => 'ร้าน'.repeat(30) }));
    const selectionId = await frozen(setup, ids(setup.rows));
    const key = randomUUID();
    const big = await confirm(setup, selectionId, ids(setup.rows), { key });
    expect([big.status, big.body.code]).toEqual([413, 'COMMAND_TOO_LARGE']);
    expect(await count('transactions', setup.user.accountId)).toBe(0);
    expect(await adminRows('SELECT 1 FROM command_receipts WHERE command_id = $1', [key])).toEqual([]);
    const halves = chunks(ids(setup.rows), 250);
    for (const half of halves) expect((await confirmed(setup, selectionId, half)).committed).toEqual(half);
    expect(await count('transactions', setup.user.accountId)).toBe(500);
  });

  it('a row whose wallet was archived after the freeze is conflicted; the rest are saved', async () => {
    const setup = await parsedImport(fileRows(6));
    const selectionId = await frozen(setup, ids(setup.rows));
    const bank = await as(setup.user).get(`/v1/wallets/${setup.wallets.bank}`);
    expect((await as(setup.user).post(`/v1/wallets/${setup.wallets.bank}/archive`, {}, { ifMatch: (bank.body as { version: number }).version })).status).toBe(200);
    const result = await confirmed(setup, selectionId, ids(setup.rows));
    const bankRows = setup.rows.filter((row) => row.wallet === 'Bank').map((row) => row.id);
    expect(result.conflicted).toEqual(bankRows);
    expect(result.committed).toEqual(ids(setup.rows).filter((id) => !bankRows.includes(id)));
    expect(result.remaining).toEqual([]);
    expect(await count('transactions', setup.user.accountId)).toBe(6 - bankRows.length);
  });

  it('a re-freeze after a partial confirmation does not re-validate rows already committed, even if their wallet or category was archived since', async () => {
    const setup = await parsedImport(fileRows(6));
    const all = ids(setup.rows);
    const firstSelection = await frozen(setup, all);
    // row:2 (Bank, food) and row:3 (Cash, travel) become records.
    expect((await confirmed(setup, firstSelection, ['row:2', 'row:3'])).committed).toEqual(['row:2', 'row:3']);
    const before = await importTransactions(setup);

    await archiveWalletWithRecords(setup, setup.wallets.bank);
    const foodId = builtinId(setup.user, 'food');
    const categories = (await as(setup.user).get('/v1/categories')).body as { id: string; version: number }[];
    const food = categories.find((category) => category.id === foodId);
    const archivedFood = await as(setup.user).post(`/v1/categories/${foodId}/archive`, {}, { ifMatch: food?.version });
    expect([archivedFood.status, archivedFood.body.code]).toEqual([200, undefined]);

    // Only the rows still to be written are problems: row:4 (food), row:5 (Bank) and row:6 (food).
    const refused = await freeze(setup, all);
    expect([refused.status, refused.body.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect(refused.body.fields).toEqual({ 'row:4': 'errors.category_archived', 'row:5': 'errors.wallet_archived', 'row:6': 'errors.category_archived' });

    // Dropping them, the full selection of committed rows plus the one open row freezes.
    const second = await frozen(setup, ['row:2', 'row:3', 'row:7']);
    const result = await confirmed(setup, second, ['row:2', 'row:3', 'row:7']);
    expect(result.committed).toEqual(['row:2', 'row:3', 'row:7']);
    expect(result.conflicted).toEqual([]);
    const after = await importTransactions(setup);
    expect(after).toHaveLength(3);
    for (const record of before) expect(after).toContainEqual(record);
  });

  it('a re-freeze of only committed rows succeeds after their wallet and category are archived', async () => {
    const setup = await parsedImport(fileRows(4));
    const firstSelection = await frozen(setup, ids(setup.rows));
    expect((await confirmed(setup, firstSelection, ['row:2'])).committed).toEqual(['row:2']);
    await archiveWalletWithRecords(setup, setup.wallets.bank);
    const second = await frozen(setup, ['row:2']);
    const result = await confirmed(setup, second, ['row:2']);
    expect([result.committed, result.conflicted, result.remaining]).toEqual([['row:2'], [], []]);
    expect(await count('transactions', setup.user.accountId)).toBe(1);
  });

  it('a row dated before its wallet\'s tracking start, moved after the freeze, is conflicted', async () => {
    const setup = await parsedImport(fileRows(6));
    const selectionId = await frozen(setup, ids(setup.rows));
    const cash = await as(setup.user).get(`/v1/wallets/${setup.wallets.cash}`);
    const moved = await as(setup.user).patch(`/v1/wallets/${setup.wallets.cash}`, { tracking_start: '2026-04-01' }, { ifMatch: (cash.body as { version: number }).version });
    expect(moved.status).toBe(200);
    const result = await confirmed(setup, selectionId, ids(setup.rows));
    const early = setup.rows.filter((row) => row.wallet === 'Cash' && row.date < '2026-04-01').map((row) => row.id);
    expect(early.length).toBeGreaterThan(0);
    expect(result.conflicted).toEqual(early);
    expect(await count('transactions', setup.user.accountId)).toBe(6 - early.length);
  });

  it('the database refuses stale, unknown and committed rows even when its routines are called directly', async () => {
    const setup = await parsedImport(fileRows(3));
    const selectionId = await frozen(setup, ['row:2', 'row:3']);
    await confirmed(setup, selectionId, ['row:3']);
    expect((await patchRows(setup, 1, [{ source_row_id: 'row:4', note: 'later' }])).status).toBe(200);
    const [row] = await adminRows<Record<string, string | null>>(
      `SELECT type, amount_minor::text AS amount_minor, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, wallet_id, category_id, note, merchant
         FROM import_selection_rows WHERE selection_id = $1 AND source_row_id = 'row:2'`, [selectionId]);
    const app = await db.loginPool(['gogospend_app'], 1);
    const client = await app.connect();
    const asOwner = async (run: () => Promise<unknown>) => {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [setup.user.accountId]);
      try {
        return await run();
      } finally {
        await client.query('ROLLBACK');
      }
    };
    try {
      // A record that is exactly the frozen row, recorded as progress of a selection the preview has moved past.
      await expect(asOwner(async () => {
        const id = transactionId(setup, 'row:2');
        await client.query(
          `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [setup.user.accountId, id, row.type, row.amount_minor, row.occurred_on, row.wallet_id, row.category_id, row.note, row.merchant],
        );
        await client.query('INSERT INTO import_row_progress (account_id, job_id, source_row_id, selection_id, transaction_id, command_id) VALUES ($1, $2, $3, $4, $5, gen_random_uuid())',
          [setup.user.accountId, setup.jobId, 'row:2', selectionId, id]);
      })).rejects.toMatchObject({ code: '23514' });
      const freezeDirect = (revision: number, rows: string[]) => asOwner(() => client.query('SELECT gogospend_freeze_import_selection(gen_random_uuid(), $1, $2, $3::text[], $4::jsonb)', [setup.jobId, revision, rows, JSON.stringify(setup.mapping)]));
      await expect(freezeDirect(1, ['row:2'])).rejects.toMatchObject({ code: '23514' });
      await expect(freezeDirect(2, ['row:2', 'row:99'])).rejects.toMatchObject({ code: '23514' });
      await expect(freezeDirect(2, ['row:2'])).resolves.toBeDefined();
      const patchDirect = (revision: number, rowId: string) => asOwner(() => client.query('SELECT gogospend_patch_import_rows($1, $2, $3::jsonb)', [setup.jobId, revision, JSON.stringify([{ source_row_id: rowId, set: { note: 'x' } }])]));
      await expect(patchDirect(2, 'row:3')).rejects.toMatchObject({ code: '23514' });
      await expect(patchDirect(1, 'row:2')).rejects.toMatchObject({ code: '23514' });
      await expect(patchDirect(2, 'row:99')).rejects.toMatchObject({ code: '23514' });
      await expect(patchDirect(2, 'row:2')).resolves.toBeDefined();
      // A committed source row stays committed once: a later selection cannot record it again.
      const later = await frozen(setup, ['row:3'], { revision: '2' });
      const [again] = await adminRows<Record<string, string | null>>(
        `SELECT type, amount_minor::text AS amount_minor, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, wallet_id, category_id, note, merchant
           FROM import_selection_rows WHERE selection_id = $1 AND source_row_id = 'row:3'`, [later]);
      await expect(asOwner(async () => {
        const id = '5e3c1f00-0000-4000-8000-000000000001';
        await client.query(
          `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [setup.user.accountId, id, again.type, again.amount_minor, again.occurred_on, again.wallet_id, again.category_id, again.note, again.merchant],
        );
        await client.query('INSERT INTO import_row_progress (account_id, job_id, source_row_id, selection_id, transaction_id, command_id) VALUES ($1, $2, $3, $4, $5, gen_random_uuid())',
          [setup.user.accountId, setup.jobId, 'row:3', later, id]);
      })).rejects.toMatchObject({ code: '23505' });
    } finally {
      client.release();
    }
  });

  it('every selected row needs its labels mapped, and transfers cannot be confirmed from a file', async () => {
    const setup = await parsedImport(fileRows(4));
    const unmapped = await freeze(setup, ids(setup.rows), { mapping: { ...setup.mapping, wallets: { Cash: setup.wallets.cash } } });
    expect([unmapped.status, unmapped.body.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect(unmapped.body.fields).toEqual(Object.fromEntries(setup.rows.filter((row) => row.wallet === 'Bank').map((row) => [row.id, 'errors.import_wallet_unmapped'])));
    const noCategory = await freeze(setup, ids(setup.rows), { mapping: { ...setup.mapping, categories: { expense: {}, income: setup.mapping.categories.income } } });
    expect(noCategory.body.fields).toEqual(Object.fromEntries(setup.rows.filter((row) => row.type === 'expense').map((row) => [row.id, 'errors.import_category_unmapped'])));
    expect((await patchRows(setup, 1, [{ source_row_id: 'row:2', type: 'transfer' }])).status).toBe(200);
    const transfer = await freeze(setup, ['row:2'], { revision: '2' });
    expect([transfer.status, transfer.body.code, transfer.body.fields]).toEqual([422, 'VALIDATION_FAILED', { 'row:2': 'errors.import_row_transfer' }]);
    expect(await count('import_selections', setup.user.accountId)).toBe(0);
  });
});

describe('receipts (P2c) kept with a confirmed image row', () => {
  /** A member with Cash, a parsed receipt photo, its single row corrected (revision 2) and frozen. */
  async function receiptImport(owner?: SignedUp) {
    const user = owner ?? (await money.member());
    const cash = owner ? null : await money.wallet(user, { name: 'Cash' });
    const accepted = await upload(user, await imageWithMetadata('jpeg'), { type: 'image/jpeg', name: 'receipt.jpg' });
    await runParse(accepted.job_id);
    const preview = await previewOf(user, accepted.job_id);
    expect(preview.candidates.map((row) => row.source_row_id)).toEqual(['image:1']);
    const attachmentId = preview.summary?.image?.attachment_id as string;
    expect(attachmentId).toMatch(/^[0-9a-f-]{36}$/);
    const setup: Setup = { user, jobId: accepted.job_id, rows: [], wallets: { cash: cash ?? '', bank: '' }, mapping: { wallets: {}, categories: { expense: {}, income: {} } } };
    return { setup, attachmentId };
  }

  it('the record an image row becomes holds the kept receipt, in the same command, only with consent', async () => {
    const { setup, attachmentId } = await receiptImport();
    const other = await receiptImport(setup.user);
    const corrected = await patchRows(setup, 1, [{ source_row_id: 'image:1', occurred_on: '2026-03-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash', category_label: 'food' }]);
    expect(corrected.status).toBe(200);
    const mapping: ImportMapping = { wallets: { Cash: setup.wallets.cash }, categories: { expense: { food: builtinId(setup.user, 'food') }, income: {} } };
    const selectionId = await frozen({ ...setup, mapping }, ['image:1'], { revision: '2', mapping });
    const noConsent = await confirm(setup, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: 'yes' } });
    expect([noConsent.status, noConsent.body.message_key]).toEqual([422, 'errors.consent_required']);
    const elsewhere = await confirm(setup, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: other.attachmentId, consent: 'retain_receipt' } });
    expect([elsewhere.status, elsewhere.body.message_key]).toEqual([422, 'errors.import_receipt_not_this_import']);
    expect(await count('transactions', setup.user.accountId)).toBe(0);
    expect(await count('attachments', setup.user.accountId)).toBe(0);
    // The copy made for the refused command is due at once, not left reserved.
    expect(await adminRows(`SELECT key FROM object_publications WHERE account_id = $1 AND purpose = 'receipt' AND delete_after > now()`, [setup.user.accountId])).toEqual([]);

    const key = randomUUID();
    const receipt = { attachment_id: attachmentId, consent: 'retain_receipt' };
    const result = await confirmed(setup, selectionId, ['image:1'], { frozenRevision: '2', key, receipt });
    expect(result.committed).toEqual(['image:1']);
    const recordId = transactionId(setup, 'image:1');
    const record = await as(setup.user).get(`/v1/transactions/${recordId}`);
    expect(record.body).toMatchObject({ id: recordId, amount_minor: '6500', occurred_on: '2026-03-03', version: 1, attachment_id: attachmentId });
    const [change] = await adminRows<{ snapshot: { attachment_id?: string } }>(`SELECT snapshot FROM entity_changes WHERE account_id = $1 AND entity = 'transaction' AND entity_id = $2`, [setup.user.accountId, recordId]);
    expect(change.snapshot.attachment_id).toBe(attachmentId);
    const [audit] = await adminRows<{ metadata: Record<string, string> }>(`SELECT metadata FROM audit_events WHERE command_id = $1`, [key]);
    expect(audit.metadata).toMatchObject({ consent: 'retain_receipt', rows: '1' });
    // A replay keeps exactly one receipt and one published copy.
    expect(await confirmed(setup, selectionId, ['image:1'], { frozenRevision: '2', key, receipt })).toEqual(result);
    expect(await adminRows(`SELECT status FROM attachments WHERE account_id = $1`, [setup.user.accountId])).toEqual([{ status: 'retained' }]);
    expect(await adminRows(`SELECT status FROM object_publications WHERE account_id = $1 AND purpose = 'receipt' AND status = 'published'`, [setup.user.accountId])).toEqual([{ status: 'published' }]);
    expect((await as(setup.user).get(`/v1/attachments/${attachmentId}/grant`)).status).toBe(200);
  });

  it('a receipt that can no longer be kept refuses the batch, and the record can be saved without it', async () => {
    const { setup, attachmentId } = await receiptImport();
    expect((await patchRows(setup, 1, [{ source_row_id: 'image:1', occurred_on: '2026-03-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash', category_label: 'food' }])).status).toBe(200);
    const mapping: ImportMapping = { wallets: { Cash: setup.wallets.cash }, categories: { expense: { food: builtinId(setup.user, 'food') }, income: {} } };
    const selectionId = await frozen({ ...setup, mapping }, ['image:1'], { revision: '2', mapping });
    // The sanitized image is past its window (less than two minutes left).
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() + interval '1 minute' WHERE job_id = $1 AND purpose = 'import_image'`, [setup.jobId]));
    const late = await confirm(setup, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: 'retain_receipt' } });
    expect([late.status, late.body.message_key]).toEqual([422, 'errors.attachment_expired']);
    expect(await count('transactions', setup.user.accountId)).toBe(0);
    const alone = await confirmed(setup, selectionId, ['image:1'], { frozenRevision: '2' });
    expect(alone.committed).toEqual(['image:1']);
    const record = await as(setup.user).get(`/v1/transactions/${transactionId(setup, 'image:1')}`);
    expect(record.body.attachment_id).toBeUndefined();
    expect(await count('attachments', setup.user.accountId)).toBe(0);
  });

  it('a receipt goes only with its image row', async () => {
    const setup = await parsedImport(fileRows(2));
    const selectionId = await frozen(setup, ids(setup.rows));
    const res = await confirm(setup, selectionId, ids(setup.rows), { receipt: { attachment_id: randomUUID(), consent: 'retain_receipt' } });
    expect([res.status, res.body.fields]).toEqual([422, { receipt: 'VALIDATION_FAILED' }]);
  });
});

describe('review corrections', () => {
  it('are versioned commands that clear the corrected issues and recompute the totals', async () => {
    const setup = await parsedImport(fileRows(3));
    const key = randomUUID();
    const res = await patchRows(setup, 1, [{ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null }, { source_row_id: 'row:3', occurred_on: '2026-03-03', note: '' }], key);
    expect(res.status).toBe(200);
    expect(res.body.review_revision).toBe('2');
    expect(res.body.ack).toMatchObject({ command_id: key, entity_id: setup.jobId, outcome: 'updated', version: 1 });
    expect((await patchRows(setup, 1, [{ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null }, { source_row_id: 'row:3', occurred_on: '2026-03-03', note: '' }], key)).body).toEqual(res.body);
    const preview = await previewOf(setup.user, setup.jobId);
    expect(preview.review_revision).toBe('2');
    expect(preview.candidates[0]).toMatchObject({ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null, review_required: true });
    expect(preview.candidates[1]).toMatchObject({ source_row_id: 'row:3', occurred_on: '2026-03-03', note: null });
    const expense = setup.rows.slice(1).filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.minor, 12345n);
    expect(preview.summary?.totals.expense_minor).toBe(expense.toString());
    const stale = await patchRows(setup, 1, [{ source_row_id: 'row:4', note: 'late' }]);
    expect([stale.status, stale.body.code, stale.body.current]).toEqual([409, 'VERSION_CONFLICT', { review_revision: '2' }]);
    const tooMany = await patchRows(setup, 2, Array.from({ length: 501 }, (_, i) => ({ source_row_id: `row:${i + 2}`, note: 'x' })));
    expect([tooMany.status, tooMany.body.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect((await patchRows(setup, 2, [{ source_row_id: 'row:99', note: 'x' }])).status).toBe(422);
  });
});

describe('expiry and retention', () => {
  it('an expired preview cannot be frozen or confirmed, and retention removes its frozen copies and synced records', async () => {
    const setup = await parsedImport(fileRows(3));
    expect((await patchRows(setup, 1, [{ source_row_id: 'row:2', note: 'kept' }])).status).toBe(200);
    const selectionId = await frozen(setup, ids(setup.rows), { revision: '2' });
    await db.admin((client) => client.query(`UPDATE import_previews SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE job_id = $1`, [setup.jobId]));
    await db.admin((client) => client.query(`UPDATE import_selections SET expires_at = now() - interval '1 day' WHERE job_id = $1`, [setup.jobId]));
    const refreeze = await freeze(setup, ids(setup.rows), { revision: '2' });
    expect([refreeze.status, refreeze.body.code]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE']);
    const late = await confirm(setup, selectionId, ['row:2'], { frozenRevision: '2' });
    expect([late.status, late.body.code]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE']);
    const step = defaultPrivacySteps().retentionSteps().find((candidate) => candidate.name === 'imports.selections');
    expect(step).toBeDefined();
    const heads = () => adminRows<{ entity: string; state: string }>(`SELECT entity, state FROM entity_heads WHERE account_id = $1 AND entity LIKE 'import%' ORDER BY entity`, [setup.user.accountId]);
    const [{ pruned_through: before }] = await adminRows<{ pruned_through: string }>('SELECT pruned_through::text FROM account_sync_state WHERE account_id = $1', [setup.user.accountId]);
    // At the preview's expiry the frozen copies (private fields) go at once ...
    expect(await step?.run(jobsPool)).toBe(1);
    expect(await count('import_selections', setup.user.accountId)).toBe(0);
    expect(await count('import_selection_rows', setup.user.accountId)).toBe(0);
    // ... while the compact synced records stay inside the 30-day delta window (no forced resync).
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'active' }, { entity: 'import_selection', state: 'active' }]);
    expect((await adminRows<{ pruned_through: string }>('SELECT pruned_through::text FROM account_sync_state WHERE account_id = $1', [setup.user.accountId]))[0].pruned_through).toBe(before);
    await db.admin((client) => client.query(`UPDATE entity_changes SET committed_at = now() - interval '31 days' WHERE account_id = $1 AND entity LIKE 'import%'`, [setup.user.accountId]));
    expect(await step?.run(jobsPool)).toBe(2);
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'purged' }, { entity: 'import_selection', state: 'purged' }]);
    expect(await step?.run(jobsPool)).toBe(0);
  });
});

describe('import retention is not starved by accounts it must skip', () => {
  /** Two accounts, each with a frozen selection that is already due; returns [first, second] in the routine's account order. */
  async function twoDueAccounts(): Promise<[Setup, Setup]> {
    const pair: Setup[] = [];
    for (let n = 0; n < 2; n += 1) {
      const setup = await parsedImport(fileRows(2));
      await frozen(setup, ids(setup.rows));
      await db.admin((client) => client.query(`UPDATE import_selections SET expires_at = now() - interval '1 day' WHERE job_id = $1`, [setup.jobId]));
      pair.push(setup);
    }
    return pair.sort((a, b) => (a.user.accountId < b.user.accountId ? -1 : 1)) as [Setup, Setup];
  }
  const prune = async (limit: number): Promise<number> => Number((await jobsPool.query<{ n: number }>('SELECT gogospend_prune_import_selections($1) AS n', [limit])).rows[0].n);
  const dueFor = async (accountId: string): Promise<number> => (await adminRows<{ n: string }>(`SELECT count(*) AS n FROM import_selections WHERE account_id = $1 AND expires_at <= now()`, [accountId]).then((rows) => Number(rows[0].n)));

  it('an account being erased that sorts first does not use up the limit', async () => {
    // Other test accounts may hold due selections too: keep only this pair due.
    await db.admin((client) => client.query(`UPDATE import_selections SET expires_at = now() + interval '1 day' WHERE expires_at <= now()`));
    const [first, second] = await twoDueAccounts();
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting' WHERE id = $1`, [first.user.accountId]));
    expect(await prune(1)).toBe(1);
    expect(await dueFor(second.user.accountId)).toBe(0);
    expect(await dueFor(first.user.accountId)).toBe(1);
  });

  it('an account whose lock is held by a user write that sorts first does not use up the limit', async () => {
    await db.admin((client) => client.query(`UPDATE import_selections SET expires_at = now() + interval '1 day' WHERE expires_at <= now()`));
    const [first, second] = await twoDueAccounts();
    const pruned = await db.admin(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [first.user.accountId]);
        return await prune(1);
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(pruned).toBe(1);
    expect(await dueFor(second.user.accountId)).toBe(0);
    expect(await dueFor(first.user.accountId)).toBe(1);
  });

  it('the limit still bounds how many accounts one call prunes', async () => {
    await db.admin((client) => client.query(`UPDATE import_selections SET expires_at = now() + interval '1 day' WHERE expires_at <= now()`));
    const [first, second] = await twoDueAccounts();
    expect(await prune(1)).toBe(1);
    expect([await dueFor(first.user.accountId), await dueFor(second.user.accountId)]).toEqual([0, 1]);
    expect(await prune(1)).toBe(1);
  });
});

describe('a 5,000-row synthetic import', () => {
  it('confirms in batches of 500 through one interruption and restart, and reconciles exact wallet and category totals', async () => {
    const setup = await parsedImport(fileRows(5_000));
    const selectionId = await frozen(setup, ids(setup.rows));
    let remaining = ids(setup.rows);
    let batches = 0;
    let interrupted: { key: string; rows: string[] } | null = null;
    while (remaining.length > 0) {
      const batch = remaining.slice(0, 500);
      const key = randomUUID();
      if (batches === 4 && !interrupted) {
        // The fifth batch commits, the process dies before answering, and the API restarts.
        killAfterCommitOnce();
        expect((await confirm(setup, selectionId, batch, { key })).status).toBe(500);
        interrupted = { key, rows: batch };
        await v1.close();
        await startApp();
        // The client resolves the unknown outcome with the original key and body first.
        const resolved = await confirmed(setup, selectionId, interrupted.rows, { key: interrupted.key });
        expect(resolved.committed).toEqual(batch);
        remaining = resolved.remaining;
        batches += 1;
        continue;
      }
      const result = await confirmed(setup, selectionId, batch, { key });
      expect(result.committed).toEqual(batch);
      remaining = result.remaining;
      batches += 1;
    }
    expect(batches).toBe(10);
    expect(interrupted).not.toBeNull();
    expect(await count('transactions', setup.user.accountId)).toBe(5_000);
    expect(await count('import_row_progress', setup.user.accountId)).toBe(5_000);

    const signed = (row: FileRow) => (row.type === 'income' ? row.minor : -row.minor);
    const expectedWallets = { [setup.wallets.cash]: 0n, [setup.wallets.bank]: 0n };
    const expectedCategories: Record<string, bigint> = {};
    for (const row of setup.rows) {
      const wallet = row.wallet === 'Cash' ? setup.wallets.cash : setup.wallets.bank;
      expectedWallets[wallet] += signed(row);
      const category = builtinId(setup.user, row.category as 'food' | 'travel' | 'salary');
      expectedCategories[category] = (expectedCategories[category] ?? 0n) + row.minor;
    }
    const balances = await money.balances(setup.user);
    expect(balances).toEqual(Object.fromEntries(Object.entries(expectedWallets).map(([id, total]) => [id, total.toString()])));
    const categories = await adminRows<{ category_id: string; total: string }>(
      'SELECT category_id, sum(amount_minor)::text AS total FROM transactions WHERE account_id = $1 GROUP BY category_id', [setup.user.accountId]);
    expect(Object.fromEntries(categories.map((row) => [row.category_id, row.total]))).toEqual(Object.fromEntries(Object.entries(expectedCategories).map(([id, total]) => [id, total.toString()])));
    const progress = await as(setup.user).get(`/v1/imports/${setup.jobId}/selections/${selectionId}`);
    expect(progress.body).toMatchObject({ status: 'open', remaining: [] });
    expect((progress.body as ImportSelectionProgress).committed).toHaveLength(5_000);
  }, 180_000);
});

describe('privacy of receipts and synced progress', () => {
  it('receipts, audit rows and synced progress carry no candidate fields', async () => {
    const rows = fileRows(4, { note: (i) => `secret-note-${i}`, merchant: (i) => `secret-shop-${i}` });
    const setup = await parsedImport(rows);
    expect((await patchRows(setup, 1, [{ source_row_id: 'row:2', note: 'secret-patched-note' }])).status).toBe(200);
    const selectionId = await frozen(setup, ids(rows), { revision: '2' });
    await confirmed(setup, selectionId, ids(rows), { frozenRevision: '2' });
    const changes = await adminRows<{ entity: string; snapshot: unknown }>(`SELECT entity, snapshot FROM entity_changes WHERE account_id = $1 AND entity LIKE 'import%'`, [setup.user.accountId]);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    for (const change of changes) {
      expect(change.entity === 'import_review' ? isImportReviewSnapshot(change.snapshot) : isImportSelectionSnapshot(change.snapshot)).toBe(true);
    }
    const receipts = await adminRows('SELECT * FROM command_receipts WHERE account_id = $1', [setup.user.accountId]);
    const audit = await adminRows('SELECT kind, metadata FROM audit_events WHERE account_id = $1', [setup.user.accountId]);
    const text = JSON.stringify({ changes, receipts, audit });
    for (const secret of ['secret-note', 'secret-shop', 'secret-patched-note', 'Cash', 'Bank', 'food', 'salary']) expect(text).not.toContain(secret);
  });

  it('registers selection retention, and the new tables cascade from accounts', async () => {
    expect(defaultPrivacySteps().retentionSteps().map((step) => step.name)).toContain('imports.selections');
    const cascades = await adminRows<{ table_name: string }>(
      `SELECT c.conrelid::regclass::text AS table_name FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = 'accounts'::regclass AND c.confdeltype = 'c'
          AND c.conrelid::regclass::text IN ('import_selections', 'import_selection_rows', 'import_row_progress')
        ORDER BY 1`,
    );
    expect(cascades.map((row) => row.table_name)).toEqual(['import_row_progress', 'import_selection_rows', 'import_selections']);
  });

  it('Drizzle definitions match the migrated confirmation tables', async () => {
    for (const table of [importSelections, importSelectionRows, importRowProgress]) {
      const config = getTableConfig(table);
      const fromDatabase = await adminRows<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
        [config.name],
      );
      expect(fromDatabase.map((row) => [row.column_name, row.is_nullable === 'NO'])).toEqual(
        config.columns.map((column) => [column.name, column.notNull]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      );
    }
  });
});
