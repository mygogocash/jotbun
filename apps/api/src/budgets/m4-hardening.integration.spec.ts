// Regression tests for the independent M4 review findings.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { DatabaseService } from '../database/database.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;

const MONTH = '2026-09';
const withLimits = (user: SignedUp, overall: string, limits: [string, string][]) => ({
  overall_limit_minor: overall,
  category_limits: limits.map(([key, limit]) => ({ category_id: builtinId(user, key as 'food'), limit_minor: limit })),
});

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 8);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('account deletion with budgets', () => {
  it('deleting an account removes its budgets and sublimits', async () => {
    const user = await money.member();
    await as(user).put(`/v1/budgets/${MONTH}`, withLimits(user, '1000', [['food', '600']]));
    await db.admin((client) => client.query('DELETE FROM accounts WHERE id = $1', [user.accountId]));
    const left = (await db.admin((client) => client.query('SELECT count(*)::int AS n FROM budget_category_limits WHERE account_id = $1', [user.accountId]))).rows[0].n;
    expect(left).toBe(0);
  });

  it('a deletion routine run by a worker role that cannot read budgets still succeeds', async () => {
    const user = await money.member();
    await as(user).put(`/v1/budgets/${MONTH}`, withLimits(user, '1000', [['food', '600']]));
    await db.admin(async (client) => {
      await client.query(`CREATE OR REPLACE FUNCTION test_delete_account(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$ DELETE FROM public.accounts WHERE id = p $$`);
      await client.query('GRANT EXECUTE ON FUNCTION test_delete_account(uuid) TO gogospend_jobs');
    });
    const worker = await db.loginPool(['gogospend_jobs'], 1);
    await expect(worker.query('SELECT test_delete_account($1)', [user.accountId])).resolves.toBeDefined();
  });
});

describe('the sublimit backstop under concurrency', () => {
  it('a parent lowering and a child insert committing together cannot leave sublimits above the overall limit', async () => {
    const service = new DatabaseService(pool);
    for (let round = 0; round < 5; round += 1) {
      const user = await money.member();
      expect((await as(user).put(`/v1/budgets/${MONTH}`, withLimits(user, '1000', [['food', '600']]))).status).toBe(200);
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let ready = 0;
      const arrived = () => {
        ready += 1;
        if (ready === 2) release();
        return barrier;
      };
      const results = await Promise.allSettled([
        service.withOwnerTransaction(user.session, async (tx) => {
          await tx.query(`UPDATE monthly_budgets SET overall_limit_minor = 600 WHERE month = DATE '2026-09-01'`);
          await arrived();
        }),
        service.withOwnerTransaction(user.session, async (tx) => {
          await tx.query(`INSERT INTO budget_category_limits (account_id, month, category_id, limit_minor) VALUES ($1, DATE '2026-09-01', $2, 400)`, [user.accountId, builtinId(user, 'bills')]);
          await arrived();
        }),
      ]);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const [state] = (await db.admin((client) => client.query(
        `SELECT b.overall_limit_minor::text AS overall, (SELECT coalesce(sum(limit_minor), 0)::text FROM budget_category_limits l WHERE l.account_id = b.account_id AND l.month = b.month) AS limits
           FROM monthly_budgets b WHERE b.account_id = $1`,
        [user.accountId],
      ))).rows;
      expect(BigInt(state.limits) <= BigInt(state.overall)).toBe(true);
    }
  });
});

describe('budget and read-model edges', () => {
  it('replacing a month that has no budget is NOT_FOUND; a stale replace carries the current budget', async () => {
    const user = await money.member();
    expect((await as(user).put('/v1/budgets/2026-11', withLimits(user, '1000', []), { ifMatch: 1 })).status).toBe(404);
    await as(user).put(`/v1/budgets/${MONTH}`, withLimits(user, '1000', []));
    const stale = await as(user).put(`/v1/budgets/${MONTH}`, withLimits(user, '2000', []), { ifMatch: 9 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ month: MONTH, version: 1 });
  });

  it('category_limits must be a list when present', async () => {
    const user = await money.member();
    const res = await as(user).put(`/v1/budgets/${MONTH}`, { overall_limit_minor: '1000', category_limits: null });
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('category_limits');
  });

  it('a cursor carrying an impossible date is a 422, never a 500', async () => {
    const user = await money.member();
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' });
    await money.bulkRecords(user, Array.from({ length: 3 }, () => ({ type: 'expense' as const, amount_minor: '1', occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') })));
    const range = 'from=2026-01-01&through=2026-12-31&limit=1';
    const cursor = (await as(user).get(`/v1/history?${range}`)).body.next_cursor as string;
    for (const bad of ['2026-02-30', '0000-01-01', '2026-13-01']) {
      const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString()), d: bad })).toString('base64url');
      const res = await as(user).get(`/v1/history?${range}&cursor=${forged}`);
      expect(res.status).toBe(422);
      expect(res.body.fields).toHaveProperty('cursor');
    }
  });

  it('a history date before 1970 is INVALID_DATE, and the summary refuses unknown parameters', async () => {
    const user = await money.member();
    expect((await as(user).get('/v1/history?from=1969-12-31&through=2026-12-31')).body).toMatchObject({ code: 'INVALID_DATE', fields: { from: expect.any(String) } });
    const res = await as(user).get(`/v1/summary?month=${MONTH}&owner_id=${randomUUID()}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNKNOWN_FIELD');
  });

  it('history and summary read from one REPEATABLE READ, READ ONLY snapshot', async () => {
    const user = await money.member();
    const database = v1.app.get(DatabaseService);
    const spy = jest.spyOn(database, 'withOwnerTransaction');
    try {
      await as(user).get('/v1/history?from=2026-01-01&through=2026-12-31');
      await as(user).get(`/v1/summary?month=${MONTH}`);
      const snapshotCalls = spy.mock.calls.filter((call) => call[0].accountId === user.accountId && call[2]?.snapshot === true);
      expect(snapshotCalls).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
    const settings = await new DatabaseService(pool).withOwnerTransaction(user.session, (tx) => tx.query<{ iso: string; ro: string }>(
      `SELECT current_setting('transaction_isolation') AS iso, current_setting('transaction_read_only') AS ro`,
    ), { snapshot: true });
    expect(settings[0]).toEqual({ iso: 'repeatable read', ro: 'on' });
  });

  it('budget usage keeps a sublimit whose category was archived later', async () => {
    const g = await money.golden();
    const food = builtinId(g.user, 'food');
    await as(g.user).put(`/v1/budgets/${MONTH}`, withLimits(g.user, '2000000', [['food', '50000']]));
    await as(g.user).post(`/v1/categories/${food}/archive`, {}, { ifMatch: 1 });
    const { budget } = (await as(g.user).get(`/v1/summary?month=${MONTH}`)).body;
    expect(budget.categories).toEqual([{ category_id: food, limit_minor: '50000', spent_minor: '18200', remaining_minor: '31800' }]);
  });
});
