// The month summary in the vault. Ported by name and assertion from
// apps/api/src/summary/summary.integration.spec.ts, plus the budget-usage case of
// apps/api/src/budgets/m4-hardening.integration.spec.ts that Task 6 left to this
// task, and one exactness case: totals above Number.MAX_SAFE_INTEGER, written
// straight into the vault's table, come back as exact decimal strings.
import { runInDurableObject } from 'cloudflare:test'

import { beforeEach, describe, expect, it } from 'vitest'

import { GOLDEN_TOTALS } from '@api/transactions/fixtures/golden-diary'

import { revisionOf } from './support/command-fixtures'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { startV1, vaultOf } from './support/v1-client'
import type { V1Client } from './support/v1-client'

let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  client = await startV1()
  money = moneyFixtures(client)
})

const MONTH = '2026-09'

describe('month summary', () => {
  it('reports the golden month: transfers and opening balances are not income or spending', async () => {
    const g = await money.golden()
    const res = await client.as(g.user).get('/v1/summary?month=2026-09')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      month: '2026-09',
      income_minor: GOLDEN_TOTALS.income_minor,
      expense_minor: GOLDEN_TOTALS.expense_minor,
      balance_minor: '1555000',
      by_wallet: { [g.wallets.cash]: '-168200', [g.wallets.daily]: '1723200' },
      categories: expect.arrayContaining([
        { category_id: builtinId(g.user, 'salary'), type: 'income', total_minor: '2800000' },
        { category_id: builtinId(g.user, 'food'), type: 'expense', total_minor: '18200' },
        { category_id: builtinId(g.user, 'bills'), type: 'expense', total_minor: '1226800' },
      ]),
      budget: null,
      as_of_revision: await revisionOf(g.user),
    })
    expect(body.categories).toHaveLength(3)
  })

  it('budget usage counts every expense, capped or not, and never transfers', async () => {
    const g = await money.golden()
    expect((await client.as(g.user).put('/v1/budgets/2026-09', { overall_limit_minor: '1000000', category_limits: [{ category_id: builtinId(g.user, 'food'), limit_minor: '50000' }] })).status).toBe(200)
    const { budget } = await (await client.as(g.user).get('/v1/summary?month=2026-09')).json()
    expect(budget).toEqual({
      overall_limit_minor: '1000000',
      spent_minor: '1245000',
      remaining_minor: '-245000',
      categories: [{ category_id: builtinId(g.user, 'food'), limit_minor: '50000', spent_minor: '18200', remaining_minor: '31800' }],
    })
  })

  it('uses Bangkok calendar months: the last and first day of a month or year belong to their own month', async () => {
    const user = await money.member()
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2025-01-01' })
    const food = builtinId(user, 'food')
    await money.bulkRecords(user, [
      { type: 'expense', amount_minor: '1', occurred_on: '2025-11-30', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '10', occurred_on: '2025-12-01', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '100', occurred_on: '2025-12-31', wallet_id: wallet, category_id: food },
      { type: 'expense', amount_minor: '1000', occurred_on: '2026-01-01', wallet_id: wallet, category_id: food },
    ])
    expect((await (await client.as(user).get('/v1/summary?month=2025-12')).json()).expense_minor).toBe('110')
    expect((await (await client.as(user).get('/v1/summary?month=2026-01')).json()).expense_minor).toBe('1000')
    expect((await (await client.as(user).get('/v1/summary?month=2025-11')).json()).expense_minor).toBe('1')
  })

  it('excludes deleted records and keeps renamed or archived categories', async () => {
    const g = await money.golden()
    const food = builtinId(g.user, 'food')
    expect((await client.as(g.user).patch(`/v1/categories/${food}`, { label: 'Meals' }, { ifMatch: 1 })).status).toBe(200)
    expect((await client.as(g.user).post(`/v1/categories/${food}/archive`, {}, { ifMatch: 2 })).status).toBe(200)
    expect((await client.as(g.user).del(`/v1/transactions/${g.records[2]}`, { ifMatch: 1 })).status).toBe(200)
    const body = await (await client.as(g.user).get('/v1/summary?month=2026-09')).json()
    expect(body.expense_minor).toBe('18200')
    expect(body.categories).toContainEqual({ category_id: food, type: 'expense', total_minor: '18200' })
  })

  it('an empty month is all zeros, and the month must be YYYY-MM', async () => {
    const user = await money.member()
    expect(await (await client.as(user).get('/v1/summary?month=2030-01')).json()).toMatchObject({ income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {}, categories: [], budget: null })
    expect((await client.as(user).get('/v1/summary?month=2026-13')).status).toBe(422)
    expect((await client.as(user).get('/v1/summary')).status).toBe(422)
  })
})

