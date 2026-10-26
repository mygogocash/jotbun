// The background roles end to end on PostgreSQL: a request through the edge
// queues the work, the role runs as its Worker would on a Cron Trigger or a
// queue wake-up (each with its own least-privilege login), and the result is
// read back through the edge: a snapshot's chunks, an export's CSV, a
// provider revocation, an account deletion and its receipt.
import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { featureGatesFromEnv } from '@api/common/feature-gates'
import { MemoryObjectStore } from '@api/storage/object-store'
import { FAKE_MAINTENANCE_CLIENT_ID, FAKE_MAINTENANCE_CLIENT_SECRET, FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '@api/testing/auth0-management-fake'
import type { ManagementFake } from '@api/testing/auth0-management-fake'
import { TEST_CLIENT_ID } from '@api/testing/jwks-server'
import { deletionJobOf, deletionRequestOf, runNow } from '@api/testing/privacy-fixtures'
import { runParseWorker } from '@api/imports/parse-worker'

import { runDeletions, runGenericJobs, runMaintenance, runSecurityJobs } from '../src/server/jobs/roles'
import type { GenericJobDeps, Log } from '../src/server/jobs/roles'
import { BASE, startEdge, testSettings } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'

let edge: Edge
let fake: ManagementFake
let store: MemoryObjectStore
let generic: GenericJobDeps
let securityPool: Pool
let registryPool: Pool
let settings: Record<string, string | undefined>
const gates = featureGatesFromEnv({})
const lookupKey = randomBytes(32).toString('base64url')

beforeAll(async () => {
  fake = await startManagementFake()
  store = new MemoryObjectStore()
  const auth0 = {
    IMPORT_UPLOADS_ENABLED: 'true',
    AUTH0_MANAGEMENT_URL: fake.url,
    AUTH0_PROFILE_LINK_CLIENT_ID: FAKE_PROFILE_CLIENT_ID,
    AUTH0_PROFILE_LINK_CLIENT_SECRET: FAKE_PROFILE_CLIENT_SECRET,
    AUTH0_MAINTENANCE_CLIENT_ID: FAKE_MAINTENANCE_CLIENT_ID,
    AUTH0_MAINTENANCE_CLIENT_SECRET: FAKE_MAINTENANCE_CLIENT_SECRET,
  }
  edge = await startEdge(auth0, { store })
  settings = { ...testSettings(edge.issuer, auth0) } as Record<string, string | undefined>
  generic = { jobsPool: await edge.db.loginPool(['gogospend_jobs'], 2), readPool: await edge.db.loginPool(['gogospend_leased_read'], 2), store, gates, parserContainer: true }
  securityPool = await edge.db.loginPool(['gogospend_jobs', 'gogospend_security'], 2)
  registryPool = await edge.db.loginPool(['gogospend_erasure_registry'], 2)
}, 60_000)

afterAll(async () => {
  await edge?.close()
  await fake?.close()
})

const now = () => Math.floor(Date.now() / 1000)
const json = async (res: Response) => JSON.parse(await res.text())
const collecting = (): Log & { errors: string[]; infos: string[] } => {
  const errors: string[] = []
  const infos: string[] = []
  return { errors, infos, info: (line) => infos.push(line), error: (line) => errors.push(line) }
}

/** A proof for one purpose and command, through the edge's own challenge and proof routes. */
async function proof(user: SignedUp, purpose: string, commandId: string): Promise<string> {
  const challenge = await json(await edge.as(user).post('/v1/auth/challenges', { request_id: randomUUID(), purpose, command_id: commandId }))
  const idToken = await edge.issuer.sign({ iss: edge.issuer.issuer, sub: user.who.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 })
  const proven = await edge.as(user).post('/v1/auth/proofs', { challenge_id: challenge.challenge_id, id_token: idToken })
  expect(proven.status).toBe(201)
  return (await json(proven)).proof_id
}

/** A member with a cash wallet and one lunch. */
async function memberWithLunch(): Promise<{ user: SignedUp; wallet: string }> {
  const user = await edge.member()
  const client = edge.as(user)
  const food = (await json(await client.post('/v1/categories/builtins'))).find((c: { builtin_key: string }) => c.builtin_key === 'food').id
  const wallet = randomUUID()
  expect((await client.post('/v1/wallets', { id: wallet, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-10-01' })).status).toBe(201)
  expect((await client.post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: '6000', occurred_on: '2026-10-20', wallet_id: wallet, category_id: food, merchant: 'ข้าวมันไก่' })).status).toBe(201)
  return { user, wallet }
}

describe('the jobs Worker', () => {
  it('builds a requested snapshot, whose chunks the edge then serves', async () => {
    const { user, wallet } = await memberWithLunch()
    const key = randomUUID()
    const requested = await edge.call(new Request(`${BASE}/v1/sync/snapshots`, {
      method: 'POST',
      headers: { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`, 'x-gogospend-session': user.binding, 'idempotency-key': key },
    }))
    expect(requested.status).toBe(202)
    const { snapshot_id: id } = await json(requested)

    expect(await runGenericJobs(generic, 30_000)).toBeGreaterThanOrEqual(1)

    const ready = await json(await edge.as(user).get(`/v1/sync/snapshots/${id}`))
    expect(ready).toMatchObject({ snapshot_id: id, status: 'ready' })
    const entities = []
    for (const chunk of ready.chunks) {
      const res = await edge.as(user).get(`/v1/sync/snapshot-chunks/${encodeURIComponent(chunk.grant)}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      const text = await res.text()
      expect([Buffer.byteLength(text), createHash('sha256').update(text).digest('hex')]).toEqual([chunk.bytes, chunk.sha256])
      entities.push(...JSON.parse(text).entities)
    }
    expect(entities.map((e: { id: string }) => e.id)).toContain(wallet)
  })

  it('writes a requested export, streamed back with its length, and never serves a tampered file', async () => {
    const { user } = await memberWithLunch()
    const commandId = randomUUID()
    const proofId = await proof(user, 'export', commandId)
    const requested = await edge.as(user).post('/v1/exports', { proof_id: proofId, from: '2026-10-01', through: '2026-10-31' }, { key: commandId })
    expect(requested.status).toBe(202)
    const { entity_id: exportId } = await json(requested)

    expect(await runGenericJobs(generic, 30_000)).toBeGreaterThanOrEqual(1)

    expect(await json(await edge.as(user).get(`/v1/exports/${exportId}`))).toMatchObject({ status: 'ready' })
    const grant = await json(await edge.as(user).get(`/v1/exports/${exportId}/grant`))
    const res = await edge.as(user).get(new URL(grant.url, BASE).pathname)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="[^"]+\.csv"$/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Number(res.headers.get('content-length'))).toBe(bytes.byteLength)
    // A UTF-8 byte-order mark first, so spreadsheet apps read the Thai text as UTF-8.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = new TextDecoder().decode(bytes)
    expect(csv).toContain('ข้าวมันไก่')
    expect(csv).toContain('60.00')

    // The stored object is swapped for other bytes: its recorded digest no longer matches.
    const [object] = await store.list('export/')
    await store.delete(object.key)
    await store.putStream(object.key, new TextEncoder().encode(`\uFEFF${csv.replace('60.00', '6.00')}`))
    const fresh = await json(await edge.as(user).get(`/v1/exports/${exportId}/grant`))
    expect((await edge.as(user).get(new URL(fresh.url, BASE).pathname)).status).toBe(404)
  })

  it('sweeps and reports without an error line', async () => {
    const log = collecting()
    await runMaintenance(generic, log)
    expect(log.errors).toEqual([])
    expect(log.infos.some((line) => line.startsWith('job worker: queue'))).toBe(true)
  })
})

describe('the security Worker', () => {
  it('revokes the provider sessions after a global logout', async () => {
    const user = await edge.member()
    const commandId = randomUUID()
    const proofId = await proof(user, 'global_logout', commandId)
    expect((await edge.as(user).post('/v1/me/global-logout', { proof_id: proofId }, { key: commandId, schema: null })).status).toBe(202)
    fake.deviceCredentials.set('dc_1', { id: 'dc_1', user_id: user.who.subject, client_id: TEST_CLIENT_ID, type: 'refresh_token' })

    const log = collecting()
    await runSecurityJobs({ pool: securityPool, settings, gates, fetch: (input, init) => fetch(input, init) }, log)

    expect(log.errors).toEqual([])
    expect(fake.deviceCredentials.has('dc_1')).toBe(false)
    const { rows } = await edge.db.admin((client) => client.query(`SELECT status FROM jobs WHERE kind = 'auth0_revoke_grants' AND account_id = $1`, [user.accountId]))
    expect(rows.map((row) => row.status)).toEqual(['succeeded'])
  })
})

describe('the deletion Worker', () => {
  it('erases a requested account, and the initiating device reads its receipt', async () => {
    const { user } = await memberWithLunch()
    const [provider, id] = user.who.subject.split('|')
    fake.profiles.set(user.who.subject, { user_id: user.who.subject, email_verified: true, identities: [{ connection: 'Username-Password-Authentication', provider, user_id: id }] })
    const commandId = randomUUID()
    const proofId = await proof(user, 'deletion', commandId)
    expect((await edge.as(user).post('/v1/me/deletion', { proof_id: proofId }, { key: commandId, schema: null })).status).toBe(202)
    const [job] = await deletionJobOf(edge.db, user.accountId)
    await runNow(edge.db, job.id)

    const deps = { pool: securityPool, registryPool, lookupKey, store, settings, gates, fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }
    const log = collecting()
    for (let pass = 0; pass < 10 && !(await deletionRequestOf(edge.db, user.accountId))?.purged_at; pass += 1) {
      await runDeletions(deps, 30_000, log)
      await runNow(edge.db, job.id)
    }
    expect(log.errors).toEqual([])
    expect((await deletionRequestOf(edge.db, user.accountId))?.purged_at).toBeTruthy()
    expect(fake.deletedUsers).toContain(user.who.subject)
    const { rows } = await edge.db.admin((client) => client.query('SELECT count(*)::int AS n FROM accounts WHERE id = $1', [user.accountId]))
    expect(rows[0].n).toBe(0)

    const receipt = await edge.call(new Request(`${BASE}/v1/auth/deletion-receipt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`, 'x-gogospend-session': user.binding },
      body: JSON.stringify({ command_id: commandId }),
    }))
    expect(receipt.status).toBe(200)
    expect(await json(receipt)).toMatchObject({ status: 'completed' })
  })

  it('refuses a lookup key that is not 32 bytes', async () => {
    const deps = { pool: securityPool, registryPool, lookupKey: 'short', store, settings, gates, fetch }
    await expect(runDeletions(deps, 1_000)).rejects.toThrow(/ERASURE_REGISTRY_LOOKUP_KEY/)
  })
})

describe('the parser container', () => {
  it('parses an upload the edge accepted, which the edge then reviews and confirms', async () => {
    const user = await edge.member()
    const client = edge.as(user)
    const categories = await json(await client.post('/v1/categories/builtins'))
    const builtin = (key: string) => categories.find((c: { builtin_key: string }) => c.builtin_key === key).id
    const cash = randomUUID()
    const bank = randomUUID()
    expect((await client.post('/v1/wallets', { id: cash, name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01' })).status).toBe(201)
    expect((await client.post('/v1/wallets', { id: bank, name: 'Bank', opening_minor: '0', tracking_start: '2026-01-01' })).status).toBe(201)
    const file = ['date,type,category,amount,note,merchant,wallet', '2026-10-20,expense,food,60.00,lunch,ข้าวมันไก่,Cash', '2026-10-15,income,salary,30000.00,october,บริษัท,Bank', ''].join('\n')
    const accepted = await edge.call(new Request(`${BASE}/v1/imports`, {
      method: 'POST',
      headers: {
        'x-gogospend-client': 'ios/1.0.0',
        authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
        'x-gogospend-session': user.binding,
        'idempotency-key': randomUUID(),
        'content-type': 'text/csv',
        'x-gogospend-file-name': encodeURIComponent('บัญชี.csv'),
      },
      body: file,
    }))
    expect(accepted.status).toBe(202)
    const { job_id: jobId } = await json(accepted)

    // What the container runs: import_parse only, on the jobs login, exiting when idle.
    const parsed = await runParseWorker({ pool: generic.jobsPool, store, gates, idleExitMs: 300, pollMs: 50 })
    expect(parsed).toEqual({ ran: 1, reason: 'idle' })

    const preview = await json(await client.get(`/v1/imports/${jobId}/preview`))
    expect([preview.status, preview.candidates.length]).toEqual(['ready', 2])
    const mapping = { wallets: { Cash: cash, Bank: bank }, categories: { expense: { food: builtin('food') }, income: { salary: builtin('salary') } } }
    const frozen = await client.post(`/v1/imports/${jobId}/selections`, { review_revision: '1', selected_row_ids: ['row:2', 'row:3'], mapping })
    expect(frozen.status).toBe(201)
    const { entity_id: selectionId } = await json(frozen)
    const confirmed = await client.post(`/v1/imports/${jobId}/confirmations`, { selection_id: selectionId, frozen_revision: '1', batch_row_ids: ['row:2', 'row:3'] })
    expect(confirmed.status).toBe(200)

    const history = await json(await client.get('/v1/history?from=2026-10-01&through=2026-10-31'))
    expect(history.items.map((item: { merchant: string | null }) => item.merchant).sort()).toEqual(['ข้าวมันไก่', 'บริษัท'])
  })
})
