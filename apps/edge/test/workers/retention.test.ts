// Retention on the vault's alarm (1A-T8b, §6.2): a deleted record is purged 30
// days after its deletion, a superseded change is pruned 30 days on, and a
// receipt's request digest is dropped after the 30-day outbox lifetime. Ported by
// name from apps/api/src/privacy/retention.integration.spec.ts (14 cases): the
// five the plan lists, and three in changed form ('leaves an account being erased
// to its erasure', 'a failing step is reported and does not stop the others', and
// 'every prune works in bounded batches' as the 1,001-record case). Three are
// 1B's (exports, uploads, snapshots). Three do not apply: a lock wait, the
// security tables (D1's, in 1C) and PostgreSQL's planner. The receipt lists them.
// Time is the vault's clock (UserVault#clock), set through runInDurableObject.
// Alarms run through runDurableObjectAlarm, never by waiting. Each test takes
// t0 from Date.now() (R6), so every alarm it sets is about 30 days in the real
// future and never fires on its own.
import { randomUUID } from 'node:crypto'

import { evictAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CommandAck, SyncChangesPage } from '@gogospend/contracts'

import type { UserVault } from '../../src/vault/user-vault'
import { sqlExec, sqlRows } from './support/command-fixtures'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { createLunch, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

const DAY = 86_400_000
const NOTE = 'secret lunch with a private person'

const setClock = (user: TestUser, at: number) =>
  runInDurableObject(vaultOf(user), (v: UserVault) => {
    v.clock = () => new Date(at)
  })
const headState = (user: TestUser, id: string) => runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('SELECT state FROM entity_heads WHERE entity_id = ?', id).one().state)
const alarmOf = (user: TestUser) => runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())

type Head = { version: number; state: string; revision: string }
type Change = { revision: string; version: number; state: string; snapshot: string | null }

const headOf = async (user: TestUser, id: string): Promise<Head> =>
  (await sqlRows<Head>(user, 'SELECT version, state, CAST(revision AS TEXT) AS revision FROM entity_heads WHERE entity_id = ?', id))[0]
const changesOf = (user: TestUser, id: string) =>
  sqlRows<Change>(user, 'SELECT CAST(revision AS TEXT) AS revision, version, state, snapshot FROM entity_changes WHERE entity_id = ? ORDER BY revision', id)
