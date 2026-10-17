// P1 review fixes: the database enforces job transitions for every login,
// logins are checked by their exact memberships, and the worker loop
// survives transient errors and stops cleanly.
import { randomUUID } from 'node:crypto';
import { getEventListeners } from 'node:events';

import { Pool } from 'pg';

import { DatabaseService } from '../database/database.service';
import { ObjectPublicationService } from '../storage/object-publication.service';
import { MemoryObjectStore } from '../storage/object-store';
import { queueAccountJob } from '../testing/job-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { HandlerRegistry } from './handler-registry';
import { JobRepository } from './job.repository';
import { JobWorker } from './worker';
import { assertLoginRoles } from './worker-login';

let db: TestDatabase;
let jobsPool: Pool;
let jobs: JobRepository;

const account = async (): Promise<string> => {
  const id = randomUUID();
  await db.admin(async (client) => {
    await client.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
    await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [id]);
  });
  return id;
};
const generic = async (options: { maxRuntimeSeconds?: number } = {}) => {
  const id = randomUUID();
  await jobs.enqueue({ id, kind: 'test_task', accountId: null, payload: {}, maxAttempts: 3, maxRuntimeSeconds: options.maxRuntimeSeconds });
  return id;
};
const statusOf = async (id: string) => (await db.admin((client) => client.query('SELECT status, attempts, last_error FROM jobs WHERE id = $1', [id]))).rows[0];
const ownerCtx = (accountId: string) => ({ accountId, subject: 'x', clientId: 'native', bindingId: randomUUID(), sessionGeneration: 0 });
const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'error');

beforeAll(async () => {
  db = await createTestDatabase();
  jobsPool = await db.loginPool(['gogospend_jobs'], 4);
  jobs = new JobRepository(jobsPool);
});

afterAll(async () => {
  await db?.drop();
});

