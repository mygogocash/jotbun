// Differential parity for the routes that store files or queue background
// work: snapshot requests and chunks, export requests, status, grants and
// downloads, import uploads, status, preview and review, and receipt
// commands, grants and downloads. The built NestJS v1 server keeps objects in
// its own memory store and the edge in another; no job runs here, so this is
// the request side (job-run downloads are in jobs.db.test.ts).
// Needs `npm run build -w gogospend-api` first. The session itself is in
// support/files-session.ts, shared with vault-parity-files.db.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MemoryObjectStore } from '@api/storage/object-store'

import { startEdge } from './support/edge-harness'
import type { Edge } from './support/edge-harness'
import { STEPS, nestUser, runFilesSession } from './support/files-session'
import { startNest } from './support/nest-server'
import type { NestServer } from './support/nest-server'
import { normalizer } from './support/parity'

let edge: Edge
let nest: NestServer | undefined

beforeAll(async () => {
  const settings = { IMPORT_UPLOADS_ENABLED: 'true' }
  edge = await startEdge(settings, { store: new MemoryObjectStore() })
  nest = await startNest(edge, settings)
}, 60_000)

afterAll(async () => {
  nest?.stop()
  await edge?.close()
})

describe('the edge stores, queues and serves files exactly like the NestJS v1 API', () => {
  it('runs one scripted session on each and compares every response', async () => {
    const nestRun = await runFilesSession(nest!.send, await nestUser(edge), 'nest')
    const edgeRun = await runFilesSession(edge.call, await nestUser(edge), 'nest')
    const nestNorm = normalizer(new Set(), ['nonce'])
    const edgeNorm = normalizer(new Set(), ['nonce'])
    const differences = STEPS.flatMap((step, i) => {
      const a = { ...nestRun[i]!, body: nestNorm(nestRun[i]!.body) }
      const b = { ...edgeRun[i]!, body: edgeNorm(edgeRun[i]!.body) }
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: a, edge: b }]
    })
    expect(differences).toEqual([])
    const byName = new Map(STEPS.map((step, i) => [step.name, nestRun[i]!.status]))
    expect(byName.get('snapshot')).toBe(202)
    expect(byName.get('export')).toBe(202)
    expect(byName.get('upload')).toBe(202)
    expect(byName.get('import preview')).toBe(200)
    expect(byName.get('snapshot status')).toBe(200)
    expect(byName.get('transaction')).toBe(201)
  })
})