const syncState = async (user: TestUser) =>
  (await sqlRows<{ revision: string; pruned_through: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision, CAST(pruned_through AS TEXT) AS pruned_through FROM sync_state WHERE id = 1'))[0]
const count = async (user: TestUser, query: string, ...args: unknown[]) => (await sqlRows<{ n: number }>(user, query, ...args))[0].n
const leaked = (user: TestUser) => count(user, 'SELECT count(*) AS n FROM entity_changes WHERE snapshot LIKE ?', `%${NOTE}%`)

type Diary = { user: TestUser; cash: string }

/** A member whose vault clock reads `at`, with the built-in categories (revision 1) and a Cash wallet opening at 0 (revision 2). */
async function diary(at: number): Promise<Diary> {
  const user = await member(client)
  await setClock(user, at)
  expect((await client.as(user).post('/v1/categories/builtins')).status).toBe(200)
  const cash = await money.wallet(user, { name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
  return { user, cash }
}

/** POST /v1/transactions with a fixed key and body, so it can be replayed. */
async function create(d: Diary, overrides: Record<string, unknown> = {}) {
  const body = { id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: d.cash, category_id: builtinId(d.user, 'food'), note: NOTE, ...overrides }
  const key = randomUUID()
  const res = await client.as(d.user).post('/v1/transactions', body, { key })
  expect(res.status).toBe(201)
  return { body, key, ack: (await res.json()) as CommandAck }
}

async function remove(user: TestUser, id: string, version = 1): Promise<void> {
  expect((await client.as(user).del(`/v1/transactions/${id}`, { ifMatch: version })).status).toBe(200)
}

/** Moves a record's history and its deletion `days` before `now` (the API's age). */
async function age(user: TestUser, id: string, now: number, days: number): Promise<void> {
  const at = new Date(now - days * DAY).toISOString()
  await sqlExec(user, "UPDATE entity_changes SET committed_at = ? WHERE entity = 'transaction' AND entity_id = ?", at, id)
  await sqlExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NOT NULL', at, id)
}

/**
 * `n` deleted records written straight into the vault, deleted at `at`, each head
 * at version 2 and deleted, under one new revision (the HTTP route would spend
 * the write budget long before 1,001 records).
 */
async function seedDeleted(user: TestUser, lunch: string, n: number, at: number): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID())
  const deletedAt = new Date(at).toISOString()
  await runInDurableObject(vaultOf(user), (_v, s) =>
    s.storage.transactionSync(() => {
      const { wallet_id: wallet, category_id: category } = s.storage.sql.exec('SELECT wallet_id, category_id FROM transactions WHERE id = ?', lunch).one()
      s.storage.sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
      for (const id of ids) {
        s.storage.sql.exec(
          "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, deleted_at, created_at, updated_at) VALUES (?, 'expense', 100, '2026-10-20', ?, ?, 2, ?, ?, ?)",
          id,
          wallet,
          category,
          deletedAt,
          deletedAt,
          deletedAt,
        )
        s.storage.sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES ('transaction', ?, 1, 'active', (SELECT revision FROM sync_state WHERE id = 1))", id)
        s.storage.sql.exec("UPDATE entity_heads SET version = 2, state = 'deleted' WHERE entity = 'transaction' AND entity_id = ?", id)
      }
    }),
  )
  return ids
}

/** The cursor after every group, following next_cursor as a client does. */
async function latestCursor(user: TestUser): Promise<string> {
  let cursor: string | undefined
  for (;;) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=1000` : '?limit=1000'
    const page = (await (await client.as(user).get(`/v1/sync/changes${query}`)).json()) as SyncChangesPage
    cursor = page.next_cursor
    if (!page.has_more) return cursor
  }
}

describe('deleted records, ported from retention.integration.spec.ts', () => {
  it('purged_transactions_are_not_resurrected_by_receipts', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const record = await create(d)
    await remove(d.user, record.body.id)
    // Only the record ages, as in the API: its receipt keeps its digest, so the replay below still proves the request.
    await age(d.user, record.body.id, t0, 31)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)

    // The private row and every earlier change payload are gone; the head is a purged tombstone.
    expect(await sqlRows(d.user, 'SELECT 1 FROM transactions WHERE id = ?', record.body.id)).toEqual([])
    expect(await headOf(d.user, record.body.id)).toMatchObject({ version: 3, state: 'purged' })
    expect(await changesOf(d.user, record.body.id)).toEqual([expect.objectContaining({ version: 3, state: 'purged', snapshot: null })])
    expect(await leaked(d.user)).toBe(0)

    // The compact receipt answers a replay with the original outcome and the current (purged) state, and writes nothing.
    const replay = await client.as(d.user).post('/v1/transactions', record.body, { key: record.key })
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual({ ...record.ack, entity_state: 'purged' })
    expect(await sqlRows(d.user, 'SELECT 1 FROM transactions WHERE id = ?', record.body.id)).toEqual([])
    // A new command for the same id cannot bring it back either.
    expect((await client.as(d.user).post('/v1/transactions', record.body)).status).toBe(410)
    expect((await client.as(d.user).post(`/v1/transactions/${record.body.id}/restore`, {}, { ifMatch: 2 })).status).toBe(410)
    expect((await client.as(d.user).patch(`/v1/transactions/${record.body.id}`, { amount_minor: '1' }, { ifMatch: 2 })).status).toBe(410)
    expect((await client.as(d.user).get(`/v1/transactions/${record.body.id}`)).status).toBe(404)
    const status = (await (await client.as(d.user).post('/v1/commands/status', { command_ids: [record.key] })).json()) as { statuses: unknown[] }
    expect(status.statuses[0]).toEqual({ command_id: record.key, state: 'known', ack: { ...record.ack, entity_state: 'purged' } })
    // Purging again changes nothing.
    const head = await headOf(d.user, record.body.id)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect(await headOf(d.user, record.body.id)).toEqual(head)
  })

  it('a deleted record stops counting at once and can be undone within 30 days; nothing is purged early', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const kept = await create(d, { amount_minor: '1000' })
    const undone = await create(d, { amount_minor: '2000' })
    await remove(d.user, undone.body.id)
    expect((await money.balances(d.user))[d.cash]).toBe('-1000')
    await setClock(d.user, t0 + 29 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect(await headState(d.user, undone.body.id)).toBe('deleted')
    expect((await client.as(d.user).post(`/v1/transactions/${undone.body.id}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await money.balances(d.user))[d.cash]).toBe('-3000')
    expect(await headState(d.user, kept.body.id)).toBe('active')
  })

  it('tombstones reach delta readers, older cursors resync', async () => {
    // The snapshot half (snapshots built before the purge are dropped) is 1B's (1B-T8).
    const t0 = Date.now()
    const d = await diary(t0)
    const beforeRecord = await latestCursor(d.user)
    const record = await create(d)
    await remove(d.user, record.body.id)
    const afterDelete = await latestCursor(d.user)
    const deletedAt = (await syncState(d.user)).revision
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)

    // A reader that had seen the deletion gets the tombstone as one more group.
    const next = await client.as(d.user).get(`/v1/sync/changes?cursor=${encodeURIComponent(afterDelete)}`)
    expect(next.status).toBe(200)
    const groups = ((await next.json()) as SyncChangesPage).groups
    expect(groups.flatMap((group) => group.changes)).toEqual([{ entity: 'transaction', id: record.body.id, version: 3, state: 'purged', snapshot: null }])
    // A reader from before the record's changes resyncs: they no longer exist.
    const stale = await client.as(d.user).get(`/v1/sync/changes?cursor=${encodeURIComponent(beforeRecord)}`)
    expect(stale.status).toBe(410)
    expect(((await stale.json()) as { code?: string }).code).toBe('RESYNC_REQUIRED')
    expect(BigInt((await syncState(d.user)).pruned_through)).toBeGreaterThanOrEqual(BigInt(deletedAt))
    // A new snapshot reads the head's own change: a tombstone without data.
    const head = await headOf(d.user, record.body.id)
    expect(await sqlRows(d.user, 'SELECT snapshot FROM entity_changes WHERE entity_id = ? AND revision = CAST(? AS INTEGER)', record.body.id, head.revision)).toEqual([{ snapshot: null }])
  })

  it('leaves an account being erased to its erasure: no purge group is written for it', async () => {
    // Ported in changed form: the status is set directly, as 1C's DeletionWorkflow will set it. The vault
    // skips every job, and the alarm is cleared (§6.12, deletion step 2: "refuses writes and cancels alarms").
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await sqlExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    const revision = (await syncState(user)).revision
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('deleted')
    expect((await syncState(user)).revision).toBe(revision)
    expect(await count(user, 'SELECT count(*) AS n FROM command_receipts WHERE request_digest IS NULL')).toBe(0)
    expect(await alarmOf(user)).toBeNull()
  })
})

