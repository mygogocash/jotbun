import { createHash, randomUUID } from 'node:crypto';

import { EXPORT_CSV_BOM, EXPORT_CSV_COLUMNS, EXPORT_DOWNLOAD_PATH, exportFileName, isCommittedChangeGroup, isExportDto, isExportGrant } from '@gogospend/contracts';
import type { CommandAck, ExportDto, ExportFilter, ExportGrant, HistoryPage, SyncChangesPage, TransactionDto } from '@gogospend/contracts';
import type { Pool } from 'pg';
import request from 'supertest';

import { LeasedAccountRead, LeasedReadDenied } from '../database/leased-account-read';
import { buildHandlers } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import { JobWorker } from '../jobs/worker';
import { setLogSink } from '../common/safe-request-logger';
import { ObjectPublicationService } from '../storage/object-publication.service';
import type { MemoryObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { queueAccountJob } from '../testing/job-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, expectOk, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';
import { ExportHandler, exportCleanupOverdue } from './export-handler';
import type { ExportHandlerOptions } from './export-handler';
import { ExportService } from './export.service';

const HOUR = 3_600_000;
const MARCH: ExportFilter = { from: '2026-03-01', through: '2026-03-31' };

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let store: MemoryObjectStore;
let jobsPool: Pool;
let jobs: JobRepository;
let reader: LeasedAccountRead;
let publication: ObjectPublicationService;
let worker: JobWorker;
let service: ExportService;

const deps = () => ({ jobs, reader, store, publication, pool: jobsPool });

/** Raw response bytes (the CSV starts with a byte order mark that text decoding could hide). */
const binary = (res: unknown, done: (error: Error | null, body: Buffer) => void) => {
  const stream = res as NodeJS.ReadableStream;
  const parts: Buffer[] = [];
  stream.on('data', (part: Buffer) => parts.push(part));
  stream.on('end', () => done(null, Buffer.concat(parts)));
};

async function headers(user: SignedUp): Promise<Record<string, string>> {
  return { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`, 'x-gogospend-session': user.binding };
}

async function fetchFile(user: SignedUp, url: string) {
  return request(v1.app.getHttpServer()).get(url).set(await headers(user)).buffer(true).parse(binary);
}

/** POST /v1/exports with a fresh export proof bound to the key (unless one is given). */
async function requestExport(user: SignedUp, filter: ExportFilter = MARCH, options: { key?: string; proofId?: string; schema?: number | null } = {}) {
  const key = options.key ?? randomUUID();
  const proofId = options.proofId ?? (await fx.proven(user.who, 'export', key));
  const res = await as(user).post('/v1/exports', { proof_id: proofId, ...filter }, { key, schema: options.schema });
  return { res, key, proofId };
}

async function drain(): Promise<void> {
  for (let i = 0; i < 20 && (await worker.runOnce()) === 'ran'; i += 1);
}

async function readyExport(user: SignedUp, filter: ExportFilter = MARCH): Promise<Extract<ExportDto, { status: 'ready' }>> {
  const { res } = await requestExport(user, filter);
  expect(res.status).toBe(202);
  await drain();
  const status = await as(user).get(`/v1/exports/${(res.body as CommandAck).entity_id}`);
  expect(status.status).toBe(200);
  expect(status.body.status).toBe('ready');
  return status.body as Extract<ExportDto, { status: 'ready' }>;
}

async function download(user: SignedUp, exportId: string): Promise<{ grant: ExportGrant; body: Buffer; text: string }> {
  const grant = await as(user).get(`/v1/exports/${exportId}/grant`);
  expect(grant.status).toBe(200);
  const file = await fetchFile(user, grant.body.url);
  expect(file.status).toBe(200);
  const body = file.body as Buffer;
  return { grant: grant.body as ExportGrant, body, text: body.toString('utf8') };
}

/** A strict RFC 4180 reader (CRLF records, "" escapes). */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 1;
    } else field += char;
  }
  if (field !== '' || record.length > 0) throw new Error('the CSV does not end with CRLF');
  return records;
}

function csvRecords(text: string): Record<string, string>[] {
  expect(text.startsWith(EXPORT_CSV_BOM)).toBe(true);
  const [header, ...rows] = parseCsv(text.slice(EXPORT_CSV_BOM.length));
  expect(header).toEqual([...EXPORT_CSV_COLUMNS]);
  return rows.map((row) => Object.fromEntries(row.map((value, i) => [header[i], value])));
}

const exportsOf = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT export_id, ready_at, object_key, expires_at FROM exports WHERE account_id = $1', [accountId]))).rows;
const jobsOf = async (accountId: string) =>
  (await db.admin((client) => client.query(`SELECT id, status, payload, last_error FROM jobs WHERE account_id = $1 AND kind = 'export' ORDER BY created_at`, [accountId]))).rows;
const revisionOf = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT revision::text AS revision FROM account_sync_state WHERE account_id = $1', [accountId]))).rows[0].revision as string;
const withoutRequestId = (body: Record<string, unknown>) => ({ ...body, request_id: undefined });

async function claimExport(): Promise<ClaimedJob> {
  const [claimed] = await jobs.claim(['export'], { leaseSeconds: 60 });
  expect(claimed).toBeDefined();
  return claimed;
}

/** A member with March records on and around the period's edges, including hostile text. */
async function marchDiary() {
  const user = await money.member();
  const cash = await money.wallet(user, { name: 'Cash' });
  const bank = await money.wallet(user, { name: '=Bank', opening_minor: '100000' });
  const lunch = randomUUID();
  await expectOk(await as(user).post('/v1/categories', { id: lunch, type: 'expense', label: '@Lunch' }), 201);
  const food = builtinId(user, 'food');
  const salary = builtinId(user, 'salary');
  const ids = {
    before: await money.record(user, { type: 'expense', amount_minor: '111', occurred_on: '2026-02-28', wallet_id: cash, category_id: food }),
    first: await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: food, note: '=SUM(A1:A2)', merchant: 'Cafe, "Amazon"' }),
    salary: await money.record(user, { type: 'income', amount_minor: '2800000', occurred_on: '2026-03-10', wallet_id: bank, category_id: salary, note: 'line one\nline two' }),
    transfer: await money.record(user, { type: 'transfer', amount_minor: '150000', occurred_on: '2026-03-15', source_wallet_id: bank, destination_wallet_id: cash, note: '+66 top-up' }),
    largest: await money.record(user, { type: 'expense', amount_minor: '99999999999', occurred_on: '2026-03-20', wallet_id: bank, category_id: food, merchant: '-minus' }),
    deleted: await money.record(user, { type: 'expense', amount_minor: '222', occurred_on: '2026-03-25', wallet_id: cash, category_id: food }),
    last: await money.record(user, { type: 'expense', amount_minor: '18200', occurred_on: '2026-03-31', wallet_id: cash, category_id: lunch, note: 'ข้าวมันไก่' }),
    after: await money.record(user, { type: 'income', amount_minor: '333', occurred_on: '2026-04-01', wallet_id: bank, category_id: salary }),
  };
  await expectOk(await as(user).raw('delete', `/v1/transactions/${ids.deleted}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': '"1"' }));
  return { user, cash, bank, lunch, food, salary, ids };
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  // The worker shares the API's object store (one process's memory store here).
  store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  jobs = new JobRepository(jobsPool);
  reader = new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2));
  publication = new ObjectPublicationService(jobsPool, store);
  worker = new JobWorker(jobs, buildHandlers(deps()));
  service = v1.app.get(ExportService);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  // Each test claims only its own jobs.
  await db.admin((client) => client.query(`DELETE FROM jobs WHERE status IN ('queued', 'leased')`));
});

