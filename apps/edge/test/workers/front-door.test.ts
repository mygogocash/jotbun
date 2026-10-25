import { runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import type { UserVault } from '../../src/vault/user-vault'
import { BASE, TEST_POLICIES, member, newUser, startV1, tokenSignedByUnpublishedKey, vaultOf } from './support/v1-client'
import type { V1Client } from './support/v1-client'

// Ported from test/dispatch.db.test.ts. Wallet routes are pending until Task 3,
// so the access cases that named /v1/wallets now name /v1/me, a bound route.
let client: V1Client

beforeEach(async () => {
  client = await startV1()
})

describe('the v1 response envelope', () => {
  it('every response is no-store with its own request id and helmet-style headers', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/policies`))
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
    const res = await client.raw(new Request(`${BASE}/v1/policies`, { headers: { 'x-request-id': 'spoofed' } }))
    expect(res.headers.get('x-request-id')).not.toBe('spoofed')
  })

  it('an unknown route is 404 NOT_FOUND as an ApiProblem when nothing is forwarded', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/nothing-here`))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message_key: 'errors.not_found' })
  })
})

describe('the access pipeline, in the API’s order', () => {
  it('no client header is 426 before any token check', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/me`))
    expect(res.status).toBe(426)
    expect((await res.json()).code).toBe('CLIENT_UPGRADE_REQUIRED')
  })

  it('an outdated client is 426', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/me`, { headers: { 'x-gogospend-client': 'ios/0.9.0' } }))
    expect(res.status).toBe(426)
  })

  it('no bearer token is 401 UNAUTHENTICATED', async () => {
    const res = await client.raw(new Request(`${BASE}/v1/me`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token from an unpublished key is 401', async () => {
    const token = await tokenSignedByUnpublishedKey(newUser())
    const res = await client.raw(new Request(`${BASE}/v1/me`, { headers: { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${token}` } }))
    expect(res.status).toBe(401)
  })

  it('a token without a session id is 401 SESSION_REQUIRED', async () => {
    const res = await client.as(newUser(), { omitSid: true }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('SESSION_REQUIRED')
  })

  it('a token living longer than 15 minutes is 401 UNAUTHENTICATED', async () => {
    const now = Math.floor(Date.now() / 1000)
    const res = await client.as(newUser(), { iat: now, exp: now + 901 }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token issued in the future is 401 UNAUTHENTICATED', async () => {
    const now = Math.floor(Date.now() / 1000)
    const res = await client.as(newUser(), { iat: now + 3600, exp: now + 3600 + 300 }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token issued after its own expiry is 401 UNAUTHENTICATED', async () => {
    const now = Math.floor(Date.now() / 1000)
    const res = await client.as(newUser(), { iat: now + 20, exp: now + 10 }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token whose subject is not a UUID is 401 UNAUTHENTICATED', async () => {
    const res = await client.as({ ...newUser(), sub: 'auth0|someone' }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  it('a token whose session id is not a UUID is 401 SESSION_REQUIRED', async () => {
    const res = await client.as({ ...newUser(), sid: 'not-a-session' }).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('SESSION_REQUIRED')
  })

  it('signing out ends this session only', async () => {
    const user = newUser()
    const other = { ...user, sid: crypto.randomUUID() }
    expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
    expect((await (await client.as(user).get('/v1/me')).json()).code).toBe('SESSION_REQUIRED')
    expect((await client.as(other).get('/v1/me')).status).toBe(200)
  })

  it('a token issued before not_before is 401, and an account being deleted is 403 ACCOUNT_UNAVAILABLE', async () => {
    const user = newUser()
    await client.as(user).get('/v1/me')
    await runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec('UPDATE account_state SET not_before = ?', Math.floor(Date.now() / 1000) + 60))
    expect((await (await client.as(user).get('/v1/me')).json()).code).toBe('SESSION_REQUIRED')
    await runInDurableObject(vaultOf(user), (_v, s) => s.storage.sql.exec("UPDATE account_state SET not_before = 0, status = 'deleting'"))
    const res = await client.as(user).get('/v1/me')
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ACCOUNT_UNAVAILABLE')
  })

  it('a call naming another person is refused by the vault, which writes nothing', async () => {
    const owner = newUser()
    await client.as(owner).get('/v1/me')
    const reply = await runInDurableObject(vaultOf(owner), (v: UserVault) =>
      v.call({ route: 'me.privacy', access: 'bound_session', claims: { accountId: crypto.randomUUID(), sessionId: crypto.randomUUID(), issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' }, policies: TEST_POLICIES, params: {}, query: {}, headers: {}, body: { analytics: true } }))
    expect(reply).toMatchObject({ ok: false, status: 500, code: 'INTERNAL_ERROR' })
    expect(await runInDurableObject(vaultOf(owner), (_v, s) => s.storage.sql.exec('SELECT count(*) AS n FROM consents').one().n)).toBe(0)
  })

  it('an invented session id still spends the person’s budget', async () => {
    // A session id the vault has never seen is accepted (see "signing out ends this
    // session only"), so these ids are signed out instead: the vault refuses them, and
    // only a refused call shows whether the principal budget was charged before it.
    const user = newUser()
    const frozen = new Date()
    const signedOut = Array.from({ length: 360 }, () => crypto.randomUUID())
    await runInDurableObject(vaultOf(user), (v: UserVault, s) => {
      v.clock = () => frozen
      for (const sid of signedOut) s.storage.sql.exec('INSERT INTO revoked_sessions (session_id, revoked_at, expires_at) VALUES (?, ?, ?)', sid, frozen.toISOString(), frozen.toISOString())
    })
    for (const sid of signedOut) expect((await client.as({ ...user, sid }).get('/v1/me')).status).toBe(401)
    const res = await client.as(user).get('/v1/me')
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
  }, 30_000)

  it('/v1/me shows the pending terms until they are accepted', async () => {
    const user = newUser()
    expect(await (await client.as(user).get('/v1/me')).json()).toMatchObject({ account_id: user.sub, status: 'active', pending_policies: [{ kind: 'terms', version: 1 }] })
    expect((await client.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version: 1 })).status).toBe(204)
    expect((await (await client.as(user).get('/v1/me')).json()).pending_policies).toEqual([])
  })
})

describe('policies and the account', () => {
  it('privacy preferences are saved and read back', async () => {
    const user = await member(client)
    const res = await client.as(user).put('/v1/me/privacy-preferences', { analytics: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ analytics: true })
    expect((await (await client.as(user).get('/v1/me')).json()).privacy).toEqual({ analytics: true })
    expect((await client.as(user).put('/v1/me/privacy-preferences', { analytics: true, ads: true })).status).toBe(422)
  })

  // Ported from apps/api/src/policies/policy.integration.spec.ts ("a version scheduled for later is invisible
  // and cannot be accepted"). All three versions are required, so the account owes privacy v1 and terms v1.
  it('a version scheduled for later is invisible and cannot be accepted', async () => {
    const day = 24 * 60 * 60 * 1000
    const yesterday = new Date(Date.now() - day).toISOString()
    const tomorrow = new Date(Date.now() + day).toISOString()
    const scheduled = await startV1({
      policies: [
        { kind: 'privacy', version: 1, required: true, published_at: yesterday, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
        { kind: 'terms', version: 1, required: true, published_at: yesterday, text: { th: 'ข้อกำหนด', en: 'Terms' } },
        { kind: 'terms', version: 2, required: true, published_at: tomorrow, text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } },
      ],
      client_versions: { ios: '1.0.0', android: '1.0.0' },
    })
    const listed = await scheduled.raw(new Request(`${BASE}/v1/policies`))
    expect(await listed.json()).toEqual([
      expect.objectContaining({ kind: 'privacy', version: 1 }),
      expect.objectContaining({ kind: 'terms', version: 1 }),
    ])
    const user = newUser()
    expect(await (await scheduled.as(user).get('/v1/me')).json()).toMatchObject({ pending_policies: [{ kind: 'privacy', version: 1 }, { kind: 'terms', version: 1 }] })
    // Refused exactly as an unpublished version is: 422 VALIDATION_FAILED on the version field.
    for (const version of [2, 9]) {
      const res = await scheduled.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version })
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { version: 'VALIDATION_FAILED' } })
    }
  })
})
