// Differential parity for the routes that store files or queue background
// work: snapshot requests and chunks, export requests, status, grants and
// downloads, import uploads, status, preview and review, and receipt
// commands, grants and downloads. The built NestJS v1 server keeps objects in
// its own memory store and the edge in another; no job runs here, so this is
// the request side (job-run downloads are in jobs.db.test.ts).
// Needs `npm run build -w gogospend-api` first.
import { randomUUID } from 'node:crypto'

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MemoryObjectStore } from '@api/storage/object-store'
import { TEST_CLIENT_ID } from '@api/testing/jwks-server'

import { BASE, startEdge } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'
import { startNest } from './support/nest-server'
import type { NestServer, Send } from './support/nest-server'
import { normalizer, seenOf, trace } from './support/parity'
import type { Seen } from './support/parity'

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

const now = () => Math.floor(Date.now() / 1000)

type State = {
  user: SignedUp
  keys: { snapshot: string; export: string; upload: string }
  challenge: { challenge_id: string; nonce: string }
  proofId: string
  snapshotId: string
  exportId: string
  importId: string
  wallet: string
  food: string
  transaction: string
}

type Step = { name: string; build(st: State): Promise<Request>; after?(st: State, body: unknown): void }

const headers = async (st: State, extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  'x-gogospend-client': 'ios/1.0.0',
  authorization: `Bearer ${await edge.issuer.accessToken({ sub: st.user.who.subject })}`,
  'x-gogospend-session': st.user.binding,
  ...extra,
})
const json = (method: string, path: string, h: Record<string, string>, body?: unknown, raw?: string) =>
  new Request(`${BASE}${path}`, { method, headers: { ...h, 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body ?? {}) })
const get = (path: string, h: Record<string, string>) => new Request(`${BASE}${path}`, { headers: h })
const command = (key: string = randomUUID(), ifMatch?: number) => ({ 'idempotency-key': key, 'x-gogospend-command-schema': '1', ...(ifMatch ? { 'if-match': `"${ifMatch}"` } : {}) })
const upload = (h: Record<string, string>, type: string, body: string) => new Request(`${BASE}/v1/imports`, { method: 'POST', headers: { ...h, 'content-type': type }, body })
const CSV = 'date,amount,description\n2026-10-20,-60.00,ข้าวมันไก่\n2026-10-21,-45.50,Grab\n'

