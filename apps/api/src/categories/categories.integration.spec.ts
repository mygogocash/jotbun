import { randomUUID } from 'node:crypto';

import { BUILTIN_CATEGORIES, isCategorySnapshot } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { derivedUuid } from '../commands/derived-id';
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

const custom = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', label: 'Pets', color: '#9CD4F5', ...overrides });

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

const changeCount = async (user: SignedUp) =>
  (await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM entity_changes WHERE account_id = $1 AND entity = 'category'`, [user.accountId]))).rows[0].n;

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

describe('built-in categories', () => {
  it('are seeded once, with stable derived ids, in the canonical order', async () => {
    const user = await member();
    expect((await as(user).get('/v1/categories')).body).toEqual([]);
    const seeded = await as(user).post('/v1/categories/builtins');
    expect(seeded.status).toBe(200);
    expect(seeded.body).toMatchObject({ outcome: 'created', version: 1, entity_id: derivedUuid(user.accountId, 'builtin-category', 'food') });
    const list = (await as(user).get('/v1/categories')).body;
    expect(list).toEqual(BUILTIN_CATEGORIES.map((builtin) => ({
      id: derivedUuid(user.accountId, 'builtin-category', builtin.key),
      type: builtin.type,
      builtin_key: builtin.key,
      label: null,
      color: builtin.color,
      archived: false,
      version: 1,
    })));
    expect(list.every(isCategorySnapshot)).toBe(true);
  });

  it('seeding again, or from two devices at once, replays one command', async () => {
    const user = await member();
    const [a, b] = await Promise.all([as(user).post('/v1/categories/builtins'), as(user).post('/v1/categories/builtins')]);
    const c = await as(user).post('/v1/categories/builtins');
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
    expect((await as(user).get('/v1/categories')).body).toHaveLength(BUILTIN_CATEGORIES.length);
    expect(await changeCount(user)).toBe(BUILTIN_CATEGORIES.length);
  });

  it('a built-in can be renamed and reverted to its localized name, keeping its id', async () => {
    const user = await member();
    await as(user).post('/v1/categories/builtins');
    const food = derivedUuid(user.accountId, 'builtin-category', 'food');
    expect((await as(user).patch(`/v1/categories/${food}`, { label: '  Eating out ' }, { ifMatch: 1 })).status).toBe(200);
    expect((await as(user).get('/v1/categories')).body[0]).toMatchObject({ id: food, builtin_key: 'food', label: 'Eating out', version: 2 });
    expect((await as(user).patch(`/v1/categories/${food}`, { label: null }, { ifMatch: 2 })).status).toBe(200);
    expect((await as(user).get('/v1/categories')).body[0]).toMatchObject({ id: food, label: null, version: 3 });
  });
});

describe('custom categories', () => {
  it('are created explicitly with a label and an optional palette colour', async () => {
    const user = await member();
    const body = custom({ label: ' Pets ' });
    const res = await as(user).post('/v1/categories', body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ entity_id: body.id, version: 1, outcome: 'created' });
    expect((await as(user).get('/v1/categories')).body).toEqual([{ id: body.id, type: 'expense', builtin_key: null, label: 'Pets', color: '#9CD4F5', archived: false, version: 1 }]);
    const neutral = custom({ type: 'income', label: 'Refunds', color: null });
    expect((await as(user).post('/v1/categories', neutral)).status).toBe(201);
  });

  it.each([
    ['type', { type: 'transfer' }],
    ['color', { color: '#000000' }],
    ['label', { label: '' }],
    ['label', { label: 'x'.repeat(81) }],
    ['id', { id: 'not-a-uuid' }],
  ])('refuses an invalid %s', async (field, overrides) => {
    const user = await member();
    const res = await as(user).post('/v1/categories', custom(overrides));
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty(field);
  });

  it('refuses a built-in key or unknown fields on create', async () => {
    const user = await member();
    expect((await as(user).post('/v1/categories', { ...custom(), builtin_key: 'food' })).body.code).toBe('UNKNOWN_FIELD');
  });

  it('the type can never change, through the API or the database', async () => {
    const user = await member();
    const body = custom();
    await as(user).post('/v1/categories', body);
    expect((await as(user).patch(`/v1/categories/${body.id}`, { type: 'income' }, { ifMatch: 1 })).body.code).toBe('UNKNOWN_FIELD');
    await expect(new DatabaseService(pool).withOwnerTransaction(user.session, (tx) => tx.query(`UPDATE categories SET type = 'income' WHERE id = $1`, [body.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('a custom label cannot be removed', async () => {
    const user = await member();
    const body = custom();
    await as(user).post('/v1/categories', body);
    expect((await as(user).patch(`/v1/categories/${body.id}`, { label: null }, { ifMatch: 1 })).status).toBe(422);
  });

  it('a stale edit is VERSION_CONFLICT with the current category', async () => {
    const user = await member();
    const body = custom();
    await as(user).post('/v1/categories', body);
    await as(user).patch(`/v1/categories/${body.id}`, { label: 'Animals' }, { ifMatch: 1 });
    const stale = await as(user).patch(`/v1/categories/${body.id}`, { color: '#F2857E' }, { ifMatch: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ id: body.id, label: 'Animals', version: 2 });
  });

  it('archiving keeps the category for history and can be undone; it is never deleted', async () => {
    const user = await member();
    const body = custom();
    await as(user).post('/v1/categories', body);
    expect((await as(user).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 1 })).body).toMatchObject({ outcome: 'archived', version: 2 });
    expect((await as(user).get('/v1/categories')).body[0]).toMatchObject({ id: body.id, archived: true });
    expect((await as(user).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 2 })).status).toBe(422);
    expect((await as(user).post(`/v1/categories/${body.id}/unarchive`, {}, { ifMatch: 2 })).body).toMatchObject({ outcome: 'unarchived', version: 3 });
    expect((await as(user).raw('delete', `/v1/categories/${body.id}`)).status).toBe(404);
    await expect(new DatabaseService(pool).withOwnerTransaction(user.session, (tx) => tx.query('DELETE FROM categories WHERE id = $1', [body.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it("another account's category is NOT_FOUND", async () => {
    const owner = await member();
    const other = await member();
    const body = custom();
    await as(owner).post('/v1/categories', body);
    expect((await as(other).patch(`/v1/categories/${body.id}`, { label: 'Mine' }, { ifMatch: 1 })).status).toBe(404);
    expect((await as(other).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 1 })).status).toBe(404);
    expect((await as(other).get('/v1/categories')).body).toEqual([]);
  });
});
