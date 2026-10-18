import { randomBytes } from 'node:crypto';

import type { Pool } from 'pg';

import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { PostgresRateLimiter, RATE_BUDGETS } from './shared-rate-limit';

let db: TestDatabase;
let replicaA: PostgresRateLimiter;
let replicaB: PostgresRateLimiter;
let appPool: Pool;

beforeAll(async () => {
  db = await createTestDatabase();
  const key = randomBytes(32);
  appPool = await db.loginPool(['gogospend_app']);
  // Two API replicas: separate pools, same database and key.
  replicaA = new PostgresRateLimiter(appPool, key);
  replicaB = new PostgresRateLimiter(await db.loginPool(['gogospend_app']), key);
});

afterAll(async () => {
  await db?.drop();
});

describe('shared PostgreSQL rate limits', () => {
  it('two API replicas share one write budget per binding', async () => {
    const decisions = [];
    for (let i = 0; i < RATE_BUDGETS.write + 1; i++) {
      decisions.push(await (i % 2 === 0 ? replicaA : replicaB).consume('write', 'binding-shared'));
    }
    expect(decisions.slice(0, RATE_BUDGETS.write).every((decision) => decision.allowed)).toBe(true);
    const last = decisions[RATE_BUDGETS.write];
    expect(last.allowed).toBe(false);
    expect(last.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(last.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keeps budgets and subjects independent', async () => {
    expect((await replicaA.consume('read', 'binding-shared')).allowed).toBe(true);
    expect((await replicaA.consume('write', 'binding-other')).allowed).toBe(true);
  });

  it('enforces the small principal budget for challenge/bootstrap', async () => {
    const results = [];
    for (let i = 0; i < RATE_BUDGETS.auth_principal + 1; i++) results.push((await replicaB.consume('auth_principal', 'issuer\u0000auth0|someone')).allowed);
    expect(results.filter(Boolean)).toHaveLength(RATE_BUDGETS.auth_principal);
  });

  it('stores only keyed hashes, never raw subjects or addresses', async () => {
    await replicaA.consume('auth_network', '203.0.113.9');
    const rows = await db.admin((client) => client.query<{ bucket_key: string; window_start: Date; expires_at: Date }>('SELECT bucket_key, window_start, expires_at FROM rate_limit_buckets'));
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.bucket_key).toMatch(/^[0-9a-f]{64}$/);
      expect(row.expires_at.getTime() - row.window_start.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
    expect(JSON.stringify(rows.rows)).not.toMatch(/203\.0\.113\.9|binding-shared|auth0/);
  });

  it('purges expired buckets', async () => {
    await db.admin((client) =>
      client.query(`INSERT INTO rate_limit_buckets (bucket_key, window_start, hits, expires_at) VALUES ($1, now() - interval '2 days', 1, now() - interval '1 day')`, ['a'.repeat(64)]),
    );
    expect(await replicaA.purgeExpired()).toBeGreaterThanOrEqual(1);
    const left = await db.admin((client) => client.query(`SELECT 1 FROM rate_limit_buckets WHERE bucket_key = $1`, ['a'.repeat(64)]));
    expect(left.rows).toEqual([]);
  });

  it('the app role cannot read or write buckets except through the limiter routine', async () => {
    await expect(appPool.query('SELECT * FROM rate_limit_buckets')).rejects.toMatchObject({ code: '42501' });
    await expect(appPool.query(`DELETE FROM rate_limit_buckets`)).rejects.toMatchObject({ code: '42501' });
  });
});
