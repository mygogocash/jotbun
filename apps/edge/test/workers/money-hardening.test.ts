// Record and wallet regressions ported from
// apps/api/src/transactions/money-hardening.integration.spec.ts (15 cases).
// The DateStyle case is ported in changed form: the vault stores dates as TEXT
// and has no PostgreSQL DateStyle. The injected-failure case uses a SQLite
// trigger in this person's vault, where the API used a temporary plpgsql trigger.
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { BUILTIN_CATEGORIES } from '@gogospend/contracts'

import { builtinId, moneyFixtures } from './support/money-fixtures'
import { revisionOf, sqlExec, sqlRows } from './support/command-fixtures'
import { newUser, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

type Problem = { code?: string; fields?: Record<string, string>; current?: Record<string, unknown> }
const problemOf = async (res: Response): Promise<Problem> => (await res.json()) as Problem

type Setup = { user: TestUser; cash: string; expense: (overrides?: Record<string, unknown>) => Record<string, unknown> }

async function setup(): Promise<Setup> {
  const user = await money.member()
  const cash = await money.wallet(user, { opening_minor: '100000', tracking_start: '2026-09-01' })
  const expense = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides })
  return { user, cash, expense }
}

const del = (user: TestUser, id: string, version: number, key = randomUUID()) => client.as(user).del(`/v1/transactions/${id}`, { ifMatch: version, key })

const receiptsOf = async (user: TestUser) => (await sqlRows<{ n: number }>(user, 'SELECT count(*) AS n FROM command_receipts'))[0].n

describe('built-in seeding is an idempotent ensure', () => {
  it('returns the categories, and seeding again after the receipt is gone changes nothing', async () => {
    const user = await money.member()
    await sqlExec(user, 'DELETE FROM command_receipts')
    const again = await client.as(user).post('/v1/categories/builtins')
    expect(again.status).toBe(200)
    const body = (await again.json()) as { builtin_key: string; id: string }[]
    expect(body).toHaveLength(BUILTIN_CATEGORIES.length)
    expect(body[0]).toMatchObject({ builtin_key: 'food', id: builtinId(user, 'food') })
  })

  it('adds only the built-ins that are missing (e.g. one introduced later)', async () => {
    const user = newUser()
    await sqlExec(user, "INSERT INTO consents (kind, version, granted, updated_at) VALUES ('terms', 1, 1, '2026-10-25T00:00:00.000Z')")
    await sqlExec(
      user,
      "INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', 'food', NULL, '#F0A868', 0, 1, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')",
      builtinId(user, 'food'),
    )
    const seeded = await client.as(user).post('/v1/categories/builtins')
    expect(seeded.status).toBe(200)
    const body = (await seeded.json()) as { builtin_key: string }[]
    expect(body.map((c) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key))
    const changes = await sqlRows<{ n: number }>(user, "SELECT count(*) AS n FROM entity_changes WHERE entity = 'category'")
    expect(changes[0].n).toBe(BUILTIN_CATEGORIES.length - 1)
  })
})

