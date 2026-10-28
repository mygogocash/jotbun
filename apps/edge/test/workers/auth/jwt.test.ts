import { env } from 'cloudflare:workers'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { expect, it, vi } from 'vitest'

import { AuthConfigError } from '../../../src/auth/config'
import { createAuth } from '../../../src/auth/create-auth'
import { handleAuth, isAuthPath } from '../../../src/server/auth'
import { TEST_AUTH, testAuth } from './support/auth-harness'

async function readToken(token: string, jwks: JSONWebKeySet) {
  return jwtVerify(token, createLocalJWKSet(jwks), { issuer: TEST_AUTH.issuer, audience: TEST_AUTH.audience })
}

it('a signed-in device gets a ten-minute EdDSA JWT naming only the user, the session and the sign-in time', async () => {
  const t = testAuth()
  const me = await t.signInByEmail(`${crypto.randomUUID()}@example.test`)
  const token = await t.token(me.cookie)
  const jwks = (await (await t.request('/api/auth/jwks')).json()) as JSONWebKeySet
  const { payload, protectedHeader } = await readToken(token, jwks)
  expect(protectedHeader.alg).toBe('EdDSA')
  expect(Object.keys(payload).sort()).toEqual(['aud', 'auth_time', 'exp', 'iat', 'iss', 'sid', 'sub'])
  expect([payload.sub, payload.sid]).toEqual([me.userId, me.sessionId])
  expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(600)
  expect(Math.abs((payload.auth_time as number) - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(5)
})

it('a renewed token keeps the sign-in time', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const t = testAuth()
    const me = await t.signInByEmail(`${crypto.randomUUID()}@example.test`)
    const jwks = (await (await t.request('/api/auth/jwks')).json()) as JSONWebKeySet
    const first = await readToken(await t.token(me.cookie), jwks)
    vi.setSystemTime(Date.now() + 240_000)
    const second = await readToken(await t.token(me.cookie), jwks)
    expect(second.payload.iat).toBeGreaterThan(first.payload.iat!)
    expect(second.payload.auth_time).toBe(first.payload.auth_time)
  } finally {
    vi.useRealTimers()
  }
})

it('without a session /token is 401', async () => {
  expect((await testAuth().request('/api/auth/token')).status).toBe(401)
})

it('auth answers are no-store', async () => {
  expect((await testAuth().request('/api/auth/jwks')).headers.get('cache-control')).toBe('no-store')
})

it('an unknown auth path is 404', async () => {
  expect((await testAuth().request('/api/auth/nothing-here')).status).toBe(404)
})

it('passkeys are mounted on D1', async () => {
  const t = testAuth()
  const me = await t.signInByEmail(`${crypto.randomUUID()}@example.test`)
  const answer = await t.request('/api/auth/passkey/list-user-passkeys', { cookie: me.cookie })
  expect(answer.status).toBe(200)
  expect(await answer.json()).toEqual([])
})

it('Better Auth refuses to start without its secret', () => {
  const t = testAuth()
  expect(() => createAuth({ ...env, BETTER_AUTH_SECRET: undefined }, { mailer: t.mailer })).toThrow(AuthConfigError)
})

it('Better Auth refuses a secret under 32 characters, and a missing base URL, issuer or audience', () => {
  const t = testAuth()
  const secret = String(env.BETTER_AUTH_SECRET)
  for (const unset of [{ BETTER_AUTH_SECRET: secret.slice(0, 31) }, { AUTH_BASE_URL: undefined }, { AUTH_ISSUER: undefined }, { AUTH_AUDIENCE: undefined }]) {
    expect(() => createAuth({ ...env, ...unset }, { mailer: t.mailer })).toThrow(AuthConfigError)
  }
  expect(() => createAuth({ ...env, BETTER_AUTH_SECRET: secret.slice(0, 32) }, { mailer: t.mailer })).not.toThrow()
})

it('the HTTP Worker sends /api/auth and its subpaths to Better Auth, and nothing else', async () => {
  expect(['/api/auth', '/api/auth/jwks', '/api/authx', '/api', '/v1/sync'].map(isAuthPath)).toEqual([true, true, false, false, false])
  const answer = await handleAuth(new Request('http://auth.test/api/auth/nothing-here', { headers: { 'cf-connecting-ip': '192.0.2.10' } }))
  expect(answer.status).toBe(404)
})
