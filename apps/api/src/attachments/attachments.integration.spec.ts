import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

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
import { AttachmentService } from './attachments.service';

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

  it('registers the copy before its PUT, and the receipt outlives the import image and the preview', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const seenAtPut: { status: string | undefined }[] = [];
    const original = store.putStream.bind(store);
    store.putStream = async (key, body, options) => {
      if (key.startsWith('receipt/')) seenAtPut.push({ status: (await adminRows<{ status: string }>('SELECT status FROM object_publications WHERE key = $1', [key]))[0]?.status });
      return original(key, body, options);
    };
    try {
      await retained(user, records[0], image, 1);
    } finally {
      store.putStream = original;
    }
    expect(seenAtPut).toEqual([{ status: 'reserved' }]);

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
    // The copy that refused command made is due at once, and swept.
    const spare = (await receiptRows(user.accountId)).filter((row) => row.job_id === second.attachmentId);
    expect(spare).toEqual([expect.objectContaining({ status: 'reserved', due: true })]);
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

  it('an account has at most four copies in flight; a fifth retain is told to retry', async () => {
    const { user, records } = await memberWithRecords();
    const image = await attachableImage(user);
    const app = await db.loginPool(['gogospend_app'], 1);
    const reserve = async () => {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
        const { rows } = await client.query<{ outcome: string }>('SELECT outcome FROM gogospend_reserve_receipt_copy($1, $2)', [image.attachmentId, randomUUID()]);
        await client.query('COMMIT');
        return rows[0].outcome;
      } finally {
        client.release();
      }
    };
    expect([await reserve(), await reserve(), await reserve(), await reserve()]).toEqual(['reserved', 'reserved', 'reserved', 'reserved']);
    expect(await reserve()).toBe('limited');
    const limited = await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1);
    expect([limited.status, limited.body.code, limited.body.retry_after_seconds]).toEqual([429, 'RATE_LIMITED', 60]);
    expect(await attachmentOf(user.accountId, image.attachmentId)).toBeUndefined();
    // Once those copies are due (abandoned), retaining goes ahead.
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() - interval '1 second' WHERE purpose = 'receipt' AND account_id = $1`, [user.accountId]));
    expect((await retain(user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)).status).toBe(200);
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

  it('two records retaining one image at once keep one receipt; the spare copy is swept', async () => {
    const { user, records } = await memberWithRecords(2);
    const image = await attachableImage(user);
    const [a, b] = await Promise.all(records.map((id) => retain(user, id, { attachment_id: image.attachmentId, ...CONSENT }, 1)));
    expect([a.status, b.status]).toEqual([200, 200]);
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
