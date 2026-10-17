import { randomUUID } from 'node:crypto';

import { bangkokDate, isTransactionSnapshot } from '@gogospend/contracts';
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

const today = () => bangkokDate(new Date());
const tomorrow = () => bangkokDate(new Date(Date.now() + 86_400_000));

type Setup = { user: SignedUp; cash: string; daily: string; expense: (overrides?: Record<string, unknown>) => Record<string, unknown> };

async function setup(): Promise<Setup> {
  const user = await money.member();
  const cash = await money.wallet(user, { name: 'Cash', opening_minor: '100000', tracking_start: '2026-09-01' });
  const daily = await money.wallet(user, { name: 'Daily', opening_minor: '0', tracking_start: '2026-09-15' });
  const expense = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides });
  return { user, cash, daily, expense };
}

const transfer = (s: Setup, overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'transfer', amount_minor: '1000', occurred_on: '2026-09-20', source_wallet_id: s.cash, destination_wallet_id: s.daily, ...overrides });
const codeOf = (res: { body: { code?: string } }) => res.body.code;

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

describe('recording expenses and income', () => {
  it('records an expense and an income, and wallet balances follow', async () => {
    const s = await setup();
    const coffee = s.expense({ note: ' flat white ', merchant: 'Cafe' });
    const res = await as(s.user).post('/v1/transactions', coffee);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ entity_id: coffee.id, version: 1, outcome: 'created', entity_state: 'active' });
    const got = await as(s.user).get(`/v1/transactions/${coffee.id}`);
    expect(got.body).toEqual({ id: coffee.id, type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: s.cash, category_id: builtinId(s.user, 'food'), note: 'flat white', merchant: 'Cafe', deleted_at: null, version: 1 });
    expect(isTransactionSnapshot(got.body)).toBe(true);
    await money.record(s.user, { type: 'income', amount_minor: '50000', occurred_on: '2026-09-21', wallet_id: s.cash, category_id: builtinId(s.user, 'salary') });
    expect((await money.balances(s.user))[s.cash]).toBe('143500');
  });

  it('two identical coffees with different ids and keys are both kept', async () => {
    const s = await setup();
    await money.record(s.user, s.expense());
    await money.record(s.user, s.expense());
    expect((await money.balances(s.user))[s.cash]).toBe('87000');
  });

  it.each([
    ['0', 'MINOR_OUT_OF_RANGE'],
    ['-6500', 'MINOR_OUT_OF_RANGE'],
    ['100000000000', 'MINOR_OUT_OF_RANGE'],
    ['65.00', 'INVALID_MINOR'],
    [6500, 'INVALID_MINOR'],
  ])('refuses the amount %p (%s)', async (amount, code) => {
    const s = await setup();
    const res = await as(s.user).post('/v1/transactions', s.expense({ amount_minor: amount }));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code, fields: { amount_minor: expect.any(String) } });
  });

  it('accepts the largest amount and lets balances go negative', async () => {
    const s = await setup();
    await money.record(s.user, s.expense({ amount_minor: '99999999999' }));
    expect((await money.balances(s.user))[s.cash]).toBe('-99999899999');
  });

  it.each([
    ['2026-02-30', 'INVALID_DATE'],
    ['2026-08-31', 'DATE_BEFORE_TRACKING_START'],
  ])('refuses the date %s (%s)', async (date, code) => {
    const s = await setup();
    const res = await as(s.user).post('/v1/transactions', s.expense({ occurred_on: date }));
    expect(res.body).toMatchObject({ code, fields: { occurred_on: expect.any(String) } });
  });

  it("accepts today's Bangkok date but not tomorrow", async () => {
    const s = await setup();
    expect((await as(s.user).post('/v1/transactions', s.expense({ occurred_on: today() }))).status).toBe(201);
    expect(codeOf(await as(s.user).post('/v1/transactions', s.expense({ occurred_on: tomorrow() })))).toBe('DATE_IN_FUTURE');
  });

  it('an expense needs an owned, active expense category and an owned, active wallet', async () => {
    const s = await setup();
    const other = await setup();
    const wrongType = await as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(s.user, 'salary') }));
    expect(wrongType.status).toBe(422);
    expect(wrongType.body.fields).toHaveProperty('category_id');
    expect((await as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(other.user, 'food') }))).body.fields).toHaveProperty('category_id');
    expect((await as(s.user).post('/v1/transactions', s.expense({ wallet_id: other.cash }))).body.fields).toHaveProperty('wallet_id');
    expect((await as(s.user).post(`/v1/categories/${builtinId(s.user, 'fun')}/archive`, {}, { ifMatch: 1 })).status).toBe(200);
    expect((await as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(s.user, 'fun') }))).body.fields).toHaveProperty('category_id');
    const empty = await money.wallet(s.user, { opening_minor: '0' });
    await as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 });
    expect((await as(s.user).post('/v1/transactions', s.expense({ wallet_id: empty }))).body.fields).toHaveProperty('wallet_id');
  });

  it.each([
    ['source_wallet_id', { source_wallet_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['owner_id', { owner_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['account_id', { account_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['type', { type: 'refund' }, 'VALIDATION_FAILED'],
    ['wallet_id', { wallet_id: undefined }, 'VALIDATION_FAILED'],
    ['id', { id: 'not-a-uuid' }, 'VALIDATION_FAILED'],
  ])('refuses an invalid union branch or field: %s', async (_field, overrides, code) => {
    const s = await setup();
    expect(codeOf(await as(s.user).post('/v1/transactions', s.expense(overrides)))).toBe(code);
  });

  it('normalizes optional note and merchant; empty means none', async () => {
    const s = await setup();
    for (const blank of ['', '   ', null, undefined]) {
      const body = s.expense({ note: blank, merchant: blank });
      await money.record(s.user, body);
      expect((await as(s.user).get(`/v1/transactions/${body.id}`)).body).toMatchObject({ note: null, merchant: null });
    }
    const multiline = s.expense({ note: 'line one\r\nline two' });
    await money.record(s.user, multiline);
    expect((await as(s.user).get(`/v1/transactions/${multiline.id}`)).body.note).toBe('line one\nline two');
    expect((await as(s.user).post('/v1/transactions', s.expense({ note: 'n'.repeat(500) }))).status).toBe(201);
    expect((await as(s.user).post('/v1/transactions', s.expense({ note: 'n'.repeat(501) }))).body.fields).toHaveProperty('note');
    expect((await as(s.user).post('/v1/transactions', s.expense({ merchant: 'm'.repeat(121) }))).body.fields).toHaveProperty('merchant');
    expect((await as(s.user).post('/v1/transactions', s.expense({ merchant: 'two\nlines' }))).body.fields).toHaveProperty('merchant');
  });
});

describe('transfers', () => {
  it('moves money between two owned wallets in one record', async () => {
    const s = await setup();
    const body = transfer(s);
    await money.record(s.user, body);
    expect((await as(s.user).get(`/v1/transactions/${body.id}`)).body).toMatchObject({ type: 'transfer', source_wallet_id: s.cash, destination_wallet_id: s.daily });
    const balances = await money.balances(s.user);
    expect([balances[s.cash], balances[s.daily]]).toEqual(['99000', '1000']);
  });

  it('refuses the same wallet, foreign or archived wallets, categories, and dates before either tracking start', async () => {
    const s = await setup();
    const other = await setup();
    expect((await as(s.user).post('/v1/transactions', transfer(s, { destination_wallet_id: s.cash }))).body.fields).toHaveProperty('destination_wallet_id');
    expect((await as(s.user).post('/v1/transactions', transfer(s, { destination_wallet_id: other.daily }))).body.fields).toHaveProperty('destination_wallet_id');
    expect(codeOf(await as(s.user).post('/v1/transactions', { ...transfer(s), category_id: builtinId(s.user, 'food') }))).toBe('UNKNOWN_FIELD');
    // Daily starts tracking on 2026-09-15.
    expect(codeOf(await as(s.user).post('/v1/transactions', transfer(s, { occurred_on: '2026-09-10' })))).toBe('DATE_BEFORE_TRACKING_START');
    const empty = await money.wallet(s.user, { opening_minor: '0' });
    await as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 });
    expect((await as(s.user).post('/v1/transactions', transfer(s, { source_wallet_id: empty }))).body.fields).toHaveProperty('source_wallet_id');
  });
});

describe('edit, delete and restore', () => {
  it('edits need the current version; a stale edit is VERSION_CONFLICT with the current record', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    const edited = await as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '7000', note: 'large' }, { ifMatch: 1 });
    expect(edited.body).toMatchObject({ outcome: 'updated', version: 2 });
    const stale = await as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ id: coffee.id, amount_minor: '7000', note: 'large', version: 2 });
    expect(codeOf(await as(s.user).patch(`/v1/transactions/${coffee.id}`, { type: 'income' }, { ifMatch: 2 }))).toBe('UNKNOWN_FIELD');
    expect(codeOf(await as(s.user).patch(`/v1/transactions/${coffee.id}`, { source_wallet_id: s.daily }, { ifMatch: 2 }))).toBe('UNKNOWN_FIELD');
    expect((await money.balances(s.user))[s.cash]).toBe('93000');
  });

  it('delete hides the record from balances at once; restore within 30 days brings it back', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    const deleted = await as(s.user).raw('delete', `/v1/transactions/${coffee.id}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': '"1"' });
    expect(deleted.body).toMatchObject({ outcome: 'deleted', entity_state: 'deleted', version: 2 });
    expect((await as(s.user).get(`/v1/transactions/${coffee.id}`)).body.deleted_at).toEqual(expect.any(String));
    expect((await money.balances(s.user))[s.cash]).toBe('100000');
    expect(codeOf(await as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 2 }))).toBe('ENTITY_DELETED');
    const restored = await as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 });
    expect(restored.body).toMatchObject({ outcome: 'restored', entity_state: 'active', version: 3 });
    expect((await money.balances(s.user))[s.cash]).toBe('93500');
    expect((await as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 3 })).status).toBe(422);
  });

  it('restore fails after 30 days, and while a referenced wallet or category is archived', async () => {
    const s = await setup();
    const del = (id: string, version: number) => as(s.user).raw('delete', `/v1/transactions/${id}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': `"${version}"` });
    const old = s.expense();
    await money.record(s.user, old);
    await del(old.id as string, 1);
    await db.admin((client) => client.query(`UPDATE transactions SET deleted_at = now() - interval '31 days' WHERE id = $1`, [old.id]));
    const expired = await as(s.user).post(`/v1/transactions/${old.id}/restore`, {}, { ifMatch: 2 });
    expect(expired.status).toBe(409);
    expect(expired.body).toMatchObject({ code: 'ENTITY_DELETED', message_key: 'errors.restore_expired' });

    const pets = randomUUID();
    await as(s.user).post('/v1/categories', { id: pets, type: 'expense', label: 'Pets' });
    const food = s.expense({ category_id: pets });
    await money.record(s.user, food);
    await del(food.id as string, 1);
    await as(s.user).post(`/v1/categories/${pets}/archive`, {}, { ifMatch: 1 });
    expect((await as(s.user).post(`/v1/transactions/${food.id}/restore`, {}, { ifMatch: 2 })).body.fields).toHaveProperty('category_id');
  });

  it('renaming_category_preserves_historical_reference', async () => {
    const s = await setup();
    const originalCategory = { id: randomUUID() };
    await as(s.user).post('/v1/categories', { id: originalCategory.id, type: 'expense', label: 'Pets' });
    const vet = s.expense({ category_id: originalCategory.id });
    await money.record(s.user, vet);
    expect((await as(s.user).patch(`/v1/categories/${originalCategory.id}`, { label: 'Animals' }, { ifMatch: 1 })).status).toBe(200);
    const history = [(await as(s.user).get(`/v1/transactions/${vet.id}`)).body];
    expect(history[0].category_id).toBe(originalCategory.id);
  });

  it('of two edits from the same version one wins, with no extra receipt or revision for the loser', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    const before = (await db.admin((client) => client.query('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [s.user.accountId]))).rows[0].revision;
    const results = await Promise.all(['7000', '8000'].map((amount) => as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: amount }, { ifMatch: 1 })));
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const after = (await db.admin((client) => client.query('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [s.user.accountId]))).rows[0].revision;
    expect(BigInt(after) - BigInt(before)).toBe(1n);
  });

  it("another account's record is NOT_FOUND", async () => {
    const s = await setup();
    const other = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    expect((await as(other.user).get(`/v1/transactions/${coffee.id}`)).status).toBe(404);
    expect((await as(other.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 1 })).status).toBe(404);
  });
});

