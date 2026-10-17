import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { IMPORT_LIMIT_MESSAGE_KEYS, IMPORT_UPLOAD_MAX_BYTES, isImportJobDto } from '@gogospend/contracts';
import type { ImportJobDto } from '@gogospend/contracts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import request from 'supertest';

import { LeasedAccountRead } from '../database/leased-account-read';
import { importUploads } from '../database/schema';
import { HandlerRegistry } from '../jobs/handler-registry';
import { buildHandlers } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { ObjectPublicationService } from '../storage/object-publication.service';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { acceptPolicies, publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { SYNTHETIC, meteredStream } from './fixtures/synthetic-uploads';

const MiB = 1024 * 1024;
const CAP = IMPORT_UPLOAD_MAX_BYTES;
const HOUR_MS = 3_600_000;
// A legacy sample, read-only: accepted into quarantine, never parsed here.
const LEGACY_SAMPLE = readFileSync(join(__dirname, '..', 'spend', 'fixtures', 'spendee-th-sample.csv'));

let db: TestDatabase;
let issuer: JwksFixture;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let server: Server;
let port: number;
let store: ObjectStore;
let jobsPool: Pool;
let jobs: JobRepository;
let publication: ObjectPublicationService;
let worker: JobWorker;
let handled: string[];

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

async function sessionHeaders(user: SignedUp): Promise<Record<string, string>> {
  return {
    'x-gogospend-client': 'ios/1.0.0',
    authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`,
    'x-gogospend-session': user.binding,
  };
}

type Reply = { status: number; body: Record<string, unknown> & Partial<ImportJobDto>; headers: Record<string, string | string[] | undefined> };
type UploadOptions = {
  name?: string;
  /** Sent as is (already percent-encoded, or deliberately malformed). */
  rawName?: string;
  type?: string;
  key?: string;
  /** Stream without Content-Length (chunked). */
  chunked?: boolean;
  /** A Content-Length to declare instead of the real one; the body is then held back until the reply. */
  declaredLength?: number;
  /** Destroy the request after writing this many bytes (a client that goes away). */
  abortAfter?: number;
  /** After writing `bytes`, wait for `then` before writing the rest. */
  pauseAfter?: { bytes: number; then: () => Promise<void> };
};

/** A raw HTTP upload (node:http), so bodies can stream, stall or abort. */
async function upload(user: SignedUp, body: Uint8Array | AsyncIterable<Uint8Array>, options: UploadOptions = {}): Promise<Reply> {
  const headers: Record<string, string> = {
    ...(await sessionHeaders(user)),
    'idempotency-key': options.key ?? randomUUID(),
    'content-type': options.type ?? 'text/csv',
    'x-gogospend-file-name': options.rawName ?? encodeURIComponent(options.name ?? 'statement.csv'),
  };
  const isBytes = body instanceof Uint8Array;
  if (options.declaredLength !== undefined) headers['content-length'] = String(options.declaredLength);
  else if (isBytes && !options.chunked) headers['content-length'] = String(body.byteLength);
  return new Promise<Reply>((resolve, reject) => {
    let settled = false;
    // No reply in time (a server waiting for a body that is held back) reads as status 0.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 0, body: {}, headers: {} });
      req.destroy();
    }, 15_000);
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/v1/imports', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, body: text ? (JSON.parse(text) as Reply['body']) : {}, headers: res.headers });
        if (options.declaredLength !== undefined) req.destroy();
      });
    });
    req.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        if (options.abortAfter !== undefined) resolve({ status: 0, body: {}, headers: {} });
        else reject(error);
      }
    });
    if (options.declaredLength !== undefined) {
      req.flushHeaders();
      return;
    }
    void (async () => {
      let written = 0;
      let paused = false;
      const source: AsyncIterable<Uint8Array> = isBytes ? (async function* () { yield body; })() : body;
      for await (const chunk of source) {
        if (req.destroyed) return;
        if (options.abortAfter !== undefined && written + chunk.byteLength > options.abortAfter) {
          req.write(chunk.subarray(0, options.abortAfter - written));
          await new Promise((done) => setTimeout(done, 100));
          req.destroy();
          return;
        }
        if (!req.write(chunk)) await once(req, 'drain');
        written += chunk.byteLength;
        if (options.pauseAfter && !paused && written >= options.pauseAfter.bytes) {
          paused = true;
          await options.pauseAfter.then();
        }
      }
      req.end();
    })().catch(() => req.destroy());
  });
}

async function get(user: SignedUp, id: string) {
  return request(server).get(`/v1/imports/${id}`).set(await sessionHeaders(user));
}

const adminRows = async <T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> =>
  (await db.admin((client) => client.query<T>(text, values))).rows;

async function quarantined(accountId: string): Promise<string[]> {
  return (await store.list(`import_quarantine/${accountId}/`)).map((object) => object.key);
}

async function liveRegistry(accountId: string): Promise<{ key: string; status: string }[]> {
  return adminRows(`SELECT key, status FROM object_publications WHERE account_id = $1 AND purpose = 'import_quarantine' AND status IN ('reserved', 'published') ORDER BY key`, [accountId]);
}

async function jobsOf(accountId: string): Promise<{ id: string; kind: string; status: string; payload: { import_job_id?: string } }[]> {
  return adminRows(`SELECT id, kind, status, payload FROM jobs WHERE account_id = $1 ORDER BY kind, created_at`, [accountId]);
}

async function transactionCount(): Promise<number> {
  return Number((await adminRows<{ n: string }>('SELECT count(*) AS n FROM transactions'))[0].n);
}

async function eventually<T>(read: () => Promise<T>, ok: (value: T) => boolean, ms = 5_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (ok(value) || Date.now() > until) return value;
    await new Promise((done) => setTimeout(done, 50));
  }
}

/** Accepted uploads `minutesAgo`, straight into the ledger (quota fixtures). */
async function seedAccepted(accountId: string, rows: { bytes: number; minutesAgo: number }[]): Promise<void> {
  for (const row of rows) {
    await db.admin((client) =>
      client.query(
        `INSERT INTO import_uploads (job_id, account_id, lifecycle_generation, intake_token, status, file_name, declared_type, format, bytes, sha256, part_count,
                                     created_at, receive_deadline, accepted_at, expires_at)
         SELECT gen_random_uuid(), a.id, a.lifecycle_generation, gen_random_uuid(), 'accepted', 'seed.csv', 'text/csv', 'csv', $2::bigint, decode(repeat('ab', 32), 'hex'),
                greatest(1, ceil($2::bigint / 1048576.0))::int, t.at, t.at + interval '10 minutes', t.at + interval '1 minute', t.at + interval '1 minute' + interval '24 hours'
           FROM accounts a, (SELECT now() - make_interval(mins => $3::int) AS at) t
          WHERE a.id = $1`,
        [accountId, row.bytes, row.minutesAgo],
      ),
    );
  }
}

/** Moves an upload (and its expiry job) `hours` into the past. */
async function age(jobId: string, hours: number): Promise<void> {
  await db.admin(async (client) => {
    await client.query(
      `UPDATE import_uploads SET created_at = created_at - make_interval(hours => $2), receive_deadline = receive_deadline - make_interval(hours => $2),
              accepted_at = accepted_at - make_interval(hours => $2), expires_at = expires_at - make_interval(hours => $2)
        WHERE job_id = $1`,
      [jobId, hours],
    );
    await client.query(`UPDATE jobs SET run_after = run_after - make_interval(hours => $2) WHERE kind = 'import_expire' AND payload ->> 'import_job_id' = $1::text`, [jobId, hours]);
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
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  store = v1.app.get<ObjectStore>(OBJECT_STORE);
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  jobs = new JobRepository(jobsPool);
  publication = new ObjectPublicationService(jobsPool, store);
  const all = buildHandlers({ jobs, reader: new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2)), store, publication, pool: jobsPool });
  // This spec covers intake and quarantine expiry: its worker runs only the
  // expiry handler, so parse jobs stay queued (parsing is import-preview.integration.spec's).
  const handlers = new HandlerRegistry().register('import_expire', all.handler('import_expire'));
  handled = handlers.kinds();
  worker = new JobWorker(jobs, handlers);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('POST /v1/imports streams into bounded private quarantine', () => {
  it('oversized_stream_is_rejected_before_buffering', async () => {
    const user = await member();
    let stored = 0;
    const original = store.putStream.bind(store);
    store.putStream = async (key, body, options) => {
      const written = await original(key, body, options);
      if (key.includes(user.accountId)) stored += written.bytes;
      return written;
    };
    let response: Reply;
    try {
      response = await upload(user, meteredStream(SYNTHETIC.csv, CAP + 1).stream, { chunked: true });
    } finally {
      store.putStream = original;
    }
    const bytesBufferedBeyondCap = Math.max(0, stored - CAP);
    expect(response.status).toBe(413);
    expect(bytesBufferedBeyondCap).toBe(0);
    expect(response.body.code).toBe('UPLOAD_TOO_LARGE');
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await liveRegistry(user.accountId)).toEqual([]);
    expect(await jobsOf(user.accountId)).toEqual([]);
    const [row] = await adminRows<{ status: string; outcome_code: string }>('SELECT status, outcome_code FROM import_uploads WHERE account_id = $1', [user.accountId]);
    expect(row).toEqual({ status: 'rejected', outcome_code: 'too_large' });
  });

  it('a declared Content-Length over 12 MiB is refused before the body is read', async () => {
    const user = await member();
    const response = await upload(user, SYNTHETIC.csv, { declaredLength: CAP + 1 });
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('UPLOAD_TOO_LARGE');
    expect(await adminRows('SELECT 1 FROM import_uploads WHERE account_id = $1', [user.accountId])).toEqual([]);
  });

  it('accepts a CSV into private quarantine and queues exactly one parse job; nothing is parsed or saved', async () => {
    const user = await member();
    const before = await transactionCount();
    const response = await upload(user, LEGACY_SAMPLE, { name: 'spendee-th-sample.csv' });
    expect(response.status).toBe(202);
    const accepted = response.body as ImportJobDto;
    expect(isImportJobDto(accepted)).toBe(true);
    expect(accepted).toMatchObject({ status: 'queued', format: 'csv', file_name: 'spendee-th-sample.csv', bytes: LEGACY_SAMPLE.byteLength });
    expect(Date.parse(accepted.expires_at) - Date.parse(accepted.received_at)).toBe(24 * HOUR_MS);
    expect(JSON.stringify(accepted)).not.toMatch(/import_quarantine|part-/);

    // Quarantine: server-generated keys only, registered and published until expiry, holding exactly the upload.
    const keys = await quarantined(user.accountId);
    expect(keys).toEqual([expect.stringMatching(new RegExp(`^import_quarantine/${user.accountId}/${accepted.job_id}/[0-9a-f-]{36}/part-0000$`))]);
    expect(keys.join()).not.toContain('spendee');
    const registry = await adminRows<{ key: string; status: string; delete_after: Date; bytes: string }>(
      `SELECT key, status, delete_after, bytes::text AS bytes FROM object_publications WHERE account_id = $1 ORDER BY key`,
      [user.accountId],
    );
    expect(registry.map((row) => [row.key, row.status, row.bytes])).toEqual([[keys[0], 'published', String(LEGACY_SAMPLE.byteLength)]]);
    expect(registry[0].delete_after.toISOString()).toBe(accepted.expires_at);
    const whole = Buffer.from((await store.get(keys[0])) as Uint8Array);
    expect(createHash('sha256').update(whole).digest('hex')).toBe(createHash('sha256').update(LEGACY_SAMPLE).digest('hex'));

    // One parse job (the import's own id) and one expiry job; this spec's worker does not run the parser, so the parse job stays queued.
    const queued = await jobsOf(user.accountId);
    expect(queued.map((job) => [job.kind, job.status])).toEqual([['import_expire', 'queued'], ['import_parse', 'queued']]);
    expect(queued.find((job) => job.kind === 'import_parse')?.id).toBe(accepted.job_id);
    expect(queued.find((job) => job.kind === 'import_expire')?.payload).toEqual({ import_job_id: accepted.job_id });
    expect(handled).not.toContain('import_parse');
    expect(await worker.runOnce()).toBe('idle');
    expect((await jobs.backlog()).some((row) => row.kind === 'import_parse' && row.status === 'queued')).toBe(true);

    expect(await transactionCount()).toBe(before);
    const read = await get(user, accepted.job_id);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(accepted);
  });

  it.each<[string, Buffer, UploadOptions, number, string]>([
    ['a PNG named and declared as JPEG', SYNTHETIC.png, { name: 'receipt.jpg', type: 'image/jpeg' }, 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a HEIC photo named and declared as JPEG', SYNTHETIC.heic, { name: 'receipt.jpg', type: 'image/jpeg' }, 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a ZIP named and declared as CSV', SYNTHETIC.xlsx, { name: 'statement.csv' }, 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a declared HEIC type', SYNTHETIC.heic, { name: 'IMG_0001.heic', type: 'image/heic' }, 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a path-like name', SYNTHETIC.csv, { name: '../../etc/passwd.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an encoded backslash path', SYNTHETIC.csv, { rawName: '..%5C..%5Cboot.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an undecodable name', SYNTHETIC.csv, { rawName: 'bad%E0%A4%A.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an empty body', Buffer.alloc(0), {}, 422, 'UPLOAD_EMPTY'],
  ])('refuses %s: nothing quarantined, published, parsed or saved', async (_label, body, options, status, code) => {
    const user = await member();
    const before = await transactionCount();
    const response = await upload(user, body, options);
    expect([response.status, response.body.code]).toEqual([status, code]);
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await liveRegistry(user.accountId)).toEqual([]);
    expect(await jobsOf(user.accountId)).toEqual([]);
    expect(await transactionCount()).toBe(before);
  });

  it('keeps Thai file names as labels and replays an accepted key without a second job', async () => {
    const user = await member();
    const key = randomUUID();
    const first = await upload(user, SYNTHETIC.csvBom, { key, name: 'รายการ มีนาคม.csv' });
    expect(first.status).toBe(202);
    expect(first.body.file_name).toBe('รายการ มีนาคม.csv');
    const again = await upload(user, SYNTHETIC.csvBom, { key, name: 'รายการ มีนาคม.csv' });
    expect(again.status).toBe(202);
    expect(again.body).toEqual(first.body);
    const other = await upload(user, SYNTHETIC.csv, { key, name: 'other.csv' });
    expect([other.status, other.body.code]).toEqual([409, 'IDEMPOTENCY_MISMATCH']);
    expect((await jobsOf(user.accountId)).filter((job) => job.kind === 'import_parse')).toHaveLength(1);
    expect(await adminRows('SELECT 1 FROM import_uploads WHERE account_id = $1', [user.accountId])).toHaveLength(1);
    // The same key from another account is a different upload.
    const stranger = await member();
    const theirs = await upload(stranger, SYNTHETIC.csv, { key });
    expect(theirs.status).toBe(202);
    expect(theirs.body.job_id).not.toBe(first.body.job_id);
  });

  it('is disabled by default: 404 with the body unread and nothing recorded', async () => {
    const off = await startV1App(db, issuer);
    const offServer = off.app.getHttpServer() as Server;
    try {
      const user = await member();
      const response = await request(offServer)
        .post('/v1/imports')
        .set({ ...(await sessionHeaders(user)), 'idempotency-key': randomUUID(), 'content-type': 'text/csv', 'x-gogospend-file-name': 'statement.csv' })
        .send(SYNTHETIC.csv);
      expect([response.status, response.body.code]).toEqual([404, 'NOT_FOUND']);
      expect(await adminRows('SELECT 1 FROM import_uploads WHERE account_id = $1', [user.accountId])).toEqual([]);
    } finally {
      await off.close();
    }
  });
});

describe('per-account quotas hold under concurrent uploads', () => {
  it('at most 5 upload attempts in 15 minutes', async () => {
    const user = await member();
    const replies = await Promise.all(Array.from({ length: 8 }, (_, index) => upload(user, SYNTHETIC.csv, { name: `s${index}.csv` })));
    const statuses = replies.map((reply) => reply.status).sort();
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429, 429, 429]);
    for (const reply of replies.filter((r) => r.status === 429)) {
      expect(reply.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.uploads });
      expect(reply.body.retry_after_seconds).toBeGreaterThan(0);
      expect(reply.body.retry_after_seconds).toBeLessThanOrEqual(15 * 60);
      expect(reply.headers['retry-after']).toBe(String(reply.body.retry_after_seconds));
    }
    expect(await adminRows('SELECT 1 FROM import_uploads WHERE account_id = $1', [user.accountId])).toHaveLength(5);
    expect((await jobsOf(user.accountId)).filter((job) => job.kind === 'import_parse')).toHaveLength(5);
  });

  it('at most 50 MiB of accepted bytes per 24 hours, decided under the account lock', async () => {
    const user = await member();
    await seedAccepted(user.accountId, [
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 2 * MiB - 3 * 1024, minutesAgo: 60 },
    ]);
    const body = Buffer.concat([SYNTHETIC.csv, Buffer.alloc(2048 - SYNTHETIC.csv.length, 0x61)]);
    const replies = await Promise.all([upload(user, body, { chunked: true }), upload(user, body, { chunked: true })]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([202, 429]);
    const refused = replies.find((reply) => reply.status === 429) as Reply;
    expect(refused.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.bytes });
    // Room returns when the seeded uploads (accepted 59 minutes ago) leave the 24-hour window.
    expect(refused.body.retry_after_seconds).toBeGreaterThan(23 * 3600);
    expect(refused.body.retry_after_seconds).toBeLessThanOrEqual(23 * 3600 + 60);
    expect(await quarantined(user.accountId)).toHaveLength(1);
    expect(await liveRegistry(user.accountId)).toHaveLength(1);
    // A declared length that cannot fit is refused before streaming.
    const declared = await upload(user, body);
    expect(declared.body.message_key).toBe(IMPORT_LIMIT_MESSAGE_KEYS.bytes);
  });

  it('at most 10 parse jobs per 24 hours', async () => {
    const user = await member();
    await seedAccepted(user.accountId, Array.from({ length: 10 }, () => ({ bytes: 100, minutesAgo: 120 })));
    const reply = await upload(user, SYNTHETIC.csv);
    expect(reply.status).toBe(429);
    expect(reply.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.parse_jobs });
    // The oldest seeded upload was accepted 119 minutes ago.
    expect(reply.body.retry_after_seconds).toBeGreaterThan(22 * 3600);
    expect(reply.body.retry_after_seconds).toBeLessThanOrEqual(22 * 3600 + 60);
    expect(await jobsOf(user.accountId)).toEqual([]);
  });
});

describe('job ids belong to their account', () => {
  it('another account gets the same 404 for an existing import as for an unknown id', async () => {
    const owner = await member();
    const stranger = await member();
    const accepted = (await upload(owner, SYNTHETIC.csv)).body as ImportJobDto;
    expect((await get(owner, accepted.job_id)).status).toBe(200);
    const foreign = await get(stranger, accepted.job_id);
    const unknown = await get(stranger, randomUUID());
    expect([foreign.status, foreign.body.code, foreign.body.message_key]).toEqual([404, 'NOT_FOUND', 'errors.not_found']);
    expect({ ...foreign.body, request_id: '' }).toEqual({ ...unknown.body, request_id: '' });
    expect((await get(stranger, 'not-a-uuid')).status).toBe(404);
    // A refused upload never becomes a readable import either.
    const refused = await upload(owner, SYNTHETIC.png, { name: 'receipt.jpg', type: 'image/jpeg', key: randomUUID() });
    expect(refused.status).toBe(422);
    const [rejected] = await adminRows<{ job_id: string }>(`SELECT job_id FROM import_uploads WHERE account_id = $1 AND status = 'rejected'`, [owner.accountId]);
    expect((await get(owner, rejected.job_id)).status).toBe(404);
  });
});

describe('cancelled, failed and expired uploads are swept', () => {
  it('expires quarantine after 24 hours through the import_expire job: objects deleted, the parse job cancelled', async () => {
    const user = await member();
    const accepted = (await upload(user, SYNTHETIC.png, { name: 'receipt.png', type: 'image/png' })).body as ImportJobDto;
    expect(await quarantined(user.accountId)).toHaveLength(1);
    // Not due yet: nothing runs.
    expect(await worker.runOnce()).toBe('idle');
    await age(accepted.job_id, 25);
    expect(await worker.runOnce()).toBe('ran');
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await liveRegistry(user.accountId)).toEqual([]);
    const after = await jobsOf(user.accountId);
    expect(after.map((job) => [job.kind, job.status])).toEqual([['import_expire', 'succeeded'], ['import_parse', 'cancelled']]);
    const read = await get(user, accepted.job_id);
    expect(read.body).toMatchObject({ job_id: accepted.job_id, status: 'expired', file_name: null });
    const [row] = await adminRows<{ status: string; sha256: Buffer | null; bytes: string }>('SELECT status, sha256, bytes::text AS bytes FROM import_uploads WHERE job_id = $1', [accepted.job_id]);
    expect(row).toEqual({ status: 'expired', sha256: null, bytes: String(SYNTHETIC.png.byteLength) });
  });

  it('an expiry job that is not due yet changes nothing', async () => {
    const user = await member();
    const accepted = (await upload(user, SYNTHETIC.csv)).body as ImportJobDto;
    // Due by the queue, but the upload itself is only 23 hours old.
    await db.admin((client) => client.query(`UPDATE jobs SET run_after = now() - interval '1 minute' WHERE kind = 'import_expire' AND payload ->> 'import_job_id' = $1::text`, [accepted.job_id]));
    expect(await worker.runOnce()).toBe('ran');
    expect(await quarantined(user.accountId)).toHaveLength(1);
    expect((await get(user, accepted.job_id)).body.status).toBe('queued');
    const [expiry] = (await jobsOf(user.accountId)).filter((job) => job.kind === 'import_expire');
    expect(expiry.status).toBe('queued');
  });

  it('the P1 sweep deletes quarantine past its 24-hour registry deadline even if the expiry job never runs', async () => {
    const user = await member();
    await upload(user, SYNTHETIC.csv);
    await db.admin((client) => client.query(`UPDATE jobs SET status = 'cancelled', finished_at = now() WHERE account_id = $1`, [user.accountId]));
    expect(await publication.sweep(user.accountId)).toEqual([]);
    const swept = await publication.sweep(user.accountId, new Date(Date.now() + 25 * HOUR_MS));
    expect(swept).toHaveLength(1);
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await liveRegistry(user.accountId)).toEqual([]);
  });

  it('a client that goes away mid-stream leaves nothing in quarantine', async () => {
    const user = await member();
    const reply = await upload(user, meteredStream(SYNTHETIC.csv, 4 * MiB).stream, { chunked: true, abortAfter: 2.5 * MiB });
    expect(reply.status).toBe(0);
    const [row] = await eventually(
      () => adminRows<{ status: string; outcome_code: string }>('SELECT status, outcome_code FROM import_uploads WHERE account_id = $1', [user.accountId]),
      (rows) => rows[0]?.status === 'failed',
    );
    expect(row).toEqual({ status: 'failed', outcome_code: 'upload_incomplete' });
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await jobsOf(user.accountId)).toEqual([]);
    // Its reservations are due now, so the next sweep closes them.
    await publication.sweep(user.accountId);
    expect(await liveRegistry(user.accountId)).toEqual([]);
  });

  it('an upload whose session ended while it streamed is not accepted and leaves nothing', async () => {
    const user = await member();
    const reply = await upload(user, meteredStream(SYNTHETIC.csv, 3 * MiB).stream, {
      chunked: true,
      pauseAfter: {
        bytes: 1.5 * MiB,
        then: async () => {
          await eventually(() => quarantined(user.accountId), (keys) => keys.length > 0);
          await db.admin((client) => client.query('UPDATE accounts SET session_generation = session_generation + 1 WHERE id = $1', [user.accountId]));
        },
      },
    });
    expect([reply.status, reply.body.code]).toEqual([401, 'SESSION_REQUIRED']);
    expect(await quarantined(user.accountId)).toEqual([]);
    expect(await jobsOf(user.accountId)).toEqual([]);
    const [row] = await adminRows<{ status: string; outcome_code: string }>('SELECT status, outcome_code FROM import_uploads WHERE account_id = $1', [user.accountId]);
    expect(row).toEqual({ status: 'failed', outcome_code: 'session_ended' });
  });

  it('an API that died between a PUT and finishing: the reservation is swept after its deadline, and the upload counts as failed', async () => {
    const user = await member();
    const pool = await db.loginPool(['gogospend_app'], 1);
    // Simulate the dead API with the app login: begin, reserve, PUT - and nothing else.
    const jobId = randomUUID();
    const token = randomUUID();
    /** One owner-context statement in its own transaction, as the API's owner transactions run them. */
    const asOwner = async (text: string, values: unknown[]): Promise<Record<string, unknown>[]> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
        const { rows } = await client.query<Record<string, unknown>>(text, values);
        await client.query('COMMIT');
        return rows;
      } finally {
        client.release();
      }
    };
    const [begun] = await asOwner('SELECT outcome FROM gogospend_begin_import_upload($1, $2, $3, $4, $5)', [jobId, token, 'statement.csv', 'text/csv', null]);
    expect(begun).toEqual({ outcome: 'started' });
    const [reserved] = await asOwner('SELECT gogospend_reserve_import_part($1, $2, 0) AS key', [jobId, token]);
    const key = String(reserved.key);
    expect(key).toBe(`import_quarantine/${user.accountId}/${jobId}/${token}/part-0000`);
    await store.putStream(key, SYNTHETIC.csv);
    // Before the deadline the registry protects it from the orphan pass.
    expect(await publication.sweep(user.accountId)).toEqual([]);
    expect(await quarantined(user.accountId)).toEqual([key]);
    // After it, the sweep deletes it.
    expect(await publication.sweep(user.accountId, new Date(Date.now() + 30 * 60_000))).toEqual([key]);
    expect(await quarantined(user.accountId)).toEqual([]);
    // The dead upload is marked failed once its deadline passed, when the account next uploads.
    await db.admin((client) => client.query(`UPDATE import_uploads SET created_at = created_at - interval '20 minutes', receive_deadline = receive_deadline - interval '20 minutes' WHERE job_id = $1`, [jobId]));
    expect((await upload(user, SYNTHETIC.csv)).status).toBe(202);
    const [row] = await adminRows<{ status: string; outcome_code: string }>('SELECT status, outcome_code FROM import_uploads WHERE job_id = $1', [jobId]);
    expect(row).toEqual({ status: 'failed', outcome_code: 'deadline_passed' });
  });
});

describe('privileges', () => {
  it('the app login only reads its own rows; quarantine keys and jobs are reached through routines; the worker cannot mint import jobs', async () => {
    const user = await member();
    const app = await db.loginPool(['gogospend_app'], 1);
    const worker = await db.loginPool(['gogospend_jobs'], 1);
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await expect(
        client.query(`INSERT INTO import_uploads (job_id, account_id, lifecycle_generation, intake_token, status, declared_type, receive_deadline)
                      VALUES (gen_random_uuid(), $1, 0, gen_random_uuid(), 'accepted', 'text/csv', now() + interval '1 minute')`, [user.accountId]),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await expect(app.query('SELECT * FROM object_publications')).rejects.toMatchObject({ code: '42501' });
    for (const kind of ['import_parse', 'import_expire']) {
      await expect(
        worker.query(`INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts) VALUES (gen_random_uuid(), $1, $2, 0, '{}', 3)`, [kind, user.accountId]),
      ).rejects.toMatchObject({ code: '42501' });
    }
    await expect(worker.query('SELECT * FROM import_uploads')).rejects.toMatchObject({ code: '42501' });
  });

  it('Drizzle definitions match the migrated import_uploads columns', async () => {
    const config = getTableConfig(importUploads);
    const fromDatabase = await adminRows<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [config.name],
    );
    expect(fromDatabase.map((row) => [row.column_name, row.is_nullable === 'NO'])).toEqual(
      config.columns.map((column) => [column.name, column.notNull]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });
});