describe('requesting an export', () => {
  it('needs a fresh export proof bound to its own command, and queues one owned job', async () => {
    const user = await money.member();
    const missing = await requestExport(user, MARCH, { proofId: randomUUID() });
    expect(missing.res.status).toBe(401);
    expect(missing.res.body.code).toBe('REAUTH_REQUIRED');

    const key = randomUUID();
    const wrongPurpose = await requestExport(user, MARCH, { key, proofId: await fx.proven(user.who, 'global_logout', key) });
    expect(wrongPurpose.res.status).toBe(401);
    const otherCommand = await requestExport(user, MARCH, { proofId: await fx.proven(user.who, 'export', randomUUID()) });
    expect(otherCommand.res.status).toBe(401);
    const staleKey = randomUUID();
    const stale = await fx.proven(user.who, 'export', staleKey);
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET auth_time = now() - interval '6 minutes' WHERE id = $1`, [stale]));
    expect((await requestExport(user, MARCH, { key: staleKey, proofId: stale })).res.status).toBe(401);
    expect(await jobsOf(user.accountId)).toEqual([]);
    expect(await exportsOf(user.accountId)).toEqual([]);

    const { res, key: accepted, proofId } = await requestExport(user);
    expect(res.status).toBe(202);
    const ack = res.body as CommandAck;
    expect(ack).toMatchObject({ command_id: accepted, version: 1, outcome: 'accepted', entity_state: 'active' });
    const queued = await jobsOf(user.accountId);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: ack.entity_id, status: 'queued', payload: { from: MARCH.from, through: MARCH.through } });
    expect(ack.committed_revision).toBe(await revisionOf(user.accountId));
    // The proof was consumed by this command.
    expect((await requestExport(user, MARCH, { proofId })).res.status).toBe(401);

    // The request is an `export` entity in the change log, valid for sync.
    const changes = (await as(user).get('/v1/sync/changes?limit=1000')).body as SyncChangesPage;
    const group = changes.groups.find((g) => g.command_id === accepted);
    expect(group && isCommittedChangeGroup(group)).toBe(true);
    expect(group?.changes).toEqual([{ entity: 'export', id: ack.entity_id, version: 1, state: 'active', snapshot: { id: ack.entity_id, from: MARCH.from, through: MARCH.through } }]);
  });

  it('a replayed request returns the same acknowledgement and queues nothing new', async () => {
    const user = await money.member();
    const first = await requestExport(user);
    expect(first.res.status).toBe(202);
    const replay = await as(user).post('/v1/exports', { proof_id: first.proofId, ...MARCH }, { key: first.key });
    expect(replay.status).toBe(202);
    expect(replay.body).toEqual(first.res.body);
    expect(await jobsOf(user.accountId)).toHaveLength(1);
    expect(await exportsOf(user.accountId)).toHaveLength(1);
    const status = await as(user).post('/v1/commands/status', { command_ids: [first.key] });
    expect(status.body.statuses[0]).toEqual({ command_id: first.key, state: 'known', ack: first.res.body });
    const changed = await as(user).post('/v1/exports', { proof_id: first.proofId, from: MARCH.from, through: '2026-04-30' }, { key: first.key });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('validates the period like history, and refuses an unsupported schema before using the proof', async () => {
    const user = await money.member();
    expect((await requestExport(user, { from: '2026-03-31', through: '2026-03-01' })).res.status).toBe(422);
    expect((await requestExport(user, { from: '2026-02-30', through: '2026-03-01' })).res.body.code).toBe('INVALID_DATE');
    expect((await requestExport(user, { from: '1969-12-31', through: '2026-03-01' })).res.body.code).toBe('INVALID_DATE');
    const key = randomUUID();
    const proofId = await fx.proven(user.who, 'export', key);
    expect((await as(user).post('/v1/exports', { proof_id: proofId, ...MARCH, account_id: user.accountId }, { key })).body.code).toBe('UNKNOWN_FIELD');
    const unsupported = await as(user).post('/v1/exports', { proof_id: proofId, ...MARCH }, { key, schema: null });
    expect(unsupported.status).toBe(422);
    expect(unsupported.body.code).toBe('COMMAND_SCHEMA_UNSUPPORTED');
    expect((await as(user).post('/v1/exports', { proof_id: proofId, ...MARCH }, { key })).status).toBe(202);
  });

  it('stays reachable while a required policy is not accepted, but needs a bound session', async () => {
    const pending = await fx.signUp();
    const wallet = await as(pending).post('/v1/wallets', { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01' });
    expect(wallet.status).toBe(403);
    expect(wallet.body.code).toBe('POLICY_ACCEPTANCE_REQUIRED');
    const { res } = await requestExport(pending);
    expect(res.status).toBe(202);
    await drain();
    const status = await as(pending).get(`/v1/exports/${res.body.entity_id}`);
    expect(status.body).toMatchObject({ status: 'ready', row_count: 0 });
    const { text } = await download(pending, res.body.entity_id);
    expect(csvRecords(text)).toEqual([]);
    const unbound = await request(v1.app.getHttpServer())
      .post('/v1/exports')
      .set({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: pending.who.subject })}`, 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' })
      .send({ proof_id: randomUUID(), ...MARCH });
    expect(unbound.status).toBe(401);
  });
});

