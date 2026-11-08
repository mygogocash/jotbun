import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

import { DISABLED_EMAIL_OTP_PATHS } from '../../../src/auth/config'
import { createdDuring, handleAuthRequest } from '../../../src/auth/handler'
import { testAuth } from './support/auth-harness'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const address = () => `${crypto.randomUUID()}@example.test`

async function codeOf(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { code?: string }
  return body.code
}

it('the first code signs a person up with a UUID user id', async () => {
  const me = await testAuth().signInByEmail(address())
  expect(me.userId).toMatch(UUID)
  expect(me.sessionId).toMatch(UUID)
})

it('the next code signs into the same user with a new session', async () => {
  const t = testAuth()
  const email = address()
  const first = await t.signInByEmail(email)
  const second = await t.signInByEmail(email)
  expect(second.userId).toBe(first.userId)
  expect(second.sessionId).not.toBe(first.sessionId)
})

it("the first code's answer says it created the account; the next code's answer does not", async () => {
  const t = testAuth()
  const email = address()
  expect((await t.signInByEmail(email)).created).toBe(true)
  expect((await t.signInByEmail(email)).created).toBe(false)
})

it('an answer without a readable creation time never says created', () => {
  expect(createdDuring({ user: { createdAt: 'soon' } }, 0)).toBe(false)
})

it('a code is six digits', async () => {
  const t = testAuth()
  const email = address()
  const sent = await t.requestCode(email)
  expect(sent.status).toBe(200)
  expect(t.mailer.lastCode(email)).toMatch(/^\d{6}$/)
})

it('a code expires after ten minutes', async () => {
  const t = testAuth()
  const email = address()
  expect((await t.requestCode(email)).status).toBe(200)
  const sent = t.mailer.sent.at(-1)!
  const remaining = sent.expiresAt.getTime() - Date.now()
  expect(remaining).toBeGreaterThanOrEqual(590_000)
  expect(remaining).toBeLessThanOrEqual(600_000)
  const code = t.mailer.lastCode(email)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 601_000)
  try {
    const answer = await t.request('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: code } })
    expect(answer.status).toBe(400)
    expect(await codeOf(answer)).toBe('OTP_EXPIRED')
    const sessions = await env.AUTH_DB.prepare('SELECT count(*) AS n FROM session s JOIN "user" u ON u.id = s.userId WHERE u.email = ?').bind(email.trim().toLowerCase()).first<{ n: number }>()
    expect(sessions?.n).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

it('three wrong codes use a code up', async () => {
  const t = testAuth()
  const email = address()
  expect((await t.requestCode(email)).status).toBe(200)
  const right = t.mailer.lastCode(email)
  const wrong = right === '000000' ? '000001' : '000000'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await t.request('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: wrong } })
    expect(answer.status).toBe(400)
    expect(await codeOf(answer)).toBe('INVALID_OTP')
  }
  const used = await t.request('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: right } })
  expect(used.status).toBe(403)
  expect(await codeOf(used)).toBe('TOO_MANY_ATTEMPTS')
  const sessions = await env.AUTH_DB.prepare('SELECT count(*) AS n FROM session s JOIN "user" u ON u.id = s.userId WHERE u.email = ?').bind(email).first<{ n: number }>()
  expect(sessions?.n).toBe(0)
})

it('an address typed with capitals and spaces reaches the same account', async () => {
  const t = testAuth()
  const id = crypto.randomUUID()
  const first = await t.signInByEmail(` Kan.${id}@Example.TEST `)
  const second = await t.signInByEmail(`kan.${id}@example.test`)
  expect(second.userId).toBe(first.userId)
  const row = await env.AUTH_DB.prepare('SELECT email FROM "user" WHERE id = ?').bind(first.userId).first<{ email: string }>()
  expect(row?.email).toBe(`kan.${id}@example.test`)
})

it('only sign-in codes are sent, for a known address and an unknown one', async () => {
  const t = testAuth()
  const known = address()
  await t.signInByEmail(known)
  const before = t.mailer.sent.length
  for (const email of [known, address()]) {
    const answer = await t.request('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: { email, type: 'email-verification' },
    })
    expect(answer.status).toBe(400)
    expect(await answer.json()).toMatchObject({ code: 'UNSUPPORTED_CODE_TYPE' })
  }
  expect(t.mailer.sent.length).toBe(before)
})

it('the password, verification and change-email code routes are off', async () => {
  const t = testAuth()
  for (const path of DISABLED_EMAIL_OTP_PATHS) {
    const answer = await t.request(`/api/auth${path}`, { method: 'POST', body: {} })
    expect(answer.status).toBe(404)
  }
})

it('the eleventh code request from one network in a minute is 429', async () => {
  const t = testAuth()
  const ip = '203.0.113.7'
  const emails = [address(), address(), address()]
  const counts = [4, 4, 2]
  for (let index = 0; index < emails.length; index += 1) {
    for (let n = 0; n < counts[index]!; n += 1) {
      expect((await t.requestCode(emails[index]!, ip)).status).toBe(200)
    }
  }
  expect((await t.requestCode(address(), ip)).status).toBe(429)
  expect((await t.requestCode(address(), '203.0.113.8')).status).toBe(200)
})

it('a body over 64 KiB is refused before Better Auth reads it', async () => {
  const t = testAuth()
  const rawBody = `{"otp":"${'0'.repeat(70_000 - 10)}"}`
  expect(new TextEncoder().encode(rawBody).byteLength).toBe(70_000)
  const answer = await t.request('/api/auth/sign-in/email-otp', { method: 'POST', rawBody })
  expect(answer.status).toBe(413)
  expect(await answer.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE' })
})

it('a body that is not JSON is 415 before Better Auth reads it', async () => {
  const t = testAuth()
  const answer = await handleAuthRequest(t.auth, new Request('http://auth.test/api/auth/sign-in/email-otp', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'email=someone@example.test' }))
  expect(answer.status).toBe(415)
  expect(await answer.json()).toEqual({ code: 'UNSUPPORTED_MEDIA_TYPE' })
})

it('a body that is not valid JSON is 400 VALIDATION_FAILED before Better Auth reads it', async () => {
  const answer = await testAuth().request('/api/auth/sign-in/email-otp', { method: 'POST', rawBody: '{"email":' })
  expect(answer.status).toBe(400)
  expect(await answer.json()).toEqual({ code: 'VALIDATION_FAILED' })
})
