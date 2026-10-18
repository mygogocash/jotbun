import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';

import { IMPORT_PARSE_JOB_DEADLINE_SECONDS, IMPORT_PARSE_LIMITS, isImportJobDto, isImportPreview } from '@gogospend/contracts';
import type { ImportJobDto, ImportPreview } from '@gogospend/contracts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import sharp from 'sharp';
import request from 'supertest';

import { FeatureGates } from '../common/feature-gates';
import { LeasedAccountRead } from '../database/leased-account-read';
import { importCandidates, importPreviews } from '../database/schema';
import { HandlerRegistry } from '../jobs/handler-registry';
import { buildHandlers } from '../jobs/handlers';
import type { WorkerDeps } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
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
import { defaultPrivacySteps } from '../privacy/privacy-steps';
import { OpenNetRunner, parsingRunner } from './fixtures/parsing-runner';
import { IMAGE_MARKERS, XLSX_STATEMENT_ROWS, buildXlsx, csv, csvRows, imageWithMetadata } from './fixtures/synthetic-parse';
import { importMaintenance } from './import-expiry';
import { importParsingStartup } from './import-parsing';
import { ParseHandler } from './parse-handler';
import type { ParserRunOutcome, ParserRunnerPort } from './parser-runner';
import { DUPLICATE_ADVICE_SQL } from './preview-query';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Legacy samples, read-only.
const MEOWJOT = readFileSync(join(__dirname, '..', 'spend', 'fixtures', 'meowjot-export-sample.csv'));
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let db: TestDatabase;
let issuer: JwksFixture;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let server: Server;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let store: MemoryObjectStore;
let jobsPool: Pool;
let jobs: JobRepository;
let publication: ObjectPublicationService;
let deps: WorkerDeps;
let worker: JobWorker;

async function sessionHeaders(user: SignedUp): Promise<Record<string, string>> {
  return {
    'x-gogospend-client': 'ios/1.0.0',
    authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`,
    'x-gogospend-session': user.binding,
  };
}

async function upload(user: SignedUp, body: Buffer, options: { name?: string; type?: string } = {}): Promise<ImportJobDto> {
  const res = await request(server)
    .post('/v1/imports')
    .set(await sessionHeaders(user))
    .set('idempotency-key', randomUUID())
    .set('content-type', options.type ?? 'text/csv')
    .set('x-gogospend-file-name', encodeURIComponent(options.name ?? 'statement.csv'))
    .send(body);
  if (res.status !== 202) throw new Error(`upload refused: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as ImportJobDto;
}

async function preview(user: SignedUp, id: string, query = '') {
  return request(server).get(`/v1/imports/${id}/preview${query}`).set(await sessionHeaders(user));
}

async function previewOf(user: SignedUp, id: string, query = ''): Promise<ImportPreview> {
  const res = await preview(user, id, query);
  expect(res.status).toBe(200);
  expect(isImportPreview(res.body)).toBe(true);
  return res.body as ImportPreview;
}

const adminRows = async <T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> =>
  (await db.admin((client) => client.query<T>(text, values))).rows;

async function jobOf(id: string): Promise<{ status: string; last_error: string | null }> {
  const [row] = await adminRows<{ status: string; last_error: string | null }>('SELECT status, last_error FROM jobs WHERE id = $1', [id]);
  return row;
}

/** Runs the worker until this import's parse job has finished (or 10 rounds). */
async function runParse(jobId: string, on: JobWorker = worker): Promise<{ status: string; last_error: string | null }> {
  for (let round = 0; round < 10; round += 1) {
    const job = await jobOf(jobId);
    if (job.status !== 'queued' && job.status !== 'leased') return job;
    if ((await on.runOnce()) === 'idle') return job;
  }
  return jobOf(jobId);
}

async function count(table: string, accountId?: string): Promise<number> {
  const [row] = await adminRows<{ n: string }>(`SELECT count(*) AS n FROM ${table}${accountId ? ' WHERE account_id = $1' : ''}`, accountId ? [accountId] : []);
  return Number(row.n);
}

const transactionCount = () => count('transactions');

async function stored(prefix: string): Promise<string[]> {
  return (await store.list(prefix)).map((object) => object.key);
}

/** A worker whose parse handler uses `runner` instead of the real child. */
function workerWith(runner: ParserRunnerPort): JobWorker {
  return new JobWorker(jobs, new HandlerRegistry().register('import_parse', (job) => new ParseHandler(deps, { runner }).run(job)));
}

const fakeRunner = (outcome: ParserRunOutcome): ParserRunnerPort => ({ run: async () => outcome });

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  const pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 4);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  process.env.IMPORT_UPLOADS_ENABLED = '1';
  try {
    v1 = await startV1App(db, issuer);
  } finally {
    delete process.env.IMPORT_UPLOADS_ENABLED;
  }
  server = v1.app.getHttpServer() as Server;
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  jobs = new JobRepository(jobsPool);
  publication = new ObjectPublicationService(jobsPool, store);
  deps = { jobs, reader: new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2)), store, publication, pool: jobsPool };
  // The real children; the sandbox gate itself is proven in parser-runner.spec (and below).
  worker = new JobWorker(jobs, buildHandlers(deps, { parse: { runner: parsingRunner() } }));
});

