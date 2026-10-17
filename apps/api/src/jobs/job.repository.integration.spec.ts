import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { DatabaseService } from '../database/database.service';
import { HandlerRegistry } from './handler-registry';
import { JobRepository } from './job.repository';
import { JobWorker } from './worker';
import { assertLoginRoles } from './worker-login';

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

// ---------------------------------------------------------------------------
// P1: the generic runtime - heartbeats, bounded runtime, cancellation,
// explicit requeue, backlog and the worker loop.

const account = async (): Promise<string> => {
  const id = randomUUID();
  await db.admin(async (client) => {
    await client.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
    await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [id]);
  });
  return id;
};
const generic = (accountId: string | null, options: { maxAttempts?: number; maxRuntimeSeconds?: number; kind?: string } = {}) => {
  const id = randomUUID();
  return jobs.enqueue({ id, kind: options.kind ?? 'test_task', accountId, payload: { n: 1 }, maxAttempts: options.maxAttempts ?? 3, maxRuntimeSeconds: options.maxRuntimeSeconds }).then(() => id);
};
const ownerCtx = (accountId: string) => ({ accountId, subject: 'x', clientId: 'native', bindingId: randomUUID(), sessionGeneration: 0 });

describe('P1 job runtime', () => {
  it('three failed attempts end in a visible failure that can be requeued explicitly', async () => {
    const id = await generic(null, { maxAttempts: 3 });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await db.admin((client) => client.query('UPDATE jobs SET run_after = now() WHERE id = $1', [id]));
      const [claimed] = await jobs.claim(['test_task']);
      expect(claimed.lease.attempt).toBe(attempt);
      await jobs.fail(claimed.lease, { code: 'parser_error', retryable: true });
    }
    expect(await status(id)).toMatchObject({ status: 'failed', attempts: 3, last_error: 'parser_error' });
    expect(await jobs.backlog()).toContainEqual(expect.objectContaining({ kind: 'test_task', status: 'failed', count: 1 }));
    expect(await jobs.requeue(id)).toBe(true);
    expect(await status(id)).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await jobs.requeue(id)).toBe(false);
  });

  it('a heartbeat extends only the current lease, and never past the attempt runtime bound', async () => {
    await generic(null, { maxRuntimeSeconds: 10 });
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 5 });
    const extended = await jobs.heartbeat(claimed.lease, 30);
    expect(extended).not.toBeNull();
    const bound = (await db.admin((client) => client.query(`SELECT attempt_started_at + interval '10 seconds' AS bound FROM jobs WHERE id = $1`, [claimed.lease.jobId]))).rows[0].bound as Date;
    expect(new Date(extended as string).getTime()).toBeLessThanOrEqual(bound.getTime());
    expect(await jobs.heartbeat({ ...claimed.lease, leaseToken: randomUUID() })).toBeNull();
    expect(await jobs.isHeld(claimed.lease)).toBe(true);
  });

  it("cancelling an account stops its open jobs, fences the holder, and leaves others and security cleanup alone", async () => {
    const [mine, theirs] = [await account(), await account()];
    const queued = await generic(mine);
    const leasedId = await generic(mine);
    await db.admin((client) => client.query(`UPDATE jobs SET run_after = now() + interval '1 hour' WHERE id = $1`, [queued]));
    const [held] = await jobs.claim(['test_task']);
    expect(held.lease.jobId).toBe(leasedId);
    const other = await generic(theirs);
    const security = randomUUID();
    await jobs.enqueue({ id: security, kind: 'auth0_revoke_grants', accountId: mine, payload: {}, maxAttempts: 3 });
    expect(await jobs.cancelAccount(mine)).toBe(2);
    expect((await status(queued)).status).toBe('cancelled');
    expect((await status(leasedId)).status).toBe('cancelled');
    expect((await status(other)).status).toBe('queued');
    expect((await status(security)).status).toBe('queued');
    expect(await jobs.complete(held.lease)).toBe(false);
    expect(await jobs.heartbeat(held.lease)).toBeNull();
    expect(await jobs.isHeld(held.lease)).toBe(false);
  });

  it("the app cancels and enqueues only its own account's jobs, under the account lock", async () => {
    const [mine, theirs] = [await account(), await account()];
    const service = new DatabaseService(await db.loginPool(['gogospend_app'], 2));
    const id = randomUUID();
    await service.withOwnerTransaction(ownerCtx(mine), (tx) => tx.query(`SELECT gogospend_enqueue_account_job($1, 'sync_snapshot', '{}'::jsonb, 3, 120)`, [id]));
    const row = (await db.admin((client) => client.query('SELECT account_id, kind, status, max_runtime_seconds FROM jobs WHERE id = $1', [id]))).rows[0];
    expect(row).toEqual({ account_id: mine, kind: 'sync_snapshot', status: 'queued', max_runtime_seconds: 120 });
    await expect(service.withOwnerTransaction(ownerCtx(mine), (tx) => tx.query(`SELECT gogospend_enqueue_account_job($1, 'auth0_revoke_grants', '{}'::jsonb, 3, 120)`, [randomUUID()]))).rejects.toThrow();
    const theirsJob = await generic(theirs);
    const [cancelled] = await service.withOwnerTransaction(ownerCtx(mine), (tx) => tx.query<{ n: number }>('SELECT gogospend_cancel_account_jobs() AS n'));
    expect(cancelled.n).toBe(1);
    expect((await status(theirsJob)).status).toBe('queued');
  });

  it('the worker runs registered handlers with heartbeats and never claims unknown kinds', async () => {
    const slow = await generic(null, { maxRuntimeSeconds: 60 });
    await generic(null, { kind: 'nobody_handles_this' });
    let beats = 0;
    const registry = new HandlerRegistry().register('test_task', async (job) => {
      const before = await db.admin((client) => client.query('SELECT lease_expires_at FROM jobs WHERE id = $1', [job.lease.jobId]));
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      const after = await db.admin((client) => client.query('SELECT lease_expires_at FROM jobs WHERE id = $1', [job.lease.jobId]));
      if (after.rows[0].lease_expires_at > before.rows[0].lease_expires_at) beats += 1;
      await jobs.complete(job.lease);
    });
    const worker = new JobWorker(jobs, registry, { leaseSeconds: 2, heartbeatMs: 500 });
    expect(await worker.runOnce()).toBe('ran');
    expect(beats).toBe(1);
    expect((await status(slow)).status).toBe('succeeded');
    expect(await worker.runOnce()).toBe('idle');
  });

  it('a handler that throws is retried; one that ends without a transition fails visibly', async () => {
    const thrown = await generic(null);
    const registry = new HandlerRegistry().register('test_task', async () => {
      throw new Error('boom user@example.com');
    });
    await new JobWorker(jobs, registry).runOnce();
    expect(await status(thrown)).toMatchObject({ status: 'queued', last_error: 'handler_error' });
    await db.admin((client) => client.query('DELETE FROM jobs'));
    const silent = await generic(null);
    await new JobWorker(jobs, new HandlerRegistry().register('test_task', async () => undefined)).runOnce();
    expect(await status(silent)).toMatchObject({ status: 'failed', last_error: 'handler_incomplete' });
  });

  it('each worker connection is a login with exactly its group roles', async () => {
    const jobsOnly = await db.loginPool(['gogospend_jobs'], 1);
    const leasedOnly = await db.loginPool(['gogospend_leased_read'], 1);
    await expect(assertLoginRoles(jobsOnly, ['gogospend_jobs'], 'DATABASE_URL')).resolves.toBeUndefined();
    await expect(assertLoginRoles(leasedOnly, ['gogospend_leased_read'], 'LEASED_READ_DATABASE_URL')).resolves.toBeUndefined();
    await expect(assertLoginRoles(leasedOnly, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow(/DATABASE_URL/);
    await expect(assertLoginRoles(workerPool, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow(/gogospend_jobs/);
    const both = await db.loginPool(['gogospend_jobs', 'gogospend_leased_read'], 1);
    await expect(assertLoginRoles(both, ['gogospend_leased_read'], 'LEASED_READ_DATABASE_URL')).rejects.toThrow();
    const superuser = new Pool({ connectionString: db.adminUrl, max: 1 });
    try {
      await expect(assertLoginRoles(superuser, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow();
    } finally {
      await superuser.end();
    }
  });
});
