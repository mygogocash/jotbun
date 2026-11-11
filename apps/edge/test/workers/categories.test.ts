// Categories in the vault. Ported by name and assertion from
// apps/api/src/categories/categories.integration.spec.ts. Not ported: the database
// refuses a forged category row or any delete (PostgreSQL grants and row-level
// security). The vault has no such roles; its triggers refuse an id change, a
// type or built-in key change and a delete (vault-schema.test.ts).
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { BUILTIN_CATEGORIES, isCategorySnapshot } from '@gogospend/contracts'

import { member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'
import { sqlExec, sqlRows } from './support/command-fixtures'

let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

const custom = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), type: 'expense', label: 'Pets', color: '#9CD4F5', ...overrides })

const changeCount = async (user: TestUser) => (await sqlRows<{ n: number }>(user, "SELECT count(*) AS n FROM entity_changes WHERE entity = 'category'"))[0].n

describe('built-in categories', () => {
  it('are seeded once, with stable derived ids, in the canonical order', async () => {
    const user = await member(client)
    expect(await (await client.as(user).get('/v1/categories')).json()).toEqual([])
    const seeded = await client.as(user).post('/v1/categories/builtins')
    expect(seeded.status).toBe(200)
    const list = await (await client.as(user).get('/v1/categories')).json()
    expect(await seeded.json()).toEqual(list)
    expect(list).toEqual(
      BUILTIN_CATEGORIES.map((builtin) => ({
        id: derivedUuid(user.sub, 'builtin-category', builtin.key),
        type: builtin.type,
        builtin_key: builtin.key,
        label: null,
        color: builtin.color,
        archived: false,
        version: 1,
      })),
    )
    expect(list.every(isCategorySnapshot)).toBe(true)
  })

  it('seeding again, or from two devices at once, replays one command', async () => {
    const user = await member(client)
    const [a, b] = await Promise.all([client.as(user).post('/v1/categories/builtins'), client.as(user).post('/v1/categories/builtins')])
    const c = await client.as(user).post('/v1/categories/builtins')
    expect(a.status).toBe(200)
    const body = await a.json()
    expect(await b.json()).toEqual(body)
    expect(await c.json()).toEqual(body)
    expect(await (await client.as(user).get('/v1/categories')).json()).toHaveLength(BUILTIN_CATEGORIES.length)
    expect(await changeCount(user)).toBe(BUILTIN_CATEGORIES.length)
  })

  it('the built-in ids and their seed command are derived exactly as the API derives them', async () => {
    const user = await member(client)
    const seeded = await (await client.as(user).post('/v1/categories/builtins')).json()
    expect(seeded.map((c: { builtin_key: string }) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key))
    for (const c of seeded) expect(c.id).toBe(derivedUuid(user.sub, 'builtin-category', c.builtin_key))
    const status = await (await client.as(user).post('/v1/commands/status', { command_ids: [derivedUuid(user.sub, 'seed-builtin-categories', ...BUILTIN_CATEGORIES.map((b) => b.key))] })).json()
    expect(status.statuses[0].state).toBe('known')
  })

  it('a built-in can be renamed and reverted to its localized name, keeping its id', async () => {
    const user = await member(client)
    await client.as(user).post('/v1/categories/builtins')
    const food = derivedUuid(user.sub, 'builtin-category', 'food')
    expect((await client.as(user).patch(`/v1/categories/${food}`, { label: '  Eating out ' }, { ifMatch: 1 })).status).toBe(200)
    expect((await (await client.as(user).get('/v1/categories')).json())[0]).toMatchObject({ id: food, builtin_key: 'food', label: 'Eating out', version: 2 })
    expect((await client.as(user).patch(`/v1/categories/${food}`, { label: null }, { ifMatch: 2 })).status).toBe(200)
    expect((await (await client.as(user).get('/v1/categories')).json())[0]).toMatchObject({ id: food, label: null, version: 3 })
  })
})