describe('the export file', () => {
  it('holds every income, expense and transfer field of the period exactly, and reconciles with history', async () => {
    const { user, cash, bank, lunch, food, salary, ids } = await marchDiary();
    const dto = await readyExport(user);
    expect(isExportDto(dto)).toBe(true);
    expect(dto).toMatchObject({ status: 'ready', from: MARCH.from, through: MARCH.through, row_count: 5, as_of_revision: await revisionOf(user.accountId) });
    expect(Math.abs(Date.parse(dto.expires_at) - (Date.now() + 24 * HOUR))).toBeLessThan(5 * 60_000);

    const grant = await as(user).get(`/v1/exports/${dto.export_id}/grant`);
    expect(grant.status).toBe(200);
    expect(isExportGrant(grant.body)).toBe(true);
    expect(grant.body.url.startsWith(EXPORT_DOWNLOAD_PATH)).toBe(true);
    expect(Date.parse(grant.body.expires_at) - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 1000);
    expect(JSON.stringify(grant.body)).not.toContain('export/');
    const file = await fetchFile(user, grant.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/^text\/csv/);
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.headers['content-disposition']).toBe(`attachment; filename="${exportFileName(MARCH)}"`);
    const body = file.body as Buffer;
    expect(body.byteLength).toBe(dto.bytes);
    expect(createHash('sha256').update(body).digest('hex')).toBe(dto.sha256);
    const text = body.toString('utf8');
    const rows = csvRecords(text);

    // Exactly the active records dated within the period, both edges included, in date order.
    expect(rows.map((row) => row.record_id)).toEqual([ids.first, ids.salary, ids.transfer, ids.largest, ids.last]);
    const byId = new Map(rows.map((row) => [row.record_id, row]));
    expect(byId.get(ids.first)).toEqual({
      record_id: ids.first, date: '2026-03-01', type: 'expense', amount: '65.00', amount_minor: '6500', currency: 'THB',
      wallet_id: cash, wallet_name: 'Cash', category_id: food, category_name: 'food', category_builtin_key: 'food',
      source_wallet_id: '', source_wallet_name: '', destination_wallet_id: '', destination_wallet_name: '',
      merchant: 'Cafe, "Amazon"', note: "'=SUM(A1:A2)", version: '1',
    });
    expect(byId.get(ids.salary)).toMatchObject({ type: 'income', amount_minor: '2800000', wallet_id: bank, wallet_name: "'=Bank", category_id: salary, category_builtin_key: 'salary', note: 'line one\nline two' });
    expect(byId.get(ids.transfer)).toMatchObject({
      type: 'transfer', amount: '1500.00', amount_minor: '150000', wallet_id: '', category_id: '', category_name: '',
      source_wallet_id: bank, source_wallet_name: "'=Bank", destination_wallet_id: cash, destination_wallet_name: 'Cash', note: "'+66 top-up",
    });
    expect(byId.get(ids.largest)).toMatchObject({ amount: '999999999.99', amount_minor: '99999999999', merchant: "'-minus" });
    expect(byId.get(ids.last)).toMatchObject({ date: '2026-03-31', category_id: lunch, category_name: "'@Lunch", category_builtin_key: '', note: 'ข้าวมันไก่' });

    // Reconciles with history over the same period, record by record and in total.
    const history = (await as(user).get(`/v1/history?from=${MARCH.from}&through=${MARCH.through}&sort=date_asc&limit=200`)).body as HistoryPage;
    expect(rows.map((row) => row.record_id)).toEqual(history.items.map((item) => item.id));
    for (const item of history.items as TransactionDto[]) {
      const row = byId.get(item.id) as Record<string, string>;
      expect(row).toMatchObject({ date: item.occurred_on, type: item.type, amount_minor: item.amount_minor, version: String(item.version) });
      if (item.type === 'transfer') expect(row).toMatchObject({ source_wallet_id: item.source_wallet_id, destination_wallet_id: item.destination_wallet_id });
      else expect(row).toMatchObject({ wallet_id: item.wallet_id, category_id: item.category_id });
    }
    const sum = (type: string) => rows.filter((row) => row.type === type).reduce((total, row) => total + BigInt(row.amount_minor), 0n).toString();
    expect(sum('income')).toBe(history.summary.income_minor);
    expect(sum('expense')).toBe(history.summary.expense_minor);
    expect(sum('transfer')).toBe('150000');

    // No receipt images and no account or sign-in identifiers.
    for (const secret of [user.accountId, user.who.subject, user.binding, issuer.issuer, 'account_id', 'receipt', 'attachment']) expect(text).not.toContain(secret);
  });

  it('a concurrent edit during the export does not tear its one consistent view', async () => {
    const { user, cash, food, ids } = await marchDiary();
    const before = await revisionOf(user.accountId);
    const { res } = await requestExport(user);
    const exportId = res.body.entity_id as string;
    const atRequest = await revisionOf(user.accountId);
    let wrote = false;
    const options: ExportHandlerOptions = {
      pageSize: 2,
      afterPage: async (index) => {
        if (index !== 0) return;
        await expectOk(await as(user).patch(`/v1/transactions/${ids.last}`, { amount_minor: '1' }, { ifMatch: 1 }));
        await expectOk(await as(user).raw('delete', `/v1/transactions/${ids.largest}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': '"1"' }));
        await money.record(user, { type: 'expense', amount_minor: '4242', occurred_on: '2026-03-30', wallet_id: cash, category_id: food });
        wrote = true;
      },
    };
    await new ExportHandler(deps(), options).run((await claimExport()).lease);
    expect(wrote).toBe(true);
    expect(BigInt(await revisionOf(user.accountId))).toBe(BigInt(atRequest) + 3n);
    const dto = (await as(user).get(`/v1/exports/${exportId}`)).body as ExportDto;
    expect(dto).toMatchObject({ status: 'ready', as_of_revision: atRequest, row_count: 5 });
    expect(BigInt(atRequest)).toBe(BigInt(before) + 1n);
    const rows = csvRecords((await download(user, exportId)).text);
    expect(rows.map((row) => row.record_id)).toEqual([ids.first, ids.salary, ids.transfer, ids.largest, ids.last]);
    expect(rows.find((row) => row.record_id === ids.last)?.amount_minor).toBe('18200');
    expect(rows.some((row) => row.amount_minor === '4242')).toBe(false);

    // A later export sees the edits.
    const later = csvRecords((await download(user, (await readyExport(user)).export_id)).text);
    expect(later.find((row) => row.record_id === ids.last)?.amount_minor).toBe('1');
    expect(later.some((row) => row.record_id === ids.largest)).toBe(false);
    expect(later.some((row) => row.amount_minor === '4242')).toBe(true);
  });

  it('an export over its byte limit fails visibly and publishes nothing', async () => {
    const { user } = await marchDiary();
    const { res } = await requestExport(user);
    const small = new JobWorker(jobs, buildHandlers(deps(), { export: { maxBytes: 300 } }));
    expect(await small.runOnce()).toBe('ran');
    expect((await as(user).get(`/v1/exports/${res.body.entity_id}`)).body.status).toBe('failed');
    expect((await jobsOf(user.accountId))[0]).toMatchObject({ status: 'failed', last_error: 'export_too_large' });
    expect((await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM object_publications WHERE job_id = $1 AND status = 'published'`, [res.body.entity_id]))).rows[0].n).toBe(0);
    expect((await as(user).get(`/v1/exports/${res.body.entity_id}/grant`)).status).toBe(404);
  });
});