afterEach(async () => {
  // A test that leaves a parse job queued must not hand it to the next test's worker.
  await db.admin((client) => client.query(`UPDATE jobs SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now() WHERE kind = 'import_parse' AND status IN ('queued', 'leased')`));
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('a parsed upload becomes a reviewable preview and nothing else', () => {
  it('parsing_has_no_financial_side_effect', async () => {
    const user = await money.member();
    await money.wallet(user, { name: 'กสิกรไทย', tracking_start: '2025-01-01' });
    const transactionCountBeforeUpload = await transactionCount();
    const before = {
      wallets: await count('wallets', user.accountId),
      categories: await count('categories', user.accountId),
      changes: await count('entity_changes', user.accountId),
      receipts: await count('command_receipts', user.accountId),
    };
    const accepted = await upload(user, MEOWJOT, { name: 'meowjot.csv' });
    // The parse job's whole run (read, parse, record) is bounded to 120 seconds, with 3 attempts.
    const [bounds] = await adminRows<{ max_runtime_seconds: number; max_attempts: number }>('SELECT max_runtime_seconds, max_attempts FROM jobs WHERE id = $1', [accepted.job_id]);
    expect(bounds).toEqual({ max_runtime_seconds: IMPORT_PARSE_JOB_DEADLINE_SECONDS, max_attempts: 3 });
    expect(await runParse(accepted.job_id)).toEqual({ status: 'succeeded', last_error: null });
    const transactionCountAfterParse = await transactionCount();
    expect(transactionCountAfterParse).toBe(transactionCountBeforeUpload);
    expect({
      wallets: await count('wallets', user.accountId),
      categories: await count('categories', user.accountId),
      changes: await count('entity_changes', user.accountId),
      receipts: await count('command_receipts', user.accountId),
    }).toEqual(before);
    // Reading the preview saves nothing either.
    expect((await previewOf(user, accepted.job_id)).status).toBe('ready');
    expect(await transactionCount()).toBe(transactionCountBeforeUpload);
    expect(await count('import_candidates', user.accountId)).toBe(6);
  });

  it('serves exact candidates, issues and totals to the owner, with a 7-day expiry and revision 1', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT, { name: 'meowjot.csv' });
    const parsedAt = Date.now();
    await runParse(accepted.job_id);
    const result = await previewOf(user, accepted.job_id);
    expect(result).toMatchObject({ job_id: accepted.job_id, status: 'ready', review_revision: '1', duplicate_advice: [] });
    expect(result.candidates).toEqual([
      { source_row_id: 'row:2', ordinal: 1, occurred_on: '2025-12-01', type: 'expense', amount_minor: '29000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'บริษัท สบาย สบาย จำกัด', note: 'ข้าวมันไก่', review_required: false },
      { source_row_id: 'row:3', ordinal: 2, occurred_on: '2025-12-02', type: 'expense', amount_minor: '23000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'คอฟฟี่ แอนด์ โค', note: null, review_required: false },
      { source_row_id: 'row:4', ordinal: 3, occurred_on: '2025-12-03', type: 'expense', amount_minor: '2000', wallet_label: 'กรุงไทย', category_label: 'สุขภาพ, ดูแลตัวเอง', merchant: 'การกีฬาสุขภาพดี', note: null, review_required: false },
      { source_row_id: 'row:5', ordinal: 4, occurred_on: '2025-12-03', type: 'income', amount_minor: '200000', wallet_label: null, category_label: 'ค่าจ้าง', merchant: null, note: null, review_required: true },
      { source_row_id: 'row:6', ordinal: 5, occurred_on: '2025-12-04', type: 'expense', amount_minor: '100000', wallet_label: 'KBANK PLATINUM', category_label: 'ช้อปปิ้ง', merchant: 'EASY MALL', note: null, review_required: false },
      { source_row_id: 'row:7', ordinal: 6, occurred_on: '2025-12-05', type: 'income', amount_minor: '35000', wallet_label: 'KBANK PLATINUM', category_label: 'เงินคืน', merchant: 'THE CLOTH SHOP', note: null, review_required: false },
    ]);
    expect(result.issues).toEqual([{ code: 'missing_wallet', source_row_id: 'row:5', field: 'wallet_label' }]);
    // Exact totals: 290 + 230 + 20 + 1,000 baht spent; 2,000 + 350 baht received.
    expect(result.summary).toEqual({ layout: 'meowjot', candidate_count: 6, review_required_count: 1, totals: { expense_minor: '154000', income_minor: '235000', transfer_minor: '0' }, image: null });
    const expiresIn = Date.parse(result.expires_at as string) - parsedAt;
    expect(expiresIn).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY_MS + 60_000);
    const status = await request(server).get(`/v1/imports/${accepted.job_id}`).set(await sessionHeaders(user));
    expect(isImportJobDto(status.body)).toBe(true);
    expect(status.body.status).toBe('parsed');
  });

  it('5,000 rows parse with exact totals (no float arithmetic anywhere)', async () => {
    const user = await money.member();
    const accepted = await upload(user, csvRows(IMPORT_PARSE_LIMITS.candidateRows));
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    const result = await previewOf(user, accepted.job_id);
    let expected = 0n;
    for (let i = 0; i < IMPORT_PARSE_LIMITS.candidateRows; i += 1) expected += BigInt((i % 900) + 1) * 100n + 25n;
    expect(result.candidates).toHaveLength(5_000);
    expect(result.summary?.totals).toEqual({ expense_minor: expected.toString(), income_minor: '0', transfer_minor: '0' });
    expect(result.candidates.reduce((sum, candidate) => sum + BigInt(candidate.amount_minor ?? '0'), 0n)).toBe(expected);
    expect(result.summary?.review_required_count).toBe(0);
  }, 60_000);

  it('before parsing there is no preview yet: queued, nothing to review', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    expect(await previewOf(user, accepted.job_id)).toEqual({
      job_id: accepted.job_id, status: 'queued', candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null,
    });
  });

  it('is owner-only: another account and an unknown id get the same 404', async () => {
    const owner = await money.member();
    const stranger = await money.member();
    const accepted = await upload(owner, MEOWJOT);
    await runParse(accepted.job_id);
    const foreign = await preview(stranger, accepted.job_id);
    const unknown = await preview(stranger, randomUUID());
    expect([foreign.status, foreign.body.code]).toEqual([404, 'NOT_FOUND']);
    expect({ ...foreign.body, request_id: '' }).toEqual({ ...unknown.body, request_id: '' });
    expect((await preview(stranger, 'not-a-uuid')).status).toBe(404);
    expect((await preview(owner, accepted.job_id)).status).toBe(200);
  });
});

describe('duplicates are advice only', () => {
  it('names matching records and same-file twins, and keeps every row', async () => {
    const user = await money.member();
    const cash = await money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' });
    const existing = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') });
    const beforeCount = await transactionCount();
    const accepted = await upload(user, csv(['date,type,amount,wallet,note', '2026-09-01,expense,65.00,Cash,coffee', '2026-09-01,expense,65.00,Cash,coffee', '2026-09-02,income,1000.00,Cash,pay']));
    await runParse(accepted.job_id);
    const result = await previewOf(user, accepted.job_id);
    expect(result.candidates.map((candidate) => candidate.source_row_id)).toEqual(['row:2', 'row:3', 'row:4']);
    expect(result.duplicate_advice).toEqual([
      { source_row_id: 'row:2', kind: 'existing_transaction', matches: [existing] },
      { source_row_id: 'row:2', kind: 'same_file', matches: ['row:3'] },
      { source_row_id: 'row:3', kind: 'existing_transaction', matches: [existing] },
      { source_row_id: 'row:3', kind: 'same_file', matches: ['row:2'] },
    ]);
    expect(await transactionCount()).toBe(beforeCount);
    // Another account's identical record is never advice for this one.
    const other = await money.member();
    const otherCash = await money.wallet(other, { name: 'Cash', tracking_start: '2026-01-01' });
    await money.record(other, { type: 'income', amount_minor: '100000', occurred_on: '2026-09-02', wallet_id: otherCash, category_id: builtinId(other, 'salary') });
    expect((await previewOf(user, accepted.job_id)).duplicate_advice.some((advice) => advice.source_row_id === 'row:4')).toBe(false);
  });
});

