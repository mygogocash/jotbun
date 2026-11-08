// Transactions in the vault: expense, income and transfer records, their edits,
// soft deletes and restores, and the wallet rules around them. Ported by name and
// assertion from apps/api/src/transactions/transactions.integration.spec.ts (17
// cases; the it.each rows run as they do there). The PostgreSQL role and grant
// case in 'database guards' is ported in changed form: the vault has no roles, so
// its refusals are the triggers on the transactions table. Cross-account
// references cannot be written at all here, because each person's records live
// only in that person's own vault.
import { randomUUID } from 'node:crypto'

import { runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { bangkokDate, isTransactionSnapshot } from '@gogospend/contracts'

import type { UserVault } from '../../src/vault/user-vault'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { revisionOf, countRows, sqlExec, sqlRows } from './support/command-fixtures'
import { startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

// 36 hours ahead is tomorrow or later for the server too, even across Bangkok midnight.
const today = () => bangkokDate(new Date())
const tomorrow = () => bangkokDate(new Date(Date.now() + 36 * 3_600_000))
const DAY_MS = 86_400_000

type Problem = { code?: string; message_key?: string; fields?: Record<string, string>; current?: Record<string, unknown> }
const problemOf = async (res: Response): Promise<Problem> => (await res.json()) as Problem

type Setup = { user: TestUser; cash: string; daily: string; expense: (overrides?: Record<string, unknown>) => Record<string, unknown> }

async function setup(): Promise<Setup> {
  const user = await money.member()
  const cash = await money.wallet(user, { name: 'Cash', opening_minor: '100000', tracking_start: '2026-09-01' })
  const daily = await money.wallet(user, { name: 'Daily', opening_minor: '0', tracking_start: '2026-09-15' })
  const expense = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: cash, category_id: builtinId(user, 'food'), ...overrides })
  return { user, cash, daily, expense }
}

const transfer = (s: Setup, overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'transfer', amount_minor: '1000', occurred_on: '2026-09-20', source_wallet_id: s.cash, destination_wallet_id: s.daily, ...overrides })