const STEPS: Step[] = [
  { name: 'snapshot, no key', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st)) },
  { name: 'snapshot', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': st.keys.snapshot })), after: (st, body) => (st.snapshotId = (body as { snapshot_id: string }).snapshot_id) },
  { name: 'snapshot, same key', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': st.keys.snapshot })) },
  { name: 'snapshot, unknown field', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': randomUUID() }), { full: true }) },
  { name: 'snapshot status', build: async (st) => get(`/v1/sync/snapshots/${st.snapshotId}`, await headers(st)) },
  { name: 'snapshot status, bad id', build: async (st) => get('/v1/sync/snapshots/not-a-uuid', await headers(st)) },
  { name: 'snapshot status, unknown', build: async (st) => get(`/v1/sync/snapshots/${randomUUID()}`, await headers(st)) },
  { name: 'snapshot chunk, bad grant', build: async (st) => get('/v1/sync/snapshot-chunks/nope', await headers(st)) },

  { name: 'export: challenge', build: async (st) => json('POST', '/v1/auth/challenges', await headers(st), { request_id: randomUUID(), purpose: 'export', command_id: st.keys.export }), after: (st, body) => (st.challenge = body as State['challenge']) },
  {
    name: 'export: proof',
    build: async (st) => {
      const idToken = await edge.issuer.sign({ iss: edge.issuer.issuer, sub: st.user.who.subject, aud: TEST_CLIENT_ID, nonce: st.challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 })
      return json('POST', '/v1/auth/proofs', await headers(st), { challenge_id: st.challenge.challenge_id, id_token: idToken })
    },
    after: (st, body) => (st.proofId = (body as { proof_id: string }).proof_id),
  },
  { name: 'export, bad dates', build: async (st) => json('POST', '/v1/exports', await headers(st, command(st.keys.export)), { proof_id: st.proofId, from: '2026-10-31', through: '2026-10-01' }) },
  { name: 'export, unknown field', build: async (st) => json('POST', '/v1/exports', await headers(st, command(st.keys.export)), { proof_id: st.proofId, from: '2026-10-01', through: '2026-10-31', format: 'xlsx' }) },
  { name: 'export', build: async (st) => json('POST', '/v1/exports', await headers(st, command(st.keys.export)), { proof_id: st.proofId, from: '2026-10-01', through: '2026-10-31' }), after: (st, body) => (st.exportId = (body as { entity_id: string }).entity_id) },
  { name: 'export replayed', build: async (st) => json('POST', '/v1/exports', await headers(st, command(st.keys.export)), { proof_id: st.proofId, from: '2026-10-01', through: '2026-10-31' }) },
  { name: 'export status', build: async (st) => get(`/v1/exports/${st.exportId}`, await headers(st)) },
  { name: 'export status, unknown', build: async (st) => get(`/v1/exports/${randomUUID()}`, await headers(st)) },
  { name: 'export grant before it is ready', build: async (st) => get(`/v1/exports/${st.exportId}/grant`, await headers(st)) },
  { name: 'export file, bad grant', build: async (st) => get('/v1/export-files/nope', await headers(st)) },

  { name: 'upload, no file name', build: async (st) => upload(await headers(st, { 'idempotency-key': randomUUID() }), 'text/csv', CSV) },
  { name: 'upload, unsupported type', build: async (st) => upload(await headers(st, { 'idempotency-key': randomUUID(), 'x-gogospend-file-name': 'statement.pdf' }), 'application/pdf', '%PDF-1.7') },
  { name: 'upload, type and name differ', build: async (st) => upload(await headers(st, { 'idempotency-key': randomUUID(), 'x-gogospend-file-name': 'statement.xlsx' }), 'text/csv', CSV) },
  { name: 'upload, no key', build: async (st) => upload(await headers(st, { 'x-gogospend-file-name': 'statement.csv' }), 'text/csv', CSV) },
  { name: 'upload, empty', build: async (st) => upload(await headers(st, { 'idempotency-key': randomUUID(), 'x-gogospend-file-name': 'empty.csv' }), 'text/csv', '') },
  {
    name: 'upload',
    build: async (st) => upload(await headers(st, { 'idempotency-key': st.keys.upload, 'x-gogospend-file-name': encodeURIComponent('บัญชี ต.ค..csv') }), 'text/csv', CSV),
    after: (st, body) => (st.importId = (body as { job_id: string }).job_id),
  },
  { name: 'upload replayed', build: async (st) => upload(await headers(st, { 'idempotency-key': st.keys.upload, 'x-gogospend-file-name': encodeURIComponent('บัญชี ต.ค..csv') }), 'text/csv', CSV) },
  { name: 'import status', build: async (st) => get(`/v1/imports/${st.importId}`, await headers(st)) },
  { name: 'import status, unknown', build: async (st) => get(`/v1/imports/${randomUUID()}`, await headers(st)) },
  { name: 'import preview', build: async (st) => get(`/v1/imports/${st.importId}/preview`, await headers(st)) },
  { name: 'import preview, bad paging', build: async (st) => get(`/v1/imports/${st.importId}/preview?limit=0`, await headers(st)) },
  { name: 'review rows before parsing', build: async (st) => json('PATCH', `/v1/imports/${st.importId}/rows`, await headers(st, command(undefined, 1)), { rows: [] }) },
  { name: 'freeze before parsing', build: async (st) => json('POST', `/v1/imports/${st.importId}/selections`, await headers(st, command()), { review_revision: 1, select: 'all' }) },
  { name: 'confirm, unknown selection', build: async (st) => json('POST', `/v1/imports/${st.importId}/confirmations`, await headers(st, command()), { selection_id: randomUUID(), batch: 1 }) },
  { name: 'selection progress, unknown', build: async (st) => get(`/v1/imports/${st.importId}/selections/${randomUUID()}`, await headers(st)) },

  { name: 'built-in categories', build: async (st) => json('POST', '/v1/categories/builtins', await headers(st)), after: (st, body) => (st.food = (body as { id: string; builtin_key: string }[]).find((c) => c.builtin_key === 'food')!.id) },
  { name: 'wallet', build: async (st) => json('POST', '/v1/wallets', await headers(st, command()), { id: st.wallet, name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }) },
  { name: 'transaction', build: async (st) => json('POST', '/v1/transactions', await headers(st, command()), { id: st.transaction, type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: st.wallet, category_id: st.food }) },
  { name: 'retain an unknown receipt', build: async (st) => json('POST', `/v1/transactions/${st.transaction}/attachment`, await headers(st, command(undefined, 1)), { attachment_id: randomUUID(), consent: RECEIPT_RETENTION_CONSENT }) },
  { name: 'retain without consent', build: async (st) => json('POST', `/v1/transactions/${st.transaction}/attachment`, await headers(st, command(undefined, 1)), { attachment_id: randomUUID() }) },
  { name: 'replace, stale version', build: async (st) => json('PUT', `/v1/transactions/${st.transaction}/attachment`, await headers(st, command(undefined, 9)), { attachment_id: randomUUID(), consent: RECEIPT_RETENTION_CONSENT }) },
  { name: 'remove a receipt it does not have', build: async (st) => new Request(`${BASE}/v1/transactions/${st.transaction}/attachment`, { method: 'DELETE', headers: await headers(st, command(undefined, 1)) }) },
  { name: 'receipt grant, unknown', build: async (st) => get(`/v1/attachments/${randomUUID()}/grant`, await headers(st)) },
  { name: 'receipt file, bad grant', build: async (st) => get('/v1/attachment-files/nope', await headers(st)) },
]

async function runSession(send: Send): Promise<Seen[]> {
  const st = { user: await edge.member(), keys: { snapshot: randomUUID(), export: randomUUID(), upload: randomUUID() }, wallet: randomUUID(), transaction: randomUUID() } as State
  const out: Seen[] = []
  for (const step of STEPS) {
    const seen = await seenOf(await send(await step.build(st)))
    trace(step.name, seen)
    if (seen.status < 300) step.after?.(st, seen.body)
    out.push(seen)
  }
  return out
}

describe('the edge stores, queues and serves files exactly like the NestJS v1 API', () => {
  it('runs one scripted session on each and compares every response', async () => {
    const nestRun = await runSession(nest!.send)
    const edgeRun = await runSession(edge.call)
    const nestNorm = normalizer(new Set(), ['nonce'])
    const edgeNorm = normalizer(new Set(), ['nonce'])
    const differences = STEPS.flatMap((step, i) => {
      const a = { ...nestRun[i], body: nestNorm(nestRun[i].body) }
      const b = { ...edgeRun[i], body: edgeNorm(edgeRun[i].body) }
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: a, edge: b }]
    })
    expect(differences).toEqual([])
    const byName = new Map(STEPS.map((step, i) => [step.name, nestRun[i].status]))
    expect(byName.get('snapshot')).toBe(202)
    expect(byName.get('export')).toBe(202)
    expect(byName.get('upload')).toBe(202)
    expect(byName.get('import preview')).toBe(200)
    expect(byName.get('snapshot status')).toBe(200)
    expect(byName.get('transaction')).toBe(201)
  })
})
