import { createHash, randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import { queueAccountJob } from '../testing/job-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { ObjectPublicationService } from './object-publication.service';
import { MemoryObjectStore } from './object-store';

let db: TestDatabase;
let pool: Pool;
let jobs: JobRepository;
let store: MemoryObjectStore;
let publication: ObjectPublicationService;

const HOUR = 3_600_000;
const bytes = (text: string) => new TextEncoder().encode(text);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const keys = async () => (await store.list('sync_snapshot/')).map((object) => object.key);
const publishedKeys = async () => (await db.admin((client) => client.query(`SELECT key FROM object_publications WHERE status = 'published'`))).rows.map((row) => row.key as string);

async function account(): Promise<string> {
  const id = randomUUID();
  await db.admin(async (client) => {
    await client.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
    await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [id]);
  });
  return id;
}

async function claimFor(accountId: string, leaseSeconds = 30, kind: 'sync_snapshot' | 'export' = 'sync_snapshot'): Promise<ClaimedJob> {
  await queueAccountJob(db, accountId, kind, { maxRuntimeSeconds: 60 });
  const [claimed] = await jobs.claim([kind], { leaseSeconds });
  return claimed;
}

async function write(claimed: ClaimedJob, name: string, text: string) {
  const key = await publication.reserveKey(pool, claimed.lease, 'sync_snapshot', name);
  const result = await store.putStream(key, bytes(text));
  return { key, ...result };
}

beforeAll(async () => {
  db = await createTestDatabase();
  pool = await db.loginPool(['gogospend_jobs'], 4);
  jobs = new JobRepository(pool);
});

afterAll(async () => {
  await db?.drop();
});

beforeEach(async () => {
  store = new MemoryObjectStore();
  publication = new ObjectPublicationService(pool, store);
  await db.admin((client) => client.query('DELETE FROM jobs; DELETE FROM object_publications'));
});

