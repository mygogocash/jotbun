// The NestJS reference's harness: a disposable PostgreSQL database from the
// API's own test harness, with the API's synthetic JWKS issuer and real
// sign-in routines. The PostgreSQL edge it once served retired at C1
// (1B-T13); the parity tests compare NestJS with the vault on the one Worker.
// Test use only.
import { authFixtures } from '@api/testing/auth-fixtures'
import type { SignedUp } from '@api/testing/auth-fixtures'
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'
import { createTestDatabase } from '@api/testing/postgres-harness'
import type { TestDatabase } from '@api/testing/postgres-harness'

import type { EdgeEnv } from '../../src/server/env'

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

/** The reference's database, issuer and sign-up routines. */
export type Edge = {
  db: TestDatabase
  issuer: JwksFixture
  fx: ReturnType<typeof authFixtures>
  /** A signed-up NestJS member who has accepted terms v1. */
  member(): Promise<SignedUp>
  close(): Promise<void>
}

export const BASE = 'http://edge.test'

/** The database (with the policies published) and the JWKS issuer that NestJS and the vault Worker both trust. */
export async function startEdge(): Promise<Edge> {
  const db = await createTestDatabase()
  const issuer = await startJwksFixture()
  const pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6)
  await publishPolicies(db)
  const fx = authFixtures(issuer, pool)
  return {
    db,
    issuer,
    fx,
    async member() {
      const user = await fx.signUp()
      await acceptPolicies(db, user.accountId)
      return user
    },
    async close() {
      await issuer.close()
      // drop() ends every login pool the harness handed out.
      await db.drop()
    },
  }
}
