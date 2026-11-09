// Monthly budgets in the vault. Ported by name and assertion from
// apps/api/src/budgets/budgets.integration.spec.ts and m4-hardening.integration.spec.ts.
// Not ported, under the not-applicable rule: the account-deletion cascade (1B), the
// worker role that cannot read budgets, and the REPEATABLE READ snapshot (PostgreSQL
// roles, grants and isolation). The history cursor, the history dates and the budget
// usage in the summary wait for Task 7, which owns those routes. The database backstop
// is proved by direct SQL that must throw, and the parent and child race becomes one
// call's transaction.
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { isBudgetSnapshot } from '@gogospend/contracts'

import { inVault, sqlExec, sqlRows } from './support/command-fixtures'
import { member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

const MONTH = '2026-09'
const MONTH_KEY = '2026-09-01'

/** A member whose built-in categories are seeded, as the budget routes expect. */
async function budgetUser(): Promise<TestUser> {
  const user = await member(client)
  expect((await client.as(user).post('/v1/categories/builtins')).status).toBe(200)
  return user
}

const builtin = (user: TestUser, key: string) => derivedUuid(user.sub, 'builtin-category', key)

/** A budget body: an overall limit and sublimits, by built-in key or by a 36-character category id. */
const budget = (user: TestUser, overall = '1000000', limits: [string, string][] = [['food', '50000']]) => ({
  overall_limit_minor: overall,
  category_limits: limits.map(([key, limit]) => ({ category_id: key.length === 36 ? key : builtin(user, key), limit_minor: limit })),
})

describe('setting a monthly budget', () => {
  it('creates the month budget once, then replaces it with the current version', async () => {
    const user = await budgetUser()
    const created = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user))
    expect(created.status).toBe(200)
    const ack = await created.json()
    expect(ack).toMatchObject({ outcome: 'created', version: 1, entity_id: derivedUuid(user.sub, 'monthly-budget', MONTH) })
    const got = await (await client.as(user).get(`/v1/budgets/${MONTH}`)).json()
    expect(got).toEqual({ id: ack.entity_id, month: MONTH, overall_limit_minor: '1000000', category_limits: [{ category_id: builtin(user, 'food'), limit_minor: '50000' }], version: 1 })
    expect(isBudgetSnapshot(got)).toBe(true)
    const replaced = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '900000', [['bills', '400000'], ['food', '60000']]), { ifMatch: 1 })
    expect(await replaced.json()).toMatchObject({ outcome: 'updated', version: 2 })
    const after = await (await client.as(user).get(`/v1/budgets/${MONTH}`)).json()
    expect(after.category_limits.map((limit: { limit_minor: string }) => limit.limit_minor).sort()).toEqual(['400000', '60000'])
    expect((await client.as(user).get('/v1/budgets/2026-10')).status).toBe(404)
  })

  it('a second create for the month, or a stale replace, is VERSION_CONFLICT with the current budget; replacing a missing month is NOT_FOUND', async () => {
    const user = await budgetUser()
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user))
    const again = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'))
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { month: MONTH, version: 1 } })
    expect((await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'), { ifMatch: 7 })).status).toBe(409)
    // Replacing a month with no budget is NOT_FOUND, not a conflict.
    expect((await client.as(user).put('/v1/budgets/2026-11', budget(user), { ifMatch: 1 })).status).toBe(404)
  })

  it('two devices creating the same month at once: exactly one wins', async () => {
    const user = await budgetUser()
    const results = await Promise.all([client.as(user).put(`/v1/budgets/${MONTH}`, budget(user)), client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000000'))])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  })

  it.each([
    ['overall_limit_minor', { overall_limit_minor: '0' }, 'MINOR_OUT_OF_RANGE'],
    ['overall_limit_minor', { overall_limit_minor: '100000000000' }, 'MINOR_OUT_OF_RANGE'],
    ['overall_limit_minor', { overall_limit_minor: 5 }, 'INVALID_MINOR'],
  ])('refuses %s %p', async (field, overrides, code) => {
    const user = await budgetUser()
    const res = await client.as(user).put(`/v1/budgets/${MONTH}`, { ...budget(user), ...overrides })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code, fields: { [field]: expect.any(String) } })
  })

  it('refuses invalid sublimits: zero, duplicate categories, sums above the overall limit', async () => {
    const user = await budgetUser()
    const zero = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '0']]))
    expect((await zero.json()).code).toBe('MINOR_OUT_OF_RANGE')
    const duplicate = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '10'], ['food', '20']]))
    expect((await duplicate.json()).fields).toHaveProperty('category_limits')
    const overSum = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600'], ['bills', '401']]))
    expect((await overSum.json()).fields).toHaveProperty('category_limits')
    expect((await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600'], ['bills', '400']]))).status).toBe(200)
    // Lowering the overall limit below the sublimits is refused too.
    const lowered = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '999', [['food', '600'], ['bills', '400']]), { ifMatch: 1 })
    expect((await lowered.json()).fields).toHaveProperty('category_limits')
  })

  it('sublimits need owned, active expense categories', async () => {
    const user = await budgetUser()
    const other = await budgetUser()
    const income = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['salary', '10']]))
    expect((await income.json()).fields).toHaveProperty('category_limits')
    const foreign = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [[builtin(other, 'food'), '10']]))
    expect((await foreign.json()).fields).toHaveProperty('category_limits')
    await client.as(user).post(`/v1/categories/${builtin(user, 'fun')}/archive`, {}, { ifMatch: 1 })
    const archived = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['fun', '10']]))
    expect((await archived.json()).fields).toHaveProperty('category_limits')
    expect((await (await client.as(user).put(`/v1/budgets/${MONTH}`, { ...budget(user), extra: 1 })).json()).code).toBe('UNKNOWN_FIELD')
  })

  it('keeps a limit for a category renamed or archived after it was set', async () => {
    const user = await budgetUser()
    const pets = randomUUID()
    await client.as(user).post('/v1/categories', { id: pets, type: 'expense', label: 'Pets' })
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [[pets, '100']]))
    await client.as(user).patch(`/v1/categories/${pets}`, { label: 'Animals' }, { ifMatch: 1 })
    await client.as(user).post(`/v1/categories/${pets}/archive`, {}, { ifMatch: 2 })
    expect((await (await client.as(user).get(`/v1/budgets/${MONTH}`)).json()).category_limits).toEqual([{ category_id: pets, limit_minor: '100' }])
    // Re-setting the same budget keeps the archived category (not a new reference).
    expect((await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000', [[pets, '100']]), { ifMatch: 1 })).status).toBe(200)
  })

  it.each([['2026-13'], ['2026-9'], ['1969-12'], ['september']])('refuses the month %s', async (month) => {
    const user = await budgetUser()
    const res = await client.as(user).put(`/v1/budgets/${month}`, budget(user))
    expect(res.status).toBe(422)
    expect((await res.json()).fields).toHaveProperty('month')
  })

  it("another account's budget is NOT_FOUND", async () => {
    const owner = await budgetUser()
    const other = await budgetUser()
    await client.as(owner).put(`/v1/budgets/${MONTH}`, budget(owner))
    expect((await client.as(other).get(`/v1/budgets/${MONTH}`)).status).toBe(404)
  })
})

