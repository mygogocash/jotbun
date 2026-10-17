// Regression tests for the independent M2 and M3 review findings.
import { randomUUID } from 'node:crypto';

import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import { Pool } from 'pg';

import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService } from '../database/database.service';
import { walletRows } from '../wallets/wallets.repository';
import { BalanceQuery } from './balance-query';
import { RECORD_COLUMNS } from './transactions.repository';

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

const admin = async <R>(sql: string, values: unknown[] = []) => (await db.admin((client) => client.query(sql, values))).rows as R[];
const revisionOf = async (user: SignedUp) => (await admin<{ revision: string }>('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [user.accountId]))[0].revision;
const receiptsOf = async (user: SignedUp) => (await admin<{ n: number }>('SELECT count(*)::int AS n FROM command_receipts WHERE account_id = $1', [user.accountId]))[0].n;
const del = (user: SignedUp, id: string, version: number, key = randomUUID()) =>
  as(user).raw('delete', `/v1/transactions/${id}`, {}, { 'idempotency-key': key, 'x-gogospend-command-schema': '1', 'if-match': `"${version}"` });

async function setup() {
  const user = await money.member();
  const cash = await money.wallet(user, { opening_minor: '100000', tracking_start: '2026-09-01' });
  const expense = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides });
  return { user, cash, expense };
}

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

describe('built-in seeding is an idempotent ensure', () => {
  it('returns the categories, and seeding again after the receipt is gone changes nothing', async () => {
    const user = await money.member();
    await admin('DELETE FROM command_receipts WHERE account_id = $1', [user.accountId]);
    const again = await as(user).post('/v1/categories/builtins');
    expect(again.status).toBe(200);
    expect(again.body).toHaveLength(BUILTIN_CATEGORIES.length);
    expect(again.body[0]).toMatchObject({ builtin_key: 'food', id: builtinId(user, 'food') });
  });

  it('adds only the built-ins that are missing (e.g. one introduced later)', async () => {
    const user = await fx.signUp();
    await admin(`INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, 'terms', 1, true)`, [user.accountId]);
    await admin(`INSERT INTO categories (account_id, id, type, builtin_key, color) VALUES ($1, $2, 'expense', 'food', '#F0A868')`, [user.accountId, builtinId(user, 'food')]);
    const seeded = await as(user).post('/v1/categories/builtins');
    expect(seeded.status).toBe(200);
    expect(seeded.body.map((c: { builtin_key: string }) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key));
    const changes = await admin<{ n: number }>(`SELECT count(*)::int AS n FROM entity_changes WHERE account_id = $1 AND entity = 'category'`, [user.accountId]);
    expect(changes[0].n).toBe(BUILTIN_CATEGORIES.length - 1);
  });
});