describe('deletion and cancellation races', () => {
  it('an account deleted mid-export publishes nothing, and the file it wrote is swept', async () => {
    const { user } = await marchDiary();
    const { res } = await requestExport(user);
    const exportId = res.body.entity_id as string;
    await new ExportHandler(deps(), {
      afterUpload: async () => {
        await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting', lifecycle_generation = lifecycle_generation + 1 WHERE id = $1`, [user.accountId]));
      },
    }).run((await claimExport()).lease);
    const [row] = await exportsOf(user.accountId);
    expect(row).toMatchObject({ export_id: exportId, ready_at: null, object_key: null });
    expect((await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM object_publications WHERE job_id = $1 AND status = 'published'`, [exportId]))).rows[0].n).toBe(0);
    expect((await store.list(`export/${user.accountId}/`)).length).toBe(1);
    await publication.sweep(user.accountId, new Date(Date.now() + 2 * HOUR));
    expect(await store.list(`export/${user.accountId}/`)).toEqual([]);
  });

  it('an export cancelled by an account lifecycle transition mid-read publishes nothing', async () => {
    const { user } = await marchDiary();
    const { res } = await requestExport(user);
    await expect(
      new ExportHandler(deps(), {
        pageSize: 1,
        afterPage: async (index) => {
          if (index === 0) await jobs.cancelAccount(user.accountId);
        },
      }).run((await claimExport()).lease),
    ).resolves.toBeUndefined();
    expect((await as(user).get(`/v1/exports/${res.body.entity_id}`)).body.status).toBe('failed');
    expect((await exportsOf(user.accountId))[0].ready_at).toBeNull();
    await publication.sweep(user.accountId, new Date(Date.now() + 2 * HOUR));
    expect(await store.list(`export/${user.accountId}/`)).toEqual([]);
  });

  it('a ready export cannot be granted or downloaded once the account is deleting or locked', async () => {
    const { user } = await marchDiary();
    const dto = await readyExport(user);
    const grant = (await as(user).get(`/v1/exports/${dto.export_id}/grant`)).body as ExportGrant;
    const token = grant.url.slice(EXPORT_DOWNLOAD_PATH.length);
    for (const status of ['disabled', 'deleting']) {
      await db.admin((client) => client.query('UPDATE accounts SET status = $2 WHERE id = $1', [user.accountId, status]));
      expect(await service.grant(user.session, dto.export_id)).toBeNull();
      expect(await service.file(user.session, token)).toBeNull();
      expect((await service.status(user.session, dto.export_id))?.status).toBe('expired');
      const http = await fetchFile(user, grant.url);
      expect([401, 403]).toContain(http.status);
      expect((http.body as Buffer).toString('utf8')).not.toContain('record_id');
    }
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'active', lifecycle_generation = lifecycle_generation + 1 WHERE id = $1`, [user.accountId]));
    // A new lifecycle generation never serves an earlier generation's file.
    expect(await service.file(user.session, token)).toBeNull();
    expect((await as(user).get(`/v1/exports/${dto.export_id}`)).body.status).toBe('expired');
    expect((await as(user).get(`/v1/exports/${dto.export_id}/grant`)).status).toBe(404);
  });
});

