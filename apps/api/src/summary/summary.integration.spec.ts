import type { Pool } from 'pg';

import { authFixtures } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';
import { GOLDEN_TOTALS } from '../transactions/fixtures/golden-diary';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
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

describe('month summary', () => {
  it('reports the golden month: transfers and opening balances are not income or spending', async () => {
    const g = await money.golden();
    const res = await as(g.user).get('/v1/summary?month=2026-09');
    expect(res.status).toBe(200);
    const revision = (await db.admin((client) => client.query('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [g.user.accountId]))).rows[0].revision;
    expect(res.body).toEqual({
      month: '2026-09',
      income_minor: GOLDEN_TOTALS.income_minor,
      expense_minor: GOLDEN_TOTALS.expense_minor,
      balance_minor: '1555000',
      by_wallet: { [g.wallets.cash]: '-168200', [g.wallets.daily]: '1723200' },
      categories: expect.arrayContaining([
        { category_id: builtinId(g.user, 'salary'), type: 'income', total_minor: '2800000' },
        { category_id: builtinId(g.user, 'food'), type: 'expense', total_minor: '18200' },
        { category_id: builtinId(g.user, 'bills'), type: 'expense', total_minor: '1226800' },
      ]),
      budget: null,
      as_of_revision: revision,
    });
    expect(res.body.categories).toHaveLength(3);
  });

  it('budget usage counts every expense, capped or not, and never transfers', async () => {
    const g = await money.golden();
    await as(g.user).put('/v1/budgets/2026-09', { overall_limit_minor: '1000000', category_limits: [{ category_id: builtinId(g.user, 'food'), limit_minor: '50000' }] });
    const { budget } = (await as(g.user).get('/v1/summary?month=2026-09')).body;
    expect(budget).toEqual({
      overall_limit_minor: '1000000',
      spent_minor: '1245000',
      remaining_minor: '-245000',
      categories: [{ category_id: builtinId(g.user, 'food'), limit_minor: '50000', spent_minor: '18200', remaining_minor: '31800' }],
    });
  });

  it('uses Bangkok calendar months: the last and first day of a month or year belong to their own month', async () => {
    const user = await money.member();
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2025-01-01' });
    const food = builtinId(user, 'food');
    await money.bulkRecords(user, [
      { type: 'expense', amount_minor: '1', occurred_on: '2025-11-30', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '10', occurred_on: '2025-12-01', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '100', occurred_on: '2025-12-31', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '1000', occurred_on: '2026-01-01', wallet_id: wallet, category_id: food },
    ]);
    expect((await as(user).get('/v1/summary?month=2025-12')).body.expense_minor).toBe('110');
    expect((await as(user).get('/v1/summary?month=2026-01')).body.expense_minor).toBe('1000');
    expect((await as(user).get('/v1/summary?month=2025-11')).body.expense_minor).toBe('1');
  });

  it('excludes deleted records and keeps renamed or archived categories', async () => {
    const g = await money.golden();
    const food = builtinId(g.user, 'food');
    await as(g.user).patch(`/v1/categories/${food}`, { label: 'Meals' }, { ifMatch: 1 });
    await as(g.user).post(`/v1/categories/${food}/archive`, {}, { ifMatch: 2 });
    await as(g.user).raw('delete', `/v1/transactions/${g.records[2]}`, {}, { 'idempotency-key': crypto.randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': '"1"' });
    const body = (await as(g.user).get('/v1/summary?month=2026-09')).body;
    expect(body.expense_minor).toBe('18200');
    expect(body.categories).toContainEqual({ category_id: food, type: 'expense', total_minor: '18200' });
  });

  it('an empty month is all zeros, and the month must be YYYY-MM', async () => {
    const user = await money.member();
    expect((await as(user).get('/v1/summary?month=2030-01')).body).toMatchObject({ income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {}, categories: [], budget: null });
    expect((await as(user).get('/v1/summary?month=2026-13')).status).toBe(422);
    expect((await as(user).get('/v1/summary')).status).toBe(422);
  });
});
