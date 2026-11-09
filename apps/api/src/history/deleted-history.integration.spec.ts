// "Recently deleted" (GET /v1/history/deleted) against real PostgreSQL: only
// the signed-in account's deleted records, only inside the 30-day restore
// window (the restore command's own rule, so what is listed can be
// restored), never a purged one, newest deletion first, and keyset pages that
// neither drop nor repeat a row, ties and microseconds included.
import { randomUUID } from 'node:crypto';

import type { DeletedHistoryPage, TransactionDto } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { purgeExpiredRecords } from '../privacy/privacy-steps';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, expectOk, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let jobsPool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;

type Reply = { status: number; body: DeletedHistoryPage & { code?: string; message_key?: string; fields?: Record<string, string> } };

async function page(user: SignedUp, query = ''): Promise<Reply> {
  const res = await as(user).get(`/v1/history/deleted${query ? `?${query}` : ''}`);
  return { status: res.status, body: res.body };
}

async function fetchAll(user: SignedUp, query = ''): Promise<{ items: TransactionDto[]; pages: DeletedHistoryPage[] }> {
  const pages: DeletedHistoryPage[] = [];
  let cursor: string | null = null;
  do {
    const parts = [query, cursor ? `cursor=${encodeURIComponent(cursor)}` : ''].filter(Boolean).join('&');
    const res = await page(user, parts);
    expect(res.status).toBe(200);
    pages.push(res.body);
    cursor = res.body.next_cursor;
  } while (cursor && pages.length < 100);
  return { items: pages.flatMap((p) => p.items), pages };
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
const remove = async (user: SignedUp, id: string, version = 1) => expectOk(await as(user).del(`/v1/transactions/${id}`, { ifMatch: version }));

/** Sets a record's deletion instant to `now() - <interval>` (a PostgreSQL interval, e.g. '30 days 1 minute'). */
async function deletedAgo(id: string, interval: string): Promise<void> {
  await db.admin((client) => client.query(`UPDATE transactions SET deleted_at = now() - $2::interval WHERE id = $1 AND deleted_at IS NOT NULL`, [id, interval]));
}

async function diary(): Promise<{ user: SignedUp; cash: string; record: (overrides?: Record<string, unknown>) => Promise<string> }> {
  const user = await money.member();
  const cash = await money.wallet(user);
  const record = (overrides: Record<string, unknown> = {}) =>
    money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides });
  return { user, cash, record };
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
  // Retention purges on the generic worker's login, as deployed.
  jobsPool = await db.loginPool(['gogospend_jobs'], 2);
});