describe('recording expenses and income', () => {
  it('records an expense and an income, and wallet balances follow', async () => {
    const s = await setup()
    const coffee = s.expense({ note: ' flat white ', merchant: 'Cafe' })
    const res = await client.as(s.user).post('/v1/transactions', coffee)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ entity_id: coffee.id, version: 1, outcome: 'created', entity_state: 'active' })
    const got = await (await client.as(s.user).get(`/v1/transactions/${coffee.id}`)).json()
    expect(got).toEqual({ id: coffee.id, type: 'expense', amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: s.cash, category_id: builtinId(s.user, 'food'), note: 'flat white', merchant: 'Cafe', deleted_at: null, version: 1 })
    expect(isTransactionSnapshot(got)).toBe(true)
    await money.record(s.user, { type: 'income', amount_minor: '50000', occurred_on: '2026-09-21', wallet_id: s.cash, category_id: builtinId(s.user, 'salary') })
    expect((await money.balances(s.user))[s.cash]).toBe('143500')
  })

  it('two identical coffees with different ids and keys are both kept', async () => {
    const s = await setup()
    await money.record(s.user, s.expense())
    await money.record(s.user, s.expense())
    expect((await money.balances(s.user))[s.cash]).toBe('87000')
  })

  it.each<[string | number, string]>([
    ['0', 'MINOR_OUT_OF_RANGE'],
    ['-6500', 'MINOR_OUT_OF_RANGE'],
    ['100000000000', 'MINOR_OUT_OF_RANGE'],
    ['65.00', 'INVALID_MINOR'],
    [6500, 'INVALID_MINOR'],
  ])('refuses the amount %p (%s)', async (amount, code) => {
    const s = await setup()
    const res = await client.as(s.user).post('/v1/transactions', s.expense({ amount_minor: amount }))
    expect(res.status).toBe(422)
    expect(await problemOf(res)).toMatchObject({ code, fields: { amount_minor: expect.any(String) } })
  })

  it('accepts the largest amount and lets balances go negative', async () => {
    const s = await setup()
    await money.record(s.user, s.expense({ amount_minor: '99999999999' }))
    expect((await money.balances(s.user))[s.cash]).toBe('-99999899999')
  })

  it.each<[string, string]>([
    ['2026-02-30', 'INVALID_DATE'],
    ['2026-08-31', 'DATE_BEFORE_TRACKING_START'],
  ])('refuses the date %s (%s)', async (date, code) => {
    const s = await setup()
    const res = await client.as(s.user).post('/v1/transactions', s.expense({ occurred_on: date }))
    expect(await problemOf(res)).toMatchObject({ code, fields: { occurred_on: expect.any(String) } })
  })

  it("accepts today's Bangkok date but not tomorrow", async () => {
    const s = await setup()
    expect((await client.as(s.user).post('/v1/transactions', s.expense({ occurred_on: today() }))).status).toBe(201)
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ occurred_on: tomorrow() })))).code).toBe('DATE_IN_FUTURE')
  })

  it('an expense needs an owned, active expense category and an owned, active wallet', async () => {
    const s = await setup()
    const other = await setup()
    const wrongType = await client.as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(s.user, 'salary') }))
    expect(wrongType.status).toBe(422)
    expect((await problemOf(wrongType)).fields).toHaveProperty('category_id')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(other.user, 'food') })))).fields).toHaveProperty('category_id')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ wallet_id: other.cash })))).fields).toHaveProperty('wallet_id')
    expect((await client.as(s.user).post(`/v1/categories/${builtinId(s.user, 'fun')}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ category_id: builtinId(s.user, 'fun') })))).fields).toHaveProperty('category_id')
    const empty = await money.wallet(s.user, { opening_minor: '0' })
    expect((await client.as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ wallet_id: empty })))).fields).toHaveProperty('wallet_id')
  })

  it.each<[string, Record<string, unknown>, string]>([
    ['source_wallet_id', { source_wallet_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['owner_id', { owner_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['account_id', { account_id: randomUUID() }, 'UNKNOWN_FIELD'],
    ['type', { type: 'refund' }, 'VALIDATION_FAILED'],
    ['wallet_id', { wallet_id: undefined }, 'VALIDATION_FAILED'],
    ['id', { id: 'not-a-uuid' }, 'VALIDATION_FAILED'],
  ])('refuses an invalid union branch or field: %s', async (_field, overrides, code) => {
    const s = await setup()
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense(overrides)))).code).toBe(code)
  })

  it('normalizes optional note and merchant; empty means none', async () => {
    const s = await setup()
    for (const blank of ['', '   ', null, undefined]) {
      const body = s.expense({ note: blank, merchant: blank })
      await money.record(s.user, body)
      expect(await (await client.as(s.user).get(`/v1/transactions/${body.id}`)).json()).toMatchObject({ note: null, merchant: null })
    }
    const multiline = s.expense({ note: 'line one\r\nline two' })
    await money.record(s.user, multiline)
    expect((await (await client.as(s.user).get(`/v1/transactions/${multiline.id}`)).json()).note).toBe('line one\nline two')
    expect((await client.as(s.user).post('/v1/transactions', s.expense({ note: 'n'.repeat(500) }))).status).toBe(201)
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ note: 'n'.repeat(501) })))).fields).toHaveProperty('note')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ merchant: 'm'.repeat(121) })))).fields).toHaveProperty('merchant')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', s.expense({ merchant: 'two\nlines' })))).fields).toHaveProperty('merchant')
  })
})

describe('transfers', () => {
  it('moves money between two owned wallets in one record', async () => {
    const s = await setup()
    const body = transfer(s)
    await money.record(s.user, body)
    expect(await (await client.as(s.user).get(`/v1/transactions/${body.id}`)).json()).toMatchObject({ type: 'transfer', source_wallet_id: s.cash, destination_wallet_id: s.daily })
    const balances = await money.balances(s.user)
    expect([balances[s.cash], balances[s.daily]]).toEqual(['99000', '1000'])
  })

  it('refuses the same wallet, foreign or archived wallets, categories, and dates before either tracking start', async () => {
    const s = await setup()
    const other = await setup()
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', transfer(s, { destination_wallet_id: s.cash })))).fields).toHaveProperty('destination_wallet_id')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', transfer(s, { destination_wallet_id: other.daily })))).fields).toHaveProperty('destination_wallet_id')
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', { ...transfer(s), category_id: builtinId(s.user, 'food') }))).code).toBe('UNKNOWN_FIELD')
    // Daily starts tracking on 2026-09-15.
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', transfer(s, { occurred_on: '2026-09-10' })))).code).toBe('DATE_BEFORE_TRACKING_START')
    const empty = await money.wallet(s.user, { opening_minor: '0' })
    expect((await client.as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    expect((await problemOf(await client.as(s.user).post('/v1/transactions', transfer(s, { source_wallet_id: empty })))).fields).toHaveProperty('source_wallet_id')
  })
})

describe('edit, delete and restore', () => {
  it('edits need the current version; a stale edit is VERSION_CONFLICT with the current record', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    const edited = await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '7000', note: 'large' }, { ifMatch: 1 })
    expect(await edited.json()).toMatchObject({ outcome: 'updated', version: 2 })
    const stale = await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 1 })
    expect(stale.status).toBe(409)
    expect(await problemOf(stale)).toMatchObject({ code: 'VERSION_CONFLICT', current: { id: coffee.id, amount_minor: '7000', note: 'large', version: 2 } })
    expect((await problemOf(await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { type: 'income' }, { ifMatch: 2 }))).code).toBe('UNKNOWN_FIELD')
    expect((await problemOf(await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { source_wallet_id: s.daily }, { ifMatch: 2 }))).code).toBe('UNKNOWN_FIELD')
    expect((await money.balances(s.user))[s.cash]).toBe('93000')
  })

  it('delete hides the record from balances at once; restore within 30 days brings it back', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    const deleted = await client.as(s.user).del(`/v1/transactions/${coffee.id}`, { ifMatch: 1 })
    expect(await deleted.json()).toMatchObject({ outcome: 'deleted', entity_state: 'deleted', version: 2 })
    expect((await (await client.as(s.user).get(`/v1/transactions/${coffee.id}`)).json()).deleted_at).toEqual(expect.any(String))
    expect((await money.balances(s.user))[s.cash]).toBe('100000')
    expect((await problemOf(await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 2 }))).code).toBe('ENTITY_DELETED')
    const restored = await client.as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 2 })
    expect(await restored.json()).toMatchObject({ outcome: 'restored', entity_state: 'active', version: 3 })
    expect((await money.balances(s.user))[s.cash]).toBe('93500')
    expect((await client.as(s.user).post(`/v1/transactions/${coffee.id}/restore`, {}, { ifMatch: 3 })).status).toBe(422)
  })

  it('restore fails after 30 days, and while a referenced wallet or category is archived', async () => {
    const s = await setup()
    const old = s.expense()
    await money.record(s.user, old)
    await client.as(s.user).del(`/v1/transactions/${old.id}`, { ifMatch: 1 })
    // The vault clock is pinned a week ahead and the deletion backdated 31 days from it: past the restore window, yet
    // the purge alarm the next commit arms is still in the real future, so no purge runs during the case (ruling R6).
    const at = Date.now() + 7 * DAY_MS
    await runInDurableObject(vaultOf(s.user), (vault: UserVault) => {
      vault.clock = () => new Date(at)
    })
    await sqlExec(s.user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(at - 31 * DAY_MS).toISOString(), old.id)
    const expired = await client.as(s.user).post(`/v1/transactions/${old.id}/restore`, {}, { ifMatch: 2 })
    expect(expired.status).toBe(409)
    expect(await problemOf(expired)).toMatchObject({ code: 'ENTITY_DELETED', message_key: 'errors.restore_expired' })

    const pets = randomUUID()
    expect((await client.as(s.user).post('/v1/categories', { id: pets, type: 'expense', label: 'Pets' })).status).toBe(201)
    const food = s.expense({ category_id: pets })
    await money.record(s.user, food)
    await client.as(s.user).del(`/v1/transactions/${food.id}`, { ifMatch: 1 })
    expect((await client.as(s.user).post(`/v1/categories/${pets}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    expect((await problemOf(await client.as(s.user).post(`/v1/transactions/${food.id}/restore`, {}, { ifMatch: 2 }))).fields).toHaveProperty('category_id')
    // Every commit above armed the alarm in the real future, so the expired record was never purged during the case.
    expect((await runInDurableObject(vaultOf(s.user), (_vault, state) => state.storage.getAlarm())) ?? 0).toBeGreaterThan(Date.now())
    expect(await sqlRows(s.user, 'SELECT 1 FROM transactions WHERE id = ?', old.id)).toHaveLength(1)
  })

  it('renaming_category_preserves_historical_reference', async () => {
    const s = await setup()
    const originalCategory = { id: randomUUID() }
    expect((await client.as(s.user).post('/v1/categories', { id: originalCategory.id, type: 'expense', label: 'Pets' })).status).toBe(201)
    const vet = s.expense({ category_id: originalCategory.id })
    await money.record(s.user, vet)
    expect((await client.as(s.user).patch(`/v1/categories/${originalCategory.id}`, { label: 'Animals' }, { ifMatch: 1 })).status).toBe(200)
    expect((await (await client.as(s.user).get(`/v1/transactions/${vet.id}`)).json()).category_id).toBe(originalCategory.id)
  })

  it('of two edits from the same version one wins, with no extra receipt or revision for the loser', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    const before = await revisionOf(s.user)
    const results = await Promise.all(['7000', '8000'].map((amount) => client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: amount }, { ifMatch: 1 })))
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    expect(BigInt(await revisionOf(s.user)) - BigInt(before)).toBe(1n)
  })

  it("another account's record is NOT_FOUND", async () => {
    const s = await setup()
    const other = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    expect((await client.as(other.user).get(`/v1/transactions/${coffee.id}`)).status).toBe(404)
    expect((await client.as(other.user).patch(`/v1/transactions/${coffee.id}`, { amount_minor: '1' }, { ifMatch: 1 })).status).toBe(404)
  })
})