describe('budget and read-model edges (m4-hardening)', () => {
  it('budget usage keeps a sublimit whose category was archived later', async () => {
    const g = await money.golden()
    const food = builtinId(g.user, 'food')
    expect((await client.as(g.user).put(`/v1/budgets/${MONTH}`, { overall_limit_minor: '2000000', category_limits: [{ category_id: food, limit_minor: '50000' }] })).status).toBe(200)
    expect((await client.as(g.user).post(`/v1/categories/${food}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const { budget } = await (await client.as(g.user).get(`/v1/summary?month=${MONTH}`)).json()
    expect(budget.categories).toEqual([{ category_id: food, limit_minor: '50000', spent_minor: '18200', remaining_minor: '31800' }])
  })
})

describe('exactness beyond JavaScript numbers', () => {
  it('totals above Number.MAX_SAFE_INTEGER stay exact decimal strings in the summary, its budget usage and the history totals', async () => {
    const user = await money.member()
    const wallet = await money.wallet(user, { opening_minor: '0', tracking_start: '2026-01-01' })
    const food = builtinId(user, 'food')
    expect((await client.as(user).put('/v1/budgets/2026-02', { overall_limit_minor: '99999999999', category_limits: [{ category_id: food, limit_minor: '50000' }] })).status).toBe(200)
    const rows = 90_100
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      // 300 by 301 is 90,300 rows, under SQLite's recursion limit, and the insert keeps 90,100.
      state.storage.sql
        .exec(
          `WITH RECURSIVE
             a(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM a WHERE n < 300),
             b(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM b WHERE n < 301)
           INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at)
           SELECT printf('01900000-0000-4000-8000-%012d', (a.n - 1) * 301 + b.n), 'expense', 99999999999, '2026-02-01', ?, ?, 1, 'x', 'x'
             FROM a CROSS JOIN b
            LIMIT ?`,
          wallet,
          food,
          rows,
        )
        .toArray()
    })
    const total = (99_999_999_999n * BigInt(rows)).toString()
    expect(BigInt(total) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
    const month = await (await client.as(user).get('/v1/summary?month=2026-02')).json()
    expect(month).toMatchObject({ income_minor: '0', expense_minor: total, balance_minor: `-${total}`, by_wallet: { [wallet]: `-${total}` } })
    expect(month.categories).toEqual([{ category_id: food, type: 'expense', total_minor: total }])
    expect(month.budget).toEqual({
      overall_limit_minor: '99999999999',
      spent_minor: total,
      remaining_minor: (99_999_999_999n - BigInt(total)).toString(),
      categories: [{ category_id: food, limit_minor: '50000', spent_minor: total, remaining_minor: (50_000n - BigInt(total)).toString() }],
    })
    const history = await (await client.as(user).get('/v1/history?from=2026-02-01&through=2026-02-28&limit=1')).json()
    expect(history.summary).toEqual({ count: rows, income_minor: '0', expense_minor: total, balance_minor: `-${total}`, by_wallet: { [wallet]: `-${total}` } })
  }, 60_000)
})