afterAll(async () => {
  // db.drop() ends every pool it handed out, jobsPool included.
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('what is listed', () => {
  it("only this account's deleted records, newest deletion first, each exactly as GET /v1/transactions/:id reads it", async () => {
    const g = await money.golden();
    const other = await money.golden();
    const [income, food, rent] = g.records;
    await remove(g.user, food);
    await remove(g.user, rent);
    await remove(other.user, other.records[0]);
    // Food was deleted before rent.
    await deletedAgo(food, '2 days');
    await deletedAgo(rent, '1 day');

    const { items, pages } = await fetchAll(g.user);
    expect(pages).toHaveLength(1);
    expect(ids(items)).toEqual([rent, food]);
    for (const item of items) {
      expect(item.deleted_at).toEqual(expect.any(String));
      expect(item).toEqual((await as(g.user).get(`/v1/transactions/${item.id}`)).body);
    }
    expect(Object.keys(pages[0]).sort()).toEqual(['as_of_revision', 'items', 'next_cursor', 'refresh_suggested']);
    // Active records stay out, and so does everything of the other account.
    expect(ids(items)).not.toContain(income);
    expect(ids((await fetchAll(other.user)).items)).toEqual([other.records[0]]);
    // A brand-new account has nothing deleted.
    const empty = await page(await money.member());
    expect([empty.status, empty.body.items, empty.body.next_cursor]).toEqual([200, [], null]);
  });

  it('another account’s cursor grants nothing: rows are still read under the owner’s RLS', async () => {
    const mine = await diary();
    const theirs = await diary();
    const own = [await mine.record(), await mine.record()];
    const foreign = [await theirs.record(), await theirs.record()];
    for (const id of own) await remove(mine.user, id);
    for (const id of foreign) await remove(theirs.user, id);
    const first = await page(theirs.user, 'limit=1');
    expect(first.body.next_cursor).not.toBeNull();
    // Their cursor on my listing continues from their position, over my rows only.
    const reused = await page(mine.user, `limit=200&cursor=${encodeURIComponent(first.body.next_cursor as string)}`);
    expect(reused.status).toBe(200);
    expect(reused.body.items.every((item) => own.includes(item.id))).toBe(true);
    expect(ids((await fetchAll(mine.user)).items).sort()).toEqual([...own].sort());
  });
});

describe('the restore window', () => {
  it('just inside 30 days is listed and restorable; just outside is neither, before any purge', async () => {
    const { user, record } = await diary();
    const inside = await record({ amount_minor: '100' });
    const outside = await record({ amount_minor: '200' });
    await remove(user, inside);
    await remove(user, outside);
    // A minute either side of the boundary; the request's now() is a moment later, which only moves "inside" closer.
    await deletedAgo(inside, '29 days 23 hours 59 minutes');
    await deletedAgo(outside, '30 days 1 minute');
    // Not purged yet: the row is still there, but past the window it is not offered.
    expect((await db.admin((client) => client.query('SELECT 1 FROM transactions WHERE id = $1', [outside]))).rowCount).toBe(1);

    expect(ids((await fetchAll(user)).items)).toEqual([inside]);
    // The listing agrees with the restore command, in both directions.
    const expired = await as(user).post(`/v1/transactions/${outside}/restore`, {}, { ifMatch: 2 });
    expect([expired.status, expired.body.code, expired.body.message_key]).toEqual([409, 'ENTITY_DELETED', 'errors.restore_expired']);
    await expectOk(await as(user).post(`/v1/transactions/${inside}/restore`, {}, { ifMatch: 2 }));
    expect((await fetchAll(user)).items).toEqual([]);
  });

  it('a purged record is never listed, and the retention purge leaves the window alone', async () => {
    const { user, record } = await diary();
    const [purged, kept, lateOutside] = [await record(), await record(), await record()];
    for (const id of [purged, kept, lateOutside]) await remove(user, id);
    await deletedAgo(purged, '31 days');
    await deletedAgo(kept, '29 days');
    expect(await purgeExpiredRecords(jobsPool)).toBeGreaterThanOrEqual(1);
    expect((await db.admin((client) => client.query('SELECT 1 FROM transactions WHERE id = $1', [purged]))).rowCount).toBe(0);
    // Aged past the window after the purge ran: still in the table, not listed.
    await deletedAgo(lateOutside, '31 days');
    const { items } = await fetchAll(user);
    expect(ids(items)).toEqual([kept]);
    // The purged record cannot be restored either.
    expect((await as(user).post(`/v1/transactions/${purged}/restore`, {}, { ifMatch: 2 })).status).toBe(410);
  });
});

describe('ordering and paging', () => {
  /**
   * Seven deleted records: three a microsecond apart (a cursor kept only to
   * the millisecond would lose one), three deleted at the very same instant
   * (ties go by id, descending), and one older.
   */
  async function seeded() {
    const user = await money.member();
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' });
    const recordIds = await money.bulkRecords(user, Array.from({ length: 7 }, (_, i) => ({
      type: 'expense' as const, amount_minor: String(i + 1), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food'),
    })));
    const offsets = ['3 microseconds', '2 microseconds', '1 microsecond', '-1 second', '-1 second', '-1 second', '-2 seconds'];
    await db.admin((client) => client.query(
      `UPDATE transactions t SET deleted_at = date_trunc('second', now() - interval '1 day') + o.offset_by::interval
         FROM unnest($1::uuid[], $2::text[]) AS o(id, offset_by) WHERE t.id = o.id`,
      [recordIds, offsets],
    ));
    const ties = recordIds.slice(3, 6).sort().reverse();
    return { user, wallet, expected: [...recordIds.slice(0, 3), ...ties, recordIds[6]] };
  }

  it('newest deletion first, ties by id, a page at a time with nothing lost or repeated', async () => {
    const { user, expected } = await seeded();
    const { items, pages } = await fetchAll(user, 'limit=2');
    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 2, 1]);
    expect(ids(items)).toEqual(expected);
    expect(pages[pages.length - 1].next_cursor).toBeNull();
    expect(pages.every((p) => p.refresh_suggested === false)).toBe(true);
    // Every limit pages the same list.
    for (const limit of [1, 3, 200]) expect(ids((await fetchAll(user, `limit=${limit}`)).items)).toEqual(expected);
    // Without a limit, one default page holds them all.
    const whole = await page(user);
    expect([ids(whole.body.items), whole.body.next_cursor]).toEqual([expected, null]);
  });

  it('suggests a refresh when the account changed between pages, without skipping unchanged rows', async () => {
    const { user, wallet, expected } = await seeded();
    const first = await page(user, 'limit=3');
    const cursor = encodeURIComponent(first.body.next_cursor as string);
    const unchanged = await page(user, `limit=3&cursor=${cursor}`);
    expect(unchanged.body.refresh_suggested).toBe(false);
    await money.record(user, { type: 'expense', amount_minor: '1', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food') });
    const changed = await page(user, `limit=3&cursor=${cursor}`);
    expect(changed.body.refresh_suggested).toBe(true);
    expect(ids(changed.body.items)).toEqual(expected.slice(3, 6));
    expect(ids(unchanged.body.items)).toEqual(expected.slice(3, 6));
  });

  it.each([
    ['limit', 'limit=0'],
    ['limit', 'limit=201'],
    ['limit', 'limit=abc'],
    ['cursor', 'cursor=not-a-cursor'],
    ['from', 'from=2026-01-01&through=2026-12-31'],
    ['owner_id', `owner_id=${randomUUID()}`],
  ])('refuses an invalid %s (%s) with a 422 naming it', async (field, query) => {
    const res = await page(await money.member(), query);
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty(field);
  });

  it("refuses history's own cursor", async () => {
    const { user, record } = await diary();
    await record();
    await record();
    const history = await as(user).get('/v1/history?from=2026-01-01&through=2026-12-31&limit=1');
    expect(history.body.next_cursor).toEqual(expect.any(String));
    const res = await page(user, `cursor=${encodeURIComponent(history.body.next_cursor as string)}`);
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty('cursor');
  });
});
