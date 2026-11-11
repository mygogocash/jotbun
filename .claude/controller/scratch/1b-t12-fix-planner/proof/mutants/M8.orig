// The parity files session: one scripted v1 session (42 steps) over the routes
// that store files or queue background work (snapshot requests and chunks,
// export requests, status, grants and downloads, import uploads, status,
// preview and review, and receipt commands, grants and downloads), and the
// runner that sends it. parity-files.db.test.ts runs it against NestJS and the
// PostgreSQL edge; vault-parity-files.db.test.ts runs it against NestJS and the
// vault Worker in workerd. The steps are moved verbatim from
// parity-files.db.test.ts; they never sign a token themselves: each request's
// headers come from the FilesUser. Test use only.
import { randomUUID } from 'node:crypto'

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'

import { TEST_AUDIENCE, TEST_CLIENT_ID } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { BASE } from './edge-harness'
import type { Edge } from './edge-harness'
import type { Send } from './nest-server'
import { seenOf, trace } from './parity'
import type { Seen } from './parity'

/** Who sends the session: the headers of each request, and for NestJS the Auth0 ID token of the proof step. */
export type FilesUser = {
  /** The client header and the authorization; for NestJS also the session binding header. */
  headers(): Promise<Record<string, string>>
  /** NestJS only: the Auth0 ID token the proof step sends for the challenge's nonce. */
  proofToken?(nonce: string): Promise<string>
}

export type FilesState = {
  who: FilesUser
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

/** `signIn`: an Auth0 proof step, sent to NestJS only (owner answer 2, B12). */
export type FileStep = { name: string; signIn?: true; build(st: FilesState): Promise<Request>; after?(st: FilesState, body: unknown): void }

const now = () => Math.floor(Date.now() / 1000)

const headers = async (st: FilesState, extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  ...(await st.who.headers()),
  ...extra,
})
const json = (method: string, path: string, h: Record<string, string>, body?: unknown, raw?: string) =>
  new Request(`${BASE}${path}`, { method, headers: { ...h, 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body ?? {}) })
const get = (path: string, h: Record<string, string>) => new Request(`${BASE}${path}`, { headers: h })
const command = (key: string = randomUUID(), ifMatch?: number) => ({ 'idempotency-key': key, 'x-gogospend-command-schema': '1', ...(ifMatch ? { 'if-match': `"${ifMatch}"` } : {}) })
const upload = (h: Record<string, string>, type: string, body: string) => new Request(`${BASE}/v1/imports`, { method: 'POST', headers: { ...h, 'content-type': type }, body })
const CSV = 'date,amount,description\n2026-10-20,-60.00,ข้าวมันไก่\n2026-10-21,-45.50,Grab\n'

const proofToken = (st: FilesState, nonce: string): Promise<string> => {
  if (!st.who.proofToken) throw new Error('The proof step needs a NestJS user (proofToken)')
  return st.who.proofToken(nonce)
}

export const STEPS: FileStep[] = [
  { name: 'snapshot, no key', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st)) },
  { name: 'snapshot', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': st.keys.snapshot })), after: (st, body) => (st.snapshotId = (body as { snapshot_id: string }).snapshot_id) },
  { name: 'snapshot, same key', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': st.keys.snapshot })) },
  { name: 'snapshot, unknown field', build: async (st) => json('POST', '/v1/sync/snapshots', await headers(st, { 'idempotency-key': randomUUID() }), { full: true }) },
  { name: 'snapshot status', build: async (st) => get(`/v1/sync/snapshots/${st.snapshotId}`, await headers(st)) },
  { name: 'snapshot status, bad id', build: async (st) => get('/v1/sync/snapshots/not-a-uuid', await headers(st)) },
  { name: 'snapshot status, unknown', build: async (st) => get(`/v1/sync/snapshots/${randomUUID()}`, await headers(st)) },
  { name: 'snapshot chunk, bad grant', build: async (st) => get('/v1/sync/snapshot-chunks/nope', await headers(st)) },

  { name: 'export: challenge', signIn: true, build: async (st) => json('POST', '/v1/auth/challenges', await headers(st), { request_id: randomUUID(), purpose: 'export', command_id: st.keys.export }), after: (st, body) => (st.challenge = body as FilesState['challenge']) },
  {
    name: 'export: proof',
    signIn: true,
    build: async (st) => {
      const idToken = await proofToken(st, st.challenge.nonce)
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

/**
 * Sends the session in order. In `vault` mode the two sign-in steps are not
 * sent (their entry is null) and the export's proof_id is a fresh UUID: the
 * vault reads `auth_time` from the token instead (B8, B12).
 */
export async function runFilesSession(send: Send, who: FilesUser, mode: 'nest' | 'vault'): Promise<(Seen | null)[]> {
  const st = { who, keys: { snapshot: randomUUID(), export: randomUUID(), upload: randomUUID() }, wallet: randomUUID(), transaction: randomUUID() } as FilesState
  if (mode === 'vault') st.proofId = randomUUID()
  const out: (Seen | null)[] = []
  for (const step of STEPS) {
    if (mode === 'vault' && step.signIn) {
      out.push(null)
      continue
    }
    const seen = await seenOf(await send(await step.build(st)))
    trace(step.name, seen)
    if (seen.status < 300) step.after?.(st, seen.body)
    out.push(seen)
  }
  return out
}

/** A NestJS (or PostgreSQL edge) member: signed up, terms v1 accepted, with an access token and the session binding, as the old session had. */
export async function nestUser(edge: Edge): Promise<FilesUser> {
  const user = await edge.member()
  return {
    headers: async () => ({
      'x-gogospend-client': 'ios/1.0.0',
      authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
      'x-gogospend-session': user.binding,
    }),
    proofToken: (nonce) => edge.issuer.sign({ iss: edge.issuer.issuer, sub: user.who.subject, aud: TEST_CLIENT_ID, nonce, auth_time: now(), iat: now(), exp: now() + 600 }),
  }
}

/** A token for `{ sub, sid }` as the vault reads it: signed now, with a sign-in that is now too (`auth_time`). */
const vaultToken = (issuer: JwksFixture, sub: string, sid: string): Promise<string> =>
  issuer.sign({ iss: issuer.issuer, aud: TEST_AUDIENCE, sub, sid, auth_time: now(), iat: now(), exp: now() + 300 })

/** A fresh vault person `{ sub, sid }` that has accepted terms v1 on the vault Worker; each request's token carries `sid` and `auth_time`. */
export async function vaultUser(vault: { send: Send }, issuer: JwksFixture): Promise<FilesUser> {
  const [sub, sid] = [randomUUID(), randomUUID()]
  const user: FilesUser = { headers: async () => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await vaultToken(issuer, sub, sid)}` }) }
  const accepted = await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await user.headers()), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))
  if (accepted.status !== 204) throw new Error(`The vault user could not accept terms v1: ${accepted.status}`)
  return user
}

/** The headers of one request from a fresh vault person `{ sub, sid }`, with a JSON body. */
export async function vaultHeaders(issuer: JwksFixture): Promise<Record<string, string>> {
  return { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await vaultToken(issuer, randomUUID(), randomUUID())}`, 'content-type': 'application/json' }
}
