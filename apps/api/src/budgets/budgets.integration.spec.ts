import { randomUUID } from 'node:crypto';

import { isBudgetSnapshot } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { derivedUuid } from '../commands/derived-id';
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
const budget = (user: SignedUp, overall = '1000000', limits: [string, string][] = [['food', '50000']]) => ({
  overall_limit_minor: overall,
  category_limits: limits.map(([key, limit]) => ({ category_id: key.length === 36 ? key : builtinId(user, key as 'food'), limit_minor: limit })),
});

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

describe('setting a monthly budget', () => {
  it('creates the month budget once, then replaces it with the current version', async () => {
    const user = await money.member();
    const created = await as(user).put(`/v1/budgets/${MONTH}`, budget(user));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ outcome: 'created', version: 1, entity_id: derivedUuid(user.accountId, 'monthly-budget', MONTH) });
    const got = await as(user).get(`/v1/budgets/${MONTH}`);
    expect(got.body).toEqual({ id: created.body.entity_id, month: MONTH, overall_limit_minor: '1000000', category_limits: [{ category_id: builtinId(user, 'food'), limit_minor: '50000' }], version: 1 });
    expect(isBudgetSnapshot(got.body)).toBe(true);
    const replaced = await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '900000', [['bills', '400000'], ['food', '60000']]), { ifMatch: 1 });
    expect(replaced.body).toMatchObject({ outcome: 'updated', version: 2 });
    const after = (await as(user).get(`/v1/budgets/${MONTH}`)).body;
    expect(after.category_limits.map((limit: { limit_minor: string }) => limit.limit_minor).sort()).toEqual(['400000', '60000']);
    expect((await as(user).get('/v1/budgets/2026-10')).status).toBe(404);
  });

  it('a second create for the month, or a stale replace, is VERSION_CONFLICT with the current budget; replacing a missing month is NOT_FOUND', async () => {
    const user = await money.member();
    await as(user).put(`/v1/budgets/${MONTH}`, budget(user));
    const again = await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'));
    expect(again.status).toBe(409);
    expect(again.body.current).toMatchObject({ month: MONTH, version: 1 });
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'), { ifMatch: 7 })).status).toBe(409);
    // Replacing a month with no budget is NOT_FOUND (review fix), not a conflict.
    expect((await as(user).put('/v1/budgets/2026-11', budget(user), { ifMatch: 1 })).status).toBe(404);
  });

  it('two devices creating the same month at once: exactly one wins', async () => {
    const user = await money.member();
    const results = await Promise.all([as(user).put(`/v1/budgets/${MONTH}`, budget(user)), as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'))]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  it.each([
    ['overall_limit_minor', { overall_limit_minor: '0' }, 'MINOR_OUT_OF_RANGE'],
    ['overall_limit_minor', { overall_limit_minor: '100000000000' }, 'MINOR_OUT_OF_RANGE'],
    ['overall_limit_minor', { overall_limit_minor: 5 }, 'INVALID_MINOR'],
  ])('refuses %s %p', async (field, overrides, code) => {
    const user = await money.member();
    const res = await as(user).put(`/v1/budgets/${MONTH}`, { ...budget(user), ...overrides });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code, fields: { [field]: expect.any(String) } });
  });

  it('refuses invalid sublimits: zero, duplicate categories, sums above the overall limit', async () => {
    const user = await money.member();
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '0']]))).body.code).toBe('MINOR_OUT_OF_RANGE');
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '10'], ['food', '20']]))).body.fields).toHaveProperty('category_limits');
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600'], ['bills', '401']]))).body.fields).toHaveProperty('category_limits');
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600'], ['bills', '400']]))).status).toBe(200);
    // Lowering the overall limit below the sublimits is refused too.
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '999', [['food', '600'], ['bills', '400']]), { ifMatch: 1 })).body.fields).toHaveProperty('category_limits');
  });

  it('sublimits need owned, active expense categories', async () => {
    const user = await money.member();
    const other = await money.member();
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['salary', '10']]))).body.fields).toHaveProperty('category_limits');
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [[builtinId(other, 'food'), '10']]))).body.fields).toHaveProperty('category_limits');
    await as(user).post(`/v1/categories/${builtinId(user, 'fun')}/archive`, {}, { ifMatch: 1 });
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['fun', '10']]))).body.fields).toHaveProperty('category_limits');
    expect((await as(user).put(`/v1/budgets/${MONTH}`, { ...budget(user), extra: 1 })).body.code).toBe('UNKNOWN_FIELD');
  });

  it('keeps a limit for a category renamed or archived after it was set', async () => {
    const user = await money.member();
    const pets = randomUUID();
    await as(user).post('/v1/categories', { id: pets, type: 'expense', label: 'Pets' });
    await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [[pets, '100']]));
    await as(user).patch(`/v1/categories/${pets}`, { label: 'Animals' }, { ifMatch: 1 });
    await as(user).post(`/v1/categories/${pets}/archive`, {}, { ifMatch: 2 });
    expect((await as(user).get(`/v1/budgets/${MONTH}`)).body.category_limits).toEqual([{ category_id: pets, limit_minor: '100' }]);
    // Re-setting the same budget keeps the archived category (not a new reference).
    expect((await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000', [[pets, '100']]), { ifMatch: 1 })).status).toBe(200);
  });

  it.each([['2026-13'], ['2026-9'], ['1969-12'], ['september']])('refuses the month %s', async (month) => {
    const user = await money.member();
    const res = await as(user).put(`/v1/budgets/${month}`, budget(user));
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('month');
  });

  it("another account's budget is NOT_FOUND", async () => {
    const owner = await money.member();
    const other = await money.member();
    await as(owner).put(`/v1/budgets/${MONTH}`, budget(owner));
    expect((await as(other).get(`/v1/budgets/${MONTH}`)).status).toBe(404);
  });
});

describe('the database backstop', () => {
  it('refuses, at commit, sublimits that add up to more than the overall limit, from either side', async () => {
    const user = await money.member();
    await as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600']]));
    const service = new DatabaseService(pool);
    await expect(service.withOwnerTransaction(user.session, (tx) => tx.query(
      `INSERT INTO budget_category_limits (account_id, month, category_id, limit_minor) VALUES ($1, DATE '2026-09-01', $2, 401)`,
      [user.accountId, builtinId(user, 'bills')],
    ))).rejects.toMatchObject({ code: '23514' });
    await expect(service.withOwnerTransaction(user.session, (tx) => tx.query(
      `UPDATE monthly_budgets SET overall_limit_minor = 599 WHERE month = DATE '2026-09-01'`,
    ))).rejects.toMatchObject({ code: '23514' });
    await expect(service.withOwnerTransaction(user.session, (tx) => tx.query(
      `INSERT INTO budget_category_limits (account_id, month, category_id, limit_minor) VALUES ($1, DATE '2026-09-01', $2, 1)`,
      [user.accountId, builtinId(user, 'salary')],
    ))).rejects.toMatchObject({ code: '23503' });
  });
});
