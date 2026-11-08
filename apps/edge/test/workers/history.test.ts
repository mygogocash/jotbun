// History and Recently deleted in the vault. Ported by name and assertion from
// apps/api/src/history/history.integration.spec.ts and
// deleted-history.integration.spec.ts, plus the two history cases of
// apps/api/src/budgets/m4-hardening.integration.spec.ts that Task 6 left to this
// task. Rows the API writes through SQL (bulkRecords, deletedAgo) are written
// straight into the vault's own tables with runInDurableObject. The retention
// purge is 1A-T8b's: here a purged record is what that purge leaves (no row and a
// purged head), written by SQL. Another account's rows live in another vault, so
// "other accounts" cases hold by addressing, not by row-level security.
import { runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { encodeDeletedCursor } from '@api/history/cursor'
import { BUILTIN_CATEGORIES } from '@gogospend/contracts'
import type { DeletedHistoryPage, EntryDto, HistoryPage, TransactionDto } from '@gogospend/contracts'

import type { UserVault } from '../../src/vault/user-vault'
import { sqlExec, sqlRows } from './support/command-fixtures'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

const DAY_MS = 86_400_000
const RANGE = 'from=2026-01-01&through=2026-12-31'

type Problem = { code?: string; message_key?: string; fields?: Record<string, string> }
type Reply<T> = { status: number; body: T & Problem }

async function page(user: TestUser, query: string): Promise<Reply<HistoryPage>> {
  const res = await client.as(user).get(`/v1/history?${query}`)
  return { status: res.status, body: await res.json() }
}

async function fetchAll(user: TestUser, query: string): Promise<{ items: TransactionDto[]; pages: HistoryPage[] }> {
  const pages: HistoryPage[] = []
  let cursor: string | null = null
  do {
    const res = await page(user, cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query)
    expect(res.status).toBe(200)
    pages.push(res.body)
    cursor = res.body.next_cursor
  } while (cursor && pages.length < 100)
  return { items: pages.flatMap((p) => p.items), pages }
}

/** 451 records on three tied dates, in one wallet and category. */
async function seeded451(): Promise<{ user: TestUser; wallet: string; ids: string[] }> {
  const user = await money.member()
  const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
  const dates = ['2026-03-01', '2026-03-02', '2026-03-03']
  const ids = await money.bulkRecords(
    user,
    Array.from({ length: 451 }, (_, i) => ({ type: 'expense' as const, amount_minor: String(i + 1), occurred_on: dates[i % 3], wallet_id: wallet, category_id: builtinId(user, 'food') })),
  )
  return { user, wallet, ids }
}

describe('keyset history', () => {
  it('all_451_records_are_pageable', async () => {
    const { user, ids } = await seeded451()
    const { items: allPages, pages } = await fetchAll(user, RANGE)
    expect(new Set(allPages.map((r) => r.id)).size).toBe(451)
    expect(allPages).toHaveLength(451)
    expect(new Set(allPages.map((r) => r.id))).toEqual(new Set(ids))
    expect(pages).toHaveLength(10)
    expect(pages.slice(0, 9).every((p) => p.items.length === 50)).toBe(true)
    // Newest first, ties broken by id, with no hidden 200-row cap.
    const keys = allPages.map((r) => `${r.occurred_on}|${r.id}`)
    expect(keys).toEqual([...keys].sort().reverse())
  })

  it('ascending order and the maximum limit page the same records the other way round', async () => {
    const { user } = await seeded451()
    const { items, pages } = await fetchAll(user, `${RANGE}&sort=date_asc&limit=200`)
    expect(pages.map((p) => p.items.length)).toEqual([200, 200, 51])
    const keys = items.map((r) => `${r.occurred_on}|${r.id}`)
    expect(keys).toEqual([...keys].sort())
  })

  it.each([['0'], ['201'], ['abc'], ['1.5']])('refuses limit=%s', async (limit) => {
    const user = await money.member()
    const res = await page(user, `${RANGE}&limit=${limit}`)
    expect(res.status).toBe(422)
    expect(res.body.fields).toHaveProperty('limit')
  })

  it('refuses malformed cursors and cursors from another filter', async () => {
    const { user } = await seeded451()
    const first = await page(user, RANGE)
    expect((await page(user, `${RANGE}&cursor=not-a-cursor`)).body.fields).toHaveProperty('cursor')
    const other = await page(user, `from=2026-01-01&through=2026-06-30&cursor=${encodeURIComponent(first.body.next_cursor as string)}`)
    expect(other.status).toBe(422)
    expect(other.body.fields).toHaveProperty('cursor')
    const sorted = await page(user, `${RANGE}&sort=date_asc&cursor=${encodeURIComponent(first.body.next_cursor as string)}`)
    expect(sorted.status).toBe(422)
  })

  it('signals a refresh when the account changed between pages, without skipping unchanged rows', async () => {
    const { user, wallet } = await seeded451()
    const first = await page(user, RANGE)
    expect(first.body.refresh_suggested).toBe(false)
    const unchanged = await page(user, `${RANGE}&cursor=${encodeURIComponent(first.body.next_cursor as string)}`)
    expect(unchanged.body.refresh_suggested).toBe(false)
    await money.record(user, { type: 'expense', amount_minor: '1', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food') })
    const changed = await page(user, `${RANGE}&cursor=${encodeURIComponent(first.body.next_cursor as string)}`)
    expect(changed.body.refresh_suggested).toBe(true)
    expect(changed.body.items.map((r) => r.id)).toEqual(unchanged.body.items.map((r) => r.id).filter((id) => changed.body.items.some((r) => r.id === id)))
  })
})

describe('filters and their totals', () => {
  it('filters by wallet (both sides of transfers), category, type, text and inclusive dates, and totals agree with the rows', async () => {
    const g = await money.golden()
    const check = async (query: string, expectIds: string[]) => {
      const { items, pages } = await fetchAll(g.user, query)
      expect(items.map((r) => r.id).sort()).toEqual([...expectIds].sort())
      const summary = pages[0].summary
      expect(summary.count).toBe(items.length)
      const sum = (type: string) =>
        items
          .filter((r) => r.type === type)
          .reduce((s, r) => s + BigInt(r.amount_minor), 0n)
          .toString()
      expect(summary.income_minor).toBe(sum('income'))
      expect(summary.expense_minor).toBe(sum('expense'))
      expect(summary.balance_minor).toBe((BigInt(sum('income')) - BigInt(sum('expense'))).toString())
      return summary
    }
    const [income, food, rent, transfer] = g.records
    const cash = await check(`${RANGE}&wallet_id=${g.wallets.cash}`, [food, transfer])
    expect(cash.by_wallet).toEqual({ [g.wallets.cash]: '-168200', [g.wallets.daily]: '150000' })
    await check(`${RANGE}&wallet_id=${g.wallets.daily}`, [income, rent, transfer])
    await check(`${RANGE}&category_id=${builtinId(g.user, 'bills')}`, [rent])
    await check(`${RANGE}&type=transfer`, [transfer])
    await check(`${RANGE}&type=income`, [income])
    await check(`${RANGE}&query=RENT`, [rent])
    await check(`${RANGE}&query=${encodeURIComponent('%')}`, [])
    await check('from=2026-09-26&through=2026-09-27', [food, rent])
    const everything = await check(RANGE, [income, food, rent, transfer])
    expect(everything).toMatchObject({ income_minor: '2800000', expense_minor: '1245000', balance_minor: '1555000' })
  })

  it('leaves out deleted records and other accounts, and keeps the category id after a rename', async () => {
    const g = await money.golden()
    const other = await money.golden()
    expect((await client.as(g.user).del(`/v1/transactions/${g.records[1]}`, { ifMatch: 1 })).status).toBe(200)
    const bills = builtinId(g.user, 'bills')
    expect((await client.as(g.user).patch(`/v1/categories/${bills}`, { label: 'Housing' }, { ifMatch: 1 })).status).toBe(200)
    const { items } = await fetchAll(g.user, RANGE)
    expect(items.map((r) => r.id).sort()).toEqual([g.records[0], g.records[2], g.records[3]].sort())
    expect(items.some((r) => other.records.includes(r.id))).toBe(false)
    const history = items.filter((r): r is EntryDto => r.type === 'expense')
    expect(history[0].category_id).toBe(bills)
  })

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
    const user = await money.member()
    const res = await page(user, query)
    expect(res.status).toBe(422)
    expect(res.body.fields).toHaveProperty(field)
  })
})

describe('budget and read-model edges (m4-hardening)', () => {
  it('a cursor carrying an impossible date is a 422, never a 500', async () => {
    const user = await money.member()
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
    await money.bulkRecords(user, Array.from({ length: 3 }, () => ({ type: 'expense' as const, amount_minor: '1', occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') })))
    const range = 'from=2026-01-01&through=2026-12-31&limit=1'
    const cursor = (await page(user, range)).body.next_cursor as string
    for (const bad of ['2026-02-30', '0000-01-01', '2026-13-01']) {
      const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cursor, 'base64url').toString()), d: bad })).toString('base64url')
      const res = await page(user, `${range}&cursor=${forged}`)
      expect(res.status).toBe(422)
      expect(res.body.fields).toHaveProperty('cursor')
    }
  })

  it('a history date before 1970 is INVALID_DATE, and the summary refuses unknown parameters', async () => {
    const user = await money.member()
    expect((await page(user, 'from=1969-12-31&through=2026-12-31')).body).toMatchObject({ code: 'INVALID_DATE', fields: { from: expect.any(String) } })
    const res = await client.as(user).get(`/v1/summary?month=2026-09&owner_id=${randomUUID()}`)
    expect(res.status).toBe(422)
    expect(((await res.json()) as Problem).code).toBe('UNKNOWN_FIELD')
  })
})

