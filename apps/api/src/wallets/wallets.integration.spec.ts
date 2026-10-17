import { randomUUID } from 'node:crypto';

import { bangkokDate, isWalletSnapshot } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { DatabaseService } from '../database/database.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { acceptPolicies, publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;

const today = () => bangkokDate(new Date());
const tomorrow = () => bangkokDate(new Date(Date.now() + 86_400_000));
const wallet = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), name: 'Cash', opening_minor: '403200', tracking_start: '2026-01-01', ...overrides });

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

async function created(user: SignedUp, overrides: Record<string, unknown> = {}) {
  const body = wallet(overrides);
  const res = await as(user).post('/v1/wallets', body);
  expect(res.status).toBe(201);
  return body;
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('creating wallets', () => {
  it('creates a THB wallet whose balance starts at its opening balance', async () => {
    const user = await member();
    const body = wallet({ name: '  Cash  ' });
    const res = await as(user).post('/v1/wallets', body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ entity_id: body.id, version: 1, outcome: 'created', entity_state: 'active', committed_revision: '1' });
    const got = await as(user).get(`/v1/wallets/${body.id}`);
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ id: body.id, name: 'Cash', currency: 'THB', opening_minor: '403200', balance_minor: '403200', tracking_start: '2026-01-01', archived: false, version: 1 });
    expect((await as(user).get('/v1/wallets')).body).toEqual([got.body]);
    const [change] = (await db.admin((client) => client.query('SELECT snapshot FROM entity_changes WHERE account_id = $1', [user.accountId]))).rows;
    expect(isWalletSnapshot(change.snapshot)).toBe(true);
    expect(change.snapshot).toEqual({ ...got.body, balance_minor: undefined });
  });

  it('a zero opening balance is valid and is not income', async () => {
    const user = await member();
    const body = await created(user, { opening_minor: '0' });
    expect((await as(user).get(`/v1/wallets/${body.id}`)).body).toMatchObject({ opening_minor: '0', balance_minor: '0' });
  });

  it.each([
    ['99999999999', 201, undefined],
    ['100000000000', 422, 'MINOR_OUT_OF_RANGE'],
    ['-1', 422, 'MINOR_OUT_OF_RANGE'],
    ['1.50', 422, 'INVALID_MINOR'],
    ['007', 422, 'INVALID_MINOR'],
    [100, 422, 'INVALID_MINOR'],
  ])('opening %p → %i %s', async (opening, status, code) => {
    const user = await member();
    const res = await as(user).post('/v1/wallets', wallet({ opening_minor: opening }));
    expect(res.status).toBe(status);
    if (code) expect(res.body).toMatchObject({ code, fields: { opening_minor: expect.any(String) } });
  });

  it.each([
    ['2026-02-30', 'INVALID_DATE'],
    ['2026-1-01', 'INVALID_DATE'],
    ['1969-12-31', 'INVALID_DATE'],
  ])('tracking start %s is %s', async (start, code) => {
    const user = await member();
    const res = await as(user).post('/v1/wallets', wallet({ tracking_start: start }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
  });

  it('tracking may start today in Bangkok but not tomorrow', async () => {
    const user = await member();
    expect((await as(user).post('/v1/wallets', wallet({ tracking_start: today() }))).status).toBe(201);
    expect((await as(user).post('/v1/wallets', wallet({ tracking_start: tomorrow() }))).body.code).toBe('DATE_IN_FUTURE');
  });

  it.each([[''], ['   '], ['x'.repeat(81)], ['Cash\nWallet'], ['Cash\u0000']])('refuses the name %p', async (name) => {
    const user = await member();
    const res = await as(user).post('/v1/wallets', wallet({ name }));
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('name');
  });

  it('accepts an 80-character Thai name', async () => {
    const user = await member();
    expect((await as(user).post('/v1/wallets', wallet({ name: 'ก'.repeat(80) }))).status).toBe(201);
  });

  it.each([['currency', 'USD'], ['owner_id', randomUUID()], ['balance_minor', '1']])('refuses the field %s', async (field, value) => {
    const user = await member();
    const res = await as(user).post('/v1/wallets', { ...wallet(), [field]: value });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UNKNOWN_FIELD');
  });

  it('needs an idempotency key and a supported command schema', async () => {
    const user = await member();
    expect((await as(user).raw('post', '/v1/wallets', wallet(), { 'x-gogospend-command-schema': '1' })).body.code).toBe('VALIDATION_FAILED');
    expect((await as(user).post('/v1/wallets', wallet(), { schema: null })).body.code).toBe('COMMAND_SCHEMA_UNSUPPORTED');
    expect((await as(user).post('/v1/wallets', wallet(), { schema: 99 })).body.code).toBe('COMMAND_SCHEMA_UNSUPPORTED');
  });

  it('a retried create replays its acknowledgement; a new key for the same id is a conflict', async () => {
    const user = await member();
    const body = wallet();
    const key = randomUUID();
    const first = await as(user).post('/v1/wallets', body, { key });
    const again = await as(user).post('/v1/wallets', body, { key });
    expect(again.body).toEqual(first.body);
    expect((await as(user).post('/v1/wallets', body)).status).toBe(409);
  });

  it('writes need the current required policies', async () => {
    const pending = await fx.signUp();
    expect((await as(pending).post('/v1/wallets', wallet())).body.code).toBe('POLICY_ACCEPTANCE_REQUIRED');
  });
});

