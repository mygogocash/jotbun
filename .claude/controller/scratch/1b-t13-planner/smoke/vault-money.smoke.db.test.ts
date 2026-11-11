// LOCAL SMOKE, never committed (1B-T13 planner; the 1B-T12 planner's money smoke, unchanged below this header):
// 1A-T9's money session (49 steps) through startVaultWorker with its defaults (background on, no vars), against
// the vault on the built one Worker (dist/server) in workerd, with no database. Each status must be the one
// 1A-T9's planner read from the API's code (briefs/1A-T9.md, A.6). vault-parity.db.test.ts compares the same
// session with NestJS in CI.
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { TEST_AUDIENCE, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { STEPS, runSession } from './support/money-session'
import { startVaultWorker } from './support/vault-worker'
import type { VaultWorker } from './support/vault-worker'

const EXPECTED = '200 200 403 204 200 201 201 409 422 422 422 422 400 201 200 409 422 422 409 404 200 201 200 201 201 201 422 200 200 200 200 422 422 200 422 200 200 200 200 200 409 200 200 200 200 200 200 204 401'
const day = new Date(Date.now() - 86_400_000).toISOString()
const POLICIES = [
  { kind: 'privacy', version: 1, required: false, published_at: day, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: day, text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

let issuer: JwksFixture
let vault: VaultWorker

beforeAll(async () => {
  issuer = await startJwksFixture()
  vault = await startVaultWorker({ issuer, policies: POLICIES })
}, 120_000)

afterAll(async () => {
  vault?.stop()
  await issuer?.close()
})

it('the money session answers as 1A-T9 proved, through the default startVaultWorker', async () => {
  const user = { sub: randomUUID(), sid: randomUUID(), binding: 'unused' }
  const token = () => {
    const now = Math.floor(Date.now() / 1000)
    return issuer.sign({ iss: issuer.issuer, aud: TEST_AUDIENCE, sub: user.sub, sid: user.sid, iat: now, exp: now + 300 })
  }
  const run = await runSession(vault.send, user, token)
  expect(run).toHaveLength(STEPS.length)
  expect(run.map((seen) => seen.status).join(' ')).toBe(EXPECTED)
})