describe('wallet setup rules', () => {
  it('a correction reason is refused when nothing is being corrected', async () => {
    const s = await setup()
    const res = await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { name: 'Pocket', correction_reason: 'entry_error' }, { ifMatch: 1 })
    expect(res.status).toBe(422)
    expect((await problemOf(res)).fields).toHaveProperty('correction_reason')
  })

  it('deleted records that can still be restored count as existing records', async () => {
    const s = await setup()
    const early = s.expense({ occurred_on: '2026-09-05' })
    await money.record(s.user, early)
    await del(s.user, early.id as string, 1)
    expect((await problemOf(await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1' }, { ifMatch: 1 }))).fields).toHaveProperty('correction_reason')
    expect((await problemOf(await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { tracking_start: '2026-09-10', correction_reason: 'entry_error' }, { ifMatch: 1 }))).fields).toHaveProperty('tracking_start')
    expect((await client.as(s.user).post(`/v1/transactions/${early.id}/restore`, {}, { ifMatch: 2 })).status).toBe(200)
  })

  it('dates read back as YYYY-MM-DD even when the connection uses a non-ISO DateStyle', async () => {
    // No DateStyle here. The columns are TEXT, and both SQL and HTTP still return YYYY-MM-DD.
    const s = await setup()
    const body = s.expense({ occurred_on: '2026-09-03' })
    await money.record(s.user, body)
    const [wallet] = await sqlRows<{ tracking_start: string }>(s.user, 'SELECT tracking_start FROM wallets WHERE id = ?', s.cash)
    expect(wallet.tracking_start).toBe('2026-09-01')
    const [first] = await sqlRows<{ first: string }>(s.user, 'SELECT min(occurred_on) AS first FROM transactions WHERE deleted_at IS NULL AND (wallet_id = ? OR source_wallet_id = ? OR destination_wallet_id = ?)', s.cash, s.cash, s.cash)
    expect(first.first).toBe('2026-09-03')
    const [record] = await sqlRows<{ occurred_on: string }>(s.user, 'SELECT occurred_on FROM transactions WHERE id = ?', body.id)
    expect(record.occurred_on).toBe('2026-09-03')
    expect(await (await client.as(s.user).get(`/v1/transactions/${body.id}`)).json()).toMatchObject({ occurred_on: '2026-09-03' })
  })
})

describe('record command semantics', () => {
  it('a replay after the record was deleted reports its current state', async () => {
    const s = await setup()
    const coffee = s.expense()
    const key = randomUUID()
    await client.as(s.user).post('/v1/transactions', coffee, { key })
    await del(s.user, coffee.id as string, 1)
    const replay = await client.as(s.user).post('/v1/transactions', coffee, { key })
    expect(replay.status).toBe(201)
    expect((await replay.json()).entity_state).toBe('deleted')
  })

  it('a stale restore is VERSION_CONFLICT with the current record, not a state error', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    await del(s.user, coffee.id as string, 1)
    await client.as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 })
    const stale = await client.as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 })
    expect(stale.status).toBe(409)
    expect((await problemOf(stale)).current).toMatchObject({ id: coffee.id, version: 3, deleted_at: null })
  })

  it('moving a record to a wallet that starts tracking later names the wallet field', async () => {
    const s = await setup()
    const later = await money.wallet(s.user, { tracking_start: '2026-09-25' })
    const coffee = s.expense()
    await money.record(s.user, coffee)
    const res = await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { wallet_id: later }, { ifMatch: 1 })
    expect(await problemOf(res)).toMatchObject({ code: 'DATE_BEFORE_TRACKING_START', fields: { wallet_id: expect.any(String) } })
  })

  it('an id whose record was purged cannot be reused', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    // What the purge leaves: no row, a purged head. The head's revision stays the current one.
    await sqlExec(s.user, 'DELETE FROM transactions WHERE id = ?', coffee.id)
    await sqlExec(s.user, "UPDATE entity_heads SET state = 'purged', version = version + 1 WHERE entity = 'transaction' AND entity_id = ?", coffee.id)
    const reused = await client.as(s.user).post('/v1/transactions', { ...coffee })
    expect(reused.status).toBe(410)
    expect((await problemOf(reused)).code).toBe('ENTITY_PURGED')
  })

  it('an equivalent retry replays and a changed one is a mismatch', async () => {
    const s = await setup()
    const key = randomUUID()
    const first = await client.as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', note: 'flat white', merchant: null }), { key })
    const padded = await client.as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', note: ' flat white\r\n', merchant: '  ' }), { key })
    expect(await padded.json()).toEqual(await first.json())
    const changed = await client.as(s.user).post('/v1/transactions', s.expense({ id: 'b6f0c9a2-3d4e-4f5a-8b7c-1d2e3f4a5b6c', amount_minor: '6600', note: 'flat white' }), { key })
    expect((await problemOf(changed)).code).toBe('IDEMPOTENCY_MISMATCH')
  })

  it('receipts and audit rows never hold notes, merchants or amounts', async () => {
    const s = await setup()
    await money.record(s.user, s.expense({ amount_minor: '7654321', note: 'private-note-text', merchant: 'Secret Merchant' }))
    const rows = await sqlRows<{ text: string }>(
      s.user,
      `SELECT kind || ' ' || entity || ' ' || outcome || ' ' || entity_state AS text FROM command_receipts
       UNION ALL SELECT kind || ' ' || metadata || ' ' || client_id FROM audit_events`,
    )
    expect(rows.map((row) => row.text).join('\n')).not.toMatch(/private-note-text|Secret Merchant|7654321/)
  })

  it('delete needs If-Match, and another account cannot delete or restore', async () => {
    const s = await setup()
    const other = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    expect((await client.as(s.user).del(`/v1/transactions/${coffee.id}`)).status).toBe(422)
    expect((await del(other.user, coffee.id as string, 1)).status).toBe(404)
    expect((await client.as(other.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 1 })).status).toBe(404)
  })
})

describe('failure and race atomicity', () => {
  it('a failure after the row was written rolls back the row, change log, receipt and revision together', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    await sqlExec(
      s.user,
      `CREATE TRIGGER fail_on_4242 AFTER UPDATE ON transactions
       WHEN NEW.amount_minor = 4242
       BEGIN
         SELECT RAISE(ABORT, 'injected failure');
       END`,
    )
    try {
      const [revision, receipts] = [await revisionOf(s.user), await receiptsOf(s.user)]
      const res = await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '4242' }, { ifMatch: 1 })
      expect(res.status).toBe(500)
      expect(await (await client.as(s.user).get(`/v1/transactions/${coffee.id}`)).json()).toMatchObject({ amount_minor: '6500', version: 1 })
      expect([await revisionOf(s.user), await receiptsOf(s.user)]).toEqual([revision, receipts])
    } finally {
      await sqlExec(s.user, 'DROP TRIGGER fail_on_4242')
    }
  })

  it('of an edit, a delete and another edit from one version exactly one commits, with one receipt and one revision', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    const [revision, receipts] = [await revisionOf(s.user), await receiptsOf(s.user)]
    const results = await Promise.all([
      client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '7000' }, { ifMatch: 1 }),
      del(s.user, coffee.id as string, 1),
      client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '8000' }, { ifMatch: 1 }),
    ])
    expect(results.filter((res) => res.status === 200)).toHaveLength(1)
    expect(results.filter((res) => res.status === 409)).toHaveLength(2)
    expect(BigInt(await revisionOf(s.user)) - BigInt(revision)).toBe(1n)
    expect((await receiptsOf(s.user)) - receipts).toBe(1)
  })

  it('every record read back over HTTP matches its SQL row', async () => {
    const g = await money.golden()
    for (const id of g.records) {
      const http = (await (await client.as(g.user).get(`/v1/transactions/${id}`)).json()) as Record<string, unknown>
      const [row] = await sqlRows<Record<string, unknown>>(
        g.user,
        `SELECT id, type, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note FROM transactions WHERE id = ?`,
        id,
      )
      for (const [key, value] of Object.entries(row)) {
        if (value !== null) expect(http[key]).toBe(value)
      }
    }
  })
})
