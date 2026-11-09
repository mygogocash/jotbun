// Sync changes in the vault, ported by name from
// apps/api/src/sync/sync-query.integration.spec.ts (13 cases) and
// sync-api.integration.spec.ts (5 cases). Ported in full: 10, the 30-day
// retention case with 8b's prune run. In part: 3, each with its missing half in
// 1B (the lifecycle generation, the snapshot step, the export and import
// entities of the registry check). Not applicable: 3, two lock waits and the
// batch across accounts (a vault call runs to completion, and one vault holds
// one account). Deferred to 1B: the two snapshot cases. The receipts give each
// case's reason.
// The fixture domain builds the wide and large groups a page budget needs. Those
// cases read through syncChanges inside the call's transaction, since the
// vault's registry holds only wallets; the route cases use wallets.
import { randomUUID } from 'node:crypto'

import { runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { SYNC_ENTITY_VALIDATORS, SYNC_PAGE_BYTES, isCommittedChangeGroup } from '@gogospend/contracts'
import type { CommittedChangeGroup, SyncChangesPage } from '@gogospend/contracts'

import { decodeSyncCursor, encodeSyncCursor } from '@api/sync/sync-cursor'
import { parseSyncRequest } from '@api/sync/sync-query'

import { buildVaultRegistry } from '../../src/vault/commands/registry'
import { jsonbOrder, syncChanges } from '../../src/vault/reads/sync'
import { pruneChanges } from '../../src/vault/retention'
import { FIXTURE_ENTITY, fixtureCommands, inVault, purchase, sqlExec, sqlRows, syncRegistry } from './support/command-fixtures'
import { member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

const wallet = (name: string) => ({ id: randomUUID(), name, opening_minor: '0', tracking_start: '2026-01-01' })
const DAY = 86_400_000

/** One change-log prune in its own block, at `at` (epoch ms), as the vault's alarm runs it (1A-T8b's retention.ts). */
const prune = (user: TestUser, at: number) =>
  runInDurableObject(vaultOf(user), (_vault, state) => state.storage.transactionSync(() => pruneChanges({ sql: state.storage.sql, storage: state.storage, now: new Date(at) })))

/** One wallet, created through the route: one change group under the next revision. Returns its id. */
async function createWallet(user: TestUser, name = 'Cash'): Promise<string> {
  const body = wallet(name)
  const res = await client.as(user).post('/v1/wallets', body)
  expect(res.status).toBe(201)
  return body.id
}

/** GET the delta feed with its query string, as a client sends it. */
const feed = (user: TestUser, query = '') => client.as(user).get(`/v1/sync/changes${query}`)

/** A delta request that must succeed, as its page. */
async function pageFrom(user: TestUser, query = ''): Promise<SyncChangesPage> {
  const res = await feed(user, query)
  expect(res.status).toBe(200)
  return (await res.json()) as SyncChangesPage
}

/** The status and code of a delta request (a refusal, or the 200 with no code). */
async function problemOf(user: TestUser, query = ''): Promise<{ status: number; code?: string }> {
  const res = await feed(user, query)
  return { status: res.status, code: ((await res.json()) as { code?: string }).code }
}

/**
 * One page read in the vault's transaction. The fixture groups need the fixture
 * registry, which the route does not hold, so these calls go to syncChanges directly.
 */
function pageOf(user: TestUser, query: Record<string, unknown> = {}): Promise<SyncChangesPage> {
  return inVault(user, (c) => syncChanges(c, query), { registry: syncRegistry() })
}

/** Follows next_cursor from a position until has_more is false, as a client does. */
async function allGroups(user: TestUser, cursor?: string, limit?: string): Promise<{ pages: SyncChangesPage[]; groups: CommittedChangeGroup[] }> {
  const pages: SyncChangesPage[] = []
  let next = cursor
  do {
    const query: Record<string, unknown> = {}
    if (next !== undefined) query.cursor = next
    if (limit !== undefined) query.limit = limit
    const current = await pageOf(user, query)
    pages.push(current)
    next = current.next_cursor
    if (!current.has_more) break
  } while (pages.length < 50)
  return { pages, groups: pages.flatMap((p) => p.groups) }
}

/** One command that commits `count` sibling purchases under one revision: a group with many changes. */
function wideCommand(commands: ReturnType<typeof fixtureCommands>, count: number) {
  const siblings = Array.from({ length: count }, () => purchase())
  return commands.create(siblings[0], {
    result: () => ({
      entityId: siblings[0].id,
      version: 1,
      changes: siblings.map((p) => ({ entity: FIXTURE_ENTITY, id: p.id, version: 1, state: 'active' as const, snapshot: p })),
    }),
  })
}

describe('ordered deltas, ported from sync-query.integration.spec.ts', () => {
  it('pagination_never_splits_a_command_group', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user, { registry: syncRegistry() })
    const first = await commands.create(purchase())
    const wide = await wideCommand(commands, 500)
    await commands.create(purchase())
    const firstPage = await pageOf(user, { cursor: encodeSyncCursor(user.sub, first.committed_revision), limit: '1' })
    const group = firstPage.groups[0]
    expect(firstPage.groups).toHaveLength(1)
    expect(group.revision).toBe(wide.committed_revision)
    expect(group.command_id).toBe(wide.command_id)
    expect(firstPage.groups[0].changes).toHaveLength(500)
    expect(decodeSyncCursor(user.sub, firstPage.next_cursor)).toBe(group.revision)
    expect(firstPage.has_more).toBe(true)
  })

  it('pages whole groups in revision order within the 2 MiB budget, with no gaps', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user, { registry: syncRegistry() })
    const big = 'x'.repeat(600 * 1024)
    for (let i = 0; i < 5; i += 1) await commands.create(purchase({ note: big }))
    const { pages, groups } = await allGroups(user, undefined, '1000')
    expect(groups.map((g) => g.revision)).toEqual(['1', '2', '3', '4', '5'])
    expect(pages.length).toBeGreaterThan(1)
    for (const p of pages) {
      expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(SYNC_PAGE_BYTES)
      for (const g of p.groups) expect(g.changes).toHaveLength(1)
    }
    expect(decodeSyncCursor(user.sub, pages[pages.length - 1].next_cursor)).toBe('5')
  })

  it('defaults to 200 groups a page and refuses more than 1,000', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user, { registry: syncRegistry() })
    for (let i = 0; i < 201; i += 1) await commands.create(purchase())
    const first = await pageOf(user)
    expect(first.groups).toHaveLength(200)
    expect(first.has_more).toBe(true)
    const second = await pageOf(user, { cursor: first.next_cursor })
    expect(second.groups.map((g) => g.revision)).toEqual(['201'])
    expect(second.has_more).toBe(false)
    const empty = await pageOf(user, { cursor: second.next_cursor })
    expect(empty).toEqual({ groups: [], next_cursor: second.next_cursor, has_more: false })
    expect(parseSyncRequest({ limit: '1000' }).limit).toBe(1000)
    for (const bad of [{ limit: '1001' }, { limit: '0' }, { limit: 'ten' }, { other: '1' }, { cursor: ['a', 'b'] }]) {
      expect(() => parseSyncRequest(bad)).toThrow()
    }
    // 201 vault calls. The default 5s is enough alone, and not when the exactness case (90,100 rows) runs beside it.
  }, 20_000)

  it('rejects malformed, foreign and future cursors, and needs a resync below retention', async () => {
    const user = await member(client)
    const other = await member(client)
    await createWallet(user)
    await createWallet(user)
    await createWallet(other)
    expect(await problemOf(user, '?cursor=not%20a%20cursor')).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    expect(await problemOf(user, `?cursor=${encodeSyncCursor(other.sub, '1')}`)).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    // A cursor ahead of the account (e.g. after a database restore) needs a resync.
    expect(await problemOf(user, `?cursor=${encodeSyncCursor(user.sub, '3')}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '2')}`)).groups).toEqual([])
    await sqlExec(user, 'UPDATE sync_state SET pruned_through = 1 WHERE id = 1')
    expect(await problemOf(user, `?cursor=${encodeSyncCursor(user.sub, '0')}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    expect(await problemOf(user)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '1')}`)).groups.map((g) => g.revision)).toEqual(['2'])
  })

  it('30-day retention drops superseded changes, keeps every head, and expires older cursors', async () => {
    const user = await member(client)
    const id = await createWallet(user, 'Cash')
    expect((await client.as(user).patch(`/v1/wallets/${id}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    await createWallet(user, 'Bank')
    await createWallet(user, 'Savings')
    const now = Date.now()
    await sqlExec(user, 'UPDATE entity_changes SET committed_at = ? WHERE revision <= 3', new Date(now - 31 * DAY).toISOString())
    expect(await prune(user, now)).toBe(true)
    const rows = await sqlRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM entity_changes ORDER BY revision')
    // Cash's create (revision 1) was superseded by its rename; every head stays.
    expect(rows.map((row) => row.revision)).toEqual(['2', '3', '4'])
    expect((await sqlRows<{ p: string }>(user, 'SELECT CAST(pruned_through AS TEXT) AS p FROM sync_state WHERE id = 1'))[0].p).toBe('3')
    expect(await problemOf(user, `?cursor=${encodeSyncCursor(user.sub, '2')}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '3')}`)).groups.map((g) => g.revision)).toEqual(['4'])
    // Changes inside the 30 days stay, whatever the caller's clock says.
    await sqlExec(user, 'UPDATE entity_changes SET committed_at = ? WHERE revision = 4', new Date(now - 29 * DAY).toISOString())
    expect(await prune(user, now)).toBe(false)
    expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '3')}`)).groups.map((g) => g.revision)).toEqual(['4'])
  })

  it('refuses to serve a stored change that no longer matches its entity DTO', async () => {
    const user = await member(client)
    await createWallet(user)
    await sqlExec(user, "UPDATE entity_changes SET snapshot = json_set(snapshot, '$.extra', 1) WHERE revision = 1")
    expect(await problemOf(user)).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
  })

  it('a cursor is bound to its account and names a revision, nothing else', () => {
    const account = randomUUID()
    const cursor = encodeSyncCursor(account, '42')
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{16,200}$/)
    expect(decodeSyncCursor(account, cursor)).toBe('42')
    expect(() => decodeSyncCursor(randomUUID(), cursor)).toThrow()
    expect(cursor).not.toContain(account)
  })

  it('a cursor from an earlier lifecycle generation needs a resync', async () => {
    // Partly ported: the vault has no lifecycle generation until 1B's deletion, so it is always 0. The API's case
    // (a generation that moved on) needs that column. Here a cursor from another generation resyncs, and the current one serves.
    const user = await member(client)
    await createWallet(user)
    expect(await problemOf(user, `?cursor=${encodeSyncCursor(user.sub, '1', 1)}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    expect((await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '1')}`)).groups).toEqual([])
  })

  it('a page reads about its byte budget, not every group the limit allows', async () => {
    const user = await member(client)
    const commands = fixtureCommands(user, { registry: syncRegistry() })
    const big = 'x'.repeat(600 * 1024)
    for (let i = 0; i < 20; i += 1) await commands.create(purchase({ note: big }))
    let fetched = 0
    const first = await inVault(
      user,
      (c) => {
        // Counts the bytes of every row a read returns, as the API's test counts the rows its query returns.
        const counted = (text: string, ...values: unknown[]) => {
          const rows = c.sql.exec(text, ...values).toArray()
          fetched += Buffer.byteLength(JSON.stringify(rows))
          return {
            toArray: () => rows,
            one: () => {
              if (rows.length !== 1) throw new Error('expected one row')
              return rows[0]
            },
          }
        }
        return syncChanges({ ...c, sql: { exec: counted } as unknown as SqlStorage }, { limit: '1000' })
      },
      { registry: syncRegistry() },
    )
    expect(first.groups.length).toBeGreaterThan(1)
    expect(fetched).toBeLessThanOrEqual(2 * SYNC_PAGE_BYTES)
  })

  it('the retention line can never pass the account revision', async () => {
    const user = await member(client)
    await createWallet(user)
    await expect(
      runInDurableObject(vaultOf(user), (_vault, state) => {
        state.storage.sql.exec('UPDATE sync_state SET pruned_through = revision + 1 WHERE id = 1').toArray()
      }),
    ).rejects.toThrow(/CHECK constraint failed/)
  })
})