async function deletedPage(user: TestUser, query = ''): Promise<Reply<DeletedHistoryPage>> {
  const res = await client.as(user).get(`/v1/history/deleted${query ? `?${query}` : ''}`)
  return { status: res.status, body: await res.json() }
}

async function fetchDeleted(user: TestUser, query = ''): Promise<{ items: TransactionDto[]; pages: DeletedHistoryPage[] }> {
  const pages: DeletedHistoryPage[] = []
  let cursor: string | null = null
  do {
    const parts = [query, cursor ? `cursor=${encodeURIComponent(cursor)}` : ''].filter(Boolean).join('&')
    const res = await deletedPage(user, parts)
    expect(res.status).toBe(200)
    pages.push(res.body)
    cursor = res.body.next_cursor
  } while (cursor && pages.length < 100)
  return { items: pages.flatMap((p) => p.items), pages }
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

async function remove(user: TestUser, id: string, version = 1): Promise<void> {
  expect((await client.as(user).del(`/v1/transactions/${id}`, { ifMatch: version })).status).toBe(200)
}

/** Sets a deleted record's deletion instant to `ms` before `from` (default now; the API's `now() - interval`). */
async function deletedAgo(user: TestUser, id: string, ms: number, from = Date.now()): Promise<void> {
  await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', new Date(from - ms).toISOString(), id)
}

/**
 * Pins the vault clock a week ahead of real time and returns it (1A-T8b-followup). A deletion
 * backdated past 30 days from this clock is outside the restore window, yet the purge alarm the
 * next commit arms is still about a week in the real future, so no past-due alarm fires on its
 * own during the case (ruling R6).
 */
async function clockAhead(user: TestUser): Promise<number> {
  const at = Date.now() + 7 * DAY_MS
  await runInDurableObject(vaultOf(user), (vault: UserVault) => {
    vault.clock = () => new Date(at)
  })
  return at
}

/** The vault's armed alarm (epoch ms), or null (none armed, or one firing right now). */
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_vault, state) => state.storage.getAlarm())

