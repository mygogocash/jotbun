import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ATTACHMENT_DOWNLOAD_PATH, ATTACHMENT_GRANT_MINUTES, RECEIPT_RETENTION_CONSENT, isAttachmentGrant, isImportPreview, isSyncChangesPage, isTransactionSnapshot } from '@gogospend/contracts';
import type { AttachmentGrant, CommandAck, ImportJobDto, ImportPreview, SyncChangesPage, TransactionDto } from '@gogospend/contracts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import sharp from 'sharp';
import request from 'supertest';

import { LeasedAccountRead } from '../database/leased-account-read';
import { attachments as attachmentsTable, importPreviews, transactionAttachments } from '../database/schema';
import { HandlerRegistry } from '../jobs/handler-registry';
import type { WorkerDeps } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { imageWithMetadata } from '../imports/fixtures/synthetic-parse';
import { ParseHandler } from '../imports/parse-handler';
import type { ParserRunOutcome } from '../imports/parser-runner';
import { defaultPrivacySteps, purgeExpiredRecords } from '../privacy/privacy-steps';
import { API_PUBLISHED_PURPOSES, ObjectPublicationService } from '../storage/object-publication.service';
import { ObjectStoreError } from '../storage/object-store';
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
import { deletionWorker, scriptedGateway } from '../testing/privacy-fixtures';
import { v1Client } from '../testing/v1-client';
import { ATTACHMENT_LIMITS } from './attachment-limits';
import type { AttachmentLimits } from './attachment-limits';
import { AttachmentService } from './attachments.service';
import { receiptCleanupOverdue } from './receipt-cleanup';

const HOUR_MS = 3_600_000;
const CONSENT = { consent: RECEIPT_RETENTION_CONSENT };

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