describe('other retention, ported from retention.integration.spec.ts', () => {
  it('drops receipt digests after the outbox lifetime: a replay is refused and never re-run; status still answers', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const old = await create(d)
    await setClock(d.user, t0 + 2 * DAY)
    const fresh = await create(d)
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    const digests = await sqlRows<{ command_id: string; dropped: number }>(
      d.user,
      'SELECT command_id, request_digest IS NULL AS dropped FROM command_receipts WHERE command_id IN (SELECT value FROM json_each(?))',
      JSON.stringify([old.key, fresh.key]),
    )
    expect(Object.fromEntries(digests.map((row) => [row.command_id, row.dropped]))).toEqual({ [old.key]: 1, [fresh.key]: 0 })
    const replay = await client.as(d.user).post('/v1/transactions', old.body, { key: old.key })
    expect(replay.status).toBe(409)
    expect(((await replay.json()) as { code?: string }).code).toBe('IDEMPOTENCY_MISMATCH')
    expect(await count(d.user, 'SELECT count(*) AS n FROM transactions')).toBe(2)
    const status = (await (await client.as(d.user).post('/v1/commands/status', { command_ids: [old.key] })).json()) as { statuses: unknown[] }
    expect(status.statuses[0]).toEqual({ command_id: old.key, state: 'known', ack: old.ack })
    // The fresh receipt still replays.
    expect(await (await client.as(d.user).post('/v1/transactions', fresh.body, { key: fresh.key })).json()).toEqual(fresh.ack)
  })

  it('removes a superseded change that sat below the retention line (S1 change log)', async () => {
    const t0 = Date.now()
    const d = await diary(t0)
    const record = await create(d)
    // Renaming the wallet supersedes its first change, so the prune is due and moves the line past the record's create.
    expect((await client.as(d.user).patch(`/v1/wallets/${d.cash}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    await setClock(d.user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    // The create is the head, so it survived and the retention line moved past it.
    expect(BigInt((await syncState(d.user)).pruned_through)).toBeGreaterThanOrEqual(BigInt((await headOf(d.user, record.body.id)).revision))
    expect(await changesOf(d.user, record.body.id)).toHaveLength(1)
    expect((await client.as(d.user).patch(`/v1/transactions/${record.body.id}`, { note: 'edited' }, { ifMatch: 1 })).status).toBe(200)
    // The create is now superseded below the line. It can go 30 days after the edit, and the alarm waits for that, not for a time already past.
    expect(await alarmOf(d.user)).toBe(t0 + 61 * DAY)
    // At exactly that time: the prune's 30 days are inclusive (ruling P2).
    await setClock(d.user, t0 + 61 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(d.user))).toBe(true)
    expect((await changesOf(d.user, record.body.id)).map((change) => change.version)).toEqual([2])
    expect(await leaked(d.user)).toBe(0)
  })

  it('a failing step is reported and does not stop the others', async () => {
    // Ported in changed form: a trigger makes the purge fail. The failure is logged, the prune and the digest drop
    // still run, and the alarm comes back a minute later, so a failing job is never retried in a loop.
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await sqlExec(user, "CREATE TRIGGER fail_purge BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'synthetic purge failure'); END")
    try {
      await setClock(user, t0 + 31 * DAY)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await headState(user, lunch)).toBe('deleted')
      expect(await count(user, 'SELECT count(*) AS n FROM command_receipts WHERE request_digest IS NOT NULL')).toBe(0)
      expect(await alarmOf(user)).toBe(t0 + 31 * DAY + 60_000)
    } finally {
      await sqlExec(user, 'DROP TRIGGER fail_purge')
    }
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })

  it('a purge retried after the prune moved the retention line never moves it back', async () => {
    // The purge fails while the prune still runs and moves the line past the lunch's deletion and the rename. The
    // retried purge's earlier changes sit below that line, so the line stays where it is: lowered, it would let a
    // cursor between the two lines read a delta missing the pruned changes, with no 410.
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    const [{ id: wallet }] = await sqlRows<{ id: string }>(user, 'SELECT id FROM wallets')
    expect((await client.as(user).patch(`/v1/wallets/${wallet}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    await sqlExec(user, "CREATE TRIGGER fail_purge BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT, 'synthetic purge failure'); END")
    try {
      await setClock(user, t0 + 31 * DAY)
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await headState(user, lunch)).toBe('deleted')
    } finally {
      await sqlExec(user, 'DROP TRIGGER fail_purge')
    }
    const line = (await syncState(user)).pruned_through
    expect(BigInt(line)).toBeGreaterThan(BigInt((await headOf(user, lunch)).revision))
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect((await syncState(user)).pruned_through).toBe(line)
  })
})

describe('the retention alarm', () => {
  it('a deleted record is purged by the alarm 30 days later, and the alarm follows the earliest job', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())).toBe(t0 + 30 * DAY)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
  })

  it('an alarm that fires after the vault slept still purges', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await evictAllDurableObjects()
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
  })

  it('with nothing left to do, the alarm is cleared', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    await createLunch(client, user)
    await setClock(user, t0 + 31 * DAY)
    await runDurableObjectAlarm(vaultOf(user)) // drops the receipt digests, the only due job
    expect(await runInDurableObject(vaultOf(user), (_v, s) => s.storage.getAlarm())).toBeNull()
  })

  it('the alarm follows the earliest job, and each record waits its own 30 days', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user) // its receipts' digests are due at t0 + 30 days
    await setClock(user, t0 + 5 * DAY)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 }) // the lunch is due at t0 + 35 days
    await setClock(user, t0 + 6 * DAY)
    const dinner = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${dinner}`, { ifMatch: 1 }) // the dinner is due at t0 + 36 days
    expect(await alarmOf(user)).toBe(t0 + 30 * DAY)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('deleted')
    expect(await alarmOf(user)).toBe(t0 + 35 * DAY)
    // Exactly 30 days after its deletion the lunch goes; the dinner, deleted a day later, stays.
    await setClock(user, t0 + 35 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, lunch)).toBe('purged')
    expect(await headState(user, dinner)).toBe('deleted')
    expect(await alarmOf(user)).toBe(t0 + 36 * DAY)
    await setClock(user, t0 + 36 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await headState(user, dinner)).toBe('purged')
    expect(await alarmOf(user)).toBeNull()
  })

  it('purges more records than SQLite has parameters, at most 1,000 to a change group', async () => {
    // The vault's 'every prune works in bounded batches': each group holds at most 1,000 records, and the id lists bind as one JSON parameter (R57).
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await seedDeleted(user, lunch, 1_001, t0)
    await setClock(user, t0 + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await count(user, "SELECT count(*) AS n FROM entity_heads WHERE entity = 'transaction' AND state = 'purged'")).toBe(1_001)
    expect(await count(user, 'SELECT count(*) AS n FROM transactions WHERE deleted_at IS NOT NULL')).toBe(0)
    const groups = await sqlRows<{ n: number }>(user, "SELECT count(*) AS n FROM entity_changes WHERE state = 'purged' GROUP BY revision ORDER BY revision")
    expect(groups.map((group) => group.n)).toEqual([1_000, 1])
  })

  it('an erased vault runs no retention and keeps no alarm, awake or after it sleeps', async () => {
    const t0 = Date.now()
    const user = await member(client)
    await setClock(user, t0)
    const lunch = await createLunch(client, user)
    await client.as(user).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })
    await vaultOf(user).erase()
    expect(await alarmOf(user)).toBeNull()
    for (const asleep of [false, true]) {
      if (asleep) await evictAllDurableObjects()
      await setClock(user, t0 + 31 * DAY)
      await runInDurableObject(vaultOf(user), (_v, s) => s.storage.setAlarm(t0 + DAY))
      expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
      expect(await alarmOf(user)).toBeNull()
      expect(await sqlRows(user, 'SELECT job FROM schedule')).toEqual([])
      expect(await sqlRows(user, 'SELECT account_id, status FROM account_state')).toEqual([{ account_id: '', status: 'deleted' }])
    }
  })
})