async function diary(): Promise<{ user: TestUser; cash: string; record: (overrides?: Record<string, unknown>) => Promise<string> }> {
  const user = await money.member()
  const cash = await money.wallet(user)
  const record = (overrides: Record<string, unknown> = {}) =>
    money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides })
  return { user, cash, record }
}

const rowCount = async (user: TestUser, id: string) => (await sqlRows(user, 'SELECT 1 FROM transactions WHERE id = ?', id)).length

describe('Recently deleted: what is listed', () => {
  it("only this account's deleted records, newest deletion first, each exactly as GET /v1/transactions/:id reads it", async () => {
    const g = await money.golden()
    const other = await money.golden()
    const [income, food, rent] = g.records
    await remove(g.user, food)
    await remove(g.user, rent)
    await remove(other.user, other.records[0])
    // Food was deleted before rent.
    await deletedAgo(g.user, food, 2 * DAY_MS)
    await deletedAgo(g.user, rent, DAY_MS)

    const { items, pages } = await fetchDeleted(g.user)
    expect(pages).toHaveLength(1)
    expect(ids(items)).toEqual([rent, food])
    for (const item of items) {
      expect(item.deleted_at).toEqual(expect.any(String))
      expect(item).toEqual(await (await client.as(g.user).get(`/v1/transactions/${item.id}`)).json())
    }
    expect(Object.keys(pages[0]).sort()).toEqual(['as_of_revision', 'items', 'next_cursor', 'refresh_suggested'])
    // Active records stay out, and so does everything of the other account.
    expect(ids(items)).not.toContain(income)
    expect(ids((await fetchDeleted(other.user)).items)).toEqual([other.records[0]])
    // A brand-new account has nothing deleted.
    const empty = await deletedPage(await money.member())
    expect([empty.status, empty.body.items, empty.body.next_cursor]).toEqual([200, [], null])
  })

  it('another account’s cursor grants nothing: rows are still read under the owner’s RLS', async () => {
    const mine = await diary()
    const theirs = await diary()
    const own = [await mine.record(), await mine.record()]
    const foreign = [await theirs.record(), await theirs.record()]
    for (const id of own) await remove(mine.user, id)
    for (const id of foreign) await remove(theirs.user, id)
    const first = await deletedPage(theirs.user, 'limit=1')
    expect(first.body.next_cursor).not.toBeNull()
    // Their cursor on my listing continues from their position, over my rows only: mine live in my own vault.
    const reused = await deletedPage(mine.user, `limit=200&cursor=${encodeURIComponent(first.body.next_cursor as string)}`)
    expect(reused.status).toBe(200)
    expect(reused.body.items.every((item) => own.includes(item.id))).toBe(true)
    expect(ids((await fetchDeleted(mine.user)).items).sort()).toEqual([...own].sort())
  })
})

