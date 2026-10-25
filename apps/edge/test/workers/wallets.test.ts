// Wallets in the vault. Ported by name and assertion from
// apps/api/src/wallets/wallets.integration.spec.ts, with the brief's Thai-name
// case. Not ported: the database refuses a forged wallet row or any delete
// (PostgreSQL row-level security and grants). The vault has no such roles, and
// each person's wallets live only in that person's own vault.
import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { bangkokDate, isWalletSnapshot } from '@gogospend/contracts'

import { BASE, member, newUser, signedHeaders, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'
import { sqlExec, sqlRows } from './support/command-fixtures'

let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

const today = () => bangkokDate(new Date())
// 36 hours ahead is tomorrow or later for the server too, even across Bangkok midnight.
const tomorrow = () => bangkokDate(new Date(Date.now() + 36 * 3_600_000))
const wallet = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), name: 'Cash', opening_minor: '403200', tracking_start: '2026-01-01', ...overrides })

async function created(user: TestUser, overrides: Record<string, unknown> = {}) {
  const body = wallet(overrides)
  const res = await client.as(user).post('/v1/wallets', body)
  expect(res.status).toBe(201)
  return body
}

describe('creating wallets', () => {
  it('creates a THB wallet whose balance starts at its opening balance', async () => {
    const user = await member(client)
    const body = wallet({ name: '  Cash  ' })
    const res = await client.as(user).post('/v1/wallets', body)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ entity_id: body.id, version: 1, outcome: 'created', entity_state: 'active', committed_revision: '1' })
    const got = await client.as(user).get(`/v1/wallets/${body.id}`)
    expect(got.status).toBe(200)
    const dto = await got.json()
    expect(dto).toEqual({ id: body.id, name: 'Cash', currency: 'THB', opening_minor: '403200', balance_minor: '403200', tracking_start: '2026-01-01', archived: false, version: 1 })
    expect(await (await client.as(user).get('/v1/wallets')).json()).toEqual([dto])
    const [change] = await sqlRows<{ snapshot: string }>(user, 'SELECT snapshot FROM entity_changes')
    const snapshot = JSON.parse(change.snapshot)
    expect(isWalletSnapshot(snapshot)).toBe(true)
    expect(snapshot).toEqual({ ...dto, balance_minor: undefined })
  })

  it('a zero opening balance is valid and is not income', async () => {
    const user = await member(client)
    const body = await created(user, { opening_minor: '0' })
    expect(await (await client.as(user).get(`/v1/wallets/${body.id}`)).json()).toMatchObject({ opening_minor: '0', balance_minor: '0' })
  })

  it.each<[string | number, number, string?]>([
    ['99999999999', 201],
    ['100000000000', 422, 'MINOR_OUT_OF_RANGE'],
    ['-1', 422, 'MINOR_OUT_OF_RANGE'],
    ['1.50', 422, 'INVALID_MINOR'],
    ['007', 422, 'INVALID_MINOR'],
    [100, 422, 'INVALID_MINOR'],
  ])('opening %p → %i %s', async (opening, status, code) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', wallet({ opening_minor: opening }))
    expect(res.status).toBe(status)
    if (code) expect(await res.json()).toMatchObject({ code, fields: { opening_minor: expect.any(String) } })
  })

  it.each([
    ['2026-02-30', 'INVALID_DATE'],
    ['2026-1-01', 'INVALID_DATE'],
    ['1969-12-31', 'INVALID_DATE'],
  ])('tracking start %s is %s', async (start, code) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', wallet({ tracking_start: start }))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe(code)
  })

  it('tracking may start today in Bangkok but not tomorrow', async () => {
    const user = await member(client)
    expect((await client.as(user).post('/v1/wallets', wallet({ tracking_start: today() }))).status).toBe(201)
    const future = await client.as(user).post('/v1/wallets', wallet({ tracking_start: tomorrow() }))
    expect((await future.json()).code).toBe('DATE_IN_FUTURE')
  })

  it.each([[''], ['   '], ['x'.repeat(81)], ['Cash\nWallet'], ['Cash\u0000']])('refuses the name %p', async (name) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', wallet({ name }))
    expect(res.status).toBe(422)
    expect((await res.json()).fields).toHaveProperty('name')
  })

  it('accepts an 80-character Thai name', async () => {
    const user = await member(client)
    expect((await client.as(user).post('/v1/wallets', wallet({ name: 'ก'.repeat(80) }))).status).toBe(201)
  })

  it('a wallet name counts Thai code points as the API does: 80 accepted, 81 refused on name', async () => {
    const user = await member(client)
    const name80 = 'ก่'.repeat(40)
    expect((await client.as(user).post('/v1/wallets', { id: randomUUID(), name: name80, opening_minor: '0', tracking_start: '2026-10-01' })).status).toBe(201)
    const res = await client.as(user).post('/v1/wallets', { id: randomUUID(), name: `${name80}ก`, opening_minor: '0', tracking_start: '2026-10-01' })
    expect(res.status).toBe(422)
    expect((await res.json()).fields).toHaveProperty('name')
  })

  it.each([
    ['currency', 'USD'],
    ['owner_id', randomUUID()],
    ['balance_minor', '1'],
  ])('refuses the field %s', async (field, value) => {
    const user = await member(client)
    const res = await client.as(user).post('/v1/wallets', { ...wallet(), [field]: value })
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('UNKNOWN_FIELD')
  })

  it('needs an idempotency key and a supported command schema', async () => {
    const user = await member(client)
    const headers = { ...(await signedHeaders(user)), 'content-type': 'application/json', 'x-gogospend-command-schema': '1' }
    const noKey = await client.raw(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers, body: JSON.stringify(wallet()) }))
    expect((await noKey.json()).code).toBe('VALIDATION_FAILED')
    expect((await (await client.as(user).post('/v1/wallets', wallet(), { schema: null })).json()).code).toBe('COMMAND_SCHEMA_UNSUPPORTED')
    expect((await (await client.as(user).post('/v1/wallets', wallet(), { schema: 99 })).json()).code).toBe('COMMAND_SCHEMA_UNSUPPORTED')
  })

  it('a POST with an unknown field and no Idempotency-Key refuses on idempotency_key, as the API does', async () => {
    const user = await member(client)
    const headers = { ...(await signedHeaders(user)), 'content-type': 'application/json', 'x-gogospend-command-schema': '1' }
    const res = await client.raw(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers, body: JSON.stringify({ ...wallet(), currency: 'USD' }) }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { idempotency_key: expect.any(String) } })
  })

  it('a retried create replays its acknowledgement; a new key for the same id is a conflict', async () => {
    const user = await member(client)
    const body = wallet()
    const key = randomUUID()
    const first = await (await client.as(user).post('/v1/wallets', body, { key })).json()
    const again = await (await client.as(user).post('/v1/wallets', body, { key })).json()
    expect(again).toEqual(first)
    expect((await client.as(user).post('/v1/wallets', body)).status).toBe(409)
  })

  it('writes need the current required policies', async () => {
    const pending = newUser()
    expect((await (await client.as(pending).post('/v1/wallets', wallet())).json()).code).toBe('POLICY_ACCEPTANCE_REQUIRED')
  })
})

