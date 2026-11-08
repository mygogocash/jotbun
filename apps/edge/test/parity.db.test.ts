// Differential parity: the same scripted session against the real NestJS v1
// server (apps/api/dist, started as a child process) and the edge
// dispatcher, on one disposable database. Each run uses its own account;
// responses are compared after replacing per-account values (account and
// derived ids, request ids, cursors, timestamps) with stable placeholders.
// Needs `npm run build -w gogospend-api` first. The session itself is in
// support/money-session.ts, shared with vault-parity.db.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startEdge } from './support/edge-harness'
import type { Edge } from './support/edge-harness'
import { STEPS, runSession, shared } from './support/money-session'
import { startNest } from './support/nest-server'
import type { NestServer } from './support/nest-server'
import { normalizer } from './support/parity'

let edge: Edge
let nest: NestServer | undefined

beforeAll(async () => {
  edge = await startEdge()
  nest = await startNest(edge)
}, 60_000)

afterAll(async () => {
  nest?.stop()
  await edge?.close()
})

describe('the edge answers exactly like the NestJS v1 API', () => {
  it('runs one scripted session on each and compares every response', async () => {
    const nestUser = await edge.fx.signUp()
    const edgeUser = await edge.fx.signUp()
    const nestRun = await runSession(nest!.send, nestUser, () => edge.issuer.accessToken({ sub: nestUser.who.subject }))
    const edgeRun = await runSession(edge.call, edgeUser, () => edge.issuer.accessToken({ sub: edgeUser.who.subject }))

    const nestNorm = normalizer(shared)
    const edgeNorm = normalizer(shared)
    const differences = STEPS.flatMap((step, i) => {
      const a = { ...nestRun[i], body: nestNorm(nestRun[i].body) }
      const b = { ...edgeRun[i], body: edgeNorm(edgeRun[i].body) }
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: a, edge: b }]
    })
    expect(differences).toEqual([])
    // The script must exercise real outcomes, not a wall of identical errors.
    const statuses = new Set(nestRun.map((r) => r.status))
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 422]) expect(statuses).toContain(status)
  })
})