describe('the database backstop', () => {
  it('refuses, in the database, sublimits that add up to more than the overall limit from either side, and an income sublimit', async () => {
    const user = await budgetUser()
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600']]))
    await expect(sqlExec(user, 'INSERT INTO budget_category_limits (month, category_id, limit_minor) VALUES (?, ?, 401)', MONTH_KEY, builtin(user, 'bills'))).rejects.toThrow(/exceed the overall budget/)
    await expect(sqlExec(user, 'UPDATE monthly_budgets SET overall_limit_minor = 599 WHERE month = ?', MONTH_KEY)).rejects.toThrow(/exceed the overall budget/)
    await expect(sqlExec(user, 'INSERT INTO budget_category_limits (month, category_id, limit_minor) VALUES (?, ?, 1)', MONTH_KEY, builtin(user, 'salary'))).rejects.toThrow(/expense category/)
  })

  it('a parent lowering and a child insert in one call cannot leave sublimits above the overall limit', async () => {
    const user = await budgetUser()
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600']]))
    // Parent first: the overall drops to the sublimits' sum, then a sublimit that breaks it is refused.
    await expect(
      inVault(user, (c) => {
        c.sql.exec('UPDATE monthly_budgets SET overall_limit_minor = 600 WHERE month = ?', MONTH_KEY).toArray()
        c.sql.exec('INSERT INTO budget_category_limits (month, category_id, limit_minor) VALUES (?, ?, 400)', MONTH_KEY, builtin(user, 'bills')).toArray()
      }),
    ).rejects.toThrow(/exceed the overall budget/)
    // Child first: the sublimit fits the overall, then the overall drops below the sum.
    await expect(
      inVault(user, (c) => {
        c.sql.exec('INSERT INTO budget_category_limits (month, category_id, limit_minor) VALUES (?, ?, 400)', MONTH_KEY, builtin(user, 'bills')).toArray()
        c.sql.exec('UPDATE monthly_budgets SET overall_limit_minor = 600 WHERE month = ?', MONTH_KEY).toArray()
      }),
    ).rejects.toThrow(/exceed the overall budget/)
    // Each call rolled back as a whole, so the budget is as it was.
    const [state] = await sqlRows<{ overall: string; limits: string }>(
      user,
      'SELECT CAST(b.overall_limit_minor AS TEXT) AS overall, CAST((SELECT coalesce(sum(l.limit_minor), 0) FROM budget_category_limits l WHERE l.month = b.month) AS TEXT) AS limits FROM monthly_budgets b',
    )
    expect(state).toEqual({ overall: '1000', limits: '600' })
  })
})

