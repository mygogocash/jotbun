import { randomUUID } from 'node:crypto'

import { BUILTIN_CATEGORIES, isWalletSnapshot } from '@gogospend/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildContainer } from '../src/server/app/container'
import { BASE, startEdge, testSettings } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'

let edge: Edge

beforeAll(async () => {
  edge = await startEdge()
})

afterAll(async () => {
  await edge?.close()
})

const json = async (res: Response) => (res.headers.get('content-type')?.includes('json') ? res.json() : null)
const wallet = (overrides: Record<string, unknown> = {}) => ({ id: randomUUID(), name: 'Cash', opening_minor: '403200', tracking_start: '2026-01-01', ...overrides })

async function walletOf(user: SignedUp, overrides: Record<string, unknown> = {}) {
  const body = wallet(overrides)
  expect((await edge.as(user).post('/v1/wallets', body)).status).toBe(201)
  return body
}

describe('the v1 response envelope', () => {
  it('every response is no-store with its own request id and helmet-style headers', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/policies`))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.json()).toEqual([
      expect.objectContaining({ kind: 'privacy', version: 1, required: false, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } }),
      expect.objectContaining({ kind: 'terms', version: 1, required: true, text: { th: 'ข้อกำหนด', en: 'Terms' } }),
    ])
  })

  it('a client-sent request id is ignored', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/policies`, { headers: { 'x-request-id': 'spoofed' } }))
    expect(res.headers.get('x-request-id')).not.toBe('spoofed')
  })

  it('an unknown route is 404 NOT_FOUND as an ApiProblem when nothing is forwarded', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/nothing-here`))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message_key: 'errors.not_found' })
  })
})

describe('the access pipeline, in the API’s order', () => {
  it('no client header is 426 before any token check', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/wallets`))
    expect(res.status).toBe(426)
    expect((await res.json()).code).toBe('CLIENT_UPGRADE_REQUIRED')
  })

  it('an outdated client is 426', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/0.9.0' } }))
    expect(res.status).toBe(426)
  })

  it('no bearer token is 401 UNAUTHENTICATED', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token from an unpublished key is 401', async () => {
    const key = await edge.issuer.unpublishedKey()
    const token = await edge.issuer.sign({ iss: edge.issuer.issuer, sub: 'auth0|x', aud: 'https://api.gogospend.test', azp: 'native-client-test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 }, { key: key.privateKey })
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}` } }))
    expect(res.status).toBe(401)
  })

  it('a valid token without a session binding is 401 SESSION_REQUIRED', async () => {
    const user = await edge.member()
    const token = await edge.issuer.accessToken({ sub: user.who.subject })
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}` } }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('SESSION_REQUIRED')
  })

  it('another principal’s binding does not resolve', async () => {
    const owner = await edge.member()
    const other = await edge.member()
    const token = await edge.issuer.accessToken({ sub: other.who.subject })
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { headers: { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}`, 'x-gogospend-session': owner.binding } }))
    expect(res.status).toBe(401)
  })
})

describe('policies and the account', () => {
  it('writes wait for the current terms; accepting them opens writes', async () => {
    const user = await edge.fx.signUp()
    const blocked = await edge.as(user).post('/v1/wallets', wallet())
    expect(blocked.status).toBe(403)
    expect((await blocked.json()).code).toBe('POLICY_ACCEPTANCE_REQUIRED')
    const me = await json(await edge.as(user).get('/v1/me'))
    expect(me).toMatchObject({ account_id: user.accountId, status: 'active', pending_policies: [{ kind: 'terms', version: 1 }], privacy: { analytics: false } })
    const accept = await edge.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version: 1 })
    expect(accept.status).toBe(204)
    expect(await accept.text()).toBe('')
    expect((await edge.as(user).post('/v1/wallets', wallet())).status).toBe(201)
    expect((await json(await edge.as(user).get('/v1/me'))).pending_policies).toEqual([])
  })

  it('the policy check runs in the guard, before the body is validated', async () => {
    const user = await edge.fx.signUp()
    const res = await edge.as(user).post('/v1/wallets', wallet({ opening_minor: 'not money' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('POLICY_ACCEPTANCE_REQUIRED')
  })

  it('privacy preferences are saved and read back', async () => {
    const user = await edge.member()
    const res = await edge.as(user).put('/v1/me/privacy-preferences', { analytics: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ analytics: true })
    expect((await json(await edge.as(user).get('/v1/me'))).privacy).toEqual({ analytics: true })
    expect((await edge.as(user).put('/v1/me/privacy-preferences', { analytics: true, ads: true })).status).toBe(422)
  })

  it('signing out ends this binding only', async () => {
    const user = await edge.member()
    expect((await edge.as(user).post('/v1/me/logout')).status).toBe(204)
    expect((await edge.as(user).get('/v1/wallets')).status).toBe(401)
  })
})

describe('commands through the shared executor', () => {
  it('creates a wallet whose balance starts at its opening balance', async () => {
    const user = await edge.member()
    const body = wallet({ name: '  Cash  ' })
    const res = await edge.as(user).post('/v1/wallets', body)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ entity_id: body.id, version: 1, outcome: 'created', entity_state: 'active', committed_revision: '1' })
    const got = await edge.as(user).get(`/v1/wallets/${body.id}`)
    expect(got.status).toBe(200)
    const dto = await got.json()
    expect(dto).toEqual({ id: body.id, name: 'Cash', currency: 'THB', opening_minor: '403200', balance_minor: '403200', tracking_start: '2026-01-01', archived: false, version: 1 })
    expect(await json(await edge.as(user).get('/v1/wallets'))).toEqual([dto])
    const [change] = (await edge.db.admin((client) => client.query('SELECT snapshot FROM entity_changes WHERE account_id = $1', [user.accountId]))).rows
    expect(isWalletSnapshot(change.snapshot)).toBe(true)
  })

  it('a resent command replays its acknowledgement; the same key with other content is 409', async () => {
    const user = await edge.member()
    const key = randomUUID()
    const body = wallet()
    const first = await json(await edge.as(user).post('/v1/wallets', body, { key }))
    const again = await edge.as(user).post('/v1/wallets', body, { key })
    expect(again.status).toBe(201)
    expect(await again.json()).toEqual(first)
    const other = await edge.as(user).post('/v1/wallets', { ...body, name: 'Bank' }, { key })
    expect(other.status).toBe(409)
    expect((await other.json()).code).toBe('IDEMPOTENCY_MISMATCH')
  })

  it('an unsupported command schema is 422 before anything is written', async () => {
    const user = await edge.member()
    const res = await edge.as(user).post('/v1/wallets', wallet(), { schema: null })
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('COMMAND_SCHEMA_UNSUPPORTED')
  })

  it('a stale If-Match is 409 VERSION_CONFLICT with the current wallet', async () => {
    const user = await edge.member()
    const body = await walletOf(user)
    expect((await edge.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Bank' }, { ifMatch: 1 })).status).toBe(200)
    const stale = await edge.as(user).patch(`/v1/wallets/${body.id}`, { name: 'Pocket' }, { ifMatch: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { id: body.id, name: 'Bank', version: 2 } })
  })

  it('validation problems name the field', async () => {
    const user = await edge.member()
    const res = await edge.as(user).post('/v1/wallets', wallet({ opening_minor: '1.50' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'INVALID_MINOR', fields: { opening_minor: expect.any(String) } })
  })

  it('another account’s wallet looks like it does not exist (RLS)', async () => {
    const owner = await edge.member()
    const body = await walletOf(owner)
    const stranger = await edge.member()
    expect((await edge.as(stranger).get(`/v1/wallets/${body.id}`)).status).toBe(404)
    expect((await edge.as(stranger).patch(`/v1/wallets/${body.id}`, { name: 'Mine' }, { ifMatch: 1 })).status).toBe(404)
    expect(await json(await edge.as(stranger).get('/v1/wallets'))).toEqual([])
  })
})

describe('the money journey', () => {
  it('seeds built-ins, records spending, and reads it back through history, summary, budgets, status and sync', async () => {
    const user = await edge.member()
    const cash = await walletOf(user, { tracking_start: '2026-10-01' })
    const seeded = await edge.as(user).post('/v1/categories/builtins')
    expect(seeded.status).toBe(200)
    const categories = await seeded.json()
    expect(categories.map((c: { builtin_key: string }) => c.builtin_key)).toEqual(BUILTIN_CATEGORIES.map((b) => b.key))
    const food = categories.find((c: { builtin_key: string }) => c.builtin_key === 'food')

    const lunchKey = randomUUID()
    const lunch = { id: randomUUID(), type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: cash.id, category_id: food.id, merchant: 'ข้าวมันไก่', note: null }
    const created = await edge.as(user).post('/v1/transactions', lunch, { key: lunchKey })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ entity_id: lunch.id, outcome: 'created' })

    const history = await json(await edge.as(user).get('/v1/history?from=2026-10-01&through=2026-10-31'))
    expect(history.items).toEqual([expect.objectContaining({ id: lunch.id, amount_minor: '6000', merchant: 'ข้าวมันไก่' })])

    const summary = await json(await edge.as(user).get('/v1/summary?month=2026-10'))
    expect(summary).toMatchObject({ month: '2026-10' })
    expect(JSON.stringify(summary)).toContain('6000')

    const budget = await edge.as(user).put('/v1/budgets/2026-10', { overall_limit_minor: '1800000', category_limits: [{ category_id: food.id, limit_minor: '600000' }] })
    expect(budget.status).toBe(200)
    expect(await json(await edge.as(user).get('/v1/budgets/2026-10'))).toMatchObject({ month: '2026-10', overall_limit_minor: '1800000', version: 1 })

    const status = await edge.as(user).post('/v1/commands/status', { command_ids: [lunchKey, randomUUID()] })
    expect(status.status).toBe(200)
    const statuses = (await status.json()).statuses
    expect(statuses[0]).toMatchObject({ command_id: lunchKey, state: 'known', ack: { entity_id: lunch.id } })
    expect(statuses[1]).toMatchObject({ state: 'unknown' })

    const sync = await json(await edge.as(user).get('/v1/sync/changes'))
    expect(sync.groups.length).toBeGreaterThanOrEqual(4)
    expect(sync.groups.flatMap((g: { changes: { entity: string }[] }) => g.changes.map((c) => c.entity))).toEqual(expect.arrayContaining(['wallet', 'category', 'transaction', 'budget']))
    expect(typeof sync.next_cursor).toBe('string')

    const removed = await edge.as(user).del(`/v1/transactions/${lunch.id}`, { ifMatch: 1 })
    expect(removed.status).toBe(200)
    const deleted = await json(await edge.as(user).get('/v1/history/deleted'))
    expect(deleted.items).toEqual([expect.objectContaining({ id: lunch.id })])
    const restored = await edge.as(user).post(`/v1/transactions/${lunch.id}/restore`, {}, { ifMatch: 2 })
    expect(restored.status).toBe(200)
    expect((await json(await edge.as(user).get(`/v1/transactions/${lunch.id}`))).deleted_at).toBeNull()
  })
})

describe('bodies and gates', () => {
  it('malformed JSON is 400 VALIDATION_FAILED; a JSON primitive is refused as strict JSON', async () => {
    const user = await edge.member()
    const headers = async () => ({
      'x-gogospend-client': 'ios/1.0.0',
      authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
      'x-gogospend-session': user.binding,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-gogospend-command-schema': '1',
    })
    for (const body of ['{"id":', '"text"', '42']) {
      const res = await edge.call(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: await headers(), body }))
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('VALIDATION_FAILED')
    }
  })

  it('a body over 2 MB is 413 COMMAND_TOO_LARGE', async () => {
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024) }) }))
    expect(res.status).toBe(413)
    expect((await res.json()).code).toBe('COMMAND_TOO_LARGE')
  })

  it('a paused writes gate answers 503 WRITES_PAUSED with Retry-After before authentication; reads stay open', async () => {
    const paused = buildContainer(testSettings(edge.issuer, { OPERATIONAL_PAUSE: 'writes', OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS: '120' }))
    const res = await edge.call(new Request(`${BASE}/v1/wallets`, { method: 'POST' }), { container: () => paused })
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('120')
    expect(await res.json()).toMatchObject({ code: 'WRITES_PAUSED', retry_after_seconds: 120, message_key: 'errors.writes_paused' })
    expect((await edge.call(new Request(`${BASE}/v1/policies`), { container: () => paused })).status).toBe(200)
  })
})

describe('the strangler forwarder', () => {
  // Every v1 route is ported; the forwarder is for a route the API gains before the edge does.
  it('forwards a route the edge does not serve, with its method, path, query and body', async () => {
    const seen: { url: string; method: string; body: string; headers: Headers }[] = []
    const fetchLegacy = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const body = init?.body ? await new Response(init.body).text() : ''
      seen.push({ url: String(input), method: init?.method ?? 'GET', body, headers: new Headers(init?.headers) })
      return new Response(JSON.stringify({ forwarded: true }), { status: 202, headers: { 'content-type': 'application/json', 'x-request-id': 'origin-id' } })
    }) as typeof fetch
    const res = await edge.call(
      new Request(`${BASE}/v1/reports?x=1`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'k' }, body: '{"from":"2026-10-01"}' }),
      { legacyOrigin: 'https://legacy.internal', fetchLegacy },
    )
    expect(res.status).toBe(202)
    expect(res.headers.get('x-request-id')).toBe('origin-id')
    expect(await res.json()).toEqual({ forwarded: true })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ url: 'https://legacy.internal/v1/reports?x=1', method: 'POST', body: '{"from":"2026-10-01"}' })
    expect(seen[0].headers.get('idempotency-key')).toBe('k')
    expect(seen[0].headers.get('host')).toBeNull()
  })

  it('an unreachable origin is 503 SERVICE_UNAVAILABLE, never a hang', async () => {
    const fetchLegacy = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const res = await edge.call(new Request(`${BASE}/v1/reports`, { method: 'POST' }), { legacyOrigin: 'https://legacy.internal', fetchLegacy })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retry_after_seconds: 5 })
  })
})
