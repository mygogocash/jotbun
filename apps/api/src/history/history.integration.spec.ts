import { randomUUID } from 'node:crypto';

import type { EntryDto, HistoryPage, TransactionDto } from '@gogospend/contracts';
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

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;

const RANGE = 'from=2026-01-01&through=2026-12-31';

async function page(user: SignedUp, query: string): Promise<{ status: number; body: HistoryPage & { code?: string; fields?: Record<string, string> } }> {
  const res = await as(user).get(`/v1/history?${query}`);
  return { status: res.status, body: res.body };
}

async function fetchAll(user: SignedUp, query: string): Promise<{ items: TransactionDto[]; pages: HistoryPage[] }> {
  const pages: HistoryPage[] = [];
  let cursor: string | null = null;
  do {
    const res = await page(user, cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query);
    expect(res.status).toBe(200);
    pages.push(res.body);
    cursor = res.body.next_cursor;
  } while (cursor && pages.length < 100);
  return { items: pages.flatMap((p) => p.items), pages };
}

/** 451 records on three tied dates, in one wallet and category. */
async function seeded451(): Promise<{ user: SignedUp; wallet: string; ids: string[] }> {
  const user = await money.member();
  const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' });
  const dates = ['2026-03-01', '2026-03-02', '2026-03-03'];
  const ids = await money.bulkRecords(user, Array.from({ length: 451 }, (_, i) => ({
    type: 'expense' as const, amount_minor: String(i + 1), occurred_on: dates[i % 3], wallet_id: wallet, category_id: builtinId(user, 'food'),
  })));
  return { user, wallet, ids };
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

describe('keyset history', () => {
  it('all_451_records_are_pageable', async () => {
    const { user, ids } = await seeded451();
    const { items: allPages, pages } = await fetchAll(user, RANGE);
    expect(new Set(allPages.map((r) => r.id)).size).toBe(451);
    expect(allPages).toHaveLength(451);
    expect(new Set(allPages.map((r) => r.id))).toEqual(new Set(ids));
    expect(pages).toHaveLength(10);
    expect(pages.slice(0, 9).every((p) => p.items.length === 50)).toBe(true);
    // Newest first, ties broken by id, with no hidden 200-row cap.
    const keys = allPages.map((r) => `${r.occurred_on}|${r.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
  });

  it('ascending order and the maximum limit page the same records the other way round', async () => {
    const { user } = await seeded451();
    const { items, pages } = await fetchAll(user, `${RANGE}&sort=date_asc&limit=200`);
    expect(pages.map((p) => p.items.length)).toEqual([200, 200, 51]);
    const keys = items.map((r) => `${r.occurred_on}|${r.id}`);
    expect(keys).toEqual([...keys].sort());
  });

  it.each([['0'], ['201'], ['abc'], ['1.5']])('refuses limit=%s', async (limit) => {
    const user = await money.member();
    const res = await page(user, `${RANGE}&limit=${limit}`);
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('limit');
  });

  it('refuses malformed cursors and cursors from another filter', async () => {
    const { user } = await seeded451();
    const first = await page(user, RANGE);
    expect((await page(user, `${RANGE}&cursor=not-a-cursor`)).body.fields).toHaveProperty('cursor');
    const other = await page(user, `from=2026-01-01&through=2026-06-30&cursor=${encodeURIComponent(first.body.next_cursor as string)}`);
    expect(other.status).toBe(422);
    expect(other.body.fields).toHaveProperty('cursor');
    const sorted = await page(user, `${RANGE}&sort=date_asc&cursor=${encodeURIComponent(first.body.next_cursor as string)}`);
    expect(sorted.status).toBe(422);
  });

  it('signals a refresh when the account changed between pages, without skipping unchanged rows', async () => {
    const { user, wallet } = await seeded451();
    const first = await page(user, RANGE);
    expect(first.body.refresh_suggested).toBe(false);
    const unchanged = await page(user, `${RANGE}&cursor=${encodeURIComponent(first.body.next_cursor as string)}`);
    expect(unchanged.body.refresh_suggested).toBe(false);
    await money.record(user, { type: 'expense', amount_minor: '1', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food') });
    const changed = await page(user, `${RANGE}&cursor=${encodeURIComponent(first.body.next_cursor as string)}`);
    expect(changed.body.refresh_suggested).toBe(true);
    expect(changed.body.items.map((r) => r.id)).toEqual(unchanged.body.items.map((r) => r.id).filter((id) => changed.body.items.some((r) => r.id === id)));
  });
});

describe('filters and their totals', () => {
  it('filters by wallet (both sides of transfers), category, type, text and inclusive dates, and totals agree with the rows', async () => {
    const g = await money.golden();
    const check = async (query: string, expectIds: string[]) => {
      const { items, pages } = await fetchAll(g.user, query);
      expect(items.map((r) => r.id).sort()).toEqual([...expectIds].sort());
      const summary = pages[0].summary;
      expect(summary.count).toBe(items.length);
      const sum = (type: string) => items.filter((r) => r.type === type).reduce((s, r) => s + BigInt(r.amount_minor), 0n).toString();
      expect(summary.income_minor).toBe(sum('income'));
      expect(summary.expense_minor).toBe(sum('expense'));
      expect(summary.balance_minor).toBe((BigInt(sum('income')) - BigInt(sum('expense'))).toString());
      return summary;
    };
    const [income, food, rent, transfer] = g.records;
    const cash = await check(`${RANGE}&wallet_id=${g.wallets.cash}`, [food, transfer]);
    expect(cash.by_wallet).toEqual({ [g.wallets.cash]: '-168200', [g.wallets.daily]: '150000' });
    await check(`${RANGE}&wallet_id=${g.wallets.daily}`, [income, rent, transfer]);
    await check(`${RANGE}&category_id=${builtinId(g.user, 'bills')}`, [rent]);
    await check(`${RANGE}&type=transfer`, [transfer]);
    await check(`${RANGE}&type=income`, [income]);
    await check(`${RANGE}&query=RENT`, [rent]);
    await check(`${RANGE}&query=${encodeURIComponent('%')}`, []);
    await check('from=2026-09-26&through=2026-09-27', [food, rent]);
    const everything = await check(RANGE, [income, food, rent, transfer]);
    expect(everything).toMatchObject({ income_minor: '2800000', expense_minor: '1245000', balance_minor: '1555000' });
  });

  it('leaves out deleted records and other accounts, and keeps the category id after a rename', async () => {
    const g = await money.golden();
    const other = await money.golden();
    await as(g.user).raw('delete', `/v1/transactions/${g.records[1]}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': '"1"' });
    const bills = builtinId(g.user, 'bills');
    await as(g.user).patch(`/v1/categories/${bills}`, { label: 'Housing' }, { ifMatch: 1 });
    const { items } = await fetchAll(g.user, RANGE);
    expect(items.map((r) => r.id).sort()).toEqual([g.records[0], g.records[2], g.records[3]].sort());
    expect(items.some((r) => other.records.includes(r.id))).toBe(false);
    const history = items.filter((r): r is EntryDto => r.type === 'expense');
    expect(history[0].category_id).toBe(bills);
  });

  it.each([
    ['from', 'through=2026-12-31'],
    ['from', 'from=2026-02-30&through=2026-12-31'],
    ['through', 'from=2026-12-31&through=2026-01-01'],
    ['type', `${RANGE}&type=refund`],
    ['sort', `${RANGE}&sort=newest`],
    ['wallet_id', `${RANGE}&wallet_id=nope`],
    ['query', `${RANGE}&query=${'q'.repeat(101)}`],
    ['owner_id', `${RANGE}&owner_id=${randomUUID()}`],
  ])('refuses an invalid %s', async (field, query) => {
    const user = await money.member();
    const res = await page(user, query);
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty(field);
  });
});