describe('editing wallets', () => {
  it('renames keep the id and bump the version; a stale version is VERSION_CONFLICT with the current wallet', async () => {
    const user = await member();
    const body = await created(user);
    const renamed = await as(user).patch(`/v1/wallets/${body.id}`, { name: 'Pocket' }, { ifMatch: 1 });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ entity_id: body.id, version: 2, outcome: 'updated' });
    const stale = await as(user).patch(`/v1/wallets/${body.id}`, { name: 'Purse' }, { ifMatch: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.current).toMatchObject({ id: body.id, name: 'Pocket', version: 2 });
  });

  it('of two concurrent renames from the same version, exactly one wins', async () => {
    const user = await member();
    const body = await created(user);
    const results = await Promise.all(['Left', 'Right'].map((name) => as(user).patch(`/v1/wallets/${body.id}`, { name }, { ifMatch: 1 })));
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect((await as(user).get(`/v1/wallets/${body.id}`)).body.version).toBe(2);
  });

  it('needs If-Match and at least one known field', async () => {
    const user = await member();
    const body = await created(user);
    expect((await as(user).patch(`/v1/wallets/${body.id}`, { name: 'X' })).body).toMatchObject({ code: 'VALIDATION_FAILED', fields: { if_match: expect.any(String) } });
    expect((await as(user).patch(`/v1/wallets/${body.id}`, {}, { ifMatch: 1 })).status).toBe(422);
    expect((await as(user).patch(`/v1/wallets/${body.id}`, { currency: 'USD' }, { ifMatch: 1 })).body.code).toBe('UNKNOWN_FIELD');
    expect((await as(user).patch(`/v1/wallets/${body.id}`, { id: randomUUID(), name: 'X' }, { ifMatch: 1 })).body.code).toBe('UNKNOWN_FIELD');
  });

  it('an opening correction records its reason as an audit code, never as income', async () => {
    const user = await member();
    const body = await created(user);
    const res = await as(user).patch(`/v1/wallets/${body.id}`, { opening_minor: '500000', correction_reason: 'entry_error' }, { ifMatch: 1 });
    expect(res.status).toBe(200);
    expect((await as(user).get(`/v1/wallets/${body.id}`)).body).toMatchObject({ opening_minor: '500000', balance_minor: '500000' });
    const audit = (await db.admin((client) => client.query('SELECT metadata FROM audit_events WHERE account_id = $1 ORDER BY revision DESC LIMIT 1', [user.accountId]))).rows[0];
    expect(audit.metadata).toEqual({ correction: 'entry_error' });
    expect((await as(user).patch(`/v1/wallets/${body.id}`, { opening_minor: '1', correction_reason: 'because' }, { ifMatch: 2 })).status).toBe(422);
  });
});