describe('wallet rules once records exist', () => {
  it('an opening correction needs a reason, and tracking cannot start after an existing record', async () => {
    const s = await setup();
    await money.record(s.user, s.expense({ occurred_on: '2026-09-20' }));
    const noReason = await as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1' }, { ifMatch: 1 });
    expect(noReason.status).toBe(422);
    expect(noReason.body.fields).toHaveProperty('correction_reason');
    expect((await as(s.user).patch(`/v1/wallets/${s.cash}`, { tracking_start: '2026-09-21', correction_reason: 'entry_error' }, { ifMatch: 1 })).body.fields).toHaveProperty('tracking_start');
    expect((await as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1', correction_reason: 'balance_reconciliation' }, { ifMatch: 1 })).status).toBe(200);
    expect((await money.balances(s.user))[s.cash]).toBe('-6499');
  });

  it('archiving needs the derived balance, records included, to be zero', async () => {
    const s = await setup();
    const empty = await money.wallet(s.user, { opening_minor: '0', tracking_start: '2026-09-01' });
    await money.record(s.user, s.expense({ wallet_id: empty, amount_minor: '100' }));
    expect((await as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(422);
    await money.record(s.user, { type: 'income', amount_minor: '100', occurred_on: '2026-09-20', wallet_id: empty, category_id: builtinId(s.user, 'gift') });
    expect((await as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(200);
  });
});

describe('database guards', () => {
  it('refuses forged references across accounts or category types, and hard deletes', async () => {
    const s = await setup();
    const other = await setup();
    const service = new DatabaseService(pool);
    const insert = (wallet: string, category: string, type = 'expense') => service.withOwnerTransaction(s.user.session, (tx) => tx.query(
      `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id) VALUES ($1, $2, $3, 1, '2026-09-20', $4, $5)`,
      [s.user.accountId, randomUUID(), type, wallet, category],
    ));
    await expect(insert(other.cash, builtinId(s.user, 'food'))).rejects.toMatchObject({ code: '23503' });
    await expect(insert(s.cash, builtinId(s.user, 'salary'))).rejects.toMatchObject({ code: '23503' });
    await expect(insert(s.cash, builtinId(other.user, 'food'))).rejects.toMatchObject({ code: '23503' });
    const coffee = s.expense();
    await money.record(s.user, coffee);
    await expect(service.withOwnerTransaction(s.user.session, (tx) => tx.query('DELETE FROM transactions WHERE id = $1', [coffee.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(service.withOwnerTransaction(s.user.session, (tx) => tx.query(`UPDATE transactions SET type = 'income' WHERE id = $1`, [coffee.id]))).rejects.toMatchObject({ code: '42501' });
  });
});