beforeEach(async () => {
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('the database guards job transitions', () => {
  it('the worker login cannot create jobs a user starts, for any account', async () => {
    const owner = await account();
    for (const kind of ['sync_snapshot', 'export']) {
      expect(await code(jobs.enqueue({ id: randomUUID(), kind, accountId: owner, payload: {}, maxAttempts: 3 }))).toBe('42501');
    }
  });

  it('a lease can only be taken by a claim: no forged token, revival or moved runtime start', async () => {
    const queued = await generic();
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'leased', lease_token = gen_random_uuid(), lease_expires_at = now() + interval '1 hour', attempt_started_at = now() WHERE id = $1`, [queued]))).toBe('42501');
    const [claimed] = await jobs.claim(['test_task']);
    expect(await code(jobsPool.query('UPDATE jobs SET lease_token = gen_random_uuid() WHERE id = $1', [queued]))).toBe('42501');
    expect(await code(jobsPool.query(`UPDATE jobs SET attempt_started_at = now() + interval '1 hour' WHERE id = $1`, [queued]))).toBe('42501');
    expect(await code(jobsPool.query(`UPDATE jobs SET lease_expires_at = now() + interval '2 hours' WHERE id = $1`, [queued]))).toBe('42501');
    expect(await jobs.complete(claimed.lease)).toBe(true);
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'queued', run_after = now() WHERE id = $1`, [queued]))).toBe('42501');
    expect(await code(jobsPool.query(`UPDATE jobs SET status = 'leased', lease_token = gen_random_uuid(), lease_expires_at = now() + interval '1 minute', attempts = attempts + 1, attempt_started_at = now() WHERE id = $1`, [queued]))).toBe('42501');
    expect((await statusOf(queued)).status).toBe('succeeded');
  });

  it('an expired lease that nobody reclaimed can no longer complete or fail', async () => {
    await generic();
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 30 });
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await jobs.complete(claimed.lease)).toBe(false);
    expect(await jobs.fail(claimed.lease, { code: 'late', retryable: true })).toBe(false);
    expect((await statusOf(claimed.lease.jobId)).status).toBe('leased');
  });

  it('a heartbeat never shortens a lease', async () => {
    await generic({ maxRuntimeSeconds: 600 });
    const [claimed] = await jobs.claim(['test_task'], { leaseSeconds: 300 });
    const extended = await jobs.heartbeat(claimed.lease, 30);
    expect(new Date(extended as string).getTime()).toBeGreaterThanOrEqual(new Date(claimed.lease.deadline).getTime());
  });

  it('a lock attempt with a stale token does not take the account lock', async () => {
    const owner = await account();
    const id = await queueAccountJob(db, owner, 'sync_snapshot');
    await jobs.claim(['sync_snapshot']);
    const client = await jobsPool.connect();
    try {
      await client.query('BEGIN');
      expect((await client.query('SELECT gogospend_lock_current_job($1, $2) AS ok', [id, randomUUID()])).rows[0].ok).toBe(false);
      const free = await db.admin((admin) => code(admin.query(`SET lock_timeout = '200ms'; SELECT 1 FROM account_sync_state WHERE account_id = '${owner}' FOR UPDATE`)));
      expect(free).toBe('ok');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('the app enqueue routine waits for the account lock', async () => {
    const owner = await account();
    const service = new DatabaseService(await db.loginPool(['gogospend_app'], 2));
    const holder = new Pool({ connectionString: db.adminUrl, max: 1 });
    const lock = await holder.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [owner]);
      let done = false;
      const enqueued = service.withOwnerTransaction(ownerCtx(owner), (tx) => tx.query(`SELECT gogospend_enqueue_account_job($1, 'export', '{}'::jsonb, 3, 120)`, [randomUUID()])).then(() => (done = true));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(done).toBe(false);
      await lock.query('COMMIT');
      await enqueued;
      expect(done).toBe(true);
    } finally {
      lock.release();
      await holder.end();
    }
  });

  it('late output stays unpublished when the app cancels while the publisher waits on the account lock', async () => {
    const owner = await account();
    await queueAccountJob(db, owner, 'sync_snapshot', { maxRuntimeSeconds: 60 });
    const [claimed] = await jobs.claim(['sync_snapshot']);
    const store = new MemoryObjectStore();
    const publication = new ObjectPublicationService(jobsPool, store);
    const key = await publication.reserve(claimed.lease, 'sync_snapshot', 'late.json');
    const put = await store.putStream(key, new TextEncoder().encode('late'));
    const service = new DatabaseService(await db.loginPool(['gogospend_app'], 2));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // The app's lifecycle transition holds the account lock while it cancels.
    const cancel = service.withOwnerTransaction(ownerCtx(owner), async (tx) => {
      const [row] = await tx.query<{ n: number }>('SELECT gogospend_cancel_account_jobs() AS n');
      await held;
      return row.n;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const finishing = publication.finishWithObjects(jobs, claimed.lease, [{ key, ...put }], new Date(Date.now() + 3_600_000));
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    expect(await cancel).toBe(1);
    expect(await finishing).toBe(false);
    expect((await db.admin((client) => client.query(`SELECT status FROM object_publications WHERE key = $1`, [key]))).rows[0].status).toBe('reserved');
  });
});

describe('login checks use exact memberships', () => {
  it('refuses a login with an extra membership, even a non-inheriting one, or CREATEROLE', async () => {
    const pool = await db.loginPool(['gogospend_jobs'], 1);
    const [{ login }] = (await pool.query<{ login: string }>('SELECT current_user AS login')).rows;
    await expect(assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL')).resolves.toBeUndefined();
    await db.admin((client) => client.query(`GRANT gogospend_app TO ${login} WITH INHERIT FALSE`));
    await expect(assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow(/DATABASE_URL/);
    await db.admin((client) => client.query(`REVOKE gogospend_app FROM ${login}; GRANT pg_read_all_data TO ${login}`));
    await expect(assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow();
    await db.admin((client) => client.query(`REVOKE pg_read_all_data FROM ${login}; ALTER ROLE ${login} CREATEROLE`));
    await expect(assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL')).rejects.toThrow();
    await db.admin((client) => client.query(`ALTER ROLE ${login} NOCREATEROLE`));
    await expect(assertLoginRoles(pool, ['gogospend_jobs'], 'DATABASE_URL')).resolves.toBeUndefined();
  });
});

describe('the worker loop', () => {
  it('keeps running a handler through a transient heartbeat error', async () => {
    await generic({ maxRuntimeSeconds: 60 });
    let failures = 1;
    const flaky = Object.create(jobs) as JobRepository;
    flaky.extend = async (lease, seconds) => {
      if (failures-- > 0) throw new Error('connection reset');
      return jobs.extend(lease, seconds);
    };
    let aborted = false;
    const registry = new HandlerRegistry().register('test_task', async (job) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      aborted = job.lease.signal.aborted;
      await jobs.complete(job.lease);
    });
    await new JobWorker(flaky, registry, { leaseSeconds: 10, heartbeatMs: 400 }).runOnce();
    expect(aborted).toBe(false);
  });

  it('aborts the handler once its lease is lost (cancelled)', async () => {
    const owner = await account();
    await queueAccountJob(db, owner, 'export', { maxRuntimeSeconds: 60 });
    let sawAbort = false;
    const registry = new HandlerRegistry().register('export', async (job) => {
      await jobs.cancelAccount(owner);
      sawAbort = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 3_000);
        job.lease.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    });
    await new JobWorker(jobs, registry, { leaseSeconds: 10, heartbeatMs: 300 }).runOnce();
    expect(sawAbort).toBe(true);
  });

  it('stopping the worker aborts the running handler and requeues its job', async () => {
    const id = await generic({ maxRuntimeSeconds: 60 });
    const stop = new AbortController();
    const registry = new HandlerRegistry().register('test_task', async (job) => {
      stop.abort();
      await new Promise<void>((resolve, reject) => {
        if (job.lease.signal.aborted) return reject(new Error('stopped'));
        const timer = setTimeout(resolve, 3_000);
        job.lease.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('stopped'));
        });
      });
    });
    const started = Date.now();
    await new JobWorker(jobs, registry, { leaseSeconds: 10, heartbeatMs: 1_000 }).runUntil(stop.signal, 50);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await statusOf(id)).toMatchObject({ status: 'queued', last_error: 'worker_stopped' });
  });

  it('idle polling does not accumulate listeners, and heartbeats leave the safety margin', async () => {
    const stop = new AbortController();
    const worker = new JobWorker(jobs, new HandlerRegistry().register('test_task', async () => undefined), { leaseSeconds: 10, heartbeatMs: 1_000 });
    const running = worker.runUntil(stop.signal, 5);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(getEventListeners(stop.signal, 'abort').length).toBeLessThanOrEqual(1);
    stop.abort();
    await running;
    expect(() => new JobWorker(jobs, new HandlerRegistry(), { leaseSeconds: 30, heartbeatMs: 29_000 })).toThrow(RangeError);
  });
});