describe('budget edges', () => {
  it('replacing a month that has no budget is NOT_FOUND; a stale replace carries the current budget', async () => {
    const user = await budgetUser()
    expect((await client.as(user).put('/v1/budgets/2026-11', budget(user, '1000', []), { ifMatch: 1 })).status).toBe(404)
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', []))
    const stale = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '2000', []), { ifMatch: 9 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { month: MONTH, version: 1 } })
  })

  it('category_limits must be a list when present', async () => {
    const user = await budgetUser()
    const res = await client.as(user).put(`/v1/budgets/${MONTH}`, { overall_limit_minor: '1000', category_limits: null })
    expect(res.status).toBe(422)
    expect((await res.json()).fields).toHaveProperty('category_limits')
  })

  it('a replacement lowers the overall limit under the old sublimits when the new ones fit, and reads them back in category order', async () => {
    const user = await budgetUser()
    await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '1000', [['food', '600'], ['bills', '400']]))
    const replaced = await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user, '700', [['food', '300'], ['bills', '400']]), { ifMatch: 1 })
    expect(replaced.status).toBe(200)
    const got = await (await client.as(user).get(`/v1/budgets/${MONTH}`)).json()
    expect(got).toMatchObject({ overall_limit_minor: '700', version: 2 })
    expect(got.category_limits.map((limit: { category_id: string }) => limit.category_id)).toEqual([builtin(user, 'food'), builtin(user, 'bills')].sort())
  })

  it('its change is served by the sync feed as the persisted budget', async () => {
    const user = await budgetUser()
    const ack = await (await client.as(user).put(`/v1/budgets/${MONTH}`, budget(user))).json()
    const stored = await (await client.as(user).get(`/v1/budgets/${MONTH}`)).json()
    const page = await (await client.as(user).get('/v1/sync/changes')).json()
    const changes = page.groups.flatMap((group: { changes: { entity: string }[] }) => group.changes).filter((change: { entity: string }) => change.entity === 'budget')
    expect(changes).toEqual([{ entity: 'budget', id: ack.entity_id, version: 1, state: 'active', snapshot: stored }])
  })
})
