// Money fixtures for HTTP specs: a signed-up member with accepted policies,
// seeded built-in categories and named wallets. Test use only.
import { randomUUID } from 'node:crypto';

import type { BuiltinCategoryKey } from '@gogospend/contracts';

import { derivedUuid } from '../commands/derived-id';
import { GOLDEN_RECORDS, GOLDEN_START, GOLDEN_WALLETS } from '../transactions/fixtures/golden-diary';
import type { SignedUp, authFixtures } from './auth-fixtures';
import { acceptPolicies } from './command-fixtures';
import type { TestDatabase } from './postgres-harness';
import type { v1Client } from './v1-client';

type Client = ReturnType<ReturnType<typeof v1Client>>;

export const builtinId = (user: SignedUp, key: BuiltinCategoryKey) => derivedUuid(user.accountId, 'builtin-category', key);

export async function expectOk(res: { status: number; body: unknown }, status = 200): Promise<void> {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
}

export function moneyFixtures(db: TestDatabase, fx: ReturnType<typeof authFixtures>, as: (user: SignedUp) => Client) {
  async function member(): Promise<SignedUp> {
    const user = await fx.signUp();
    await acceptPolicies(db, user.accountId);
    await expectOk(await as(user).post('/v1/categories/builtins'));
    return user;
  }

  async function wallet(user: SignedUp, overrides: Record<string, unknown> = {}): Promise<string> {
    const body = { id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01', ...overrides };
    await expectOk(await as(user).post('/v1/wallets', body), 201);
    return body.id;
  }

  async function record(user: SignedUp, body: Record<string, unknown>): Promise<string> {
    const id = (body.id as string | undefined) ?? randomUUID();
    await expectOk(await as(user).post('/v1/transactions', { id, ...body }), 201);
    return id;
  }

  async function balances(user: SignedUp): Promise<Record<string, string>> {
    const wallets = (await as(user).get('/v1/wallets')).body as { id: string; balance_minor: string }[];
    return Object.fromEntries(wallets.map((w) => [w.id, w.balance_minor]));
  }

  /** The pinned golden diary for a new member; records in GOLDEN_RECORDS order. */
  async function golden(): Promise<{ user: SignedUp; wallets: { cash: string; daily: string }; records: string[] }> {
    const user = await member();
    const wallets = {
      cash: await wallet(user, { ...GOLDEN_WALLETS.cash, tracking_start: GOLDEN_START }),
      daily: await wallet(user, { ...GOLDEN_WALLETS.daily, tracking_start: GOLDEN_START }),
    };
    const records: string[] = [];
    for (const item of GOLDEN_RECORDS) {
      const base = { type: item.type, amount_minor: item.amount_minor, occurred_on: item.occurred_on, note: item.note };
      records.push(await record(user, item.type === 'transfer'
        ? { ...base, source_wallet_id: wallets[item.source], destination_wallet_id: wallets[item.destination] }
        : { ...base, wallet_id: wallets[item.wallet], category_id: builtinId(user, item.category) }));
    }
    return { user, wallets, records };
  }

  /** Inserts records straight into the table (no commands) for read-model scale tests. */
  async function bulkRecords(user: SignedUp, rows: { type: 'expense' | 'income'; amount_minor: string; occurred_on: string; wallet_id: string; category_id: string; note?: string | null }[]): Promise<string[]> {
    const ids = rows.map(() => randomUUID());
    await db.admin((client) => client.query(
      `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note)
       SELECT $1, r.id, r.type, r.amount_minor, r.occurred_on, r.wallet_id, r.category_id, r.note
         FROM jsonb_to_recordset($2::jsonb) AS r(id uuid, type text, amount_minor bigint, occurred_on date, wallet_id uuid, category_id uuid, note text)`,
      [user.accountId, JSON.stringify(rows.map((row, i) => ({ ...row, id: ids[i], note: row.note ?? null })))],
    ));
    return ids;
  }

  return { member, wallet, record, balances, golden, bulkRecords };
}