async function sessionHeaders(user: SignedUp): Promise<Record<string, string>> {
  return {
    'x-gogospend-client': 'ios/1.0.0',
    authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`,
    'x-gogospend-session': user.binding,
  };
}

const adminRows = async <T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> =>
  (await db.admin((client) => client.query<T>(text, values))).rows;

async function upload(user: SignedUp, body: Buffer, type: string): Promise<ImportJobDto> {
  const res = await request(server)
    .post('/v1/imports')
    .set(await sessionHeaders(user))
    .set('idempotency-key', randomUUID())
    .set('content-type', type)
    .set('x-gogospend-file-name', encodeURIComponent(type === 'image/png' ? 'receipt.png' : 'receipt.jpg'))
    .send(body);
  if (res.status !== 202) throw new Error(`upload refused: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as ImportJobDto;
}

async function previewOf(user: SignedUp, jobId: string): Promise<ImportPreview> {
  const res = await request(server).get(`/v1/imports/${jobId}/preview`).set(await sessionHeaders(user));
  expect(res.status).toBe(200);
  expect(isImportPreview(res.body)).toBe(true);
  return res.body as ImportPreview;
}

type Attachable = { jobId: string; attachmentId: string; bytes: Buffer; sha256: string; contentType: string; preview: ImportPreview };

/**
 * An import preview with one sanitized receipt image, through the real upload
 * route, parse job, publication and preview route; the parser child is
 * replaced by its result (P2b's spec covers the child itself).
 */
async function attachableImage(user: SignedUp, format: 'jpeg' | 'png' = 'jpeg', width = 40, height = 30): Promise<Attachable> {
  const original = await imageWithMetadata(format, width, height);
  const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const accepted = await upload(user, original, contentType);
  const sanitized = format === 'jpeg' ? await sharp(original).jpeg().toBuffer() : await sharp(original).png().toBuffer();
  const outcome: ParserRunOutcome = {
    kind: 'result',
    result: {
      ok: true, layout: 'receipt', file_issues: ['receipt_fields_unread'], usage: { max_rss_kb: 1024, cpu_ms: 5 },
      image: { format, width, height, base64: sanitized.toString('base64') },
      rows: [{ source_row_id: 'image:1', occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, issues: [] }],
    },
  };
  const worker = new JobWorker(jobs, new HandlerRegistry().register('import_parse', (job) => new ParseHandler(deps, { runner: { run: async () => outcome } }).run(job)));
  for (let round = 0; round < 5; round += 1) {
    const [job] = await adminRows<{ status: string }>('SELECT status FROM jobs WHERE id = $1', [accepted.job_id]);
    if (job.status === 'succeeded') break;
    await worker.runOnce();
  }
  const preview = await previewOf(user, accepted.job_id);
  expect(preview.status).toBe('ready');
  const image = preview.summary?.image;
  if (!image) throw new Error('the preview has no image');
  return { jobId: accepted.job_id, attachmentId: image.attachment_id, bytes: sanitized, sha256: createHash('sha256').update(sanitized).digest('hex'), contentType, preview };
}

async function memberWithRecords(count = 1): Promise<{ user: SignedUp; records: string[] }> {
  const user = await money.member();
  const wallet = await money.wallet(user);
  const records: string[] = [];
  for (let i = 0; i < count; i += 1) {
    records.push(await money.record(user, { type: 'expense', amount_minor: String(6500 + i), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') }));
  }
  return { user, records };
}

const recordOf = async (user: SignedUp, id: string): Promise<TransactionDto> => {
  const res = await as(user).get(`/v1/transactions/${id}`);
  expect(res.status).toBe(200);
  return res.body as TransactionDto;
};
const retain = (user: SignedUp, recordId: string, body: Record<string, unknown>, ifMatch: number | null, key?: string) =>
  as(user).post(`/v1/transactions/${recordId}/attachment`, body, { ifMatch, key });
const replace = (user: SignedUp, recordId: string, body: Record<string, unknown>, ifMatch: number | null, key?: string) =>
  as(user).put(`/v1/transactions/${recordId}/attachment`, body, { ifMatch, key });
const remove = (user: SignedUp, recordId: string, ifMatch: number | null, key?: string) => as(user).del(`/v1/transactions/${recordId}/attachment`, { ifMatch, key });
const grantOf = (user: SignedUp, attachmentId: string) => as(user).get(`/v1/attachments/${attachmentId}/grant`);

async function download(user: SignedUp, url: string) {
  return request(server)
    .get(url)
    .set(await sessionHeaders(user))
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

/** The problem body without its per-request id, to compare "not found" answers. */
const problemOf = (body: Record<string, unknown>) => ({ ...body, request_id: undefined });

const receiptRows = (accountId: string) =>
  adminRows<{ key: string; status: string; job_id: string; forever: boolean; due: boolean }>(
    `SELECT key, status, job_id, delete_after = 'infinity' AS forever, delete_after <= now() AS due
       FROM object_publications WHERE purpose = 'receipt' AND account_id = $1 ORDER BY created_at, key`,
    [accountId],
  );
const storedReceipts = async (accountId: string) => (await store.list(`receipt/${accountId}/`)).map((object) => object.key);
const attachmentOf = async (accountId: string, id: string) =>
  (await adminRows<{ status: string; object_key: string; content_type: string; bytes: string; sha256: string; width: number; height: number; source_job_id: string; released: boolean }>(
    `SELECT status, object_key, content_type, bytes::text AS bytes, encode(sha256, 'hex') AS sha256, width, height, source_job_id, released_at IS NOT NULL AS released
       FROM attachments WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  ))[0];
/** A retained receipt's object key (asserting it is retained first). */
async function receiptKeyOf(accountId: string, id: string): Promise<string> {
  const row = await attachmentOf(accountId, id);
  expect(row).toEqual(expect.objectContaining({ status: 'retained' }));
  return row.object_key;
}
const heldBy = async (accountId: string, attachmentId: string) =>
  (await adminRows<{ transaction_id: string }>('SELECT transaction_id FROM transaction_attachments WHERE account_id = $1 AND attachment_id = $2 ORDER BY transaction_id', [accountId, attachmentId])).map((row) => row.transaction_id);
const latestSnapshot = async (accountId: string, recordId: string) =>
  (await adminRows<{ snapshot: Record<string, unknown> }>(
    `SELECT snapshot FROM entity_changes WHERE account_id = $1 AND entity = 'transaction' AND entity_id = $2 ORDER BY revision DESC LIMIT 1`,
    [accountId, recordId],
  ))[0]?.snapshot;

async function retained(user: SignedUp, recordId: string, image: Attachable, ifMatch: number): Promise<CommandAck> {
  const res = await retain(user, recordId, { attachment_id: image.attachmentId, ...CONSENT }, ifMatch);
  expect(res.status).toBe(200);
  return res.body as CommandAck;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type StoreMethods = Pick<MemoryObjectStore, 'getStream' | 'putStream' | 'copy' | 'head' | 'list' | 'listPages'>;
type StorePatches = { [K in keyof StoreMethods]?: (original: StoreMethods[K]) => StoreMethods[K] };
/** Wraps some of the app's store methods; returns the undo. */
function patchStore(patches: StorePatches): () => void {
  const target = store as unknown as Record<string, unknown>;
  const names = Object.keys(patches) as (keyof StoreMethods)[];
  const saved = names.map((name) => [name, Object.prototype.hasOwnProperty.call(target, name), target[name]] as const);
  for (const name of names) {
    const original = (store[name] as (...args: unknown[]) => unknown).bind(store);
    target[name] = (patches[name] as (original: unknown) => unknown)(original);
  }
  return () => {
    for (const [name, own, value] of saved) {
      if (own) target[name] = value;
      else delete target[name];
    }
  };
}

/** Counts every write of receipt bytes, whether streamed through the API or copied inside the store. */
function countReceiptWrites(): { count: () => number; restore: () => void } {
  let writes = 0;
  const restore = patchStore({
    putStream: (original) => (key, body, options) => {
      if (key.startsWith('receipt/')) writes += 1;
      return original(key, body, options);
    },
    copy: (original) => (source, destination, options) => {
      if (destination.startsWith('receipt/')) writes += 1;
      return original(source, destination, options);
    },
  });
  return { count: () => writes, restore };
}

const limits = () => v1.app.get<AttachmentLimits>(ATTACHMENT_LIMITS);
/** Runs `fn` with some limits changed, then puts them back. */
async function withLimits<T>(changes: Partial<AttachmentLimits>, fn: () => Promise<T>): Promise<T> {
  const current = limits();
  const saved = { ...current };
  Object.assign(current, changes);
  try {
    return await fn();
  } finally {
    Object.assign(current, saved);
  }
}

/** A reservation in its own owner transaction, held open `holdSeconds` before COMMIT. */
async function reserveIn(app: Pool, user: SignedUp, attachmentId: string, holdSeconds = 0): Promise<{ outcome: string; retry_after: number | null }> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
    const { rows } = await client.query<{ outcome: string; retry_after?: number | null }>('SELECT * FROM gogospend_reserve_receipt_copy($1, $2)', [attachmentId, randomUUID()]);
    if (holdSeconds > 0) await client.query('SELECT pg_sleep($1)', [holdSeconds]);
    await client.query('COMMIT');
    return { outcome: rows[0].outcome, retry_after: rows[0].retry_after ?? null };
  } finally {
    client.release();
  }
}

async function listening(): Promise<number> {
  if (!server.listening) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return (server.address() as AddressInfo).port;
}

type RawDownload = { status: number; headers: IncomingHttpHeaders; body: Buffer; complete: boolean };
/** A download over a real socket, reporting whether the response arrived whole (or was cut off). */
async function rawDownload(user: SignedUp, path: string): Promise<RawDownload> {
  const port = await listening();
  const headers = await sessionHeaders(user);
  return new Promise((resolve, reject) => {
    const req = httpGet({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), complete: res.complete });
      };
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', finish);
      res.on('error', finish);
      res.on('close', finish);
    });
    req.on('error', reject);
  });
}

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
  // Concurrent requests must not each open and close their own listener.
  await listening();
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  jobs = new JobRepository(jobsPool);
  publication = new ObjectPublicationService(jobsPool, store);
  deps = { jobs, reader: new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2)), store, publication, pool: jobsPool };
});

afterEach(async () => {
  // Parse jobs left queued must not reach another test's worker.
  await db.admin((client) => client.query(`UPDATE jobs SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now() WHERE kind = 'import_parse' AND status IN ('queued', 'leased')`));
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('ownership: another account can neither use nor learn of a receipt', () => {
  it('foreign_attachment_grant_is_denied', async () => {
    const { user: owner, records } = await memberWithRecords();
    const image = await attachableImage(owner);
    await retained(owner, records[0], image, 1);
    const ownGrant = await grantOf(owner, image.attachmentId);
    expect(ownGrant.status).toBe(200);
    const intruder = await money.member();

    const foreignGrantResponse = await grantOf(intruder, image.attachmentId);
    expect(foreignGrantResponse.status).toBe(404);
    // The same answer as an id nobody has: nothing says the receipt exists.
    const unknown = await grantOf(intruder, randomUUID());
    expect(problemOf(foreignGrantResponse.body)).toEqual(problemOf(unknown.body));
    // The owner's grant is bound to the owner's account.
    const stolen = await download(intruder, (ownGrant.body as AttachmentGrant).url);
    expect(stolen.status).toBe(404);
    expect(problemOf(JSON.parse((stolen.body as Buffer).toString('utf8')) as Record<string, unknown>)).toEqual(problemOf(unknown.body));
  });

  it('cross-owner association is denied with 404 and no existence leak, and copies nothing', async () => {
    const { user: owner, records: ownerRecords } = await memberWithRecords();
    const ownerImage = await attachableImage(owner);
    await retained(owner, ownerRecords[0], ownerImage, 1);
    const { user: intruder, records: intruderRecords } = await memberWithRecords();
    const intruderImage = await attachableImage(intruder);

    // Another account's receipt onto one's own record: the same 404 as an unknown id.
    const foreignImage = await retain(intruder, intruderRecords[0], { attachment_id: ownerImage.attachmentId, ...CONSENT }, 1);
    const unknownImage = await retain(intruder, intruderRecords[0], { attachment_id: randomUUID(), ...CONSENT }, 1);
    expect(foreignImage.status).toBe(404);
    expect(problemOf(foreignImage.body)).toEqual(problemOf(unknownImage.body));
    // One's own image onto another account's record: the same 404 as an unknown record.
    const foreignRecord = await retain(intruder, ownerRecords[0], { attachment_id: intruderImage.attachmentId, ...CONSENT }, 2);
    const unknownRecord = await retain(intruder, randomUUID(), { attachment_id: intruderImage.attachmentId, ...CONSENT }, 2);
    expect(foreignRecord.status).toBe(404);
    expect(problemOf(foreignRecord.body)).toEqual(problemOf(unknownRecord.body));

    expect(await receiptRows(intruder.accountId)).toEqual([]);
    expect(await storedReceipts(intruder.accountId)).toEqual([]);
    expect(await adminRows('SELECT 1 FROM attachments WHERE account_id = $1', [intruder.accountId])).toEqual([]);
    expect((await recordOf(intruder, intruderRecords[0])).version).toBe(1);
    expect(await heldBy(owner.accountId, ownerImage.attachmentId)).toEqual([ownerRecords[0]]);
    expect((await recordOf(owner, ownerRecords[0])).version).toBe(2);
    // Below the API: the retained-receipt guard refuses it, and so do the composite owner keys on their own.
    const crossInsert = (client: { query: (text: string, values: unknown[]) => Promise<unknown> }) => client.query(
      'INSERT INTO transaction_attachments (account_id, transaction_id, attachment_id) VALUES ($1, $2, $3)',
      [intruder.accountId, intruderRecords[0], ownerImage.attachmentId],
    );
    await expect(db.admin((client) => crossInsert(client))).rejects.toMatchObject({ code: '23514' });
    const fkCode = await db.admin(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('ALTER TABLE transaction_attachments DISABLE TRIGGER transaction_attachments_retained');
        await crossInsert(client);
        return 'inserted';
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(fkCode).toBe('23503');
  });

  it('a preview image nobody retained, a quarantined upload and an import id never get a grant', async () => {
    const user = await money.member();
    const image = await attachableImage(user);
    for (const id of [image.attachmentId, image.jobId, randomUUID()]) {
      const res = await grantOf(user, id);
      expect(res.status).toBe(404);
    }
    expect((await grantOf(user, 'not-a-uuid')).status).toBe(404);
    // The preview names the image by its opaque id only, retainable for about 24 hours.
    expect(image.attachmentId).not.toBe(image.jobId);
    expect(JSON.stringify(image.preview)).not.toMatch(/import_image|import_quarantine|receipt\//);
    const until = Date.parse(image.preview.summary?.image?.attachable_until ?? '');
    expect(Math.abs(until - (Date.now() + 24 * HOUR_MS - 2 * 60_000))).toBeLessThan(5 * 60_000);
  });
});

describe('retaining a receipt', () => {
  it('needs explicit consent and the record version, and makes the receipt part of the record', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    for (const body of [{ attachment_id: image.attachmentId }, { attachment_id: image.attachmentId, consent: 'yes' }]) {
      const refused = await retain(user, records[0], body, 1);
      expect(refused.status).toBe(422);
      expect(refused.body.fields).toEqual(expect.objectContaining({ consent: expect.any(String) }));
    }
    expect((await retain(user, records[0], { attachment_id: 'nope', ...CONSENT }, 1)).status).toBe(422);
    expect((await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, null)).status).toBe(422);
    expect(await receiptRows(user.accountId)).toEqual([]);

    const key = randomUUID();
    const ack = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key);
    expect(ack.status).toBe(200);
    expect(ack.body).toEqual(expect.objectContaining({ command_id: key, entity_id: records[0], version: 2, outcome: 'updated', entity_state: 'active' }));

    const record = await recordOf(user, records[0]);
    expect(record).toEqual(expect.objectContaining({ version: 2, attachment_id: image.attachmentId }));
    expect(isTransactionSnapshot(record)).toBe(true);
    // Sync carries the receipt on the record's next version.
    const snapshot = await latestSnapshot(user.accountId, records[0]);
    expect(snapshot).toEqual(expect.objectContaining({ version: 2, attachment_id: image.attachmentId }));
    expect(isTransactionSnapshot(snapshot)).toBe(true);
    const page = await as(user).get('/v1/sync/changes');
    expect(isSyncChangesPage(page.body)).toBe(true);
    const groups = (page.body as SyncChangesPage).groups;
    const lastChange = groups[groups.length - 1]?.changes[0];
    expect(lastChange).toEqual(expect.objectContaining({ entity: 'transaction', id: records[0], version: 2 }));
    // The consent is on the audit trail as a short code.
    const [audit] = await adminRows<{ metadata: Record<string, string> }>('SELECT metadata FROM audit_events WHERE account_id = $1 AND command_id = $2', [user.accountId, key]);
    expect(audit.metadata).toEqual(expect.objectContaining({ consent: RECEIPT_RETENTION_CONSENT }));

    // A copy under the receipt purpose, published with no expiry, byte for byte the sanitized image.
    const [row] = await receiptRows(user.accountId);
    expect(row).toEqual(expect.objectContaining({ status: 'published', job_id: image.attachmentId, forever: true }));
    expect(row.key).toMatch(new RegExp(`^receipt/${user.accountId}/${image.attachmentId}/[0-9a-f-]{36}/image\\.jpg$`));
    expect(Buffer.from((await store.get(row.key)) as Uint8Array).equals(image.bytes)).toBe(true);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual({
      status: 'retained', object_key: row.key, content_type: 'image/jpeg', bytes: String(image.bytes.length), sha256: image.sha256,
      width: 40, height: 30, source_job_id: image.jobId, released: false,
    });
  });

  it('copies inside the store, registered before the copy, and the receipt outlives the import image and the preview', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const calls: string[] = [];
    const seenAtCopy: (string | undefined)[] = [];
    const purposeOf = (key: string) => key.split('/')[0];
    const restore = patchStore({
      getStream: (original) => (key) => {
        calls.push(`read ${purposeOf(key)}`);
        return original(key);
      },
      putStream: (original) => (key, body, options) => {
        calls.push(`write ${purposeOf(key)}`);
        return original(key, body, options);
      },
      copy: (original) => async (source, destination, options) => {
        calls.push(`copy ${purposeOf(source)} to ${purposeOf(destination)}`);
        seenAtCopy.push((await adminRows<{ status: string }>('SELECT status FROM object_publications WHERE key = $1', [destination]))[0]?.status);
        return original(source, destination, options);
      },
    });
    try {
      await retained(user, records[0], image, 1);
    } finally {
      restore();
    }
    // The API never holds the image: one copy inside the store, registered first.
    expect(calls).toEqual(['copy import_image to receipt']);
    expect(seenAtCopy).toEqual(['reserved']);
    expect(Buffer.from((await store.get(await receiptKeyOf(user.accountId, image.attachmentId))) as Uint8Array).equals(image.bytes)).toBe(true);

    // The import image goes at its 24-hour deadline; the preview at 7 days.
    await publication.sweep(user.accountId, new Date(Date.now() + 25 * HOUR_MS));
    expect(await store.list(`import_image/${user.accountId}/`)).toEqual([]);
    await db.admin((client) => client.query(`UPDATE import_previews SET status = 'expired', expired_at = now() WHERE job_id = $1`, [image.jobId]));
    await publication.sweep(user.accountId, new Date(Date.now() + 30 * 24 * HOUR_MS));
    expect(await storedReceipts(user.accountId)).toHaveLength(1);

    const grant = await grantOf(user, image.attachmentId);
    expect(grant.status).toBe(200);
    expect(isAttachmentGrant(grant.body)).toBe(true);
    const body = grant.body as AttachmentGrant;
    expect(body).toEqual(expect.objectContaining({ content_type: 'image/jpeg', bytes: image.bytes.length, sha256: image.sha256 }));
    expect(body.url.startsWith(ATTACHMENT_DOWNLOAD_PATH)).toBe(true);
    expect(body.url).not.toContain(user.accountId);
    expect(Math.abs(Date.parse(body.expires_at) - (Date.now() + ATTACHMENT_GRANT_MINUTES * 60_000))).toBeLessThan(5_000);
    const file = await download(user, body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toBe('no-store');
    expect((file.body as Buffer).equals(image.bytes)).toBe(true);
    // Five minutes later the grant is spent.
    const grantToken = body.url.slice(ATTACHMENT_DOWNLOAD_PATH.length);
    const service = v1.app.get(AttachmentService);
    expect(await service.file(user.session, grantToken)).not.toBeNull();
    expect(await service.file(user.session, grantToken, new Date(Date.now() + ATTACHMENT_GRANT_MINUTES * 60_000 + 1_000))).toBeNull();
  });

  it('is versioned and idempotent: a stale version keeps nothing, a resend replays, a second receipt needs replace', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const stale = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 2);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
    // Its copy was never published: it is due, and the sweep deletes it.
    expect((await receiptRows(user.accountId)).every((row) => row.status === 'reserved' && row.due)).toBe(true);
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);

    const key = randomUUID();
    const first = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key);
    expect(first.status).toBe(200);
    const again = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key);
    expect([again.status, again.body]).toEqual([200, first.body]);
    // The resend copied nothing.
    expect(await receiptRows(user.accountId)).toEqual([expect.objectContaining({ status: 'published', forever: true })]);
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toHaveLength(1);
    expect((await retain(user, records[0], { attachment_id: randomUUID(), ...CONSENT }, 1, key)).body.code).toBe('IDEMPOTENCY_MISMATCH');

    const second = await attachableImage(user);
    // A command id that already committed never copies anything, whatever image it names (P3 prepares without a record).
    expect(await v1.app.get(AttachmentService).prepare(user.session, second.attachmentId, key)).toEqual({ kind: 'none', attachmentId: second.attachmentId });
    expect((await receiptRows(user.accountId)).filter((row) => row.job_id === second.attachmentId)).toEqual([]);
    const present = await retain(user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 2);
    expect([present.status, present.body.message_key]).toEqual([422, 'errors.attachment_present']);
    expect((await recordOf(user, records[0])).attachment_id).toBe(image.attachmentId);
    // The refusal was decided before anything was copied: no spare copy exists.
    expect((await receiptRows(user.accountId)).filter((row) => row.job_id === second.attachmentId)).toEqual([]);
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([await receiptKeyOf(user.accountId, image.attachmentId)]);
  });

  it('never publishes a copy that differs from the import image', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const [source] = await adminRows<{ key: string }>(`SELECT key FROM object_publications WHERE purpose = 'import_image' AND job_id = $1`, [image.jobId]);
    // The stored import image no longer matches its registration.
    await store.delete(source.key);
    await store.putStream(source.key, Buffer.concat([image.bytes, Buffer.from('tampered')]));
    const refused = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    expect([refused.status, refused.body.message_key]).toEqual([422, 'errors.attachment_expired']);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
    expect((await receiptRows(user.accountId)).every((row) => row.status === 'reserved' && row.due)).toBe(true);
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);
  });

  it('the retain routine publishes only this account\'s own unexpired copy at its generation, matching the image', async () => {
    const user = await money.member();
    const image = await attachableImage(user);
    const app = await db.loginPool(['gogospend_app'], 1);
    const asOwner = async <T>(fn: (query: (text: string, values: unknown[]) => Promise<{ rows: T[] }>) => Promise<T[]>, commit = false): Promise<T[]> => {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
        const rows = await fn((text, values) => client.query(text, values) as unknown as Promise<{ rows: T[] }>);
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
        return rows;
      } finally {
        client.release();
      }
    };
    const [reserved] = await asOwner<{ outcome: string; copy_key: string }>((query) => query('SELECT * FROM gogospend_reserve_receipt_copy($1, $2)', [image.attachmentId, randomUUID()]).then((r) => r.rows), true);
    expect(reserved.outcome).toBe('reserved');
    await store.putStream(reserved.copy_key, image.bytes);
    const attempt = async (bytes: number, sha256: string) =>
      (await asOwner<{ outcome: string }>((query) => query(`SELECT gogospend_retain_attachment($1, $2, $3, decode($4, 'hex')) AS outcome`, [image.attachmentId, reserved.copy_key, bytes, sha256]).then((r) => r.rows)))[0].outcome;
    expect(await attempt(image.bytes.length, 'ab'.repeat(32))).toBe('expired');
    expect(await attempt(image.bytes.length + 1, image.sha256)).toBe('expired');
    const tweak = (sql: string) => db.admin((client) => client.query(sql, [reserved.copy_key]));
    await tweak('UPDATE object_publications SET lifecycle_generation = lifecycle_generation + 1 WHERE key = $1');
    expect(await attempt(image.bytes.length, image.sha256)).toBe('expired');
    await tweak('UPDATE object_publications SET lifecycle_generation = lifecycle_generation - 1, delete_after = now() - interval \'1 second\' WHERE key = $1');
    expect(await attempt(image.bytes.length, image.sha256)).toBe('expired');
    await tweak('UPDATE object_publications SET delete_after = now() + interval \'5 minutes\' WHERE key = $1');
    // Another attachment's reservation is not this one's copy.
    const other = await attachableImage(user);
    expect((await asOwner<{ outcome: string }>((query) => query(`SELECT gogospend_retain_attachment($1, $2, $3, decode($4, 'hex')) AS outcome`, [other.attachmentId, reserved.copy_key, image.bytes.length, image.sha256]).then((r) => r.rows)))[0].outcome).toBe('expired');
    expect(await attempt(image.bytes.length, image.sha256)).toBe('retained');
  });

  it('an account has at most four copies in flight; a fifth retain is told when to retry', async () => {
    const { user, records } = await memberWithRecords();
    const images: Attachable[] = [];
    for (let i = 0; i < 5; i += 1) images.push(await attachableImage(user));
    const app = await db.loginPool(['gogospend_app'], 1);
    const outcomes: string[] = [];
    for (const image of images.slice(0, 4)) outcomes.push((await reserveIn(app, user, image.attachmentId)).outcome);
    expect(outcomes).toEqual(['reserved', 'reserved', 'reserved', 'reserved']);
    // A reservation lasts three minutes: the copy's one-minute deadline plus its command.
    const lifetimes = await adminRows<{ seconds: number }>(
      `SELECT extract(epoch FROM delete_after - created_at)::int AS seconds FROM object_publications WHERE purpose = 'receipt' AND account_id = $1`,
      [user.accountId],
    );
    expect(lifetimes.map((row) => row.seconds)).toEqual([180, 180, 180, 180]);
    expect((await reserveIn(app, user, images[4].attachmentId)).outcome).toBe('limited');
    const limited = await retain(user, records[0], { attachment_id: images[4].attachmentId, ...CONSENT }, 1);
    expect([limited.status, limited.body.code]).toEqual([429, 'RATE_LIMITED']);
    // Retry when the oldest copy in flight reaches its deadline, not before.
    expect(limited.body.retry_after_seconds).toBeGreaterThan(160);
    expect(limited.body.retry_after_seconds).toBeLessThanOrEqual(180);
    expect(await attachmentOf(user.accountId, images[4].attachmentId)).toBeUndefined();
    // Once those copies are due (abandoned), retaining goes ahead.
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() - interval '1 second' WHERE purpose = 'receipt' AND account_id = $1`, [user.accountId]));
    expect((await retain(user, records[0], { attachment_id: images[4].attachmentId, ...CONSENT }, 1)).status).toBe(200);
  });

  it('refuses an image past its window, and a deleted record', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() + interval '1 minute' WHERE purpose = 'import_image' AND job_id = $1`, [image.jobId]));
    expect((await previewOf(user, image.jobId)).summary?.image?.attachable_until).toBeNull();
    const late = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    expect([late.status, late.body.message_key, late.body.fields]).toEqual([422, 'errors.attachment_expired', { attachment_id: 'errors.attachment_expired' }]);
    expect(await receiptRows(user.accountId)).toEqual([]);

    const fresh = await attachableImage(user);
    expect((await as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 1 })).status).toBe(200);
    const deleted = await retain(user, records[1], { attachment_id: fresh.attachmentId, ...CONSENT }, 2);
    expect([deleted.status, deleted.body.code]).toEqual([409, 'ENTITY_DELETED']);
    expect(await attachmentOf(user.accountId, fresh.attachmentId)).toBeUndefined();
  });
});

describe('replace and remove are versioned against the record', () => {
  it('replace moves the record to its next version and queues the image it dropped', async () => {
    const { user, records } = await memberWithRecords();
    const first = await attachableImage(user);
    const second = await attachableImage(user, 'png', 20, 10);
    await retained(user, records[0], first, 1);
    const firstKey = await receiptKeyOf(user.accountId, first.attachmentId);

    const stale = await replace(user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 1);
    expect([stale.status, stale.body.code]).toEqual([409, 'VERSION_CONFLICT']);
    expect((await replace(user, records[0], { attachment_id: second.attachmentId }, 2)).status).toBe(422);
    expect((await recordOf(user, records[0])).attachment_id).toBe(first.attachmentId);

    const ack = await replace(user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 2);
    expect(ack.status).toBe(200);
    expect(ack.body).toEqual(expect.objectContaining({ entity_id: records[0], version: 3, outcome: 'updated' }));
    expect(await recordOf(user, records[0])).toEqual(expect.objectContaining({ version: 3, attachment_id: second.attachmentId }));
    expect(await latestSnapshot(user.accountId, records[0])).toEqual(expect.objectContaining({ version: 3, attachment_id: second.attachmentId }));

    // The dropped receipt is released for good and its object queued for deletion.
    expect(await attachmentOf(user.accountId, first.attachmentId)).toEqual(expect.objectContaining({ status: 'released', released: true }));
    const rows = await receiptRows(user.accountId);
    expect(rows.find((row) => row.key === firstKey)).toEqual(expect.objectContaining({ status: 'published', due: true, forever: false }));
    expect((await grantOf(user, first.attachmentId)).status).toBe(404);
    await publication.sweep(user.accountId);
    const stored = await storedReceipts(user.accountId);
    expect(stored).not.toContain(firstKey);
    expect(stored).toEqual([await receiptKeyOf(user.accountId, second.attachmentId)]);
    const grant = (await grantOf(user, second.attachmentId)).body as AttachmentGrant;
    expect(grant.content_type).toBe('image/png');

    const same = await replace(user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 3);
    expect([same.status, same.body.message_key]).toEqual([422, 'errors.attachment_unchanged']);
  });

  it('remove is versioned, deletes the image with no undo, and cannot be repeated', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    const key = await receiptKeyOf(user.accountId, image.attachmentId);

    const stale = await remove(user, records[0], 1);
    expect([stale.status, stale.body.code]).toEqual([409, 'VERSION_CONFLICT']);
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([records[0]]);

    const ack = await remove(user, records[0], 2);
    expect(ack.status).toBe(200);
    expect(ack.body).toEqual(expect.objectContaining({ entity_id: records[0], version: 3, outcome: 'updated' }));
    const record = await recordOf(user, records[0]);
    expect(record.version).toBe(3);
    expect('attachment_id' in record).toBe(false);
    const snapshot = await latestSnapshot(user.accountId, records[0]);
    expect(snapshot && 'attachment_id' in snapshot).toBe(false);
    expect(isTransactionSnapshot(snapshot)).toBe(true);

    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }));
    expect((await receiptRows(user.accountId))[0]).toEqual(expect.objectContaining({ key, due: true }));
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);

    const twice = await remove(user, records[0], 3);
    expect([twice.status, twice.body.message_key]).toEqual([422, 'errors.attachment_missing']);
    // No undo: the removed receipt cannot be attached again, even while its import image still exists.
    const undo = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 3);
    expect([undo.status, undo.body.message_key]).toEqual([422, 'errors.attachment_removed']);
    expect(await storedReceipts(user.accountId)).toEqual([]);
  });
});

describe('shared references prevent premature deletion', () => {
  it('a receipt two records hold is one object, deleted only after both let go', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    await retained(user, records[1], image, 1);
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([...records].sort());
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toHaveLength(1);

    expect((await remove(user, records[0], 2)).status).toBe(200);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
    expect((await receiptRows(user.accountId)).filter((row) => row.status === 'published')).toEqual([expect.objectContaining({ forever: true, due: false })]);
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toHaveLength(1);
    expect((await grantOf(user, image.attachmentId)).status).toBe(200);

    expect((await remove(user, records[1], 2)).status).toBe(200);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }));
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);
  });

  it('two records retaining one image at once keep one receipt, made by one copy', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    const writes = countReceiptWrites();
    let statuses: number[];
    try {
      statuses = (await Promise.all(records.map((id) => retain(user, id, { attachment_id: image.attachmentId, ...CONSENT }, 1)))).map((res) => res.status);
    } finally {
      writes.restore();
    }
    expect(statuses).toEqual([200, 200]);
    // The second waited for the copy already in flight instead of making its own.
    expect(writes.count()).toBe(1);
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([...records].sort());
    await publication.sweep(user.accountId);
    const kept = await receiptKeyOf(user.accountId, image.attachmentId);
    expect(await storedReceipts(user.accountId)).toEqual([kept]);
  });

  it('the 30-day purge of a deleted record releases its receipt only when no other record holds it', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    await retained(user, records[1], image, 1);
    const age = (id: string) => db.admin((client) => client.query(`UPDATE transactions SET deleted_at = now() - interval '31 days' WHERE account_id = $1 AND id = $2`, [user.accountId, id]));

    expect((await as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200);
    await age(records[0]);
    expect(await purgeExpiredRecords(jobsPool)).toBeGreaterThanOrEqual(1);
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([records[1]]);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toHaveLength(1);

    expect((await as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 2 })).status).toBe(200);
    await age(records[1]);
    await purgeExpiredRecords(jobsPool);
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([]);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }));
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);
  });
});

describe('a deleted record keeps its receipt for the undo window', () => {
  it('grants wait until the record is restored; the object is never queued meanwhile', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    expect((await as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200);

    const denied = await grantOf(user, image.attachmentId);
    expect(denied.status).toBe(404);
    expect(problemOf(denied.body)).toEqual(problemOf((await grantOf(user, randomUUID())).body));
    expect(await heldBy(user.accountId, image.attachmentId)).toEqual([records[0]]);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
    expect(await receiptRows(user.accountId)).toEqual([expect.objectContaining({ status: 'published', forever: true })]);
    // The deleted record's snapshot still names its receipt (restorable).
    expect(await latestSnapshot(user.accountId, records[0])).toEqual(expect.objectContaining({ attachment_id: image.attachmentId }));

    expect((await as(user).post(`/v1/transactions/${records[0]}/restore`, {}, { ifMatch: 3 })).status).toBe(200);
    const grant = await grantOf(user, image.attachmentId);
    expect(grant.status).toBe(200);
    const file = await download(user, (grant.body as AttachmentGrant).url);
    expect((file.body as Buffer).equals(image.bytes)).toBe(true);
  });

  it('a grant issued before the record was deleted no longer downloads', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    const grant = (await grantOf(user, image.attachmentId)).body as AttachmentGrant;
    expect((await as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200);
    expect((await download(user, grant.url)).status).toBe(404);
  });
});

describe('retention and erasure (P5)', () => {
  it('account erasure deletes every retained receipt object', async () => {
    const { user, records } = await memberWithRecords(2);
    const first = await attachableImage(user);
    const second = await attachableImage(user);
    await retained(user, records[0], first, 1);
    await retained(user, records[1], second, 1);
    expect((await as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 2 })).status).toBe(200);
    expect(await storedReceipts(user.accountId)).toHaveLength(2);

    const provider = scriptedGateway();
    const worker = await deletionWorker(db, store, provider.gateway, { steps: defaultPrivacySteps() });
    const key = randomUUID();
    const proofId = await fx.proven(user.who, 'deletion', key);
    expect((await as(user).raw('post', '/v1/me/deletion', { proof_id: proofId }, { 'idempotency-key': key })).status).toBe(202);
    await worker.drain();

    expect(await storedReceipts(user.accountId)).toEqual([]);
    expect(await adminRows('SELECT 1 FROM attachments WHERE account_id = $1', [user.accountId])).toEqual([]);
    expect(await adminRows('SELECT 1 FROM transaction_attachments WHERE account_id = $1', [user.accountId])).toEqual([]);
    const registry = await receiptRows(user.accountId);
    expect(registry.length).toBeGreaterThanOrEqual(2);
    expect(registry.every((row) => row.status === 'deleted')).toBe(true);
  });

  it('the erasure step stops the purge while a receipt object is still live', async () => {
    const user = await money.member();
    const image = await attachableImage(user);
    // A receipt row whose object no stage has made due (as if the objects stage missed it).
    const step = defaultPrivacySteps().erasureSteps().find((entry) => entry.name === 'attachments.objects');
    expect(step).toBeDefined();
    const provider = scriptedGateway();
    const worker = await deletionWorker(db, store, provider.gateway);
    const key = randomUUID();
    const proofId = await fx.proven(user.who, 'deletion', key);
    expect((await as(user).raw('post', '/v1/me/deletion', { proof_id: proofId }, { 'idempotency-key': key })).status).toBe(202);
    const [job] = await adminRows<{ id: string }>(`SELECT j.id FROM jobs j JOIN deletion_requests r ON r.job_id = j.id WHERE r.erased_account_id = $1`, [user.accountId]);
    const [claimed] = await worker.jobs.claim(['account_deletion'], { limit: 1 });
    expect(claimed?.lease.jobId).toBe(job.id);
    const live = `receipt/${user.accountId}/${image.attachmentId}/${randomUUID()}/image.jpg`;
    await db.admin((client) => client.query(
      `INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, status, delete_after, bytes, sha256, published_at)
       VALUES ($1, $2, $3, $4, 0, 'receipt', 'published', 'infinity', 1, decode(repeat('ab', 32), 'hex'), now())`,
      [live, image.attachmentId, user.accountId, live.split('/')[3]],
    ));
    if (!claimed || !step) throw new Error('no deletion lease');
    await expect(step.run({ lease: claimed.lease, accountId: user.accountId, pool: worker.pool })).rejects.toThrow();
    const [row] = await adminRows<{ due: boolean }>('SELECT delete_after <= now() AS due FROM object_publications WHERE key = $1', [live]);
    expect(row.due).toBe(true);
    await worker.publication.sweep(user.accountId);
    await expect(step.run({ lease: claimed.lease, accountId: user.accountId, pool: worker.pool })).resolves.toBeUndefined();
    await worker.jobs.fail(claimed.lease, { code: 'test_done', retryable: false });
  });

  it('the retention step releases a receipt nothing holds and drops released rows 30 days on, once their object is gone', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    const held = await attachableImage(user);
    // The held receipt is the older one, so a pass that looked at held receipts too would spend its batch on it.
    await retained(user, records[1], held, 1);
    await retained(user, records[0], image, 1);
    const key = await receiptKeyOf(user.accountId, image.attachmentId);
    // An association that went without its trigger (the safety net's case), in one transaction.
    await db.admin(async (client) => {
      await client.query('BEGIN');
      await client.query('ALTER TABLE transaction_attachments DISABLE TRIGGER transaction_attachments_unheld');
      await client.query('DELETE FROM transaction_attachments WHERE account_id = $1 AND transaction_id = $2', [user.accountId, records[0]]);
      await client.query('ALTER TABLE transaction_attachments ENABLE TRIGGER transaction_attachments_unheld');
      await client.query('COMMIT');
    });
    const step = defaultPrivacySteps().retentionSteps().find((entry) => entry.name === 'attachments.obsolete');
    if (!step) throw new Error('attachments.obsolete is not registered');
    // A one-row batch reaches the unheld receipt past the older held one.
    await db.admin((client) => client.query(`UPDATE attachments SET retained_at = retained_at - interval '1 day' WHERE account_id = $1 AND id = $2`, [user.accountId, held.attachmentId]));
    expect((await jobsPool.query<{ n: number }>('SELECT gogospend_prune_attachments(1) AS n')).rows[0].n).toBe(1);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }));
    await step.run(jobsPool);
    expect((await receiptRows(user.accountId)).find((row) => row.key === key)).toEqual(expect.objectContaining({ due: true }));
    // A receipt a record still holds is untouched.
    expect(await attachmentOf(user.accountId, held.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));

    // 30 days on, but its object is not deleted yet: the row stays.
    await db.admin((client) => client.query(`UPDATE attachments SET released_at = now() - interval '31 days' WHERE account_id = $1 AND status = 'released'`, [user.accountId]));
    await step.run(jobsPool);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }));
    await publication.sweep(user.accountId);
    expect(await step.run(jobsPool)).toBeGreaterThanOrEqual(1);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
    expect(await attachmentOf(user.accountId, held.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
  });
});

describe('copying is bounded (P2c review fixes M1, M2)', () => {
  it('serializes reservations: five at once from one account reserve exactly four', async () => {
    const user = await money.member();
    const images: Attachable[] = [];
    for (let i = 0; i < 5; i += 1) images.push(await attachableImage(user));
    const app = await db.loginPool(['gogospend_app'], 5);
    // Each holds its transaction open before COMMIT, so unlocked reads of the count would all see zero.
    const outcomes = await Promise.all(images.map((image) => reserveIn(app, user, image.attachmentId, 0.15)));
    expect(outcomes.filter((o) => o.outcome === 'reserved')).toHaveLength(4);
    expect(outcomes.filter((o) => o.outcome === 'limited')).toHaveLength(1);
    expect(await receiptRows(user.accountId)).toHaveLength(4);
    // Told when the oldest copy in flight is due, never a fixed minute.
    for (const limited of outcomes.filter((o) => o.outcome === 'limited')) {
      expect(limited.retry_after).toBeGreaterThan(0);
      expect(limited.retry_after).toBeLessThanOrEqual(180);
    }
  });

  it('a busy process answers 503 with when to retry, before it reserves anything', async () => {
    const { user, records } = await memberWithRecords(2);
    const first = await attachableImage(user);
    const second = await attachableImage(user);
    let letGo!: () => void;
    const hold = new Promise<void>((resolve) => (letGo = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const restore = patchStore({
      copy: (original) => async (source, destination, options) => {
        entered();
        await hold;
        return original(source, destination, options);
      },
    });
    try {
      await withLimits({ copiesPerProcess: 1 }, async () => {
        const running = retain(user, records[0], { attachment_id: first.attachmentId, ...CONSENT }, 1);
        await inside;
        const busy = await retain(user, records[1], { attachment_id: second.attachmentId, ...CONSENT }, 1);
        expect([busy.status, busy.body.code, busy.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5]);
        // Turned away before reserving: nothing to sweep, nothing counted against the account.
        expect((await receiptRows(user.accountId)).filter((row) => row.job_id === second.attachmentId)).toEqual([]);
        letGo();
        expect((await running).status).toBe(200);
      });
    } finally {
      letGo();
      restore();
    }
    expect((await retain(user, records[1], { attachment_id: second.attachmentId, ...CONSENT }, 1)).status).toBe(200);
  });

  it('a process never has more copies running than its limit', async () => {
    const users = await Promise.all([memberWithRecords(), memberWithRecords(), memberWithRecords(), memberWithRecords()]);
    const images = await Promise.all(users.map(({ user }) => attachableImage(user)));
    let running = 0;
    let peak = 0;
    const restore = patchStore({
      copy: (original) => async (source, destination, options) => {
        running += 1;
        peak = Math.max(peak, running);
        try {
          await delay(120);
          return await original(source, destination, options);
        } finally {
          running -= 1;
        }
      },
    });
    let statuses: number[];
    try {
      statuses = await withLimits({ copiesPerProcess: 2 }, async () =>
        (await Promise.all(users.map(({ user, records }, i) => retain(user, records[0], { attachment_id: images[i].attachmentId, ...CONSENT }, 1)))).map((res) => res.status),
      );
    } finally {
      restore();
    }
    expect(peak).toBeLessThanOrEqual(2);
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(2);
    expect(statuses.every((status) => status === 200 || status === 503)).toBe(true);
  });

  it('refused retains, replaces and removals copy nothing', async () => {
    const { user, records } = await memberWithRecords(3);
    const held = await attachableImage(user);
    await retained(user, records[0], held, 1);
    const spare = await attachableImage(user);
    const writes = countReceiptWrites();
    try {
      // The record already holds a receipt.
      const present = await retain(user, records[0], { attachment_id: spare.attachmentId, ...CONSENT }, 2);
      expect([present.status, present.body.message_key]).toEqual([422, 'errors.attachment_present']);
      // Replacing with the receipt it already holds.
      const same = await replace(user, records[0], { attachment_id: held.attachmentId, ...CONSENT }, 2);
      expect([same.status, same.body.message_key]).toEqual([422, 'errors.attachment_unchanged']);
      // Replacing on a record with none.
      const missing = await replace(user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 1);
      expect([missing.status, missing.body.message_key]).toEqual([422, 'errors.attachment_missing']);
      // A stale version, no consent, an unsupported schema, an unknown record.
      expect((await retain(user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 5)).status).toBe(409);
      expect((await retain(user, records[1], { attachment_id: spare.attachmentId }, 1)).status).toBe(422);
      const schema = await as(user).post(`/v1/transactions/${records[1]}/attachment`, { attachment_id: spare.attachmentId, ...CONSENT }, { ifMatch: 1, schema: 2 });
      expect([schema.status, schema.body.code]).toEqual([422, 'COMMAND_SCHEMA_UNSUPPORTED']);
      expect((await retain(user, randomUUID(), { attachment_id: spare.attachmentId, ...CONSENT }, 1)).status).toBe(404);
      // A deleted record.
      expect((await as(user).del(`/v1/transactions/${records[2]}`, { ifMatch: 1 })).status).toBe(200);
      expect((await retain(user, records[2], { attachment_id: spare.attachmentId, ...CONSENT }, 2)).status).toBe(409);
    } finally {
      writes.restore();
    }
    expect(writes.count()).toBe(0);
    expect((await receiptRows(user.accountId)).filter((row) => row.job_id === spare.attachmentId)).toEqual([]);
    // Nothing was spent: the same image still retains.
    expect((await retain(user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 1)).status).toBe(200);
  });

  it('a receipt that already exists is attached without another copy', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    const writes = countReceiptWrites();
    try {
      expect((await retain(user, records[1], { attachment_id: image.attachmentId, ...CONSENT }, 1)).status).toBe(200);
    } finally {
      writes.restore();
    }
    expect(writes.count()).toBe(0);
  });

  it('an account has a copy budget; past it, retaining is told when the oldest copy leaves the window', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    // 100 copies reserved in the last day (all long due: none is in flight).
    await db.admin((client) => client.query(
      `INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after)
       SELECT format('receipt/%s/%s/%s/image.jpg', $1::text, t.job, t.token), t.job, $1::uuid, t.token, 0, 'receipt', now() - interval '1 hour'
         FROM (SELECT gen_random_uuid() AS token, gen_random_uuid() AS job FROM generate_series(1, 100)) t`,
      [user.accountId],
    ));
    const writes = countReceiptWrites();
    let limited;
    try {
      limited = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    } finally {
      writes.restore();
    }
    expect([limited.status, limited.body.code]).toEqual([429, 'RATE_LIMITED']);
    expect(limited.body.retry_after_seconds).toBeGreaterThan(24 * 3600 - 60);
    expect(limited.body.retry_after_seconds).toBeLessThanOrEqual(24 * 3600);
    expect(writes.count()).toBe(0);
    // Another account is unaffected.
    const { user: other, records: otherRecords } = await memberWithRecords();
    expect((await retain(other, otherRecords[0], { attachment_id: (await attachableImage(other)).attachmentId, ...CONSENT }, 1)).status).toBe(200);
  });

  it('gives one deadline to the whole copy: the HEAD that checks it runs on the same signal', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const signals: (AbortSignal | undefined)[] = [];
    const restore = patchStore({
      copy: (original) => (source, destination, options) => {
        signals.push(options?.signal);
        return original(source, destination, options);
      },
      head: (original) => async (key, options) => {
        if (key.startsWith('receipt/')) {
          signals.push(options?.signal);
          // The deadline has passed: the check does not outlive it.
          if (options?.signal) await new Promise<void>((resolve) => options.signal?.addEventListener('abort', () => resolve(), { once: true }));
          throw new ObjectStoreError('unavailable');
        }
        return original(key, options);
      },
    });
    const started = Date.now();
    let refused;
    try {
      refused = await withLimits({ copyDeadlineMs: 400 }, () => retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1));
    } finally {
      restore();
    }
    expect([refused.status, refused.body.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeDefined();
    expect(signals[1]).toBe(signals[0]);
    expect(Date.now() - started).toBeLessThan(2_500);
    // Its reservation was given back at once.
    expect((await receiptRows(user.accountId)).every((row) => row.status === 'reserved' && row.due)).toBe(true);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
  });

  it('a copy the store cannot make is a 503 with no reservation left live, and never leaks the failure', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const restore = patchStore({
      copy: () => async () => {
        throw new Error('provider said: bucket secret-bucket is on fire');
      },
    });
    let refused;
    try {
      refused = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    } finally {
      restore();
    }
    expect([refused.status, refused.body.code, refused.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5]);
    expect(JSON.stringify(refused.body)).not.toMatch(/secret-bucket|on fire/);
    expect((await receiptRows(user.accountId)).every((row) => row.status === 'reserved' && row.due)).toBe(true);
    expect((await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)).status).toBe(200);
  });

  it('the copy is checked as stored by the database too: a copy that is not the registered image is not published', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    // The store's copy comes out different (a provider fault), and the HEAD reports what is stored.
    const restore = patchStore({
      copy: (original) => async (source, destination, options) => {
        const made = await original(source, destination, options);
        await store.delete(destination);
        await store.putStream(destination, Buffer.concat([image.bytes, randomBytes(8)]));
        return made;
      },
    });
    let refused;
    try {
      refused = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    } finally {
      restore();
    }
    expect([refused.status, refused.body.message_key]).toEqual([422, 'errors.attachment_expired']);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
    await publication.sweep(user.accountId);
    expect(await storedReceipts(user.accountId)).toEqual([]);
  });
});

describe('receipt downloads (P2c review fixes M3, minor 1)', () => {
  type Streamed = { user: SignedUp; image: Attachable; url: string };
  async function streamed(): Promise<Streamed> {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user, 'png', 120, 90);
    await retained(user, records[0], image, 1);
    return { user, image, url: ((await grantOf(user, image.attachmentId)).body as AttachmentGrant).url };
  }
  const thirds = (bytes: Buffer): Buffer[] => {
    const size = Math.ceil(bytes.length / 4);
    return [0, 1, 2, 3].map((i) => bytes.subarray(i * size, (i + 1) * size)).filter((part) => part.length > 0);
  };
  /** Replaces what the store streams for receipt objects (size and digest as registered). */
  const serving = (image: Attachable, body: () => AsyncIterable<Uint8Array>, only?: () => boolean) =>
    patchStore({
      getStream: (original) => async (key) => {
        const real = await original(key);
        if (!real || !key.startsWith('receipt/') || (only && !only())) return real;
        return { body: body(), bytes: image.bytes.length, sha256: image.sha256 };
      },
    });
  const problemBody = (raw: RawDownload) => JSON.parse(raw.body.toString('utf8')) as Record<string, unknown>;

  it('serves the image whole, with its length, as it always did', async () => {
    const { user, image, url } = await streamed();
    const raw = await rawDownload(user, url);
    expect([raw.status, raw.complete]).toEqual([200, true]);
    expect(raw.body.equals(image.bytes)).toBe(true);
    expect(raw.headers['content-length']).toBe(String(image.bytes.length));
  });

  it('one account cannot take every download slot: its third waits while another account is served', async () => {
    const mine = await streamed();
    const theirs = await streamed();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const first = new Promise<void>((resolve) => (reached = resolve));
    let held = 0;
    const restore = serving(mine.image, () => {
      held += 1;
      reached();
      return (async function* () {
        await gate;
        yield mine.image.bytes;
      })();
    }, () => held === 0);
    try {
      await withLimits({ downloadsPerAccount: 1, downloadsPerProcess: 8 }, async () => {
        const slow = rawDownload(mine.user, mine.url);
        await first;
        const refused = await rawDownload(mine.user, mine.url);
        expect([refused.status, problemBody(refused).code, problemBody(refused).retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5]);
        expect(refused.headers['retry-after']).toBe('5');
        const served = await rawDownload(theirs.user, theirs.url);
        expect([served.status, served.complete]).toEqual([200, true]);
        open();
        const done = await slow;
        expect([done.status, done.complete]).toEqual([200, true]);
        expect(done.body.equals(mine.image.bytes)).toBe(true);
        // The slot came back.
        expect((await rawDownload(mine.user, mine.url)).status).toBe(200);
      });
    } finally {
      open();
      restore();
    }
  });

  it('the process-wide cap still holds across accounts', async () => {
    const a = await streamed();
    const b = await streamed();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const first = new Promise<void>((resolve) => (reached = resolve));
    let held = 0;
    const restore = serving(a.image, () => {
      held += 1;
      reached();
      return (async function* () {
        await gate;
        yield a.image.bytes;
      })();
    }, () => held === 0);
    try {
      await withLimits({ downloadsPerProcess: 1, downloadsPerAccount: 1 }, async () => {
        const slow = rawDownload(a.user, a.url);
        await first;
        expect((await rawDownload(b.user, b.url)).status).toBe(503);
        open();
        expect((await slow).status).toBe(200);
        expect((await rawDownload(b.user, b.url)).status).toBe(200);
      });
    } finally {
      open();
      restore();
    }
  });

  it('cuts off a download that stops making progress, and frees its slot', async () => {
    const { user, image, url } = await streamed();
    const parts = thirds(image.bytes);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    let calls = 0;
    const restore = serving(image, () => {
      calls += 1;
      const stall = calls === 1;
      return (async function* () {
        yield parts[0];
        yield parts[1];
        yield parts[2];
        if (stall) await new Promise<void>(() => undefined);
        yield* parts.slice(3);
      })();
    });
    try {
      await withLimits({ downloadIdleMs: 200, downloadsPerAccount: 1 }, async () => {
        const started = Date.now();
        const cut = await rawDownload(user, url);
        expect(cut.complete).toBe(false);
        expect(Date.now() - started).toBeLessThan(5_000);
        // Never the whole image, never a made-up ending.
        expect(cut.body.length).toBeLessThan(image.bytes.length);
        const next = await rawDownload(user, url);
        expect([next.status, next.complete]).toEqual([200, true]);
        expect(next.body.equals(image.bytes)).toBe(true);
      });
    } finally {
      restore();
    }
  });

  it('cuts off a download still running at the total limit even though it keeps trickling', async () => {
    const { user, image, url } = await streamed();
    const restore = serving(image, () =>
      (async function* () {
        for (let i = 0; i < image.bytes.length; i += 1) {
          await delay(25);
          yield image.bytes.subarray(i, i + 1);
        }
      })(),
    );
    try {
      await withLimits({ downloadIdleMs: 5_000, downloadTotalMs: 400 }, async () => {
        const started = Date.now();
        const cut = await rawDownload(user, url);
        expect(cut.complete).toBe(false);
        expect(Date.now() - started).toBeLessThan(3_000);
      });
    } finally {
      restore();
    }
  });

  it('a download that never starts is a 503 problem, not an image-typed body', async () => {
    const { user, image, url } = await streamed();
    const restore = serving(image, () => (async function* () { await new Promise<void>(() => undefined); })());
    try {
      await withLimits({ downloadIdleMs: 200 }, async () => {
        const raw = await rawDownload(user, url);
        expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
        expect(String(raw.headers['content-type'])).toMatch(/json/);
      });
    } finally {
      restore();
    }
  });

  it('unavailable storage is a 503 with when to retry, and never sends the failure text', async () => {
    const { user, url } = await streamed();
    for (const failure of [new ObjectStoreError('unavailable'), new Error('provider said: secret-bucket exploded')]) {
      const restore = patchStore({ getStream: () => async () => { throw failure; } });
      try {
        const raw = await rawDownload(user, url);
        expect([raw.status, problemBody(raw).code, problemBody(raw).retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5]);
        expect(String(raw.headers['content-type'])).not.toMatch(/image/);
        expect(raw.body.toString('utf8')).not.toMatch(/secret-bucket|exploded|Object store/);
      } finally {
        restore();
      }
    }
  });

  it('a body that fails before its first byte is a 503 problem, with no error text', async () => {
    const { user, image, url } = await streamed();
    const restore = serving(image, () => (async function* () { throw new Error('secret-bucket reset'); })());
    try {
      const raw = await rawDownload(user, url);
      expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
      expect(raw.body.toString('utf8')).not.toContain('secret-bucket');
    } finally {
      restore();
    }
  });

  it('a corrupted object is never served as a complete download', async () => {
    const { user, image, url } = await streamed();
    const parts = thirds(image.bytes).map((part) => Buffer.from(part));
    const last = parts[parts.length - 1];
    last[last.length - 1] ^= 0xff;
    const restore = serving(image, () => (async function* () { yield* parts; })());
    try {
      const raw = await rawDownload(user, url);
      // The last chunk waits for the digest, so the client never receives a complete 200.
      expect(raw.complete).toBe(false);
      expect(raw.body.length).toBeLessThan(image.bytes.length);
      expect(raw.body.equals(image.bytes.subarray(0, raw.body.length))).toBe(true);
    } finally {
      restore();
    }
    // In one chunk nothing is sent before the check, so it is a plain 503.
    const single = Buffer.from(image.bytes);
    single[0] ^= 0xff;
    const restoreSingle = serving(image, () => (async function* () { yield single; })());
    try {
      const raw = await rawDownload(user, url);
      expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
      expect(raw.body.includes(single)).toBe(false);
    } finally {
      restoreSingle();
    }
    // Too long and too short are corrupt as well.
    for (const body of [Buffer.concat([image.bytes, Buffer.from('x')]), image.bytes.subarray(0, image.bytes.length - 1)]) {
      const restoreSize = serving(image, () => (async function* () { yield body; })());
      try {
        expect((await rawDownload(user, url)).status).toBe(503);
      } finally {
        restoreSize();
      }
    }
  });
});

describe('grants are bound to the session (P2c review fix, minor 2)', () => {
  it('a grant verifies only for the session it was issued to', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    const service = v1.app.get(AttachmentService);
    const issued = await service.grant(user.session, image.attachmentId);
    if (!issued) throw new Error('no grant');
    const token = issued.url.slice(ATTACHMENT_DOWNLOAD_PATH.length);
    expect(await service.file(user.session, token)).not.toBeNull();
    // The same account on another session binding, or after the session generation moved on.
    expect(await service.file({ ...user.session, bindingId: randomUUID() }, token)).toBeNull();
    expect(await service.file({ ...user.session, sessionGeneration: user.session.sessionGeneration + 1 }, token)).toBeNull();
    // Over HTTP the same: a second sign-in's session cannot use the first one's grant.
    const second = await money.member();
    expect((await download(second, issued.url)).status).toBe(404);
  });
});

describe('orphan sweep cost (P2c review fix, minor 3)', () => {
  it('the global sweep lists receipts only for accounts with recent reservations, a page at a time', async () => {
    const { user: recent, records } = await memberWithRecords();
    const image = await attachableImage(recent);
    await retained(recent, records[0], image, 1);
    const { user: quiet, records: quietRecords } = await memberWithRecords();
    await retained(quiet, quietRecords[0], await attachableImage(quiet), 1);
    await db.admin((client) => client.query(`UPDATE object_publications SET created_at = now() - interval '30 days' WHERE purpose = 'receipt' AND account_id = $1`, [quiet.accountId]));
    // An orphan: stored, with no registry row at all.
    const orphan = `receipt/${recent.accountId}/${randomUUID()}/${randomUUID()}/image.jpg`;
    await store.putStream(orphan, Buffer.from('orphan'));
    const listed: string[] = [];
    const restore = patchStore({
      listPages: (original) => (prefix) => {
        listed.push(prefix);
        return original(prefix);
      },
    });
    try {
      await publication.sweep(null);
    } finally {
      restore();
    }
    expect(listed).toContain(`receipt/${recent.accountId}/`);
    expect(listed).not.toContain('receipt/');
    expect(listed).not.toContain(`receipt/${quiet.accountId}/`);
    expect(await store.head(orphan)).toBeNull();
    // What is registered stays.
    expect(await storedReceipts(recent.accountId)).toEqual([await receiptKeyOf(recent.accountId, image.attachmentId)]);
    expect(await storedReceipts(quiet.accountId)).toHaveLength(1);
  });

  it('a sweep of one account lists that account whatever its history', async () => {
    const { user, records } = await memberWithRecords();
    await retained(user, records[0], await attachableImage(user), 1);
    await db.admin((client) => client.query(`UPDATE object_publications SET created_at = now() - interval '30 days' WHERE purpose = 'receipt' AND account_id = $1`, [user.accountId]));
    const orphan = `receipt/${user.accountId}/${randomUUID()}/${randomUUID()}/image.jpg`;
    await store.putStream(orphan, Buffer.from('orphan'));
    await publication.sweep(user.accountId);
    expect(await store.head(orphan)).toBeNull();
  });
});

describe('overdue receipt deletion (P2c review fix, minor 4)', () => {
  it('counts released receipts whose object is still stored an hour after its deadline, and failed deletes', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    const kept = await attachableImage(user);
    await retained(user, records[0], image, 1);
    await retained(user, records[1], kept, 1);
    expect(await receiptCleanupOverdue(jobsPool, user.accountId)).toBe(0);
    expect((await remove(user, records[0], 2)).status).toBe(200);
    // Due, but only just: the sweep has not had its chance yet.
    expect(await receiptCleanupOverdue(jobsPool, user.accountId)).toBe(0);
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() - interval '2 hours' WHERE purpose = 'receipt' AND account_id = $1 AND delete_after < now() + interval '1 minute'`, [user.accountId]));
    expect(await receiptCleanupOverdue(jobsPool, user.accountId)).toBe(1);
    expect(await receiptCleanupOverdue(jobsPool)).toBeGreaterThanOrEqual(1);
    // A failed storage delete leaves it `deleting`, still overdue.
    store.failNext('delete');
    await publication.sweep(user.accountId);
    expect(await receiptCleanupOverdue(jobsPool, user.accountId)).toBe(1);
    await publication.sweep(user.accountId);
    expect(await receiptCleanupOverdue(jobsPool, user.accountId)).toBe(0);
    // The receipt a record still holds is never overdue.
    expect(await storedReceipts(user.accountId)).toEqual([await receiptKeyOf(user.accountId, kept.attachmentId)]);
  });
});

