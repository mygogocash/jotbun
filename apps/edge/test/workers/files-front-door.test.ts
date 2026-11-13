import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { expect, it } from 'vitest'

import { ProblemException } from '@api/common/api-problem.filter'

import type { EdgeConfig } from '../../src/v1/config'
import { assertFreshSignIn } from '../../src/v1/fresh-sign-in'
import { EdgeGates } from '../../src/v1/gates'
import type { VaultClaims, VaultRouteId } from '../../src/v1/protocol'
import { VAULT_STEP_ROUTES } from '../../src/v1/routes'
import { vaultSession, workerSessionFor } from '../../src/v1/worker-routes'
import { okReply } from '../../src/vault/replies'
import { VAULT_HANDLERS } from '../../src/vault/routes'
import type { UserVault } from '../../src/vault/user-vault'
import { BASE, TEST_POLICIES, member, newUser, startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const UUID = /^[0-9a-f-]{36}$/

function claimsFor(user: TestUser): VaultClaims {
  return { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' }
}

function headerMap(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  return headers
}

it('the bridge catalogue is public and 404 while the bridge is off', async () => {
  const client = await startV1('absent', { env: { GOGOCASH_BRIDGE_ENABLED: 'false' } })
  const res = await client.raw(new Request(`${BASE}/v1/bridge/gogocash/catalogue`))
  expect(res.status).toBe(404)
  expect((await res.json()).code).toBe('NOT_FOUND')
  expect(res.headers.get('cache-control')).toBe('no-store')
})

it('the bridge serves the built-in brands through the front door, with the v1 headers', async () => {
  const client = await startV1('absent', {
    env: { GOGOCASH_BRIDGE_ENABLED: 'true', GOGOCASH_CATALOGUE_URL: 'https://catalogue.test/brands.json' },
    fetchCatalogue: async () => {
      throw new Error('catalogue down')
    },
  })
  const res = await client.raw(new Request(`${BASE}/v1/bridge/gogocash/catalogue`))
  expect(res.status).toBe(200)
  const catalogue = (await res.json()) as { brands: { href: string }[] }
  expect(catalogue.brands.length).toBeGreaterThan(0)
  for (const brand of catalogue.brands) expect(brand.href.startsWith('https://gogocash.co')).toBe(true)
  expect(res.headers.get('x-request-id')).toMatch(UUID)
  const head = await client.raw(new Request(`${BASE}/v1/bridge/gogocash/catalogue`, { method: 'HEAD' }))
  expect(head.status).toBe(res.status)
  const getHeaders = headerMap(res)
  const headHeaders = headerMap(head)
  expect(Object.keys(headHeaders).sort()).toEqual(Object.keys(getHeaders).sort())
  for (const name of Object.keys(getHeaders)) {
    if (name === 'x-request-id') expect(headHeaders[name]).toMatch(UUID)
    else expect(headHeaders[name], name).toBe(getHeaders[name])
  }
  expect(await head.text()).toBe('')
})

it('assertFreshSignIn accepts a sign-in up to 300 seconds old and refuses older, missing or future ones', () => {
  const now = 1_000_000
  expect(() => assertFreshSignIn({ authTime: now - 300 }, now)).not.toThrow()
  expect(() => assertFreshSignIn({ authTime: now + 30 }, now)).not.toThrow()
  for (const authTime of [now - 301, now + 31, undefined]) {
    try {
      assertFreshSignIn({ authTime }, now)
      expect.unreachable()
    } catch (e) {
      expect((e as ProblemException).getStatus()).toBe(401)
      expect((e as ProblemException).code).toBe('REAUTH_REQUIRED')
    }
  }
})

/** Epoch seconds, taken early in the second so `now + 31` is still past the 30-second tolerance when the verifier reads the clock. */
async function epochSeconds(): Promise<number> {
  const into = Date.now() % 1000
  if (into > 500) await new Promise((resolve) => setTimeout(resolve, 1000 - into + 20))
  return Math.floor(Date.now() / 1000)
}

it("a token's auth_time is optional, and one in the future is 401 UNAUTHENTICATED", async () => {
  const client = await startV1()
  const user = newUser()
  const now = await epochSeconds()
  expect((await client.as(user, { authTime: now - 10 }).get('/v1/me')).status).toBe(200)
  expect((await client.as(user).get('/v1/me')).status).toBe(200)
  const future = await client.as(user, { authTime: now + 31 }).get('/v1/me')
  expect(future.status).toBe(401)
  expect((await future.json()).code).toBe('UNAUTHENTICATED')
})

it('a step-only id answers 200 from the vault', async () => {
  const step = 'test.step' as VaultRouteId
  VAULT_STEP_ROUTES[step] = {}
  VAULT_HANDLERS[step] = (_c, call) => okReply(call.route, { ok: 1 })
  try {
    const reply = await vaultSession(env, claimsFor(newUser()), TEST_POLICIES, 'bound_session', 'read').call(step)
    expect(reply).toEqual({ ok: true, status: 200, body: { ok: 1 } })
  } finally {
    delete VAULT_STEP_ROUTES[step]
    delete VAULT_HANDLERS[step]
  }
})

it('only the first vault call of a request is charged', async () => {
  const frozen = new Date('2026-10-25T00:00:10.000Z')
  const a = newUser()
  const b = newUser()
  const pin = (user: TestUser) => runInDurableObject(vaultOf(user), (v: UserVault) => {
    v.clock = () => frozen
  })
  await pin(a)
  await pin(b)
  const session = vaultSession(env, claimsFor(a), TEST_POLICIES, 'bound_session', 'read')
  for (let n = 1; n <= 121; n += 1) {
    const reply = await session.call('me.get')
    expect(reply, `A call ${n}`).toMatchObject({ ok: true })
  }
  const claims = claimsFor(b)
  for (let n = 1; n <= 121; n += 1) {
    const reply = await vaultSession(env, claims, TEST_POLICIES, 'bound_session', 'read').call('me.get')
    if (n < 121) expect(reply, `B call ${n}`).toMatchObject({ ok: true })
    else expect(reply).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED' })
  }
}, 30_000)

it("a Worker route's vault calls see only the live policies", async () => {
  const client = await startV1()
  const user = await member(client)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const config: EdgeConfig = {
    gates: new EdgeGates(),
    policies: [...TEST_POLICIES, { kind: 'terms', version: 2, required: true, published_at: tomorrow, text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } }],
    clientVersions: { check() {} },
  }
  const session = workerSessionFor(env, claimsFor(user), config, { method: 'POST', path: '/v1/x', access: 'current_policy', worker: 'bridge.catalogue' }, new Date())
  expect(session.policies?.some((policy) => policy.kind === 'terms' && policy.version === 2)).toBe(false)
  const reply = await session.call('me.get')
  expect(reply).toMatchObject({ ok: true, status: 200 })
})