describe('wallet rules once records exist', () => {
  it('an opening correction needs a reason, and tracking cannot start after an existing record', async () => {
    const s = await setup()
    await money.record(s.user, s.expense({ occurred_on: '2026-09-20' }))
    const noReason = await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1' }, { ifMatch: 1 })
    expect(noReason.status).toBe(422)
    expect((await problemOf(noReason)).fields).toHaveProperty('correction_reason')
    expect((await problemOf(await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { tracking_start: '2026-09-21', correction_reason: 'entry_error' }, { ifMatch: 1 })))).toMatchObject({ fields: { tracking_start: expect.any(String) } })
    expect((await client.as(s.user).patch(`/v1/wallets/${s.cash}`, { opening_minor: '1', correction_reason: 'balance_reconciliation' }, { ifMatch: 1 })).status).toBe(200)
    expect((await money.balances(s.user))[s.cash]).toBe('-6499')
  })

  it('archiving needs the derived balance, records included, to be zero', async () => {
    const s = await setup()
    const empty = await money.wallet(s.user, { opening_minor: '0', tracking_start: '2026-09-01' })
    await money.record(s.user, s.expense({ wallet_id: empty, amount_minor: '100' }))
    expect((await client.as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(422)
    await money.record(s.user, { type: 'income', amount_minor: '100', occurred_on: '2026-09-20', wallet_id: empty, category_id: builtinId(s.user, 'gift') })
    expect((await client.as(s.user).post(`/v1/wallets/${empty}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
  })
})

describe('database guards', () => {
  it('refuses a row whose category has the other type, and an update that changes a record against its category', async () => {
    const s = await setup()
    const insert = (wallet: string, category: string) =>
      sqlExec(s.user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 1, '2026-09-20', ?, ?, 1, 'x', 'x')", randomUUID(), wallet, category)
    await expect(insert(s.cash, builtinId(s.user, 'salary'))).rejects.toThrow(/category of its own type/)
    const coffee = s.expense()
    await money.record(s.user, coffee)
    await expect(sqlExec(s.user, "UPDATE transactions SET type = 'income' WHERE id = ?", coffee.id)).rejects.toThrow(/category of its own type/)
    expect(await countRows(s.user, 'transactions')).toBe(1)
  })
})

describe('the delta feed', () => {
  it('serves each record change, and every change passes the persisted-DTO check the feed applies', async () => {
    const s = await setup()
    const coffee = s.expense()
    await money.record(s.user, coffee)
    await client.as(s.user).patch(`/v1/transactions/${coffee.id}`, { note: 'large' }, { ifMatch: 1 })
    const res = await client.as(s.user).get('/v1/sync/changes')
    expect(res.status).toBe(200)
    const page = (await res.json()) as { groups: { changes: { entity: string; id: string; version: number; state: string; snapshot: unknown }[] }[] }
    const changes = page.groups.flatMap((group) => group.changes).filter((change) => change.entity === 'transaction')
    expect(changes.map((change) => [change.id, change.version, change.state])).toEqual([
      [coffee.id, 1, 'active'],
      [coffee.id, 2, 'active'],
    ])
    for (const change of changes) expect(isTransactionSnapshot(change.snapshot)).toBe(true)
  })
})
