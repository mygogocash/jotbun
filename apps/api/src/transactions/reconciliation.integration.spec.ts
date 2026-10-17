import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';
import { GOLDEN_BALANCES, GOLDEN_RECORDS, GOLDEN_START, GOLDEN_WALLETS } from './fixtures/golden-diary';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;

type Golden = { user: SignedUp; wallets: { cash: string; daily: string }; records: string[] };

async function golden(): Promise<Golden> {
  const user = await money.member();
  const wallets = {
    cash: await money.wallet(user, { ...GOLDEN_WALLETS.cash, tracking_start: GOLDEN_START }),
    daily: await money.wallet(user, { ...GOLDEN_WALLETS.daily, tracking_start: GOLDEN_START }),
  };
  const records: string[] = [];
  for (const record of GOLDEN_RECORDS) {
    const base = { type: record.type, amount_minor: record.amount_minor, occurred_on: record.occurred_on, note: record.note };
    records.push(await money.record(user, record.type === 'transfer'
      ? { ...base, source_wallet_id: wallets[record.source], destination_wallet_id: wallets[record.destination] }
      : { ...base, wallet_id: wallets[record.wallet], category_id: builtinId(user, record.category) }));
  }
  return { user, wallets, records };
}

/** Balances straight from SQL, independent of BalanceQuery. */
async function sqlBalances(user: SignedUp): Promise<Record<string, string>> {
  const { rows } = await db.admin((client) => client.query<{ id: string; balance: string }>(
    `SELECT w.id, (w.opening_minor
              + coalesce((SELECT sum(t.amount_minor) FROM transactions t WHERE t.account_id = w.account_id AND t.deleted_at IS NULL AND t.type = 'income' AND t.wallet_id = w.id), 0)
              - coalesce((SELECT sum(t.amount_minor) FROM transactions t WHERE t.account_id = w.account_id AND t.deleted_at IS NULL AND t.type = 'expense' AND t.wallet_id = w.id), 0)
              - coalesce((SELECT sum(t.amount_minor) FROM transactions t WHERE t.account_id = w.account_id AND t.deleted_at IS NULL AND t.source_wallet_id = w.id), 0)
              + coalesce((SELECT sum(t.amount_minor) FROM transactions t WHERE t.account_id = w.account_id AND t.deleted_at IS NULL AND t.destination_wallet_id = w.id), 0))::text AS balance
       FROM wallets w WHERE w.account_id = $1`,
    [user.accountId],
  ));
  return Object.fromEntries(rows.map((row) => [row.id, row.balance]));
}

const pair = async (g: Golden) => {
  const all = await money.balances(g.user);
  return [all[g.wallets.cash], all[g.wallets.daily]];
};
const total = (values: string[]) => values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
const command = (version: number) => ({ 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': `"${version}"` });

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

describe('the golden diary', () => {
  it('golden_transfer_reconciles_both_wallets', async () => {
    const g = await golden();
    const wallets = (await as(g.user).get('/v1/wallets')).body as { id: string; balance_minor: string }[];
    const cash = wallets.find((w) => w.id === g.wallets.cash)!;
    const daily = wallets.find((w) => w.id === g.wallets.daily)!;
    expect([cash.balance_minor, daily.balance_minor]).toEqual([GOLDEN_BALANCES.cash, GOLDEN_BALANCES.daily]);
    expect([cash.balance_minor, daily.balance_minor]).toEqual(['235000', '1870000']);
    expect(total([cash.balance_minor, daily.balance_minor])).toBe(GOLDEN_BALANCES.total);
    expect(await sqlBalances(g.user)).toEqual({ [g.wallets.cash]: '235000', [g.wallets.daily]: '1870000' });
  });

  it('editing, deleting and restoring the transfer moves both wallets together and keeps the total', async () => {
    const g = await golden();
    const transferId = g.records[3];
    expect((await as(g.user).patch(`/v1/transactions/${transferId}`, { amount_minor: '100000' }, { ifMatch: 1 })).status).toBe(200);
    expect(await pair(g)).toEqual(['285000', '1820000']);
    expect((await as(g.user).raw('delete', `/v1/transactions/${transferId}`, {}, command(2))).status).toBe(200);
    expect(await pair(g)).toEqual(['385000', '1720000']);
    expect((await as(g.user).post(`/v1/transactions/${transferId}/restore`, {}, { ifMatch: 3 })).status).toBe(200);
    expect(await pair(g)).toEqual(['285000', '1820000']);
    expect(total(await pair(g))).toBe(GOLDEN_BALANCES.total);
    expect(await sqlBalances(g.user)).toEqual({ [g.wallets.cash]: '285000', [g.wallets.daily]: '1820000' });
  });

  it('a refused transfer edit changes neither wallet and leaves no receipt or revision', async () => {
    const g = await golden();
    const archived = await money.wallet(g.user, { opening_minor: '0', tracking_start: GOLDEN_START });
    await as(g.user).post(`/v1/wallets/${archived}/archive`, {}, { ifMatch: 1 });
    const revision = async () => (await db.admin((client) => client.query('SELECT revision::text FROM account_sync_state WHERE account_id = $1', [g.user.accountId]))).rows[0].revision;
    const before = await revision();
    const key = randomUUID();
    const refused = await as(g.user).patch(`/v1/transactions/${g.records[3]}`, { destination_wallet_id: archived }, { ifMatch: 1, key });
    expect(refused.status).toBe(422);
    expect(await pair(g)).toEqual(['235000', '1870000']);
    expect(await revision()).toBe(before);
    expect((await as(g.user).post('/v1/commands/status', { command_ids: [key] })).body.statuses[0].state).toBe('unknown');
  });

  it('edits that switch a transfer to the same wallet on both sides are refused', async () => {
    const g = await golden();
    const res = await as(g.user).patch(`/v1/transactions/${g.records[3]}`, { destination_wallet_id: g.wallets.cash }, { ifMatch: 1 });
    expect(res.status).toBe(422);
    expect(await pair(g)).toEqual(['235000', '1870000']);
  });
});

describe('exactness beyond JavaScript numbers', () => {
  it('a balance above Number.MAX_SAFE_INTEGER stays an exact decimal string', async () => {
    const user = await money.member();
    const wallet = await money.wallet(user, { opening_minor: '99999999999', tracking_start: '2026-01-01' });
    const rows = 90_100;
    await db.admin((client) => client.query(
      `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id)
       SELECT $1, gen_random_uuid(), 'income', 99999999999, DATE '2026-02-01', $2, $3 FROM generate_series(1, $4)`,
      [user.accountId, wallet, builtinId(user, 'salary'), rows],
    ));
    const expected = (99_999_999_999n * BigInt(rows + 1)).toString();
    expect(BigInt(expected) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect((await as(user).get(`/v1/wallets/${wallet}`)).body.balance_minor).toBe(expected);
  });
});