describe('editing wallets', () => {
  it('renames keep the id and bump the version; a stale version is VERSION_CONFLICT with the current wallet', async () => {
    const user = await member(client)
    const body = await created(user)
    const renamed = await client.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Pocket' }, { ifMatch: 1 })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ entity_id: body.id, version: 2, outcome: 'updated' })
    const stale = await client.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Purse' }, { ifMatch: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { id: body.id, name: 'Pocket', version: 2 } })
  })

  it('of two concurrent renames from the same version, exactly one wins', async () => {
    const user = await member(client)
    const body = await created(user)
    const results = await Promise.all(['Left', 'Right'].map((name) => client.as(user).patch(`/v1/wallets/${body.id}`, { name }, { ifMatch: 1 })))
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    expect((await (await client.as(user).get(`/v1/wallets/${body.id}`)).json()).version).toBe(2)
  })

  it('needs If-Match and at least one known field', async () => {
    const user = await member(client)
    const body = await created(user)
    expect(await (await client.as(user).patch(`/v1/wallets/${body.id}`, { name: 'X' })).json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { if_match: expect.any(String) } })
    expect((await client.as(user).patch(`/v1/wallets/${body.id}`, {}, { ifMatch: 1 })).status).toBe(422)
    expect((await (await client.as(user).patch(`/v1/wallets/${body.id}`, { currency: 'USD' }, { ifMatch: 1 })).json()).code).toBe('UNKNOWN_FIELD')
    expect((await (await client.as(user).patch(`/v1/wallets/${body.id}`, { id: randomUUID(), name: 'X' }, { ifMatch: 1 })).json()).code).toBe('UNKNOWN_FIELD')
  })

  it('a PATCH with an unknown field and no If-Match refuses on if_match, as the API does', async () => {
    const user = await member(client)
    const body = await created(user)
    const res = await client.as(user).patch(`/v1/wallets/${body.id}`, { currency: 'USD' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { if_match: expect.any(String) } })
  })

  it('an opening correction records its reason as an audit code, never as income', async () => {
    const user = await member(client)
    const body = await created(user)
    const res = await client.as(user).patch(`/v1/wallets/${body.id}`, { opening_minor: '500000', correction_reason: 'entry_error' }, { ifMatch: 1 })
    expect(res.status).toBe(200)
    expect(await (await client.as(user).get(`/v1/wallets/${body.id}`)).json()).toMatchObject({ opening_minor: '500000', balance_minor: '500000' })
    const [audit] = await sqlRows<{ metadata: string }>(user, 'SELECT metadata FROM audit_events ORDER BY revision DESC LIMIT 1')
    expect(JSON.parse(audit.metadata)).toEqual({ correction: 'entry_error' })
    expect((await client.as(user).patch(`/v1/wallets/${body.id}`, { opening_minor: '1', correction_reason: 'because' }, { ifMatch: 2 })).status).toBe(422)
  })
})