describe('archiving wallets', () => {
  it('needs a zero balance; an archived wallet stays readable but cannot be edited until unarchived', async () => {
    const user = await member();
    const funded = await created(user, { opening_minor: '100' });
    const refused = await as(user).post(`/v1/wallets/${funded.id}/archive`, {}, { ifMatch: 1 });
    expect(refused.status).toBe(422);
    expect(refused.body.message_key).toBe('errors.wallet_balance_not_zero');

    const empty = await created(user, { opening_minor: '0' });
    const archived = await as(user).post(`/v1/wallets/${empty.id}/archive`, {}, { ifMatch: 1 });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ outcome: 'archived', version: 2, entity_state: 'active' });
    expect((await as(user).get(`/v1/wallets/${empty.id}`)).body).toMatchObject({ archived: true, version: 2 });
    expect((await as(user).post(`/v1/wallets/${empty.id}/archive`, {}, { ifMatch: 2 })).status).toBe(422);
    expect((await as(user).patch(`/v1/wallets/${empty.id}`, { name: 'Old' }, { ifMatch: 2 })).status).toBe(422);
    const restored = await as(user).post(`/v1/wallets/${empty.id}/unarchive`, {}, { ifMatch: 2 });
    expect(restored.body).toMatchObject({ outcome: 'unarchived', version: 3 });
    expect((await as(user).get(`/v1/wallets/${empty.id}`)).body).toMatchObject({ id: empty.id, archived: false, version: 3 });
  });
});

describe('ownership', () => {
  it("another account's wallet is NOT_FOUND for reads and writes, like a missing one", async () => {
    const owner = await member();
    const other = await member();
    const body = await created(owner);
    expect((await as(other).get(`/v1/wallets/${body.id}`)).status).toBe(404);
    expect((await as(other).patch(`/v1/wallets/${body.id}`, { name: 'Mine' }, { ifMatch: 1 })).status).toBe(404);
    expect((await as(other).post(`/v1/wallets/${body.id}/archive`, {}, { ifMatch: 1 })).status).toBe(404);
    expect((await as(other).get('/v1/wallets')).body).toEqual([]);
    expect((await as(other).get('/v1/wallets/not-a-uuid')).status).toBe(404);
  });

  it('two accounts may use the same wallet id without seeing each other', async () => {
    const [a, b] = [await member(), await member()];
    const id = randomUUID();
    await created(a, { id, name: 'A' });
    await created(b, { id, name: 'B' });
    expect((await as(a).get(`/v1/wallets/${id}`)).body.name).toBe('A');
    expect((await as(b).get(`/v1/wallets/${id}`)).body.name).toBe('B');
  });

  it('the database refuses a wallet row forged for another account, and any delete', async () => {
    const owner = await member();
    const attacker = await member();
    const body = await created(owner);
    const service = new DatabaseService(pool);
    await expect(service.withOwnerTransaction(attacker.session, (tx) => tx.query(
      `INSERT INTO wallets (account_id, id, name, opening_minor, tracking_start) VALUES ($1, $2, 'x', 0, '2026-01-01')`, [owner.accountId, randomUUID()],
    ))).rejects.toMatchObject({ code: '42501' });
    await expect(service.withOwnerTransaction(owner.session, (tx) => tx.query('DELETE FROM wallets WHERE id = $1', [body.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(service.withOwnerTransaction(owner.session, (tx) => tx.query(`UPDATE wallets SET currency = 'USD' WHERE id = $1`, [body.id]))).rejects.toMatchObject({ code: '42501' });
  });
});
