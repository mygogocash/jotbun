import { env } from 'cloudflare:test'

import type { AuthEnv } from '../../../../src/auth/env'
import type { AuthDeps, JotbunAuth } from '../../../../src/auth/create-auth'
import { createAuth } from '../../../../src/auth/create-auth'
import { handleAuthRequest } from '../../../../src/auth/handler'
import type { SignInCode } from '../../../../src/auth/mailer'

export const TEST_AUTH = { baseUrl: 'http://auth.test', issuer: 'http://auth.test', audience: 'jotbun-v1' } as const

export type SignedIn = { email: string; cookie: string; userId: string; sessionId: string; created: boolean }

type RecordingMailer = AuthDeps['mailer'] & {
  sent: SignInCode[]
  lastCode(email: string): string
}

export type TestAuth = {
  auth: JotbunAuth
  mailer: RecordingMailer
  request(path: string, init?: { method?: string; body?: unknown; rawBody?: string; cookie?: string; ip?: string }): Promise<Response>
  requestCode(email: string, ip?: string): Promise<Response>
  signInByEmail(email: string): Promise<SignedIn>
  token(cookie: string): Promise<string>
}

// RFC 5737 documentation ranges. The two addresses the rate-limit case pins are left out
// so a random address cannot spend that bucket.
function documentationIp(): string {
  const prefixes = ['192.0.2', '198.51.100', '203.0.113']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]!
  const host = Math.floor(Math.random() * 254) + 1
  const ip = `${prefix}.${host}`
  if (ip === '203.0.113.7' || ip === '203.0.113.8') return documentationIp()
  return ip
}

function recordingMailer(): RecordingMailer {
  const sent: SignInCode[] = []
  return {
    sent,
    lastCode(email: string) {
      const key = email.trim().toLowerCase()
      const found = [...sent].reverse().find((message) => message.to.trim().toLowerCase() === key)
      if (!found) throw new Error(`no code for ${key}`)
      return found.code
    },
    async sendSignInCode(message: SignInCode) {
      sent.push(message)
    },
  }
}

function sessionCookie(response: Response): string {
  const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  const pair = lines.map((line) => line.split(';')[0]?.trim() ?? '').find((line) => line.startsWith('better-auth.session_token='))
  if (!pair) throw new Error('missing session cookie')
  return pair
}

export function testAuth(deps: Partial<AuthDeps> = {}, override: Partial<AuthEnv> = {}): TestAuth {
  const recording = recordingMailer()
  const mailer = deps.mailer ?? recording
  const authEnv: AuthEnv = {
    AUTH_DB: override.AUTH_DB ?? env.AUTH_DB,
    ERASURE_DB: override.ERASURE_DB ?? env.ERASURE_DB,
    EMAIL: override.EMAIL,
    JOTBUN_ENV: override.JOTBUN_ENV ?? env.JOTBUN_ENV,
    AUTH_BASE_URL: override.AUTH_BASE_URL ?? env.AUTH_BASE_URL,
    AUTH_ISSUER: override.AUTH_ISSUER ?? env.AUTH_ISSUER,
    AUTH_AUDIENCE: override.AUTH_AUDIENCE ?? env.AUTH_AUDIENCE,
    AUTH_TRUSTED_ORIGINS: override.AUTH_TRUSTED_ORIGINS ?? env.AUTH_TRUSTED_ORIGINS,
    BETTER_AUTH_SECRET: 'BETTER_AUTH_SECRET' in override ? override.BETTER_AUTH_SECRET : env.BETTER_AUTH_SECRET,
    ERASURE_KEY: 'ERASURE_KEY' in override ? override.ERASURE_KEY : env.ERASURE_KEY,
    EMAIL_FROM: override.EMAIL_FROM,
    EMAIL_SECONDARY: override.EMAIL_SECONDARY,
    RESEND_API_KEY: override.RESEND_API_KEY,
    APPLE_BUNDLE_ID: override.APPLE_BUNDLE_ID,
    APPLE_CLIENT_SECRET: override.APPLE_CLIENT_SECRET,
    GOOGLE_CLIENT_IDS: override.GOOGLE_CLIENT_IDS,
    GOOGLE_CLIENT_SECRET: override.GOOGLE_CLIENT_SECRET,
    PASSKEY_RP_ID: override.PASSKEY_RP_ID,
    PASSKEY_ORIGINS: override.PASSKEY_ORIGINS,
  }
  const auth = createAuth(authEnv, { ...deps, mailer })
  const shown = 'sent' in mailer && typeof (mailer as RecordingMailer).lastCode === 'function' ? (mailer as RecordingMailer) : recording

  async function request(path: string, init: { method?: string; body?: unknown; rawBody?: string; cookie?: string; ip?: string } = {}): Promise<Response> {
    const headers = new Headers({
      origin: TEST_AUTH.baseUrl,
      'content-type': 'application/json',
      'cf-connecting-ip': init.ip ?? documentationIp(),
    })
    if (init.cookie) headers.set('cookie', init.cookie)
    const method = init.method ?? 'GET'
    const body = init.rawBody !== undefined ? init.rawBody : init.body !== undefined ? JSON.stringify(init.body) : undefined
    return handleAuthRequest(auth, new Request(new URL(path, TEST_AUTH.baseUrl), { method, headers, body }))
  }

  return {
    auth,
    mailer: shown,
    request,
    requestCode(email, ip) {
      return request('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' }, ip })
    },
    async signInByEmail(email) {
      const sent = await request('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } })
      if (!sent.ok) throw new Error(`code request failed: ${sent.status}`)
      const code = shown.lastCode(email)
      const answer = await request('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: code } })
      if (!answer.ok) throw new Error(`sign-in failed: ${answer.status}`)
      const payload = (await answer.json()) as { created?: boolean }
      const cookie = sessionCookie(answer)
      const session = (await (await request('/api/auth/get-session', { cookie })).json()) as { user: { id: string }; session: { id: string } }
      return { email, cookie, userId: session.user.id, sessionId: session.session.id, created: payload.created === true }
    },
    async token(cookie) {
      const answer = await request('/api/auth/token', { cookie })
      if (!answer.ok) throw new Error(`token failed: ${answer.status}`)
      const payload = (await answer.json()) as { token: string }
      return payload.token
    },
  }
}
