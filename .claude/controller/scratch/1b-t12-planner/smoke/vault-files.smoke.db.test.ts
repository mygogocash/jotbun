// LOCAL SMOKE, never committed (1B-T12 planner): the 42-step files session
// against the built vault Worker in workerd, with no database. NestJS needs
// PostgreSQL, which is stopped here, so each compared step is checked against
// the answer NestJS gives, as the planner read it from the API's code
// (smoke/expected-nest.json in the planner's folder, normalized exactly as the
// parity test does; SMOKE_EXPECTED=<file> names another copy). SMOKE_OUT=<file>
// writes the vault's normalized answers. Run from apps/edge:
//   npx vitest run --config vitest.db.config.ts test/vault-files.smoke.db.test.ts
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { derivedUuid } from '@api/commands/derived-id'
import { TEST_AUDIENCE, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { BASE } from './support/edge-harness'
import { STEPS, runFilesSession, vaultHeaders, vaultUser } from './support/files-session'
import { normalizer } from './support/parity'
import { startVaultWorker } from './support/vault-worker'
import type { VaultWorker } from './support/vault-worker'

const EXPECTED = process.env.SMOKE_EXPECTED ?? '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1b-t12-planner/smoke/expected-nest.json'
const day = new Date(Date.now() - 86_400_000).toISOString()
// The two policies the edge harness publishes for NestJS (publishPolicies), in the order NestJS lists them.
const POLICIES = [
  { kind: 'privacy', version: 1, required: false, published_at: day, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: day, text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

let issuer: JwksFixture
let vault: VaultWorker

beforeAll(async () => {
  issuer = await startJwksFixture()
  vault = await startVaultWorker({ issuer, policies: POLICIES, vars: { IMPORT_UPLOADS_ENABLED: 'true' }, background: 'off' })
}, 120_000)

afterAll(async () => {
  vault?.stop()
  await issuer?.close()
})

it('the vault Worker answers each compared step of the files session as NestJS does', async () => {
  const run = await runFilesSession(vault.send, await vaultUser(vault, issuer), 'vault')
  const norm = normalizer(new Set(), ['nonce'])
  const compared = STEPS.flatMap((step, i) => (step.signIn ? [] : [{ step: `${i + 1}. ${step.name}`, ...run[i]!, body: norm(run[i]!.body) }]))
  if (process.env.SMOKE_OUT) writeFileSync(process.env.SMOKE_OUT, `${JSON.stringify(compared, null, 2)}\n`)
  expect(run.filter((seen) => seen === null)).toHaveLength(2)
  expect(compared.filter((c) => c.status >= 500).map((c) => c.step)).toEqual([])
  expect(compared).toHaveLength(40)
  expect(existsSync(EXPECTED), `the expected answers are missing: ${EXPECTED}`).toBe(true)
  const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as typeof compared
  const differences = compared.flatMap((c, k) => (JSON.stringify(c) === JSON.stringify(expected[k]) ? [] : [{ vault: c, nest: expected[k] }]))
  expect(differences).toEqual([])
})

// The committed test's B13 case, as written there.
it('the vault Worker runs without Workflows, queue consumers or containers (B13)', () => {
  const config = JSON.parse(readFileSync(vault.config, 'utf8')) as { workflows?: unknown; containers?: unknown; queues: { producers: { binding: string }[]; consumers?: unknown } }
  expect([config.workflows, config.containers, config.queues.consumers]).toEqual([undefined, undefined, undefined])
  expect(config.queues.producers.map((p) => p.binding)).toEqual(['PARSE_QUEUE'])
})

// The 1B-T10 review's m-2, carried into 1B-T12: the session never previews a never-accepted upload, so this
// probe does. A CSV whose bytes are a PNG header is begun (its row is written), then refused when the intake
// sniffs its first bytes (type_mismatch): the row exists and was never accepted.
it('a never-accepted upload has no status and no preview (404), as in the API', async () => {
  const [sub, sid, key] = [randomUUID(), randomUUID(), randomUUID()]
  const now = () => Math.floor(Date.now() / 1000)
  const auth = async () => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.sign({ iss: issuer.issuer, aud: TEST_AUDIENCE, sub, sid, auth_time: now(), iat: now(), exp: now() + 300 })}` })
  const accepted = await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await auth()), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))
  expect(accepted.status).toBe(204)
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array<number>(56).fill(0)])
  const refused = await vault.send(new Request(`${BASE}/v1/imports`, { method: 'POST', headers: { ...(await auth()), 'content-type': 'text/csv', 'idempotency-key': key, 'x-gogospend-file-name': 'statement.csv' }, body: png }))
  expect([refused.status, (await refused.json()).code]).toEqual([422, 'UPLOAD_TYPE_MISMATCH'])
  const job = derivedUuid(sub, 'import-upload', key)
  const seen: [string, number][] = []
  for (const path of [`/v1/imports/${job}`, `/v1/imports/${job}/preview`]) seen.push([path, (await vault.send(new Request(`${BASE}${path}`, { headers: await auth() }))).status])
  expect(seen).toEqual([
    [`/v1/imports/${job}`, 404],
    [`/v1/imports/${job}/preview`, 404],
  ])
})

it('the retired proof routes answer 404 on the vault Worker', async () => {
  for (const path of ['/v1/auth/challenges', '/v1/auth/proofs']) {
    const res = await vault.send(new Request(`${BASE}${path}`, { method: 'POST', headers: await vaultHeaders(issuer), body: '{}' }))
    expect([res.status, (await res.json()).code]).toEqual([404, 'NOT_FOUND'])
  }
})
