// Integration harness: the edge dispatcher over a disposable PostgreSQL
// database from the API's own test harness, with the API's synthetic JWKS
// issuer and real sign-in routines. Test use only.
import { randomUUID } from 'node:crypto'

import type { Pool } from 'pg'

import { authFixtures } from '@api/testing/auth-fixtures'
import type { SignedUp } from '@api/testing/auth-fixtures'
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'
import { createTestDatabase } from '@api/testing/postgres-harness'
import type { TestDatabase } from '@api/testing/postgres-harness'
import type { ObjectStore } from '@api/storage/object-store'

import { buildContainer } from '../../src/server/app/container'
import type { Container } from '../../src/server/app/container'
import { dispatch } from '../../src/server/app/dispatch'
import type { DispatchOptions } from '../../src/server/app/dispatch'
import { ALL_ROUTES } from '../../src/server/app/routes'
import { sharedPool, withRequestPool } from '../../src/server/db/request-pool'
import type { EdgeEnv } from '../../src/server/env'
import type { SendMessage } from '../../src/server/ai/model'

export type { SignedUp }

/** The same settings the API's startV1App uses for its integration tests. */
export function testSettings(issuer: JwksFixture, overrides: Partial<EdgeEnv> = {}): EdgeEnv {
  return {
    JOTBUN_ENV: 'test',
    AUTH0_ISSUER: issuer.issuer,
    AUTH0_AUDIENCE: TEST_AUDIENCE,
    AUTH0_ALLOWED_CLIENT_IDS: TEST_CLIENT_ID,
    RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
    COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
    MIN_CLIENT_VERSION_IOS: '1.0.0',
    MIN_CLIENT_VERSION_ANDROID: '1.0.0',
    ...overrides,
  }
}

/** Required terms v1 and a privacy policy, as the API's command fixtures publish them. */
export async function publishPolicies(db: TestDatabase): Promise<void> {
  await db.admin((client) =>
    client.query(`INSERT INTO policy_versions (kind, version, required, published_at, text_th, text_en)
      VALUES ('terms', 1, true, now() - interval '1 day', 'ข้อกำหนด', 'Terms'), ('privacy', 1, false, now() - interval '1 day', 'ความเป็นส่วนตัว', 'Privacy')
      ON CONFLICT DO NOTHING`),
  )
}

export async function acceptPolicies(db: TestDatabase, accountId: string): Promise<void> {
  await db.admin((client) => client.query(`INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, 'terms', 1, true) ON CONFLICT DO NOTHING`, [accountId]))
}

export type Edge = {
  db: TestDatabase
  issuer: JwksFixture
  pool: Pool
  container: Container
  fx: ReturnType<typeof authFixtures>
  call(request: Request, options?: Partial<DispatchOptions>): Promise<Response>
  member(): Promise<SignedUp>
  as(user: SignedUp): UserClient
  close(): Promise<void>
}

export type CommandOptions = { key?: string; schema?: number | null; ifMatch?: number | null }

export type UserClient = {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown, options?: CommandOptions): Promise<Response>
  patch(path: string, body: unknown, options?: CommandOptions): Promise<Response>
  put(path: string, body: unknown, options?: CommandOptions): Promise<Response>
  del(path: string, options?: CommandOptions): Promise<Response>
}

export const BASE = 'http://edge.test'

export async function startEdge(overrides: Partial<EdgeEnv> = {}, build: { send?: SendMessage | null; store?: ObjectStore } = {}): Promise<Edge> {
  const db = await createTestDatabase()
  const issuer = await startJwksFixture()
  const pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6)
  await publishPolicies(db)
  const container = buildContainer(testSettings(issuer, overrides), build)
  const fx = authFixtures(issuer, pool)
  const source = sharedPool(pool)

  const call = (request: Request, options: Partial<DispatchOptions> = {}) =>
    withRequestPool(source, () => dispatch(request, { container: () => container, routes: ALL_ROUTES, ...options }))

  const as = (user: SignedUp): UserClient => {
    const auth = async (): Promise<Record<string, string>> => ({
      'x-gogospend-client': 'ios/1.0.0',
      authorization: `Bearer ${await issuer.accessToken({ sub: user.who.subject })}`,
      'x-gogospend-session': user.binding,
    })
    const command = (options: CommandOptions = {}): Record<string, string> => {
      const headers: Record<string, string> = { 'idempotency-key': options.key ?? randomUUID() }
      if (options.schema !== null) headers['x-gogospend-command-schema'] = String(options.schema ?? 1)
      if (options.ifMatch !== undefined && options.ifMatch !== null) headers['if-match'] = `"${options.ifMatch}"`
      return headers
    }
    const send = async (method: string, path: string, body: unknown, options?: CommandOptions) =>
      call(
        new Request(`${BASE}${path}`, {
          method,
          headers: { ...(await auth()), ...command(options), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )
    return {
      get: async (path) => call(new Request(`${BASE}${path}`, { headers: await auth() })),
      post: (path, body = {}, options) => send('POST', path, body, options),
      patch: (path, body, options) => send('PATCH', path, body, options),
      put: (path, body, options) => send('PUT', path, body, options),
      del: (path, options) => send('DELETE', path, undefined, options),
    }
  }

  return {
    db,
    issuer,
    pool,
    container,
    fx,
    call,
    async member() {
      const user = await fx.signUp()
      await acceptPolicies(db, user.accountId)
      return user
    },
    as,
    async close() {
      await issuer.close()
      // drop() ends every login pool the harness handed out.
      await db.drop()
    },
  }
}