describe('wallet setup rules', () => {
  it('a correction reason is refused when nothing is being corrected', async () => {
    const s = await setup();
    const res = await as(s.user).patch(`/v1/wallets/${s.cash}`, { name: 'Pocket', correction_reason: 'entry_error' }, { ifMatch: 1 });
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('correction_reason');
  });

  it('deleted records that can still be restored count as existing records', async () => {
    const s = await setup();
    const early = s.expense({ occurred_on: '2026-09-05' });
    await money.record(s.user, early);
    await del(s.user, early.id as string, 1);
    expect((await as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1' }, { ifMatch: 1 })).body.fields).toHaveProperty('correction_reason');
    expect((await as(s.user).patch(`/v1/wallets/${s.cash}`, { tracking_start: '2026-09-10', correction_reason: 'entry_error' }, { ifMatch: 1 })).body.fields).toHaveProperty('tracking_start');
    expect((await as(s.user).post(`/v1/transactions/${early.id}/restore`, {}, { ifMatch: 2 })).status).toBe(200);
  });

  it('dates read back as YYYY-MM-DD even when the connection uses a non-ISO DateStyle', async () => {
    const s = await setup();
    await money.record(s.user, s.expense({ occurred_on: '2026-09-03' }));
    const dmy = new Pool({ ...poolConfigFromUrl(await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']), 1), options: '-c DateStyle=SQL,DMY' });
    try {
      const service = new DatabaseService(dmy);
      const [wallet] = await service.withOwnerTransaction(s.user.session, (tx) => walletRows(tx, { id: s.cash }));
      expect(wallet.tracking_start).toBe('2026-09-01');
      expect(await service.withOwnerTransaction(s.user.session, (tx) => BalanceQuery.firstRecordOn(tx, s.cash))).toBe('2026-09-03');
      const [record] = await service.withOwnerTransaction(s.user.session, (tx) => tx.query<{ occurred_on: string }>(`SELECT ${RECORD_COLUMNS} FROM transactions`));
      expect(record.occurred_on).toBe('2026-09-03');
    } finally {
      await dmy.end();
    }
  });
});

describe('record command semantics', () => {
  it('a replay after the record was deleted reports its current state', async () => {
    const s = await setup();
    const coffee = s.expense();
    const key = randomUUID();
    await as(s.user).post('/v1/transactions', coffee, { key });
    await del(s.user, coffee.id as string, 1);
    const replay = await as(s.user).post('/v1/transactions', coffee, { key });
    expect(replay.status).toBe(201);
    expect(replay.body.entity_state).toBe('deleted');
  });

  it('a stale restore is VERSION_CONFLICT with the current record, not a state error', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    await del(s.user, coffee.id as string, 1);
    await as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 });
    const stale = await as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ id: coffee.id, version: 3, deleted_at: null });
  });

  it('moving a record to a wallet that starts tracking later names the wallet field', async () => {
    const s = await setup();
    const later = await money.wallet(s.user, { tracking_start: '2026-09-25' });
    const coffee = s.expense();
    await money.record(s.user, coffee);
    const res = await as(s.user).patch(`/v1/transactions/${coffee.id}`, { wallet_id: later }, { ifMatch: 1 });
    expect(res.body).toMatchObject({ code: 'DATE_BEFORE_TRACKING_START', fields: { wallet_id: expect.any(String) } });
  });

  it('an id whose record was purged cannot be reused', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    // What P5's purge leaves: no row, a purged head.
    await admin('DELETE FROM transactions WHERE id = $1', [coffee.id]);
    await admin(`UPDATE entity_heads SET state = 'purged', version = version + 1 WHERE entity_id = $1`, [coffee.id]);
    const reused = await as(s.user).post('/v1/transactions', { ...coffee });
    expect(reused.status).toBe(410);
    expect(reused.body.code).toBe('ENTITY_PURGED');
  });

  it('an equivalent retry replays and a changed one is a mismatch', async () => {
    const s = await setup();
    const key = randomUUID();
    const first = await as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', note: 'flat white', merchant: null }), { key });
    const padded = await as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', note: ' flat white\r\n', merchant: '  ' }), { key });
    expect(padded.body).toEqual(first.body);
    const changed = await as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', amount_minor: '6600', note: 'flat white' }), { key });
    expect(changed.body.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('receipts and audit rows never hold notes, merchants or amounts', async () => {
    const s = await setup();
    await money.record(s.user, s.expense({ amount_minor: '7654321', note: 'private-note-text', merchant: 'Secret Merchant' }));
    const rows = await admin<{ text: string }>(
      `SELECT row_to_json(r)::text AS text FROM command_receipts r WHERE account_id = $1
       UNION ALL SELECT row_to_json(a)::text FROM audit_events a WHERE account_id = $1`,
      [s.user.accountId],
    );
    expect(rows.map((row) => row.text).join('\n')).not.toMatch(/private-note-text|Secret Merchant|7654321/);
  });

  it('delete needs If-Match, and another account cannot delete or restore', async () => {
    const s = await setup();
    const other = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    expect((await as(s.user).raw('delete', `/v1/transactions/${coffee.id}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' })).status).toBe(422);
    expect((await del(other.user, coffee.id as string, 1)).status).toBe(404);
    expect((await as(other.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 1 })).status).toBe(404);
  });
});

describe('failure and race atomicity', () => {
  it('a failure after the row was written rolls back the row, change log, receipt and revision together', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    await admin(`CREATE FUNCTION fail_on_4242() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.amount_minor = 4242 THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await admin('CREATE TRIGGER fail_on_4242 AFTER UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION fail_on_4242()');
    try {
      const [revision, receipts] = [await revisionOf(s.user), await receiptsOf(s.user)];
      const res = await as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '4242' }, { ifMatch: 1 });
      expect(res.status).toBe(500);
      expect((await as(s.user).get(`/v1/transactions/${coffee.id}`)).body).toMatchObject({ amount_minor: '6500', version: 1 });
      expect([await revisionOf(s.user), await receiptsOf(s.user)]).toEqual([revision, receipts]);
    } finally {
      await admin('DROP TRIGGER fail_on_4242 ON transactions');
      await admin('DROP FUNCTION fail_on_4242()');
    }
  });

  it('of an edit, a delete and another edit from one version exactly one commits, with one receipt and one revision', async () => {
    const s = await setup();
    const coffee = s.expense();
    await money.record(s.user, coffee);
    const [revision, receipts] = [await revisionOf(s.user), await receiptsOf(s.user)];
    const results = await Promise.all([
      as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '7000' }, { ifMatch: 1 }),
      del(s.user, coffee.id as string, 1),
      as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '8000' }, { ifMatch: 1 }),
    ]);
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(2);
    expect(BigInt(await revisionOf(s.user)) - BigInt(revision)).toBe(1n);
    expect((await receiptsOf(s.user)) - receipts).toBe(1);
  });

  it('every record read back over HTTP matches its SQL row', async () => {
    const g = await money.golden();
    for (const id of g.records) {
      const http = (await as(g.user).get(`/v1/transactions/${id}`)).body;
      const [row] = await admin<Record<string, unknown>>(
        `SELECT id, type, amount_minor::text AS amount_minor, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note FROM transactions WHERE id = $1`,
        [id],
      );
      for (const [key, value] of Object.entries(row)) {
        if (value !== null) expect(http[key]).toBe(value);
      }
    }
  });
});