describe('ownership', () => {
  it("another account's export, job and grant are each the same 404 as an unknown id", async () => {
    const owner = (await marchDiary()).user;
    const other = await money.member();
    const dto = await readyExport(owner);
    const grant = (await as(owner).get(`/v1/exports/${dto.export_id}/grant`)).body as ExportGrant;
    const unknown = await as(other).get(`/v1/exports/${randomUUID()}`);
    expect(unknown.status).toBe(404);
    const foreign = await as(other).get(`/v1/exports/${dto.export_id}`);
    expect(foreign.status).toBe(404);
    expect(withoutRequestId(foreign.body)).toEqual(withoutRequestId(unknown.body));
    const foreignGrant = await as(other).get(`/v1/exports/${dto.export_id}/grant`);
    expect(foreignGrant.status).toBe(404);
    expect(withoutRequestId(foreignGrant.body)).toEqual(withoutRequestId((await as(other).get(`/v1/exports/${randomUUID()}/grant`)).body));
    const stolen = await fetchFile(other, grant.url);
    expect(stolen.status).toBe(404);
    expect((stolen.body as Buffer).toString('utf8')).not.toContain('record_id');
    expect(await service.status(other.session, dto.export_id)).toBeNull();
    expect((await as(owner).get(`/v1/exports/not-a-uuid`)).status).toBe(404);
    expect((await fetchFile(owner, `${EXPORT_DOWNLOAD_PATH}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).status).toBe(404);
    // The owner still can.
    expect((await fetchFile(owner, grant.url)).status).toBe(200);
    // The other account's own export holds none of the owner's records.
    const theirs = csvRecords((await download(other, (await readyExport(other)).export_id)).text);
    expect(theirs).toEqual([]);
  });

  it('leased export reads are limited to the export lease, its account and its stored period', async () => {
    const { user, ids } = await marchDiary();
    await requestExport(user);
    const claimed = await claimExport();
    const rows = await reader.withSnapshot(claimed.lease, 'export', (read) => read.exportRows(null, 100));
    expect(rows.map((row) => row.id)).toEqual([ids.first, ids.salary, ids.transfer, ids.largest, ids.last]);
    expect(rows.every((row) => row.occurredOn >= MARCH.from && row.occurredOn <= MARCH.through)).toBe(true);
    // Keyset continuation.
    const page = await reader.withSnapshot(claimed.lease, 'export', (read) => read.exportRows({ occurredOn: rows[1].occurredOn, id: rows[1].id }, 2));
    expect(page.map((row) => row.id)).toEqual([ids.transfer, ids.largest]);
    await expect(reader.withSnapshot(claimed.lease, 'sync_snapshot', (read) => read.highWater())).rejects.toBeInstanceOf(LeasedReadDenied);
    await expect(reader.withSnapshot({ ...claimed.lease, leaseToken: randomUUID() }, 'export', (read) => read.exportRows(null, 10))).rejects.toBeInstanceOf(LeasedReadDenied);
    await jobs.complete(claimed.lease, 'superseded');
    // A snapshot lease cannot read export rows.
    await queueAccountJob(db, user.accountId, 'sync_snapshot');
    const [snapshot] = await jobs.claim(['sync_snapshot'], { leaseSeconds: 60 });
    await expect(reader.withSnapshot(snapshot.lease, 'sync_snapshot', (read) => read.exportRows(null, 10))).rejects.toBeInstanceOf(LeasedReadDenied);
    await jobs.complete(snapshot.lease, 'superseded');
    // The leased-read login itself still has no table access.
    const leasedLogin = await db.loginPool(['gogospend_leased_read'], 1);
    await expect(leasedLogin.query('SELECT * FROM transactions')).rejects.toMatchObject({ code: '42501' });
    await expect(leasedLogin.query('SELECT * FROM exports')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('expiry and cleanup', () => {
  it('grants last five minutes; the file expires after 24 hours and the sweep deletes it', async () => {
    const { user } = await marchDiary();
    const dto = await readyExport(user);
    const now = Date.now();
    const grant = await service.grant(user.session, dto.export_id, new Date(now));
    if (!grant) throw new Error('no grant');
    expect(Date.parse(grant.expires_at) - now).toBeLessThanOrEqual(5 * 60_000);
    const token = grant.url.slice(EXPORT_DOWNLOAD_PATH.length);
    expect(await service.file(user.session, token, new Date(now + 5 * 60_000 - 2_000))).not.toBeNull();
    expect(await service.file(user.session, token, new Date(now + 5 * 60_000 + 1_000))).toBeNull();

    const [row] = await exportsOf(user.accountId);
    const published = (await db.admin((client) => client.query(`SELECT delete_after, status FROM object_publications WHERE job_id = $1`, [dto.export_id]))).rows;
    expect(published).toHaveLength(1);
    expect(published[0].status).toBe('published');
    expect(new Date(published[0].delete_after).getTime()).toBe(new Date(row.expires_at).getTime());
    const ttl = new Date(row.expires_at).getTime() - new Date((await db.admin((client) => client.query('SELECT ready_at FROM exports WHERE export_id = $1', [dto.export_id]))).rows[0].ready_at).getTime();
    expect(Math.abs(ttl - 24 * HOUR)).toBeLessThan(60_000);

    const later = new Date(now + 24 * HOUR + 60_000);
    expect((await service.status(user.session, dto.export_id, later))?.status).toBe('expired');
    expect(await service.grant(user.session, dto.export_id, later)).toBeNull();
    const fresh = await service.grant(user.session, dto.export_id, new Date(now + 24 * HOUR - 60_000));
    expect(fresh).not.toBeNull();
    expect(Date.parse(fresh?.expires_at ?? '')).toBeLessThanOrEqual(new Date(row.expires_at).getTime());

    // Scheduled cleanup: the worker's sweep deletes the object at its deadline.
    await publication.sweep(user.accountId, new Date(now + 25 * HOUR));
    expect(await store.list(`export/${user.accountId}/`)).toEqual([]);
    expect((await db.admin((client) => client.query('SELECT status FROM object_publications WHERE job_id = $1', [dto.export_id]))).rows[0].status).toBe('deleted');
    await db.admin((client) => client.query(`UPDATE exports SET ready_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE export_id = $1`, [dto.export_id]));
    expect((await as(user).get(`/v1/exports/${dto.export_id}`)).body.status).toBe('expired');
    expect((await as(user).get(`/v1/exports/${dto.export_id}/grant`)).status).toBe(404);
    expect((await fetchFile(user, grant.url)).status).toBe(404);
  });

  it('a failed cleanup stays visible as overdue until a later sweep deletes the file', async () => {
    const { user } = await marchDiary();
    const dto = await readyExport(user);
    expect(await exportCleanupOverdue(jobsPool, user.accountId)).toBe(0);
    store.failNext('delete');
    await publication.sweep(user.accountId, new Date(Date.now() + 25 * HOUR));
    expect((await db.admin((client) => client.query('SELECT status FROM object_publications WHERE job_id = $1', [dto.export_id]))).rows[0].status).toBe('deleting');
    expect(await exportCleanupOverdue(jobsPool, user.accountId)).toBe(1);
    expect(await exportCleanupOverdue(jobsPool)).toBeGreaterThanOrEqual(1);
    await publication.sweep(user.accountId, new Date(Date.now() + 25 * HOUR));
    expect(await store.list(`export/${user.accountId}/`)).toEqual([]);
    expect(await exportCleanupOverdue(jobsPool, user.accountId)).toBe(0);
  });
});

describe('runtime logs', () => {
  it('carry no CSV contents, grants, object keys or amounts', async () => {
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    const spies = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      }),
    );
    try {
      const user = await money.member();
      const wallet = await money.wallet(user, { name: 'Sentinel wallet' });
      await money.record(user, { type: 'expense', amount_minor: '7777777', occurred_on: '2026-03-03', wallet_id: wallet, category_id: builtinId(user, 'food'), note: 'SENTINEL-CSV-NOTE' });
      const dto = await readyExport(user);
      const { grant, text } = await download(user, dto.export_id);
      expect(text).toContain('SENTINEL-CSV-NOTE');
      const joined = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      for (const secret of ['SENTINEL', '7777777', '77777.77', grant.url.slice(EXPORT_DOWNLOAD_PATH.length), `export/${user.accountId}`, dto.sha256]) expect(joined).not.toContain(secret);
    } finally {
      setLogSink(previous);
      for (const spy of spies) spy.mockRestore();
    }
  });
});