describe('fenced object publication', () => {
  it('registers the key before the PUT, then publishes and completes in one step', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const key = await publication.reserveKey(pool, claimed.lease, 'sync_snapshot', 'chunk-0001.json');
    expect(key).toBe(`sync_snapshot/${owner}/${claimed.lease.jobId}/${claimed.lease.leaseToken}/chunk-0001.json`);
    const reserved = (await db.admin((client) => client.query('SELECT status FROM object_publications WHERE key = $1', [key]))).rows[0];
    expect(reserved.status).toBe('reserved');
    const put = await store.putStream(key, bytes('{"a":1}'));
    expect(put).toEqual({ bytes: 7, sha256: sha('{"a":1}') });
    expect(await publication.finishWithObjects(jobs, claimed.lease, [{ key, ...put }], new Date(Date.now() + 24 * HOUR))).toBe(true);
    expect(await publishedKeys()).toEqual([key]);
    expect((await db.admin((client) => client.query('SELECT status FROM jobs WHERE id = $1', [claimed.lease.jobId]))).rows[0].status).toBe('succeeded');
  });

  it('late_cancelled_output_is_not_published', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const lateKey = await publication.reserveKey(pool, claimed.lease, 'sync_snapshot', 'late.json');
    // The account is deleted (its jobs cancelled) while the worker's PUT is in flight.
    expect(await jobs.cancelAccount(owner)).toBe(1);
    const put = await store.putStream(lateKey, bytes('late output'));
    expect(await publication.finishWithObjects(jobs, claimed.lease, [{ key: lateKey, ...put }], new Date(Date.now() + 24 * HOUR))).toBe(false);
    const publishedKeys_ = await publishedKeys();
    expect(publishedKeys_).not.toContain(lateKey);
    await publication.sweep(owner, new Date(Date.now() + 2 * HOUR));
    const keysAfterSweep = await keys();
    expect(keysAfterSweep).not.toContain(lateKey);
  });

  it('a lease that expired and was reclaimed cannot publish, and its output is swept', async () => {
    const owner = await account();
    const first = await claimFor(owner);
    const stale = await write(first, 'chunk.json', 'old');
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [first.lease.jobId]));
    const [second] = await jobs.claim(['sync_snapshot']);
    expect(second.lease.jobId).toBe(first.lease.jobId);
    expect(await publication.finishWithObjects(jobs, first.lease, [stale], new Date(Date.now() + 24 * HOUR))).toBe(false);
    expect(await publishedKeys()).toEqual([]);
    const fresh = await write(second, 'chunk.json', 'new');
    expect(fresh.key).not.toBe(stale.key);
    expect(await publication.finishWithObjects(jobs, second.lease, [fresh], new Date(Date.now() + 24 * HOUR))).toBe(true);
    await publication.sweep(null, new Date(Date.now() + 2 * HOUR));
    expect(await keys()).toEqual([fresh.key]);
  });

  it('a lifecycle change (account deletion started) blocks publication', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const object = await write(claimed, 'chunk.json', 'x');
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting', lifecycle_generation = lifecycle_generation + 1 WHERE id = $1`, [owner]));
    expect(await publication.finishWithObjects(jobs, claimed.lease, [object], new Date(Date.now() + 24 * HOUR))).toBe(false);
    expect(await publishedKeys()).toEqual([]);
  });

  it('a key cannot be reserved without a current lease, nor overwritten', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    await expect(publication.reserveKey(pool, { ...claimed.lease, leaseToken: randomUUID() }, 'sync_snapshot', 'x.json')).rejects.toThrow();
    const object = await write(claimed, 'x.json', 'first');
    await expect(publication.reserveKey(pool, claimed.lease, 'sync_snapshot', 'x.json')).rejects.toThrow();
    await expect(store.putStream(object.key, bytes('second'))).rejects.toMatchObject({ code: 'exists' });
    await expect(publication.reserveKey(pool, claimed.lease, 'sync_snapshot', '../escape')).rejects.toThrow();
  });

  it('a worker killed after its PUT leaves a reservation that is swept only after the final deadline', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const key = await publication.reserveKey(pool, claimed.lease, 'sync_snapshot', 'crashed.json');
    store.failNext('put', 'crash_after_write');
    await expect(store.putStream(key, bytes('written, then the worker died'))).rejects.toThrow();
    expect(await keys()).toEqual([key]);
    // Before the publisher's final deadline the object may still be published: keep it.
    expect(await publication.sweep(owner, new Date())).toEqual([]);
    expect(await keys()).toEqual([key]);
    expect(await publication.sweep(owner, new Date(Date.now() + 2 * HOUR))).toEqual([key]);
    expect(await keys()).toEqual([]);
  });

  it('a failure during completion publishes nothing', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const object = await write(claimed, 'chunk.json', 'x');
    // Another worker reclaims the job between the PUT and the completion.
    await db.admin((client) => client.query(`UPDATE jobs SET lease_token = gen_random_uuid() WHERE id = $1`, [claimed.lease.jobId]));
    expect(await publication.finishWithObjects(jobs, claimed.lease, [object], new Date(Date.now() + 24 * HOUR))).toBe(false);
    expect(await publishedKeys()).toEqual([]);
  });

  it('the owner sweep removes unregistered orphans and expired published objects', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const object = await write(claimed, 'chunk.json', 'x');
    await publication.finishWithObjects(jobs, claimed.lease, [object], new Date(Date.now() + HOUR));
    const orphan = `sync_snapshot/${owner}/${randomUUID()}/${randomUUID()}/orphan.json`;
    await store.putStream(orphan, bytes('never registered'));
    expect(await publication.sweep(owner, new Date())).toEqual([orphan]);
    expect((await publication.sweep(owner, new Date(Date.now() + 2 * HOUR))).sort()).toEqual([object.key]);
    expect(await keys()).toEqual([]);
  });

  it('a key is reserved only for the purpose its job runs', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    await expect(publication.reserveKey(pool, claimed.lease, 'export', 'x.json')).rejects.toThrow();
    await expect(publication.reserveKey(pool, claimed.lease, 'quarantine', 'x.json')).rejects.toThrow();
    const exportJob = await claimFor(owner, 30, 'export');
    expect(await publication.reserveKey(pool, exportJob.lease, 'export', 'x.json')).toMatch(/^export\//);
  });

  it('a failed storage delete is retried by the next sweep, and old deleted rows are purged', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const object = await write(claimed, 'chunk.json', 'x');
    store.failNext('delete');
    expect(await publication.sweep(owner, new Date(Date.now() + 2 * HOUR))).toEqual([]);
    expect(await keys()).toEqual([object.key]);
    expect(await publication.sweep(owner, new Date(Date.now() + 2 * HOUR))).toEqual([object.key]);
    expect(await keys()).toEqual([]);
    await db.admin((client) => client.query(`UPDATE object_publications SET deleted_at = now() - interval '31 days' WHERE key = $1`, [object.key]));
    await publication.sweep(owner);
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM object_publications WHERE key = $1', [object.key]))).rows[0].n).toBe(0);
  });

  it('without an explicit cutoff the sweep uses the database clock', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const due = await write(claimed, 'due.json', 'x');
    const kept = await write(claimed, 'kept.json', 'y');
    await db.admin((client) => client.query(`UPDATE object_publications SET delete_after = now() - interval '1 second' WHERE key = $1`, [due.key]));
    expect(await publication.sweep(owner)).toEqual([due.key]);
    expect(await keys()).toEqual([kept.key]);
  });

  it('the registry refuses a key that does not name its own account, job and lease, or a published expiry past 7 days', async () => {
    const owner = await account();
    const claimed = await claimFor(owner);
    const [jobId, token] = [claimed.lease.jobId, claimed.lease.leaseToken];
    const insert = (key: string) =>
      pool.query(`INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after) VALUES ($1, $2, $3, $4, 0, 'sync_snapshot', now() + interval '1 hour')`, [key, jobId, owner, token]);
    await expect(insert(`sync_snapshot/${randomUUID()}/${jobId}/${token}/x.json`)).rejects.toMatchObject({ code: '23514' });
    await expect(insert(`export/${owner}/${jobId}/${token}/x.json`)).rejects.toMatchObject({ code: '23514' });
    const object = await write(claimed, 'x.json', 'x');
    await expect(pool.query(`UPDATE object_publications SET status = 'published', published_at = now(), bytes = 1, sha256 = decode(repeat('00', 32), 'hex'), delete_after = now() + interval '8 days' WHERE key = $1`, [object.key])).rejects.toMatchObject({ code: '23514' });
  });
});