describe('custom categories', () => {
  it('are created explicitly with a label and an optional palette colour', async () => {
    const user = await member(client)
    const body = custom({ label: ' Pets ' })
    const res = await client.as(user).post('/v1/categories', body)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ entity_id: body.id, version: 1, outcome: 'created' })
    expect(await (await client.as(user).get('/v1/categories')).json()).toEqual([{ id: body.id, type: 'expense', builtin_key: null, label: 'Pets', color: '#9CD4F5', archived: false, version: 1 }])
    const neutral = custom({ type: 'income', label: 'Refunds', color: null })
    expect((await client.as(user).post('/v1/categories', neutral)).status).toBe(201)
  })

  it.each([
    ['type', { type: 'transfer' }],
    ['color', { color: '#000000' }],
    ['label', { label: '' }],
    ['label', { label: 'x'.repeat(81) }],
    ['id', { id: 'not-a-uuid' }],
  ])('refuses an invalid %s', async (field, overrides) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/categories', custom(overrides))
    expect(res.status).toBe(422)
    expect((await res.json()).fields).toHaveProperty(field)
  })

  it('refuses a built-in key or unknown fields on create', async () => {
    const user = await member(client)
    expect((await (await client.as(user).post('/v1/categories', { ...custom(), builtin_key: 'food' })).json()).code).toBe('UNKNOWN_FIELD')
  })

  it('an id already in use is VERSION_CONFLICT with the current category, whatever its type', async () => {
    const user = await member(client)
    const body = custom({ label: 'Pets' })
    await client.as(user).post('/v1/categories', body)
    const again = await client.as(user).post('/v1/categories', { ...body, type: 'income', label: 'Other' })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { id: body.id, type: 'expense', label: 'Pets', version: 1 } })
  })

  it('the type can never change, through the API or the database', async () => {
    const user = await member(client)
    const body = custom()
    await client.as(user).post('/v1/categories', body)
    expect((await (await client.as(user).patch(`/v1/categories/${body.id}`, { type: 'income' }, { ifMatch: 1 })).json()).code).toBe('UNKNOWN_FIELD')
    await expect(sqlExec(user, "UPDATE categories SET type = 'income' WHERE id = ?", body.id)).rejects.toThrow(/immutable/)
  })

  it('a custom label cannot be removed', async () => {
    const user = await member(client)
    const body = custom()
    await client.as(user).post('/v1/categories', body)
    expect((await client.as(user).patch(`/v1/categories/${body.id}`, { label: null }, { ifMatch: 1 })).status).toBe(422)
  })

  it('a stale edit is VERSION_CONFLICT with the current category', async () => {
    const user = await member(client)
    const body = custom()
    await client.as(user).post('/v1/categories', body)
    await client.as(user).patch(`/v1/categories/${body.id}`, { label: 'Animals' }, { ifMatch: 1 })
    const stale = await client.as(user).patch(`/v1/categories/${body.id}`, { color: '#F2857E' }, { ifMatch: 1 })
    expect(stale.status).toBe(409)
    expect((await stale.json()).current).toMatchObject({ id: body.id, label: 'Animals', version: 2 })
  })

  it('archiving keeps the category for history and can be undone; it is never deleted', async () => {
    const user = await member(client)
    const body = custom()
    await client.as(user).post('/v1/categories', body)
    expect(await (await client.as(user).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 1 })).json()).toMatchObject({ outcome: 'archived', version: 2 })
    expect((await (await client.as(user).get('/v1/categories')).json())[0]).toMatchObject({ id: body.id, archived: true })
    expect((await client.as(user).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 2 })).status).toBe(422)
    expect(await (await client.as(user).post(`/v1/categories/${body.id}/unarchive`, {}, { ifMatch: 2 })).json()).toMatchObject({ outcome: 'unarchived', version: 3 })
    expect((await client.as(user).del(`/v1/categories/${body.id}`)).status).toBe(404)
    await expect(sqlExec(user, 'DELETE FROM categories WHERE id = ?', body.id)).rejects.toThrow(/never deleted/)
  })

  it("another account's category is NOT_FOUND", async () => {
    const owner = await member(client)
    const other = await member(client)
    const body = custom()
    await client.as(owner).post('/v1/categories', body)
    expect((await client.as(other).patch(`/v1/categories/${body.id}`, { label: 'Mine' }, { ifMatch: 1 })).status).toBe(404)
    expect((await client.as(other).post(`/v1/categories/${body.id}/archive`, {}, { ifMatch: 1 })).status).toBe(404)
    expect(await (await client.as(other).get('/v1/categories')).json()).toEqual([])
  })
})