describe('preview paging is additive (P2b)', () => {
  const ROWS = [
    '2026-09-01,expense,65.00,Cash,coffee',
    '2026-09-01,expense,65.00,Cash,coffee',
    '2026-09-02,income,10.00,Cash,a',
    '2026-09-03,expense,11.00,,b',
    '2026-09-04,expense,12.00,Cash,c',
    '2026-09-05,expense,13.00,Cash,d',
    '2026-09-06,expense,14.00,Cash,e',
    '2026-09-07,expense,15.00,,f',
    '2026-09-08,expense,16.00,Cash,g',
    '2026-09-09,expense,17.00,Cash,h',
    '2026-09-10,expense,18.00,Cash,twin',
    '2026-09-10,expense,18.00,Cash,twin',
  ];

  async function parsed(): Promise<{ user: SignedUp; jobId: string; existing: string }> {
    const user = await money.member();
    const cash = await money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' });
    const existing = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') });
    const accepted = await upload(user, csv(['date,type,amount,wallet,note', ...ROWS]));
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    return { user, jobId: accepted.job_id, existing };
  }

  it('no parameters is exactly the whole preview, with no page key', async () => {
    const { user, jobId } = await parsed();
    const whole = await previewOf(user, jobId);
    expect(whole.candidates).toHaveLength(ROWS.length);
    expect(Object.keys(whole).sort()).toEqual(['candidates', 'duplicate_advice', 'expires_at', 'issues', 'job_id', 'review_revision', 'status', 'summary']);
  });

  it('pages only candidates: summary and issues stay whole-file, advice follows the page rows, pages rejoin the whole', async () => {
    const { user, jobId, existing } = await parsed();
    const whole = await previewOf(user, jobId);
    expect(whole.issues.map((issue) => issue.source_row_id)).toEqual(['row:5', 'row:9']);
    expect(whole.duplicate_advice.length).toBeGreaterThan(4);

    const seen: ImportPreview['candidates'] = [];
    let offset = 0;
    let pages = 0;
    for (;;) {
      const page = await previewOf(user, jobId, `?offset=${offset}&limit=5`);
      pages += 1;
      expect(page.page).toEqual({ offset, limit: 5, total: ROWS.length, next_offset: offset + 5 < ROWS.length ? offset + 5 : null });
      expect(page.candidates).toEqual(whole.candidates.slice(offset, offset + 5));
      expect(page.summary).toEqual(whole.summary);
      expect(page.issues).toEqual(whole.issues);
      expect({ job_id: page.job_id, status: page.status, review_revision: page.review_revision, expires_at: page.expires_at }).toEqual({ job_id: whole.job_id, status: whole.status, review_revision: whole.review_revision, expires_at: whole.expires_at });
      const ids = new Set(page.candidates.map((candidate) => candidate.source_row_id));
      expect(page.duplicate_advice).toEqual(whole.duplicate_advice.filter((advice) => ids.has(advice.source_row_id)));
      seen.push(...page.candidates);
      if (page.page?.next_offset === null) break;
      offset = page.page?.next_offset as number;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(whole.candidates);
    const first = await previewOf(user, jobId, '?limit=5');
    expect(first.duplicate_advice).toContainEqual({ source_row_id: 'row:2', kind: 'existing_transaction', matches: [existing] });
    // Twins named by a page point at rows that may be on another page.
    expect((await previewOf(user, jobId, '?offset=10&limit=1')).duplicate_advice).toEqual([{ source_row_id: 'row:12', kind: 'same_file', matches: ['row:13'] }]);
  });

  it('defaults the missing parameter, and a page past the end is empty', async () => {
    const { user, jobId } = await parsed();
    const whole = await previewOf(user, jobId);
    const fromStart = await previewOf(user, jobId, '?limit=3');
    expect([fromStart.candidates.length, fromStart.page]).toEqual([3, { offset: 0, limit: 3, total: ROWS.length, next_offset: 3 }]);
    const tail = await previewOf(user, jobId, '?offset=2');
    expect(tail.candidates).toEqual(whole.candidates.slice(2));
    expect(tail.page).toEqual({ offset: 2, limit: 500, total: ROWS.length, next_offset: null });
    const beyond = await previewOf(user, jobId, `?offset=${ROWS.length}&limit=5`);
    expect([beyond.candidates, beyond.duplicate_advice, beyond.page]).toEqual([[], [], { offset: ROWS.length, limit: 5, total: ROWS.length, next_offset: null }]);
    expect(beyond.issues).toEqual(whole.issues);
  });

  it('refuses malformed paging as a validation error, and keeps owner-only 404s', async () => {
    const { user, jobId } = await parsed();
    for (const query of ['?limit=0', '?limit=501', '?limit=x', '?offset=-1', '?offset=5001', '?limit=1&limit=2', '?cursor=abc', '?limit=5&foo=1']) {
      const res = await preview(user, jobId, query);
      expect([query, res.status]).toEqual([query, 422]);
    }
    const stranger = await money.member();
    expect((await preview(stranger, jobId, '?limit=5')).status).toBe(404);
    expect((await preview(stranger, randomUUID(), '?limit=5')).status).toBe(404);
  });

  it('a preview that is not ready is served as before, whatever the paging', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    expect(await previewOf(user, accepted.job_id, '?offset=0&limit=5')).toEqual({
      job_id: accepted.job_id, status: 'queued', candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null,
    });
  });
});

