// Differential parity for the vault's files and background-work routes: the
// parity files session (support/files-session.ts) against the real NestJS v1
// server on PostgreSQL, the reference, and against the built vault Worker in
// workerd, with the policies NestJS publishes seeded into the vault's
// config:v1. The vault Worker runs without Workflows, queue consumers or
// containers (B13), so nothing a request leaves pending advances, as NestJS
// runs here with no job runner. The two Auth0 proof steps run against NestJS
// only (owner answer 2, B12): 40 of the 42 steps are compared. Responses are
// compared after the same normalising as parity-files.db.test.ts. Needs
// `npm run build -w gogospend-api` and `npm run build` in apps/edge first.
//
// A known difference the session cannot reach, since it runs in seconds
// (1B-T11 review n8; 1B-T12 brief, P3): from about day 8 to day 30 after a
// snapshot is built, NestJS still answers its status and a resend of its key
// with `expired` (it keeps a finished job 30 days), while the vault, which
// deletes a ready row a week past its 24-hour expiry, answers the status 404
// and a resend with a new pending row under the same id.
import { readFileSync } from 'node:fs'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { BASE, startEdge } from './support/edge-harness'
import type { Edge } from './support/edge-harness'
import { STEPS, nestUser, runFilesSession, vaultHeaders, vaultUser } from './support/files-session'
import { startNest } from './support/nest-server'
import type { NestServer } from './support/nest-server'
import { normalizer } from './support/parity'
import { startVaultWorker } from './support/vault-worker'
import type { VaultWorker } from './support/vault-worker'

let edge: Edge
let nest: NestServer
let vault: VaultWorker

beforeAll(async () => {
  const settings = { IMPORT_UPLOADS_ENABLED: 'true' }
  edge = await startEdge(settings) // the database and the JWKS issuer; no PostgreSQL edge route runs here
  nest = await startNest(edge, settings)
  const policies = await (await nest.send(new Request(`${BASE}/v1/policies`))).json()
  vault = await startVaultWorker({ issuer: edge.issuer, policies, vars: settings, background: 'off' })
}, 120_000)

afterAll(async () => {
  vault?.stop()
  nest?.stop()
  await edge?.close()
})

it('the vault Worker stores, queues and serves files exactly like the NestJS v1 API', async () => {
  const nestRun = await runFilesSession(nest.send, await nestUser(edge), 'nest')
  const vaultRun = await runFilesSession(vault.send, await vaultUser(vault, edge.issuer), 'vault')
  const a = normalizer(new Set(), ['nonce'])
  const b = normalizer(new Set(), ['nonce'])
  const differences = STEPS.flatMap((step, i) => {
    if (step.signIn) return []
    const n = { ...nestRun[i]!, body: a(nestRun[i]!.body) }
    const v = { ...vaultRun[i]!, body: b(vaultRun[i]!.body) }
    return JSON.stringify(n) === JSON.stringify(v) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: n, vault: v }]
  })
  // vitest prints objects with sorted keys: a listed step whose two answers print alike differs in key order (R92).
  expect(differences, 'answers that print alike differ in key order (R92)').toEqual([])
  expect(STEPS.length).toBe(42)
  expect(STEPS.filter((s) => s.signIn).map((s) => s.name)).toEqual(['export: challenge', 'export: proof'])
})

// The comparison sees a queue consumer only by a race (an import reads `parsing` while a parse attempt
// runs), so B13's config is checked as written.
it('the vault Worker runs without Workflows, queue consumers or containers (B13)', () => {
  const config = JSON.parse(readFileSync(vault.config, 'utf8')) as { workflows?: unknown; containers?: unknown; queues: { producers: { binding: string }[]; consumers?: unknown } }
  expect([config.workflows, config.containers, config.queues.consumers]).toEqual([undefined, undefined, undefined])
  expect(config.queues.producers.map((p) => p.binding)).toEqual(['PARSE_QUEUE'])
})

it('the retired proof routes answer 404 on the vault Worker', async () => {
  for (const path of ['/v1/auth/challenges', '/v1/auth/proofs']) {
    const res = await vault.send(new Request(`${BASE}${path}`, { method: 'POST', headers: await vaultHeaders(edge.issuer), body: '{}' }))
    expect([res.status, (await res.json()).code]).toEqual([404, 'NOT_FOUND'])
  }
})