describe('ownership holds for replace and remove too (P2c review fix, minor 6)', () => {
  it('another account gets the same 404 as for an unknown record, and nothing changes', async () => {
    const { user: owner, records } = await memberWithRecords();
    const first = await attachableImage(owner);
    await retained(owner, records[0], first, 1);
    const { user: intruder, records: intruderRecords } = await memberWithRecords();
    const intruderImage = await attachableImage(intruder);
    const spare = await attachableImage(intruder);
    await retained(intruder, intruderRecords[0], intruderImage, 1);
    const writes = countReceiptWrites();
    try {
      // The intruder's own receipt onto the owner's record: the same 404 as an unknown record.
      const foreignReplace = await replace(intruder, records[0], { attachment_id: spare.attachmentId, ...CONSENT }, 2);
      const unknownReplace = await replace(intruder, randomUUID(), { attachment_id: spare.attachmentId, ...CONSENT }, 2);
      expect(foreignReplace.status).toBe(404);
      expect(problemOf(foreignReplace.body)).toEqual(problemOf(unknownReplace.body));
      // The owner's receipt onto the intruder's own record: the same 404 as an unknown id.
      const foreignReceipt = await replace(intruder, intruderRecords[0], { attachment_id: first.attachmentId, ...CONSENT }, 2);
      const unknownReceipt = await replace(intruder, intruderRecords[0], { attachment_id: randomUUID(), ...CONSENT }, 2);
      expect(foreignReceipt.status).toBe(404);
      expect(problemOf(foreignReceipt.body)).toEqual(problemOf(unknownReceipt.body));
      const foreignRemove = await remove(intruder, records[0], 2);
      const unknownRemove = await remove(intruder, randomUUID(), 2);
      expect(foreignRemove.status).toBe(404);
      expect(problemOf(foreignRemove.body)).toEqual(problemOf(unknownRemove.body));
    } finally {
      writes.restore();
    }
    expect(writes.count()).toBe(0);
    expect(await heldBy(owner.accountId, first.attachmentId)).toEqual([records[0]]);
    expect((await recordOf(owner, records[0])).version).toBe(2);
    expect(await attachmentOf(owner.accountId, first.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
    expect(await attachmentOf(intruder.accountId, intruderImage.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }));
    expect(await heldBy(intruder.accountId, intruderImage.attachmentId)).toEqual([intruderRecords[0]]);
  });
});

describe('privileges and schema', () => {
  it('only the routines write receipts or the registry; logins see only what they should', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    await retained(user, records[0], image, 1);
    const app = await db.loginPool(['gogospend_app'], 1);
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      expect((await client.query('SELECT count(*)::int AS n FROM attachments')).rows[0].n).toBe(1);
      await client.query('SAVEPOINT s');
      await expect(client.query(`UPDATE attachments SET status = 'released', released_at = now()`)).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK TO SAVEPOINT s');
      await expect(client.query(`UPDATE object_publications SET delete_after = 'infinity'`)).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK TO SAVEPOINT s');
      // Another account's rows are invisible.
      await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [randomUUID()]);
      expect((await client.query('SELECT count(*)::int AS n FROM attachments')).rows[0].n).toBe(0);
      expect((await client.query('SELECT count(*)::int AS n FROM transaction_attachments')).rows[0].n).toBe(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    for (const table of ['attachments', 'transaction_attachments']) {
      await expect(jobsPool.query(`SELECT 1 FROM ${table} LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
    }
    // Only a retained receipt may be published with no expiry; every other purpose keeps P1's 7 days.
    const job = randomUUID();
    const lease = randomUUID();
    await expect(db.admin((admin) => admin.query(
      `INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, status, delete_after, bytes, sha256, published_at)
       VALUES ($1, $2, $3, $4, 0, 'export', 'published', 'infinity', 1, decode(repeat('ab', 32), 'hex'), now())`,
      [`export/${user.accountId}/${job}/${lease}/x.csv`, job, user.accountId, lease],
    ))).rejects.toMatchObject({ code: '23514' });
    // Receipts are never reservable by a worker lease.
    for (const purpose of API_PUBLISHED_PURPOSES) await expect(publication.reserveKey(jobsPool, { jobId: randomUUID(), accountId: user.accountId, lifecycleGeneration: 0, leaseToken: randomUUID(), attempt: 1, maxAttempts: 1, deadline: new Date().toISOString(), signal: new AbortController().signal }, purpose, 'image.jpg')).rejects.toThrow();
  });

  it('Drizzle definitions match the migrated tables', async () => {
    for (const table of [attachmentsTable, transactionAttachments, importPreviews]) {
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