describe('duplicate advice stays linear in the file and the records (M1)', () => {
  // The advice as the first P2b release computed it (a self-join), kept here as the reference.
  const SELF_JOIN_ADVICE = `
    SELECT source_row_id, kind, matches FROM (
      SELECT c.source_row_id, c.ordinal, 'existing_transaction' AS kind, (array_agg(t.id::text ORDER BY t.id))[1:5] AS matches
        FROM import_candidates c
        JOIN transactions t ON t.account_id = c.account_id AND t.occurred_on = c.occurred_on AND t.type = c.type
                           AND t.amount_minor = c.amount_minor AND t.deleted_at IS NULL
       WHERE c.job_id = $1
       GROUP BY c.source_row_id, c.ordinal
      UNION ALL
      SELECT c.source_row_id, c.ordinal, 'same_file', (array_agg(d.source_row_id ORDER BY d.ordinal))[1:5]
        FROM import_candidates c
        JOIN import_candidates d ON d.job_id = c.job_id AND d.source_row_id <> c.source_row_id
                                AND d.occurred_on = c.occurred_on AND d.type = c.type AND d.amount_minor = c.amount_minor
                                AND d.wallet_label IS NOT DISTINCT FROM c.wallet_label AND d.merchant IS NOT DISTINCT FROM c.merchant
                                AND d.note IS NOT DISTINCT FROM c.note
       WHERE c.job_id = $1
       GROUP BY c.source_row_id, c.ordinal
    ) advice ORDER BY ordinal, kind`;

  async function cloneRecord(id: string, times: number): Promise<void> {
    await db.admin((client) =>
      client.query(
        `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant)
         SELECT account_id, gen_random_uuid(), type, amount_minor, occurred_on, wallet_id, category_id, note, merchant
           FROM transactions, generate_series(1, $2) WHERE id = $1`,
        [id, times],
      ),
    );
  }

  const bigJobs: { identical?: string; distinct?: string } = {};

  /** Statistics taken before the import under test: the planner has never seen its job id. */
  async function staleStatistics(user: SignedUp): Promise<void> {
    const earlier = await upload(user, csv(['date,type,amount,wallet', '2026-09-02,expense,1.00,Cash']));
    expect((await runParse(earlier.job_id)).status).toBe('succeeded');
    await db.admin(async (client) => {
      await client.query('ANALYZE import_candidates');
      await client.query('ANALYZE transactions');
    });
  }

  it('5,000 identical rows against 5,000 identical records, with statistics older than the import: answered in time, five matches each', async () => {
    const user = await money.member();
    await staleStatistics(user);
    const cash = await money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' });
    const existing = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') });
    await cloneRecord(existing, 4_999);
    const lines = ['date,type,amount,wallet,note'];
    for (let i = 0; i < 5_000; i += 1) lines.push('2026-09-01,expense,65.00,Cash,coffee');
    const accepted = await upload(user, csv(lines));
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    bigJobs.identical = accepted.job_id;

    const started = Date.now();
    const res = await preview(user, accepted.job_id);
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2_000);
    const body = res.body as ImportPreview;
    expect(isImportPreview(body)).toBe(true);
    expect(body.duplicate_advice).toHaveLength(10_000);
    expect(body.duplicate_advice.every((advice) => advice.matches.length === 5)).toBe(true);
    const firstRecords = (await adminRows<{ id: string }>('SELECT id::text AS id FROM transactions WHERE account_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 5', [user.accountId])).map((row) => row.id);
    const of = (id: string, kind: string) => body.duplicate_advice.find((advice) => advice.source_row_id === id && advice.kind === kind)?.matches;
    expect(of('row:2', 'existing_transaction')).toEqual(firstRecords);
    expect(of('row:5001', 'existing_transaction')).toEqual(firstRecords);
    // The first five other rows, in file order.
    expect(of('row:2', 'same_file')).toEqual(['row:3', 'row:4', 'row:5', 'row:6', 'row:7']);
    expect(of('row:4', 'same_file')).toEqual(['row:2', 'row:3', 'row:5', 'row:6', 'row:7']);
    expect(of('row:5001', 'same_file')).toEqual(['row:2', 'row:3', 'row:4', 'row:5', 'row:6']);
  }, 300_000);

  it('5,000 distinct rows with statistics older than the import are answered in time', async () => {
    const user = await money.member();
    await staleStatistics(user);
    const accepted = await upload(user, csvRows(IMPORT_PARSE_LIMITS.candidateRows));
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    bigJobs.distinct = accepted.job_id;
    const started = Date.now();
    const res = await preview(user, accepted.job_id);
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect((res.body as ImportPreview).candidates).toHaveLength(5_000);
    expect((res.body as ImportPreview).duplicate_advice).toEqual([]);
  }, 300_000);

  it('stays linear whatever join the planner picks (hash and merge joins disabled)', async () => {
    for (const [jobId, expected] of [[bigJobs.identical, 10_000], [bigJobs.distinct, 0]] as const) {
      expect(jobId).toEqual(expect.any(String));
      const started = Date.now();
      const outcome = await db.admin(async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL statement_timeout = '5s'`);
          await client.query('SET LOCAL enable_hashjoin = off');
          await client.query('SET LOCAL enable_mergejoin = off');
          return { rows: (await client.query(DUPLICATE_ADVICE_SQL, [jobId])).rowCount };
        } catch (error) {
          return { error: (error as { code?: string }).code };
        } finally {
          await client.query('ROLLBACK');
        }
      });
      expect(outcome).toEqual({ rows: expected });
      expect(Date.now() - started).toBeLessThan(2_000);
    }
  }, 60_000);

  it('names exactly what the self-join named, row for row', async () => {
    const user = await money.member();
    const cash = await money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' });
    const coffee = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') });
    await cloneRecord(coffee, 6);
    const deleted = await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') });
    await db.admin((client) => client.query('UPDATE transactions SET deleted_at = now() WHERE id = $1', [deleted]));
    await money.record(user, { type: 'income', amount_minor: '100000', occurred_on: '2026-09-02', wallet_id: cash, category_id: builtinId(user, 'salary') });
    const lines = ['date,type,amount,wallet,note,merchant'];
    for (let i = 0; i < 8; i += 1) lines.push('2026-09-01,expense,65.00,Cash,coffee,Cafe');
    lines.push('2026-09-01,expense,65.00,,coffee,Cafe', '2026-09-01,expense,65.00,,coffee,Cafe', '2026-09-01,expense,65.00,Cash,,Cafe', '2026-09-01,expense,65.00,Cash,coffee,');
    lines.push('2026-09-02,income,1000.00,Cash,pay,', '2026-09-02,income,1000.00,Cash,pay,');
    lines.push(',expense,65.00,Cash,coffee,Cafe', ',expense,65.00,Cash,coffee,Cafe', '2026-09-03,,5.00,Cash,x,', '2026-09-03,,5.00,Cash,x,', '2026-09-01,income,65.00,Cash,coffee,Cafe');
    const accepted = await upload(user, csv(lines));
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    const reference = await adminRows<{ source_row_id: string; kind: string; matches: string[] }>(SELF_JOIN_ADVICE, [accepted.job_id]);
    expect(reference.length).toBeGreaterThan(20);
    expect((await previewOf(user, accepted.job_id)).duplicate_advice).toEqual(reference.map(({ source_row_id, kind, matches }) => ({ source_row_id, kind, matches })));
  });
});

describe('rejected files leave nothing to confirm', () => {
  it('a workbook with a formula is rejected as a whole: no candidate, image or transaction', async () => {
    const user = await money.member();
    const before = await transactionCount();
    const workbook = buildXlsx({ sheets: [{ rows: [['date', 'amount'], ['2026-01-01', { formula: 'SUM(1,2)', value: '3' }]] }] });
    const accepted = await upload(user, workbook, { name: 'book.xlsx', type: XLSX_TYPE });
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    const result = await previewOf(user, accepted.job_id);
    expect(result).toMatchObject({ status: 'rejected', candidates: [], duplicate_advice: [], review_revision: '1' });
    expect(result.issues).toEqual([{ code: 'formulas', source_row_id: null, field: null }]);
    expect(result.summary).toEqual({ layout: null, candidate_count: 0, review_required_count: 0, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' }, image: null });
    expect(await count('import_candidates', user.accountId)).toBe(0);
    expect(await stored(`import_image/${user.accountId}/`)).toEqual([]);
    expect(await transactionCount()).toBe(before);
  });

  it('a valid workbook parses through the same path', async () => {
    const user = await money.member();
    const accepted = await upload(user, buildXlsx({ sheets: [{ rows: XLSX_STATEMENT_ROWS }] }), { name: 'book.xlsx', type: XLSX_TYPE });
    await runParse(accepted.job_id);
    const result = await previewOf(user, accepted.job_id);
    expect(result.status).toBe('ready');
    expect(result.candidates.map((candidate) => [candidate.occurred_on, candidate.type, candidate.amount_minor])).toEqual([
      ['2025-01-01', 'expense', '12050'],
      ['2024-02-29', 'income', '1500000'],
      ['2026-03-03', 'expense', '4250'],
    ]);
  });

  it.each<[string, ParserRunOutcome, string]>([
    ['a child killed at its 30-second deadline', { kind: 'timeout' }, 'parse_timeout'],
    ['a crashed child', { kind: 'crashed' }, 'parse_failed'],
    ['output that is not the protocol', { kind: 'output_invalid' }, 'parse_failed'],
    ['output over its cap', { kind: 'output_too_large' }, 'parse_resource_limit'],
    [
      'a parse that exceeded the 512 MiB budget',
      { kind: 'result', result: { ok: true, layout: 'generic', rows: [], file_issues: [], image: null, usage: { max_rss_kb: 600 * 1024, cpu_ms: 10 } } },
      'parse_resource_limit',
    ],
  ])('%s fails visibly as a rejected preview, never with guessed fields', async (_label, outcome, code) => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    expect((await runParse(accepted.job_id, workerWith(fakeRunner(outcome)))).status).toBe('succeeded');
    const result = await previewOf(user, accepted.job_id);
    expect(result).toMatchObject({ status: 'rejected', candidates: [] });
    expect(result.issues).toEqual([{ code, source_row_id: null, field: null }]);
    expect(await count('import_candidates', user.accountId)).toBe(0);
  });

  it('a quarantined part that does not match its registered digest is never parsed', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    const [key] = await stored(`import_quarantine/${user.accountId}/${accepted.job_id}/`);
    await store.delete(key);
    await store.putStream(key, Buffer.from(MEOWJOT.toString('utf8').replace('-290', '-999')));
    let parsedCalls = 0;
    const spy: ParserRunnerPort = { run: async () => ((parsedCalls += 1), { kind: 'crashed' }) };
    expect(await runParse(accepted.job_id, workerWith(spy))).toEqual({ status: 'failed', last_error: 'quarantine_corrupt' });
    expect(parsedCalls).toBe(0);
    const result = await previewOf(user, accepted.job_id);
    expect(result).toMatchObject({ status: 'failed', candidates: [], review_revision: null });
    expect(result.issues).toEqual([{ code: 'quarantine_unavailable', source_row_id: null, field: null }]);
    expect(await count('import_previews', user.accountId)).toBe(0);
  });

  it('a part whose registered digest disagrees with the stored object is never parsed', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    // The object is intact (the whole-file digest still matches); only the registry's per-part digest differs.
    await db.admin((client) => client.query(`UPDATE object_publications SET sha256 = decode(repeat('00', 32), 'hex') WHERE job_id = $1 AND purpose = 'import_quarantine'`, [accepted.job_id]));
    let parsedCalls = 0;
    const spy: ParserRunnerPort = { run: async () => ((parsedCalls += 1), { kind: 'crashed' }) };
    expect(await runParse(accepted.job_id, workerWith(spy))).toEqual({ status: 'failed', last_error: 'quarantine_corrupt' });
    expect(parsedCalls).toBe(0);
  });

  it('a raw file past its 24-hour expiry is not read, even if its parse job is still queued', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await db.admin((client) =>
      client.query(
        `UPDATE import_uploads SET created_at = created_at - interval '25 hours', receive_deadline = receive_deadline - interval '25 hours',
                accepted_at = accepted_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE job_id = $1`,
        [accepted.job_id],
      ),
    );
    const original = store.get.bind(store);
    let reads = 0;
    store.get = async (key) => ((reads += 1), original(key));
    try {
      expect(await runParse(accepted.job_id)).toEqual({ status: 'failed', last_error: 'import_unavailable' });
    } finally {
      store.get = original;
    }
    expect(reads).toBe(0);
    expect(await count('import_previews', user.accountId)).toBe(0);
  });

  it('a parse job cancelled while its child runs (expiry, deletion, maintenance) records nothing', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    const cancelling: ParserRunnerPort = {
      run: async () => {
        await db.admin((client) => client.query(`UPDATE jobs SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now() WHERE id = $1`, [accepted.job_id]));
        return {
          kind: 'result',
          result: {
            ok: true, layout: 'generic', file_issues: [], image: null, usage: { max_rss_kb: 1024, cpu_ms: 5 },
            rows: [{ source_row_id: 'row:2', occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: null, merchant: null, note: null, issues: [] }],
          },
        };
      },
    };
    expect((await runParse(accepted.job_id, workerWith(cancelling))).status).toBe('cancelled');
    expect(await count('import_previews', user.accountId)).toBe(0);
    expect(await count('import_candidates', user.accountId)).toBe(0);
    expect((await previewOf(user, accepted.job_id)).status).toBe('cancelled');
  });

  it('a lease lost after the image PUT publishes nothing; the sweep deletes the object', async () => {
    const user = await money.member();
    const image = await imageWithMetadata('jpeg', 16, 16);
    const accepted = await upload(user, image, { name: 'receipt.jpg', type: 'image/jpeg' });
    const result: ParserRunOutcome = {
      kind: 'result',
      result: {
        ok: true, layout: 'receipt', file_issues: ['receipt_fields_unread'], usage: { max_rss_kb: 1024, cpu_ms: 5 },
        image: { format: 'jpeg', width: 16, height: 16, base64: (await sharp(image).jpeg().toBuffer()).toString('base64') },
        rows: [{ source_row_id: 'image:1', occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, issues: [] }],
      },
    };
    const original = store.putStream.bind(store);
    store.putStream = async (key, body, options) => {
      const written = await original(key, body, options);
      if (key.startsWith('import_image/')) {
        await db.admin((client) => client.query(`UPDATE jobs SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now() WHERE id = $1`, [accepted.job_id]));
      }
      return written;
    };
    try {
      expect((await runParse(accepted.job_id, workerWith(fakeRunner(result)))).status).toBe('cancelled');
    } finally {
      store.putStream = original;
    }
    expect(await count('import_previews', user.accountId)).toBe(0);
    const keys = await stored(`import_image/${user.accountId}/`);
    expect(keys).toHaveLength(1);
    const [registry] = await adminRows<{ status: string }>('SELECT status FROM object_publications WHERE key = $1', [keys[0]]);
    expect(registry.status).toBe('reserved');
    await publication.sweep(user.accountId, new Date(Date.now() + HOUR_MS));
    expect(await stored(`import_image/${user.accountId}/`)).toEqual([]);
  });
});

describe('receipt images are sanitized and expire unattached', () => {
  it('publishes a metadata-free re-encoding for 24 hours and a review-only candidate', async () => {
    const user = await money.member();
    const original = await imageWithMetadata('jpeg', 64, 48);
    const accepted = await upload(user, original, { name: 'receipt.jpg', type: 'image/jpeg' });
    const parsedAt = Date.now();
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    const result = await previewOf(user, accepted.job_id);
    expect(result.status).toBe('ready');
    expect(result.candidates).toEqual([
      { source_row_id: 'image:1', ordinal: 1, occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, review_required: true },
    ]);
    expect(result.issues).toEqual([
      { code: 'receipt_fields_unread', source_row_id: null, field: null },
      { code: 'missing_date', source_row_id: 'image:1', field: 'occurred_on' },
      { code: 'missing_type', source_row_id: 'image:1', field: 'type' },
      { code: 'missing_amount', source_row_id: 'image:1', field: 'amount_minor' },
      { code: 'missing_wallet', source_row_id: 'image:1', field: 'wallet_label' },
    ]);
    expect(result.summary).toMatchObject({ layout: 'receipt', candidate_count: 1, review_required_count: 1, image: { width: 64, height: 48 } });
    expect(JSON.stringify(result)).not.toMatch(/import_image|import_quarantine/);

    const keys = await stored(`import_image/${user.accountId}/${accepted.job_id}/`);
    expect(keys).toEqual([expect.stringMatching(/\/image\.jpg$/)]);
    const sanitized = Buffer.from((await store.get(keys[0])) as Uint8Array);
    for (const marker of IMAGE_MARKERS) expect(sanitized.includes(marker)).toBe(false);
    const meta = await sharp(sanitized).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif, meta.xmp]).toEqual(['jpeg', 64, 48, undefined, undefined]);
    const [registry] = await adminRows<{ status: string; purpose: string; delete_after: Date }>('SELECT status, purpose, delete_after FROM object_publications WHERE key = $1', [keys[0]]);
    expect([registry.status, registry.purpose]).toEqual(['published', 'import_image']);
    expect(Math.abs(registry.delete_after.getTime() - (parsedAt + DAY_MS))).toBeLessThan(60_000);
    const [row] = await adminRows<{ image_key: string }>('SELECT image_key FROM import_previews WHERE job_id = $1', [accepted.job_id]);
    expect(row.image_key).toBe(keys[0]);

    // Unattached after 24 hours: the sweep deletes it.
    expect(await publication.sweep(user.accountId)).toEqual([]);
    expect(await publication.sweep(user.accountId, new Date(Date.now() + 25 * HOUR_MS))).toEqual(expect.arrayContaining([keys[0]]));
    expect(await stored(`import_image/${user.accountId}/`)).toEqual([]);
  });
});

describe('unconfirmed candidates expire after 7 days', () => {
  async function previewExpiryJob(jobId: string): Promise<{ id: string; status: string; run_after: Date }> {
    const [row] = await adminRows<{ id: string; status: string; run_after: Date }>(
      `SELECT id, status, run_after FROM jobs WHERE kind = 'import_expire' AND payload ->> 'import_job_id' = $1::text AND payload ->> 'stage' = 'preview'`,
      [jobId],
    );
    return row;
  }

  it('queues one expiry job at the preview expiry, and it deletes the candidates when due', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await runParse(accepted.job_id);
    const ready = await previewOf(user, accepted.job_id);
    const expiry = await previewExpiryJob(accepted.job_id);
    expect(expiry.status).toBe('queued');
    expect(expiry.run_after.toISOString()).toBe(ready.expires_at);

    // Due by the queue, but the preview is only minutes old: nothing changes.
    await db.admin((client) => client.query(`UPDATE jobs SET run_after = now() - interval '1 minute' WHERE id = $1`, [expiry.id]));
    expect(await worker.runOnce()).toBe('ran');
    expect((await previewExpiryJob(accepted.job_id)).status).toBe('queued');
    expect(await count('import_candidates', user.accountId)).toBe(6);

    await db.admin(async (client) => {
      await client.query(`UPDATE import_previews SET created_at = created_at - interval '8 days', expires_at = expires_at - interval '8 days' WHERE job_id = $1`, [accepted.job_id]);
      await client.query(`UPDATE jobs SET run_after = now() - interval '1 minute' WHERE id = $1`, [expiry.id]);
    });
    expect(await worker.runOnce()).toBe('ran');
    expect((await previewExpiryJob(accepted.job_id)).status).toBe('succeeded');
    expect(await count('import_candidates', user.accountId)).toBe(0);
    const expired = await previewOf(user, accepted.job_id);
    expect(expired).toMatchObject({ status: 'expired', candidates: [], issues: [], duplicate_advice: [] });
  });
});

describe('a preview past its 7 days is expired, whatever happened to its expiry job (M4)', () => {
  const retention = () => {
    const step = defaultPrivacySteps().retentionSteps().find((candidate) => candidate.name === 'imports.previews');
    expect(step?.name).toBe('imports.previews');
    if (!step) throw new Error('unreachable');
    return step;
  };

  async function overdue(jobId: string): Promise<string> {
    const [expiry] = await adminRows<{ id: string }>(`SELECT id FROM jobs WHERE kind = 'import_expire' AND payload ->> 'stage' = 'preview' AND payload ->> 'import_job_id' = $1::text`, [jobId]);
    await db.admin(async (client) => {
      await client.query(`UPDATE import_previews SET created_at = created_at - interval '8 days', expires_at = expires_at - interval '8 days' WHERE job_id = $1`, [jobId]);
      await client.query(`UPDATE jobs SET run_after = now() - interval '1 minute' WHERE id = $1`, [expiry.id]);
    });
    return expiry.id;
  }

  it('an account disabled at the due time: its job ends superseded, the route says expired at once, retention deletes the candidates', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await runParse(accepted.job_id);
    const expiry = await overdue(accepted.job_id);
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'disabled' WHERE id = $1`, [user.accountId]));
    expect(await worker.runOnce()).toBe('ran');
    expect((await jobOf(expiry)).status).toBe('superseded');
    // Maintenance as the worker runs it, then the account comes back.
    await importMaintenance(jobsPool);
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'active' WHERE id = $1`, [user.accountId]));
    await importMaintenance(jobsPool);

    // Past expires_at the route never serves the rows, even before retention runs.
    expect(await count('import_candidates', user.accountId)).toBe(6);
    const served = await previewOf(user, accepted.job_id);
    expect(served).toMatchObject({ status: 'expired', candidates: [], issues: [], duplicate_advice: [] });
    expect(served.summary).toMatchObject({ candidate_count: 6, totals: { expense_minor: '154000', income_minor: '235000', transfer_minor: '0' } });

    expect(await retention().run(jobsPool)).toBe(1);
    expect(await count('import_candidates', user.accountId)).toBe(0);
    const [row] = await adminRows<{ status: string; expired_at: Date | null }>('SELECT status, expired_at FROM import_previews WHERE job_id = $1', [accepted.job_id]);
    expect(row.status).toBe('expired');
    expect(row.expired_at).not.toBeNull();
    expect(await retention().run(jobsPool)).toBe(0);
  });

  it('an account at a newer lifecycle generation: retention expires the preview and makes its image due', async () => {
    const user = await money.member();
    const accepted = await upload(user, await imageWithMetadata('jpeg', 32, 24), { name: 'receipt.jpg', type: 'image/jpeg' });
    expect((await runParse(accepted.job_id)).status).toBe('succeeded');
    const expiry = await overdue(accepted.job_id);
    await db.admin((client) => client.query('UPDATE accounts SET lifecycle_generation = lifecycle_generation + 1 WHERE id = $1', [user.accountId]));
    expect(await worker.runOnce()).toBe('ran');
    expect((await jobOf(expiry)).status).toBe('superseded');
    expect(await count('import_candidates', user.accountId)).toBe(1);

    expect(await retention().run(jobsPool)).toBe(1);
    expect(await count('import_candidates', user.accountId)).toBe(0);
    const [image] = await adminRows<{ due: boolean }>(`SELECT delete_after <= now() AS due FROM object_publications WHERE job_id = $1 AND purpose = 'import_image'`, [accepted.job_id]);
    expect(image.due).toBe(true);
  });

  it('leaves a preview inside its 7 days alone', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await runParse(accepted.job_id);
    await retention().run(jobsPool);
    expect(await count('import_candidates', user.accountId)).toBe(6);
    expect((await previewOf(user, accepted.job_id)).status).toBe('ready');
  });
});

describe('a parsed import keeps its state until its rows are pruned (minor 4)', () => {
  const step = (name: string) => {
    const found = defaultPrivacySteps().retentionSteps().find((candidate) => candidate.name === name);
    expect(found?.name).toBe(name);
    if (!found) throw new Error('unreachable');
    return found;
  };

  it('pruning its succeeded parse job does not turn it into an expired upload; its rows, preview and totals go 30 days after its raw expiry', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await runParse(accepted.job_id);
    const shift = (by: string) =>
      db.admin((client) =>
        client.query(
          `UPDATE import_uploads SET created_at = created_at - $2::interval, receive_deadline = receive_deadline - $2::interval,
                  accepted_at = accepted_at - $2::interval, expires_at = expires_at - $2::interval WHERE job_id = $1`,
          [accepted.job_id, by],
        ),
      );
    // Almost 31 days on: the parse job finished over 30 days ago; the raw file expired just under 30 days ago.
    await shift('31 days -2 hours');
    await db.admin((client) => client.query(`UPDATE jobs SET finished_at = finished_at - interval '31 days' WHERE id = $1`, [accepted.job_id]));
    await step('jobs.finished').run(jobsPool);
    expect(await jobOf(accepted.job_id)).toBeUndefined();
    await importMaintenance(jobsPool);
    const [upload_] = await adminRows<{ status: string; finished_at: Date | null }>('SELECT status, finished_at FROM import_uploads WHERE job_id = $1', [accepted.job_id]);
    expect(upload_).toEqual({ status: 'accepted', finished_at: null });
    const status = await request(server).get(`/v1/imports/${accepted.job_id}`).set(await sessionHeaders(user));
    expect(status.body.status).toBe('parsed');

    // Not yet 30 days past the raw expiry: kept.
    await step('imports.uploads').run(jobsPool);
    expect(await count('import_previews', user.accountId)).toBe(1);
    await shift('3 hours');
    await step('imports.uploads').run(jobsPool);
    expect(await count('import_uploads', user.accountId)).toBe(0);
    expect(await count('import_previews', user.accountId)).toBe(0);
    expect(await count('import_candidates', user.accountId)).toBe(0);
  });
});

describe('the job worker never claims a parse it cannot sandbox (B1)', () => {
  it('a worker started on a runtime without network permission leaves import_parse queued, without spending an attempt', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    const startup = await importParsingStartup(new OpenNetRunner());
    expect(startup.parse).toBeNull();
    const unsandboxed = new JobWorker(jobs, buildHandlers(deps, { parse: startup.parse }));
    for (let round = 0; round < 3; round += 1) await unsandboxed.runOnce();
    const [job] = await adminRows<{ status: string; attempts: number }>('SELECT status, attempts FROM jobs WHERE id = $1', [accepted.job_id]);
    expect(job).toEqual({ status: 'queued', attempts: 0 });
    expect(await count('import_previews', user.accountId)).toBe(0);
  });

  it.each<[string, ParserRunOutcome, string]>([
    ['a runner that refuses an unsandboxed runtime', { kind: 'sandbox_unsupported' }, 'parser_sandbox_unsupported'],
    ['a child that could not be started', { kind: 'spawn_failed' }, 'parser_unavailable'],
  ])('%s fails the job retryably and records no preview', async (_label, outcome, code) => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    await runParse(accepted.job_id, workerWith(fakeRunner(outcome)));
    const [job] = await adminRows<{ status: string; last_error: string; attempts: number }>('SELECT status, last_error, attempts FROM jobs WHERE id = $1', [accepted.job_id]);
    expect([job.last_error, job.status === 'queued' || job.status === 'failed']).toEqual([code, true]);
    expect(await count('import_previews', user.accountId)).toBe(0);
  });

  it('a child stopped past its memory budget gives a rejected preview, never a retry', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    expect((await runParse(accepted.job_id, workerWith(fakeRunner({ kind: 'memory_limit' })))).status).toBe('succeeded');
    const result = await previewOf(user, accepted.job_id);
    expect(result).toMatchObject({ status: 'rejected', candidates: [] });
    expect(result.issues).toEqual([{ code: 'parse_resource_limit', source_row_id: null, field: null }]);
  });

  it('an image whose own header disagrees with what the child said is never published', async () => {
    const user = await money.member();
    const image = await imageWithMetadata('jpeg', 16, 16);
    const accepted = await upload(user, image, { name: 'receipt.jpg', type: 'image/jpeg' });
    const clean = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#406080' } }).jpeg().toBuffer();
    const claimed = (base64: string, width: number): ParserRunOutcome => ({
      kind: 'result',
      result: {
        ok: true, layout: 'receipt', file_issues: ['receipt_fields_unread'], usage: { max_rss_kb: 1024, cpu_ms: 5 },
        image: { format: 'jpeg', width, height: 16, base64 },
        rows: [{ source_row_id: 'image:1', occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null,
          issues: [{ field: 'occurred_on', code: 'missing_date' }, { field: 'type', code: 'missing_type' }, { field: 'amount_minor', code: 'missing_amount' }, { field: 'wallet_label', code: 'missing_wallet' }] }],
      },
    });
    // The wrong size, then metadata the child said it removed.
    expect((await runParse(accepted.job_id, workerWith(fakeRunner(claimed(clean.toString('base64'), 4_000))))).status).toBe('succeeded');
    expect((await previewOf(user, accepted.job_id)).issues).toEqual([{ code: 'parse_failed', source_row_id: null, field: null }]);
    const second = await upload(user, image, { name: 'receipt.jpg', type: 'image/jpeg' });
    expect((await runParse(second.job_id, workerWith(fakeRunner(claimed(image.toString('base64'), 16))))).status).toBe('succeeded');
    expect((await previewOf(user, second.job_id)).issues).toEqual([{ code: 'parse_failed', source_row_id: null, field: null }]);
    expect(await stored(`import_image/${user.accountId}/`)).toEqual([]);
  });
});

describe('a paused OCR gate parks queued image parses attempt-neutrally (P2b)', () => {
  const pausedOcr = () => new FeatureGates({ paused: ['ocr'], retryAfterSeconds: 120 });
  const attemptsOf = async (id: string) =>
    (await adminRows<{ status: string; attempts: number; last_error: string | null; delayed: boolean }>(
      `SELECT status, attempts, last_error, run_after > now() + interval '60 seconds' AS delayed FROM jobs WHERE id = $1`,
      [id],
    ))[0];

  it('releases a claimed image job (no attempt spent, nothing read or recorded) and still parses a spreadsheet', async () => {
    const user = await money.member();
    const image = await imageWithMetadata('jpeg', 16, 16);
    const receipt = await upload(user, image, { name: 'receipt.jpg', type: 'image/jpeg' });
    const sheet = await upload(user, MEOWJOT);
    const gated = new JobWorker(jobs, buildHandlers(deps, { parse: { runner: parsingRunner() }, gates: pausedOcr() }));
    expect((await runParse(sheet.job_id, gated)).status).toBe('succeeded');
    for (let round = 0; round < 3; round += 1) await gated.runOnce();
    // Released with its attempt given back, and held back for the retry-after rather than spun on.
    expect(await attemptsOf(receipt.job_id)).toEqual({ status: 'queued', attempts: 0, last_error: 'ocr_paused', delayed: true });
    expect(await stored(`import_image/${user.accountId}/`)).toEqual([]);
    expect(await count('import_previews', user.accountId)).toBe(1);
  });

  it('parses the same job after the gate reopens, as its first attempt', async () => {
    const user = await money.member();
    const receipt = await upload(user, await imageWithMetadata('jpeg', 16, 16), { name: 'receipt.jpg', type: 'image/jpeg' });
    const gated = new JobWorker(jobs, buildHandlers(deps, { parse: { runner: parsingRunner() }, gates: pausedOcr() }));
    await gated.runOnce();
    expect(await attemptsOf(receipt.job_id)).toMatchObject({ status: 'queued', attempts: 0, last_error: 'ocr_paused' });
    await db.admin((client) => client.query('UPDATE jobs SET run_after = now() WHERE id = $1', [receipt.job_id]));
    expect(await runParse(receipt.job_id)).toEqual({ status: 'succeeded', last_error: null });
    expect((await previewOf(user, receipt.job_id)).status).toBe('ready');
  });

  it('does not park a raw file past its expiry: it still fails visibly', async () => {
    const user = await money.member();
    const receipt = await upload(user, await imageWithMetadata('jpeg', 16, 16), { name: 'receipt.jpg', type: 'image/jpeg' });
    await db.admin((client) =>
      client.query(
        `UPDATE import_uploads SET created_at = created_at - interval '25 hours', receive_deadline = receive_deadline - interval '25 hours',
                accepted_at = accepted_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE job_id = $1`,
        [receipt.job_id],
      ),
    );
    const gated = new JobWorker(jobs, buildHandlers(deps, { parse: { runner: parsingRunner() }, gates: pausedOcr() }));
    await gated.runOnce();
    expect(await jobOf(receipt.job_id)).toEqual({ status: 'failed', last_error: 'import_unavailable' });
  });
});

describe('privileges', () => {
  it('only the fenced routines write previews; logins read nothing they should not', async () => {
    const user = await money.member();
    const accepted = await upload(user, MEOWJOT);
    const app = await db.loginPool(['gogospend_app'], 1);
    const reader = await db.loginPool(['gogospend_leased_read'], 1);
    for (const table of ['import_previews', 'import_candidates']) {
      await expect(jobsPool.query(`SELECT * FROM ${table}`)).rejects.toMatchObject({ code: '42501' });
      await expect(reader.query(`SELECT * FROM ${table}`)).rejects.toMatchObject({ code: '42501' });
      await expect(app.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(app.query(`INSERT INTO import_previews (job_id, account_id, lifecycle_generation, status, candidate_count, review_required_count, expires_at) VALUES ($1, $2, 0, 'ready', 0, 0, now() + interval '1 day')`, [accepted.job_id, user.accountId])).rejects.toMatchObject({ code: '42501' });
    await expect(app.query(`SELECT gogospend_record_import_preview($1, gen_random_uuid(), '{}'::jsonb, '[]'::jsonb)`, [accepted.job_id])).rejects.toMatchObject({ code: '42501' });
    // The worker still has no financial reads, and cannot mint an expiry job.
    await expect(jobsPool.query('SELECT * FROM transactions')).rejects.toMatchObject({ code: '42501' });
    await expect(
      jobsPool.query(`INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts) VALUES (gen_random_uuid(), 'import_expire', $1, 0, $2, 3)`, [user.accountId, JSON.stringify({ import_job_id: accepted.job_id, stage: 'preview' })]),
    ).rejects.toMatchObject({ code: '42501' });

    // A real lease: a forged token reads and records nothing; a candidate breaking the rules is refused.
    const [claimed] = await jobs.claim(['import_parse'], { limit: 1 });
    expect(claimed.lease.jobId).toBe(accepted.job_id);
    const forged = randomUUID();
    expect((await jobsPool.query('SELECT * FROM gogospend_import_parse_source($1, $2)', [accepted.job_id, forged])).rows).toEqual([]);
    const source = (await jobsPool.query<{ format: string; part_count: number; part_keys: string[] }>('SELECT * FROM gogospend_import_parse_source($1, $2)', [accepted.job_id, claimed.lease.leaseToken])).rows;
    expect(source).toHaveLength(1);
    expect([source[0].format, source[0].part_count, source[0].part_keys.length]).toEqual(['csv', 1, 1]);
    const previewJson = JSON.stringify({ status: 'ready', layout: 'generic', issues: [], image_key: null, image_width: null, image_height: null });
    const candidate = { source_row_id: 'row:2', ordinal: 1, occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: null, merchant: null, note: null, issues: [], review_required: false };
    expect((await jobsPool.query('SELECT gogospend_record_import_preview($1, $2, $3, $4) AS ok', [accepted.job_id, forged, previewJson, JSON.stringify([candidate])])).rows[0].ok).toBe(false);
    await expect(
      jobsPool.query('SELECT gogospend_record_import_preview($1, $2, $3, $4) AS ok', [accepted.job_id, claimed.lease.leaseToken, previewJson, JSON.stringify([{ ...candidate, amount_minor: '0' }])]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      jobsPool.query('SELECT gogospend_record_import_preview($1, $2, $3, $4) AS ok', [accepted.job_id, claimed.lease.leaseToken, previewJson, JSON.stringify([{ ...candidate, review_required: false, wallet_label: null }])]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      jobsPool.query('SELECT gogospend_record_import_preview($1, $2, $3, $4) AS ok', [accepted.job_id, claimed.lease.leaseToken, previewJson, JSON.stringify([{ ...candidate, issues: [{ field: 'owner_id', code: 'x' }], review_required: true }])]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await count('import_previews', user.accountId)).toBe(0);
    await jobs.fail(claimed.lease, { code: 'test_done', retryable: false });
  });

  it('Drizzle definitions match the migrated preview tables', async () => {
    for (const table of [importPreviews, importCandidates]) {
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
