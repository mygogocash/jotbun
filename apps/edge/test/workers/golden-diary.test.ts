// The pinned golden diary and the exactness case, ported from
// apps/api/src/transactions/reconciliation.integration.spec.ts (5 cases).
// The balance above Number.MAX_SAFE_INTEGER is written with runInDurableObject,
// where the API inserted through PostgreSQL.
import { randomUUID } from 'node:crypto'

import { runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { GOLDEN_BALANCES, GOLDEN_RECORDS, GOLDEN_START, GOLDEN_TOTALS, GOLDEN_WALLETS } from '@api/transactions/fixtures/golden-diary'

import { builtinId, moneyFixtures } from './support/money-fixtures'
import { revisionOf, sqlRows } from './support/command-fixtures'
import { startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

type WalletView = { id: string; name: string; balance_minor: string }

/** Balances from the stored rows, added as BigInt, independent of walletBalances. */
async function sqlBalances(user: TestUser): Promise<Record<string, string>> {
  const wallets = await sqlRows<{ id: string; opening_minor: string }>(user, 'SELECT id, CAST(opening_minor AS TEXT) AS opening_minor FROM wallets')
  const records = await sqlRows<{ type: string; amount_minor: string; wallet_id: string | null; source_wallet_id: string | null; destination_wallet_id: string | null }>(
    user,
    'SELECT type, CAST(amount_minor AS TEXT) AS amount_minor, wallet_id, source_wallet_id, destination_wallet_id FROM transactions WHERE deleted_at IS NULL',
  )
  const balances = new Map(wallets.map((wallet) => [wallet.id, BigInt(wallet.opening_minor)]))
  for (const record of records) {
    const amount = BigInt(record.amount_minor)
    if (record.type === 'income' && record.wallet_id) balances.set(record.wallet_id, (balances.get(record.wallet_id) ?? 0n) + amount)
    else if (record.type === 'expense' && record.wallet_id) balances.set(record.wallet_id, (balances.get(record.wallet_id) ?? 0n) - amount)
    else if (record.type === 'transfer' && record.source_wallet_id && record.destination_wallet_id) {
      balances.set(record.source_wallet_id, (balances.get(record.source_wallet_id) ?? 0n) - amount)
      balances.set(record.destination_wallet_id, (balances.get(record.destination_wallet_id) ?? 0n) + amount)
    }
  }
  return Object.fromEntries([...balances].map(([id, balance]) => [id, balance.toString()]))
}

const pair = async (user: TestUser, wallets: { cash: string; daily: string }) => {
  const all = await money.balances(user)
  return [all[wallets.cash], all[wallets.daily]]
}
const total = (values: string[]) => values.reduce((sum, value) => sum + BigInt(value), 0n).toString()

describe('the golden diary', () => {
  it('golden_transfer_reconciles_both_wallets', async () => {
    const g = await money.golden()
    const wallets = (await (await client.as(g.user).get('/v1/wallets')).json()) as WalletView[]
    const cash = wallets.find((w) => w.id === g.wallets.cash)!
    const daily = wallets.find((w) => w.id === g.wallets.daily)!
    expect([cash.balance_minor, daily.balance_minor]).toEqual([GOLDEN_BALANCES.cash, GOLDEN_BALANCES.daily])
    expect([cash.balance_minor, daily.balance_minor]).toEqual(['235000', '1870000'])
    expect(total([cash.balance_minor, daily.balance_minor])).toBe(GOLDEN_BALANCES.total)
    expect(await sqlBalances(g.user)).toEqual({ [g.wallets.cash]: '235000', [g.wallets.daily]: '1870000' })
    expect(g.records).toHaveLength(GOLDEN_RECORDS.length)
    expect(wallets.every((w) => w.name === GOLDEN_WALLETS.cash.name || w.name === GOLDEN_WALLETS.daily.name)).toBe(true)
    const listed = (await (await client.as(g.user).get('/v1/wallets')).json()) as { tracking_start: string }[]
    expect(listed.every((w) => w.tracking_start === GOLDEN_START)).toBe(true)
    let income = 0n
    let expense = 0n
    for (const id of g.records) {
      const row = (await (await client.as(g.user).get(`/v1/transactions/${id}`)).json()) as { type: string; amount_minor: string }
      if (row.type === 'income') income += BigInt(row.amount_minor)
      if (row.type === 'expense') expense += BigInt(row.amount_minor)
    }
    expect({ income_minor: income.toString(), expense_minor: expense.toString() }).toEqual(GOLDEN_TOTALS)
    expect(Object.fromEntries(wallets.map((w: { name: string; balance_minor: string }) => [w.name, w.balance_minor]))).toEqual({ Cash: GOLDEN_BALANCES.cash, 'Daily account': GOLDEN_BALANCES.daily })
  })

  it('editing, deleting and restoring the transfer moves both wallets together and keeps the total', async () => {
    const g = await money.golden()
    const transferId = g.records[3]
    expect((await client.as(g.user).patch(`/v1/transactions/${transferId}`, { amount_minor: '100000' }, { ifMatch: 1 })).status).toBe(200)
    expect(await pair(g.user, g.wallets)).toEqual(['285000', '1820000'])
    expect((await client.as(g.user).del(`/v1/transactions/${transferId}`, { ifMatch: 2 })).status).toBe(200)
    expect(await pair(g.user, g.wallets)).toEqual(['385000', '1720000'])
    expect((await client.as(g.user).post(`/v1/transactions/${transferId}/restore`, {}, { ifMatch: 3 })).status).toBe(200)
    expect(await pair(g.user, g.wallets)).toEqual(['285000', '1820000'])
    expect(total(await pair(g.user, g.wallets))).toBe(GOLDEN_BALANCES.total)
    expect(await sqlBalances(g.user)).toEqual({ [g.wallets.cash]: '285000', [g.wallets.daily]: '1820000' })
  })

  it('a refused transfer edit changes neither wallet and leaves no receipt or revision', async () => {
    const g = await money.golden()
    const archived = await money.wallet(g.user, { opening_minor: '0', tracking_start: GOLDEN_START })
    expect((await client.as(g.user).post(`/v1/wallets/${archived}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const before = await revisionOf(g.user)
    const key = randomUUID()
    const refused = await client.as(g.user).patch(`/v1/transactions/${g.records[3]}`, { destination_wallet_id: archived }, { ifMatch: 1, key })
    expect(refused.status).toBe(422)
    expect(await pair(g.user, g.wallets)).toEqual(['235000', '1870000'])
    expect(await revisionOf(g.user)).toBe(before)
    const status = (await (await client.as(g.user).post('/v1/commands/status', { command_ids: [key] })).json()) as { statuses: { state: string }[] }
    expect(status.statuses[0].state).toBe('unknown')
  })

  it('edits that switch a transfer to the same wallet on both sides are refused', async () => {
    const g = await money.golden()
    const res = await client.as(g.user).patch(`/v1/transactions/${g.records[3]}`, { destination_wallet_id: g.wallets.cash }, { ifMatch: 1 })
    expect(res.status).toBe(422)
    expect(await pair(g.user, g.wallets)).toEqual(['235000', '1870000'])
  })
})

describe('exactness beyond JavaScript numbers', () => {
  it('a balance above Number.MAX_SAFE_INTEGER stays an exact decimal string', async () => {
    const user = await money.member()
    const wallet = await money.wallet(user, { opening_minor: '99999999999', tracking_start: '2026-01-01' })
    const rows = 90_100
    const category = builtinId(user, 'salary')
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      // 300 by 301 is 90,300 rows, under SQLite's recursion limit, and the insert keeps 90,100.
      state.storage.sql
        .exec(
          `WITH RECURSIVE
             a(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM a WHERE n < 300),
             b(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM b WHERE n < 301)
           INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at)
           SELECT printf('01900000-0000-4000-8000-%012d', (a.n - 1) * 301 + b.n), 'income', 99999999999, '2026-02-01', ?, ?, 1, 'x', 'x'
             FROM a CROSS JOIN b
            LIMIT ?`,
          wallet,
          category,
          rows,
        )
        .toArray()
    })
    const expected = (99_999_999_999n * BigInt(rows + 1)).toString()
    expect(BigInt(expected) > BigInt('9007199254740991')).toBe(true)
    const got = (await (await client.as(user).get(`/v1/wallets/${wallet}`)).json()) as { balance_minor: string }
    expect(got.balance_minor).toBe(expected)
  }, 60_000)
})