describe('archiving wallets', () => {
  it('needs a zero balance; an archived wallet stays readable but cannot be edited until unarchived', async () => {
    const user = await member(client)
    const funded = await created(user, { opening_minor: '100' })
    const refused = await client.as(user).post(`/v1/wallets/${funded.id}/archive`, {}, { ifMatch: 1 })
    expect(refused.status).toBe(422)
    expect((await refused.json()).message_key).toBe('errors.wallet_balance_not_zero')

    const empty = await created(user, { opening_minor: '0' })
    const archived = await client.as(user).post(`/v1/wallets/${empty.id}/archive`, {}, { ifMatch: 1 })
    expect(archived.status).toBe(200)
    expect(await archived.json()).toMatchObject({ outcome: 'archived', version: 2, entity_state: 'active' })
    expect(await (await client.as(user).get(`/v1/wallets/${empty.id}`)).json()).toMatchObject({ archived: true, version: 2 })
    expect((await client.as(user).post(`/v1/wallets/${empty.id}/archive`, {}, { ifMatch: 2 })).status).toBe(422)
    expect((await client.as(user).patch(`/v1/wallets/${empty.id}`, { name: 'Old' }, { ifMatch: 2 })).status).toBe(422)
    const restored = await client.as(user).post(`/v1/wallets/${empty.id}/unarchive`, {}, { ifMatch: 2 })
    expect(await restored.json()).toMatchObject({ outcome: 'unarchived', version: 3 })
    expect(await (await client.as(user).get(`/v1/wallets/${empty.id}`)).json()).toMatchObject({ id: empty.id, archived: false, version: 3 })
  })
})

