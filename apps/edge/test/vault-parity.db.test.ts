// Differential parity for the UserVault: the parity money session
// (support/money-session.ts) against the real NestJS v1 server on PostgreSQL,
// the reference, and against the built vault Worker in workerd, with the
// policies NestJS publishes seeded into the vault's config:v1. Responses are
// compared after the same normalising as parity.db.test.ts. Needs
// `npm run build -w gogospend-api` and `npm run build` in apps/edge first.
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { TEST_AUDIENCE } from '@api/testing/jwks-server'

import { BASE, startEdge } from './support/edge-harness'
import type { Edge } from './support/edge-harness'
import { STEPS, runSession, shared } from './support/money-session'
import { startNest } from './support/nest-server'
import type { NestServer } from './support/nest-server'
import { normalizer } from './support/parity'
import { startVaultWorker } from './support/vault-worker'
import type { VaultWorker } from './support/vault-worker'

let edge: Edge
let nest: NestServer
let vault: VaultWorker

beforeAll(async () => {
  edge = await startEdge() // PostgreSQL + the synthetic JWKS issuer
  nest = await startNest(edge) // the reference
  const policies = await (await nest.send(new Request(`${BASE}/v1/policies`))).json()
  vault = await startVaultWorker({ issuer: edge.issuer, policies })
}, 120_000)

afterAll(async () => {
  vault?.stop()
  nest?.stop()
  await edge?.close()
})

it('the vault Worker answers the money session exactly like the NestJS v1 API', async () => {
  const nestUser = await edge.fx.signUp()
  const vaultUser = { sub: randomUUID(), sid: randomUUID(), binding: 'unused' }
  const vaultToken = () => {
    const now = Math.floor(Date.now() / 1000)
    return edge.issuer.sign({ iss: edge.issuer.issuer, aud: TEST_AUDIENCE, sub: vaultUser.sub, sid: vaultUser.sid, iat: now, exp: now + 300 })
  }
  const nestRun = await runSession(nest.send, nestUser, () => edge.issuer.accessToken({ sub: nestUser.who.subject }))
  const vaultRun = await runSession(vault.send, vaultUser, vaultToken)
  const a = normalizer(shared)
  const b = normalizer(shared)
  const differences = STEPS.flatMap((step, i) => {
    const n = { ...nestRun[i], body: a(nestRun[i].body) }
    const v = { ...vaultRun[i], body: b(vaultRun[i].body) }
    return JSON.stringify(n) === JSON.stringify(v) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v }]
  })
  expect(differences).toEqual([])
  expect(STEPS.length).toBe(49)
})

it('isolates people in the runtime too: one person cannot read another person’s wallet', async () => {
  const headers = async (sub: string, sid: string) => {
    const now = Math.floor(Date.now() / 1000)
    return { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await edge.issuer.sign({ iss: edge.issuer.issuer, aud: TEST_AUDIENCE, sub, sid, iat: now, exp: now + 300 })}` }
  }
  const [a, b] = [randomUUID(), randomUUID()]
  await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await headers(a, randomUUID())), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))
  const wallet = randomUUID()
  const created = await vault.send(new Request(`${BASE}/v1/wallets`, { method: 'POST', headers: { ...(await headers(a, randomUUID())), 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' }, body: JSON.stringify({ id: wallet, name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }) }))
  expect(created.status).toBe(201)
  const peek = await vault.send(new Request(`${BASE}/v1/wallets/${wallet}`, { headers: await headers(b, randomUUID()) }))
  expect(peek.status).toBe(404)
  expect((await peek.json()).code).toBe('NOT_FOUND')
})

// startVaultWorker's default (the 1B-T12 review's n5): with no `background` named it starts the built config
// itself, so this session runs with the Worker's background work, as it did before `background` existed.
it('the vault Worker starts the built config when no background is named', () => {
  expect(vault.config).toMatch(/\/dist\/jotbun_vault\/wrangler\.json$/)
})