describe('GET /v1/sync/changes, ported from sync-api.integration.spec.ts', () => {
  it('snapshots validate exactly the entities the API registers', () => {
    // Partly ported: 1B-T6 registers export; 1B registers import_review and import_selection, and phase 4 slip_inbox. Until then,
    // every entity the vault registers is checked by exactly its sync validator.
    const registry = buildVaultRegistry()
    expect(registry.entityNames().sort()).toEqual(['budget', 'category', 'export', 'transaction', 'wallet'])
    for (const name of registry.entityNames()) expect(registry.entity(name)?.validate).toBe(SYNC_ENTITY_VALIDATORS[name])
  })

  it.todo('snapshots validate exactly the entities the API registers: every key of SYNC_ENTITY_VALIDATORS, once 1B and phase 4 register theirs')
  it.todo('requests, builds, and downloads a snapshot through short-lived grants, then continues with deltas (1B-T8)')
  it.todo('asking again while a snapshot is ready answers 200 with it (1B-T8)')

  it('serves whole, valid change groups and refuses bad parameters', async () => {
    const user = await member(client)
    for (const name of ['Cash', 'Bank', 'Savings']) await createWallet(user, name)
    const body = await pageFrom(user)
    expect(body.groups.length).toBeGreaterThan(2)
    expect(body.groups.every((group) => isCommittedChangeGroup(group))).toBe(true)
    expect(body.has_more).toBe(false)
    const again = await feed(user, `?cursor=${encodeURIComponent(body.next_cursor)}`)
    expect(await again.json()).toEqual({ groups: [], next_cursor: body.next_cursor, has_more: false })
    expect((await feed(user, '?limit=1001')).status).toBe(422)
    expect(await problemOf(user, '?cursor=nonsense')).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    await sqlExec(user, 'UPDATE sync_state SET pruned_through = 1 WHERE id = 1')
    expect(await problemOf(user)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
  })

  it('orders keys as jsonb does: shorter first, equal lengths bytewise, nested objects too, arrays kept in order', () => {
    const ordered = jsonbOrder({ bb: 1, list: [{ ccc: 1, d: 2 }, 'x'], a: { zz: 1, y: null }, ab: 2, aa: 3 }) as Record<string, unknown>
    expect(JSON.stringify(ordered)).toBe('{"a":{"y":null,"zz":1},"aa":3,"ab":2,"bb":1,"list":[{"d":2,"ccc":1},"x"]}')
    expect(jsonbOrder(null)).toBe(null)
    expect(jsonbOrder('6500')).toBe('6500')
  })

  it('serves each snapshot with its keys in the API\'s order: PostgreSQL jsonb, shortest key first, then bytewise', async () => {
    const user = await member(client)
    const cash = await createWallet(user, 'Cash')
    const bank = await createWallet(user, 'Bank')
    const seeded = await client.as(user).post('/v1/categories/builtins')
    const food = ((await seeded.json()) as { id: string; builtin_key: string | null }[]).find((category) => category.builtin_key === 'food')?.id
    const lunch = { id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: cash, category_id: food, merchant: 'ข้าวมันไก่', note: 'with soup' }
    expect((await client.as(user).post('/v1/transactions', lunch)).status).toBe(201)
    const move = { id: randomUUID(), type: 'transfer', amount_minor: '100', occurred_on: '2026-10-21', source_wallet_id: bank, destination_wallet_id: cash }
    expect((await client.as(user).post('/v1/transactions', move)).status).toBe(201)
    expect((await client.as(user).put('/v1/budgets/2026-10', { overall_limit_minor: '1800000', category_limits: [{ category_id: food, limit_minor: '600000' }] })).status).toBe(200)
    // JSON.parse keeps the order the body spells, so Object.keys reads the served order.
    const page = JSON.parse(await (await feed(user)).text()) as SyncChangesPage
    const orders: Record<string, string[]> = {}
    for (const change of page.groups.flatMap((group) => group.changes)) {
      const snapshot = change.snapshot as Record<string, unknown>
      const kind = change.entity === 'transaction' ? `transaction:${'wallet_id' in snapshot ? 'expense' : 'transfer'}` : change.entity
      orders[kind] = Object.keys(snapshot)
      if (change.entity === 'budget') orders['budget.category_limits'] = Object.keys((snapshot.category_limits as object[])[0])
    }
    expect(orders).toEqual({
      wallet: ['id', 'name', 'version', 'archived', 'currency', 'opening_minor', 'tracking_start'],
      category: ['id', 'type', 'color', 'label', 'version', 'archived', 'builtin_key'],
      'transaction:expense': ['id', 'note', 'type', 'version', 'merchant', 'wallet_id', 'deleted_at', 'category_id', 'occurred_on', 'amount_minor'],
      'transaction:transfer': ['id', 'note', 'type', 'version', 'merchant', 'deleted_at', 'occurred_on', 'amount_minor', 'source_wallet_id', 'destination_wallet_id'],
      budget: ['id', 'month', 'version', 'category_limits', 'overall_limit_minor'],
      'budget.category_limits': ['category_id', 'limit_minor'],
    })
  })

  it('a client behind retention recovers: 410, then a snapshot, then deltas from its cursor', async () => {
    // Partly ported: the snapshot half is 1B's. The client's line is the retention line, and deltas continue from it.
    const user = await member(client)
    await createWallet(user, 'Cash')
    const old = await pageFrom(user)
    await createWallet(user, 'Bank')
    await sqlExec(user, 'UPDATE sync_state SET pruned_through = 2 WHERE id = 1')
    expect(await problemOf(user, `?cursor=${encodeURIComponent(old.next_cursor)}`)).toMatchObject({ status: 410, code: 'RESYNC_REQUIRED' })
    await createWallet(user, 'Savings')
    const after = await pageFrom(user, `?cursor=${encodeSyncCursor(user.sub, '2')}`)
    expect(after.groups.map((g) => g.revision)).toEqual(['3'])
  })
})