describe('balances from records', () => {
  it('a balance is the opening balance plus live income and transfers, minus expenses; a correction needs a reason once a record exists', async () => {
    const user = await member(client)
    const cash = await created(user, { opening_minor: '10000', tracking_start: '1990-01-01' })
    const bank = await created(user, { opening_minor: '0', tracking_start: '1990-01-01' })
    // Transaction commands arrive in Task 6; until then the records are written directly.
    const category = randomUUID()
    await sqlExec(user, "INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', 'food', NULL, NULL, 0, 1, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')", category)
    await sqlExec(user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, created_at, updated_at) VALUES (?, 'expense', 1500, '1990-01-10', ?, ?, 1, 'x', 'x')", randomUUID(), cash.id, category)
    await sqlExec(user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, source_wallet_id, destination_wallet_id, version, created_at, updated_at) VALUES (?, 'transfer', 2000, '1990-01-11', ?, ?, 1, 'x', 'x')", randomUUID(), cash.id, bank.id)
    await sqlExec(user, "INSERT INTO transactions (id, type, amount_minor, occurred_on, source_wallet_id, destination_wallet_id, version, created_at, updated_at, deleted_at) VALUES (?, 'transfer', 900, '1990-01-12', ?, ?, 1, 'x', 'x', '1990-01-12T00:00:00.000Z')", randomUUID(), cash.id, bank.id)
    expect(await (await client.as(user).get(`/v1/wallets/${cash.id}`)).json()).toMatchObject({ balance_minor: '6500' })
    expect(await (await client.as(user).get(`/v1/wallets/${bank.id}`)).json()).toMatchObject({ balance_minor: '2000' })
    // The first record is on 1990-01-10: the opening balance is then a correction, and tracking cannot start after that record.
    const withoutReason = await client.as(user).patch(`/v1/wallets/${cash.id}`, { opening_minor: '20000' }, { ifMatch: 1 })
    expect(await withoutReason.json()).toMatchObject({ message_key: 'errors.correction_reason_required' })
    const lateStart = await client.as(user).patch(`/v1/wallets/${cash.id}`, { tracking_start: '1990-01-11', correction_reason: 'entry_error' }, { ifMatch: 1 })
    expect(await lateStart.json()).toMatchObject({ message_key: 'errors.records_before_tracking_start' })
    expect(await (await client.as(user).get(`/v1/wallets/${cash.id}`)).json()).toMatchObject({ opening_minor: '10000', balance_minor: '6500', version: 1 })
  })
})

describe('ownership', () => {
  it("another account's wallet is NOT_FOUND for reads and writes, like a missing one", async () => {
    const owner = await member(client)
    const other = await member(client)
    const body = await created(owner)
    expect((await client.as(other).get(`/v1/wallets/${body.id}`)).status).toBe(404)
    expect((await client.as(other).patch(`/v1/wallets/${body.id}`, { name: 'Mine' }, { ifMatch: 1 })).status).toBe(404)
    expect((await client.as(other).post(`/v1/wallets/${body.id}/archive`, {}, { ifMatch: 1 })).status).toBe(404)
    expect(await (await client.as(other).get('/v1/wallets')).json()).toEqual([])
    expect((await client.as(other).get('/v1/wallets/not-a-uuid')).status).toBe(404)
  })

  it('two accounts may use the same wallet id without seeing each other', async () => {
    const a = await member(client)
    const b = await member(client)
    const id = randomUUID()
    await created(a, { id, name: 'A' })
    await created(b, { id, name: 'B' })
    expect((await (await client.as(a).get(`/v1/wallets/${id}`)).json()).name).toBe('A')
    expect((await (await client.as(b).get(`/v1/wallets/${id}`)).json()).name).toBe('B')
  })
})
