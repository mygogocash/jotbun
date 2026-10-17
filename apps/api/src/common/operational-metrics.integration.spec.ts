// P6b queue-age metric against real PostgreSQL: the age of the oldest due job
// per kind, as each worker's own login sees it (security kinds stay invisible
// to a generic login). Feeds the "queue age over 5 minutes" alert line.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { queueAge, queueAgeLines } from './operational-metrics';

let db: TestDatabase;
let jobsPool: Pool;
let securityPool: Pool;

async function insertJob(kind: string, status: 'queued' | 'leased' | 'succeeded', runAfterSecondsAgo: number, leaseExpiredSecondsAgo?: number): Promise<string> {
  const id = randomUUID();
  await db.admin((client) =>
    client.query(
      `INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds, status, run_after,
                         lease_token, lease_expires_at, attempts, attempt_started_at, finished_at)
       VALUES ($1, $2, NULL, 0, '{}'::jsonb, 3, 900, $3, now() - make_interval(secs => $4),
               CASE WHEN $3 = 'leased' THEN gen_random_uuid() END,
               CASE WHEN $3 = 'leased' THEN now() - make_interval(secs => $5) END,
               CASE WHEN $3 = 'leased' THEN 1 ELSE 0 END,
               CASE WHEN $3 = 'leased' THEN now() - make_interval(secs => $5 + 30) END,
               CASE WHEN $3 = 'succeeded' THEN now() END)`,
      [id, kind, status, runAfterSecondsAgo, leaseExpiredSecondsAgo ?? 0],
    ),
  );
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  jobsPool = await db.loginPool(['gogospend_jobs']);
  securityPool = await db.loginPool(['gogospend_jobs', 'gogospend_security']);
});

afterAll(async () => {
  // drop() also ends the login pools.
  await db?.drop();
});

beforeEach(async () => {
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('queue age', () => {
  it('reports the oldest due job per kind, counting only due work', async () => {
    await insertJob('export', 'queued', 600);
    await insertJob('export', 'queued', 30);
    // Not due yet (a 24-hour expiry job, a retry backoff): never counted.
    await insertJob('import_expire', 'queued', -3_600);
    // Finished work is not a queue.
    await insertJob('sync_snapshot', 'succeeded', 7_200);
    const rows = await queueAge(jobsPool, ['export', 'import_expire', 'sync_snapshot']);
    expect(rows.map((row) => ({ ...row, oldestDueSeconds: row.oldestDueSeconds >= 600 && row.oldestDueSeconds < 660 ? 'about 600' : row.oldestDueSeconds }))).toEqual([
      { kind: 'export', due: 2, oldestDueSeconds: 'about 600' },
    ]);
    expect(queueAgeLines('job worker', rows).alerts).toHaveLength(1);
  });

  it('counts a job whose lease ran out (a crashed worker) from its lease expiry', async () => {
    await insertJob('export', 'leased', 3_600, 400);
    const rows = await queueAge(jobsPool, ['export']);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.kind).toBe('export');
    expect(row.due).toBe(1);
    expect(row.oldestDueSeconds).toBeGreaterThanOrEqual(400);
    expect(row.oldestDueSeconds).toBeLessThan(460);
  });

  it('a running job with a live lease is not waiting', async () => {
    await insertJob('export', 'leased', 3_600, -60);
    expect(await queueAge(jobsPool, ['export'])).toEqual([]);
  });

  it('a generic login never sees security kinds; the security login does', async () => {
    await insertJob('account_deletion', 'queued', 900);
    expect(await queueAge(jobsPool, ['account_deletion'])).toEqual([]);
    const rows = await queueAge(securityPool, ['account_deletion']);
    expect(rows.map((entry) => [entry.kind, entry.due])).toEqual([['account_deletion', 1]]);
    const [row] = rows;
    expect(row.oldestDueSeconds).toBeGreaterThanOrEqual(900);
  });
});
