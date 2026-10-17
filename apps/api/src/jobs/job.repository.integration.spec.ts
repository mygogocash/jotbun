import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { JobRepository } from './job.repository';

let db: TestDatabase;
let workerPool: Pool;
let jobs: JobRepository;
let otherWorker: JobRepository;

const enqueue = (maxAttempts = 3) => {
  const id = randomUUID();
  return jobs.enqueue({ id, kind: 'auth0_revoke_grants', accountId: null, payload: { test: true }, maxAttempts }).then(() => id);
};
const status = async (id: string) => (await db.admin((client) => client.query('SELECT status, attempts, last_error, run_after > now() AS deferred FROM jobs WHERE id = $1', [id]))).rows[0];

beforeAll(async () => {
  db = await createTestDatabase();
  workerPool = await db.loginPool(['gogospend_jobs', 'gogospend_security']);
  jobs = new JobRepository(workerPool);
  // Security kinds are visible only to logins that also hold gogospend_security.
  otherWorker = new JobRepository(await db.loginPool(['gogospend_jobs', 'gogospend_security']));
});

afterAll(async () => {
  await db?.drop();
});

beforeEach(async () => {
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('job leases', () => {
  it('a claim takes a fresh fencing token, counts the attempt and sets a deadline', async () => {
    const id = await enqueue();
    const [claimed] = await jobs.claim(['auth0_revoke_grants'], { leaseSeconds: 30 });
    expect(claimed.lease).toMatchObject({ jobId: id, attempt: 1, lifecycleGeneration: 0 });
    expect(claimed.lease.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(claimed.lease.deadline).getTime()).toBeGreaterThan(Date.now());
    expect(claimed.lease.signal.aborted).toBe(false);
    expect(claimed.payload).toEqual({ test: true });
  });

  it('two workers never claim the same job', async () => {
    await enqueue();
    await enqueue();
    const [a, b] = await Promise.all([jobs.claim(['auth0_revoke_grants'], { limit: 1 }), otherWorker.claim(['auth0_revoke_grants'], { limit: 1 })]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].lease.jobId).not.toBe(b[0].lease.jobId);
  });

  it('only the current lease holder can complete, and only once', async () => {
    await enqueue();
    const [claimed] = await jobs.claim(['auth0_revoke_grants']);
    expect(await jobs.complete({ ...claimed.lease, leaseToken: randomUUID() })).toBe(false);
    expect(await jobs.complete(claimed.lease)).toBe(true);
    expect(await jobs.complete(claimed.lease)).toBe(false);
    expect((await status(claimed.lease.jobId)).status).toBe('succeeded');
  });

  it('an expired lease is reclaimed with a new token, and the old holder is fenced out', async () => {
    await enqueue();
    const [first] = await jobs.claim(['auth0_revoke_grants']);
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [first.lease.jobId]));
    const [second] = await otherWorker.claim(['auth0_revoke_grants']);
    expect(second.lease.jobId).toBe(first.lease.jobId);
    expect(second.lease.attempt).toBe(2);
    expect(await jobs.complete(first.lease)).toBe(false);
    expect(await jobs.fail(first.lease, { code: 'late', retryable: true })).toBe(false);
    expect(await otherWorker.complete(second.lease)).toBe(true);
  });

  it('a retryable failure is requeued with backoff, then fails terminally after max attempts', async () => {
    const id = await enqueue(2);
    const [first] = await jobs.claim(['auth0_revoke_grants']);
    expect(await jobs.fail(first.lease, { code: 'provider_unavailable', retryable: true })).toBe(true);
    expect(await status(id)).toMatchObject({ status: 'queued', attempts: 1, last_error: 'provider_unavailable', deferred: true });
    expect(await jobs.claim(['auth0_revoke_grants'])).toEqual([]);
    await db.admin((client) => client.query('UPDATE jobs SET run_after = now() WHERE id = $1', [id]));
    const [second] = await jobs.claim(['auth0_revoke_grants']);
    expect(await jobs.fail(second.lease, { code: 'provider_unavailable', retryable: true })).toBe(true);
    expect(await status(id)).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('a permanent failure is terminal at once', async () => {
    const id = await enqueue(5);
    const [claimed] = await jobs.claim(['auth0_revoke_grants']);
    await jobs.fail(claimed.lease, { code: 'forbidden', retryable: false });
    expect(await status(id)).toMatchObject({ status: 'failed', last_error: 'forbidden' });
  });

  it('a lease that expires on its last attempt becomes a visible failure', async () => {
    const id = await enqueue(1);
    const [claimed] = await jobs.claim(['auth0_revoke_grants']);
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await jobs.claim(['auth0_revoke_grants'])).toEqual([]);
    expect(await status(id)).toMatchObject({ status: 'failed', last_error: 'lease_expired' });
  });

  it('error codes are short identifiers, never free text', async () => {
    await enqueue();
    const [claimed] = await jobs.claim(['auth0_revoke_grants']);
    await expect(jobs.fail(claimed.lease, { code: 'user auth0|alice not found', retryable: true })).rejects.toThrow();
  });

  it('the app role cannot read the queue', async () => {
    const app = await db.loginPool(['gogospend_app'], 1);
    await expect(app.query('SELECT * FROM jobs')).rejects.toMatchObject({ code: '42501' });
  });
});