describe('Recently deleted: the restore window', () => {
  it('just inside 30 days is listed and restorable; just outside is neither, before any purge', async () => {
    const { user, record } = await diary()
    const inside = await record({ amount_minor: '100' })
    const outside = await record({ amount_minor: '200' })
    await remove(user, inside)
    await remove(user, outside)
    // A minute either side of the boundary, on a vault clock pinned a week ahead.
    const at = await clockAhead(user)
    await deletedAgo(user, inside, 30 * DAY_MS - 60_000, at)
    await deletedAgo(user, outside, 30 * DAY_MS + 60_000, at)
    // Not purged yet: the row is still there, but past the window it is not offered.
    expect(await rowCount(user, outside)).toBe(1)

    expect(ids((await fetchDeleted(user)).items)).toEqual([inside])
    // The listing agrees with the restore command, in both directions.
    const expired = await client.as(user).post(`/v1/transactions/${outside}/restore`, {}, { ifMatch: 2 })
    const problem = (await expired.json()) as Problem
    expect([expired.status, problem.code, problem.message_key]).toEqual([409, 'ENTITY_DELETED', 'errors.restore_expired'])
    expect((await client.as(user).post(`/v1/transactions/${inside}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await fetchDeleted(user)).items).toEqual([])
    // The restore armed the alarm in the real future, so no purge ran during the case.
    expect((await alarmOf(user)) ?? 0).toBeGreaterThan(Date.now())
    expect(await rowCount(user, outside)).toBe(1)
  })

  it('a purged record is never listed, and the retention purge leaves the window alone', async () => {
    const { user, record } = await diary()
    const [purged, kept, lateOutside] = [await record(), await record(), await record()]
    for (const id of [purged, kept, lateOutside]) await remove(user, id)
    await deletedAgo(user, purged, 31 * DAY_MS)
    await deletedAgo(user, kept, 29 * DAY_MS)
    // What 1A-T8b's purge leaves for a record past the window: no row, and a purged head (the heads' trigger wants the current revision on it).
    await sqlExec(user, 'DELETE FROM transactions WHERE id = ?', purged)
    await sqlExec(
      user,
      "UPDATE entity_heads SET state = 'purged', version = version + 1, revision = (SELECT revision FROM sync_state WHERE id = 1) WHERE entity = 'transaction' AND entity_id = ?",
      purged,
    )
    expect(await rowCount(user, purged)).toBe(0)
    // Aged past the window after the purge ran: still in the table, not listed.
    await deletedAgo(user, lateOutside, 31 * DAY_MS)
    const { items } = await fetchDeleted(user)
    expect(ids(items)).toEqual([kept])
    // The purged record cannot be restored either.
    expect((await client.as(user).post(`/v1/transactions/${purged}/restore`, {}, { ifMatch: 2 })).status).toBe(410)
  })

  it('exactly 30 days after its deletion a record is still listed and restorable, as the restore command decides; a millisecond more is neither', async () => {
    const { user, record } = await diary()
    const edge = await record({ amount_minor: '100' })
    const past = await record({ amount_minor: '200' })
    await remove(user, edge)
    await remove(user, past)
    const at = await clockAhead(user)
    await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 30 * DAY_MS).toISOString(), edge)
    await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 30 * DAY_MS - 1).toISOString(), past)
    expect(ids((await fetchDeleted(user)).items)).toEqual([edge])
    const expired = await client.as(user).post(`/v1/transactions/${past}/restore`, {}, { ifMatch: 2 })
    expect(((await expired.json()) as Problem).message_key).toBe('errors.restore_expired')
    expect((await client.as(user).post(`/v1/transactions/${edge}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    // The restore armed the alarm in the real future, so no purge ran during the case.
    expect((await alarmOf(user)) ?? 0).toBeGreaterThan(Date.now())
    expect(await rowCount(user, past)).toBe(1)
  })
})

describe('Recently deleted: ordering and paging', () => {
  /**
   * Seven deleted records: three a millisecond apart (the vault keeps
   * milliseconds, where PostgreSQL keeps microseconds; a cursor kept only to the
   * second would lose one), three deleted at the very same instant (ties go by
   * id, descending), and one older.
   */
  async function seeded() {
    const user = await money.member()
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
    const recordIds = await money.bulkRecords(
      user,
      Array.from({ length: 7 }, (_, i) => ({ type: 'expense' as const, amount_minor: String(i + 1), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') })),
    )
    const second = Math.floor((Date.now() - DAY_MS) / 1000) * 1000
    const offsets = [3, 2, 1, -1000, -1000, -1000, -2000]
    for (const [i, id] of recordIds.entries()) await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(second + offsets[i]).toISOString(), id)
    const ties = recordIds.slice(3, 6).sort().reverse()
    return { user, wallet, expected: [...recordIds.slice(0, 3), ...ties, recordIds[6]], second }
  }

  it('newest deletion first, ties by id, a page at a time with nothing lost or repeated', async () => {
    const { user, expected } = await seeded()
    const { items, pages } = await fetchDeleted(user, 'limit=2')
    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 2, 1])
    expect(ids(items)).toEqual(expected)
    expect(pages[pages.length - 1].next_cursor).toBeNull()
    expect(pages.every((p) => p.refresh_suggested === false)).toBe(true)
    // Every limit pages the same list.
    for (const limit of [1, 3, 200]) expect(ids((await fetchDeleted(user, `limit=${limit}`)).items)).toEqual(expected)
    // Without a limit, one default page holds them all.
    const whole = await deletedPage(user)
    expect([ids(whole.body.items), whole.body.next_cursor]).toEqual([expected, null])
  })

  it('suggests a refresh when the account changed between pages, without skipping unchanged rows', async () => {
    const { user, wallet, expected } = await seeded()
    const first = await deletedPage(user, 'limit=3')
    const cursor = encodeURIComponent(first.body.next_cursor as string)
    const unchanged = await deletedPage(user, `limit=3&cursor=${cursor}`)
    expect(unchanged.body.refresh_suggested).toBe(false)
    await money.record(user, { type: 'expense', amount_minor: '1', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food') })
    const changed = await deletedPage(user, `limit=3&cursor=${cursor}`)
    expect(changed.body.refresh_suggested).toBe(true)
    expect(ids(changed.body.items)).toEqual(expected.slice(3, 6))
    expect(ids(unchanged.body.items)).toEqual(expected.slice(3, 6))
  })

  it('a cursor with microseconds pages as PostgreSQL compares instants: a deletion in its millisecond comes after it, whatever its id', async () => {
    const { user, expected, second } = await seeded()
    const revision = (await deletedPage(user)).body.as_of_revision
    // 500 microseconds into the millisecond of the three tied rows, with the lowest possible id.
    const instant = `${new Date(second - 1000).toISOString().slice(0, 23)}500Z`
    const cursor = encodeDeletedCursor({ deletedAt: instant, id: '00000000-0000-4000-8000-000000000000', revision })
    expect(ids((await deletedPage(user, `cursor=${encodeURIComponent(cursor)}`)).body.items)).toEqual(expected.slice(3))
  })

  it.each([
    ['limit', 'limit=0'],
    ['limit', 'limit=201'],
    ['limit', 'limit=abc'],
    ['cursor', 'cursor=not-a-cursor'],
    ['from', 'from=2026-01-01&through=2026-12-31'],
    ['owner_id', `owner_id=${randomUUID()}`],
  ])('refuses an invalid %s (%s) with a 422 naming it', async (field, query) => {
    const res = await deletedPage(await money.member(), query)
    expect(res.status).toBe(422)
    expect(res.body.fields).toHaveProperty(field)
  })

  it("refuses history's own cursor", async () => {
    const { user, record } = await diary()
    await record()
    await record()
    const history = await page(user, 'from=2026-01-01&through=2026-12-31&limit=1')
    expect(history.body.next_cursor).toEqual(expect.any(String))
    const res = await deletedPage(user, `cursor=${encodeURIComponent(history.body.next_cursor as string)}`)
    expect(res.status).toBe(422)
    expect(res.body.fields).toHaveProperty('cursor')
  })
})

const json = async (res: Response) => (res.headers.get('content-type')?.includes('json') ? res.json() : null)

describe('the money journey', () => {
  // Ported from test/dispatch.db.test.ts with its sync assertions. Plan Task 7 added
  // it as a todo; 1A-T8b turned it on by changing it.todo to it (ruling R5).
  it('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {
    const user = await member(client)
    const cash = { id: randomUUID(), name: 'Cash', opening_minor: '403200', tracking_start: '2026-10-01' }
    expect((await client.as(user).post('/v1/wallets', cash)).status).toBe(201)
    const seeded = await client.as(user).post('/v1/categories/builtins')
    expect(seeded.status).toBe(200)
    const categories = (await seeded.json()) as { id: string; builtin_key: string }[]
    expect(categories.map((c) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key))
    const food = categories.find((c) => c.builtin_key === 'food') as { id: string }

    const lunchKey = randomUUID()
    const lunch = { id: randomUUID(), type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: cash.id, category_id: food.id, merchant: 'ข้าวมันไก่', note: null }
    const created = await client.as(user).post('/v1/transactions', lunch, { key: lunchKey })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ entity_id: lunch.id, outcome: 'created' })

    const history = await json(await client.as(user).get('/v1/history?from=2026-10-01&through=2026-10-31'))
    expect(history.items).toEqual([expect.objectContaining({ id: lunch.id, amount_minor: '6000', merchant: 'ข้าวมันไก่' })])

    const summary = await json(await client.as(user).get('/v1/summary?month=2026-10'))
    expect(summary).toMatchObject({ month: '2026-10' })
    expect(JSON.stringify(summary)).toContain('6000')

    const budget = await client.as(user).put('/v1/budgets/2026-10', { overall_limit_minor: '1800000', category_limits: [{ category_id: food.id, limit_minor: '600000' }] })
    expect(budget.status).toBe(200)
    expect(await json(await client.as(user).get('/v1/budgets/2026-10'))).toMatchObject({ month: '2026-10', overall_limit_minor: '1800000', version: 1 })

    const status = await client.as(user).post('/v1/commands/status', { command_ids: [lunchKey, randomUUID()] })
    expect(status.status).toBe(200)
    const statuses = (await status.json()).statuses
    expect(statuses[0]).toMatchObject({ command_id: lunchKey, state: 'known', ack: { entity_id: lunch.id } })
    expect(statuses[1]).toMatchObject({ state: 'unknown' })

    const sync = await json(await client.as(user).get('/v1/sync/changes'))
    expect(sync.groups.length).toBeGreaterThanOrEqual(4)
    expect(sync.groups.flatMap((g: { changes: { entity: string }[] }) => g.changes.map((c) => c.entity))).toEqual(expect.arrayContaining(['wallet', 'category', 'transaction', 'budget']))
    expect(typeof sync.next_cursor).toBe('string')

    const removed = await client.as(user).del(`/v1/transactions/${lunch.id}`, { ifMatch: 1 })
    expect(removed.status).toBe(200)
    const deleted = await json(await client.as(user).get('/v1/history/deleted'))
    expect(deleted.items).toEqual([expect.objectContaining({ id: lunch.id })])
    const restored = await client.as(user).post(`/v1/transactions/${lunch.id}/restore`, {}, { ifMatch: 2 })
    expect(restored.status).toBe(200)
    expect((await json(await client.as(user).get(`/v1/transactions/${lunch.id}`))).deleted_at).toBeNull()
  })
})
