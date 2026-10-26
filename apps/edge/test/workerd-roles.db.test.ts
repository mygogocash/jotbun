// The background Workers in the real Workers runtime: the built HTTP,
// jobs, security and deletion Workers each run in `wrangler dev` (workerd)
// on their own Hyperdrive logins, the HTTP and job Workers sharing one local
// R2 bucket. Work is requested through the HTTP Worker, a role Worker's Cron
// handler is fired, and the result is read back through the HTTP Worker.
// Needs `npm run build` in apps/edge first.
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FAKE_MAINTENANCE_CLIENT_ID, FAKE_MAINTENANCE_CLIENT_SECRET, FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '@api/testing/auth0-management-fake'
import type { ManagementFake } from '@api/testing/auth0-management-fake'
import { TEST_CLIENT_ID } from '@api/testing/jwks-server'
import { deletionJobOf, deletionRequestOf, runNow } from '@api/testing/privacy-fixtures'

import { startEdge, testSettings } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'
import { startDevWorker } from './support/wrangler-dev'
import type { DevWorker } from './support/wrangler-dev'

async function sequence<T>(starts: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = []
  for (const start of starts) out.push(await start())
  return out
}

const built = (name: string) => fileURLToPath(new URL(`../dist/${name}/wrangler.json`, import.meta.url))

let edge: Edge
let fake: ManagementFake
let persistTo = ''
let http: DevWorker
let jobs: DevWorker
let security: DevWorker
let deletion: DevWorker

beforeAll(async () => {
  for (const name of ['server', 'jotbun_jobs', 'jotbun_security', 'jotbun_deletion']) {
    if (!existsSync(built(name))) throw new Error('Build the edge first: npm run build (in apps/edge)')
  }
  edge = await startEdge()
  fake = await startManagementFake()
  persistTo = mkdtempSync(join(tmpdir(), 'jotbun-roles-'))
  const settings = testSettings(edge.issuer, { JOTBUN_ENV: 'local', AUTH0_MANAGEMENT_URL: fake.url, AUTH0_PROFILE_LINK_CLIENT_ID: FAKE_PROFILE_CLIENT_ID, AUTH0_PROFILE_LINK_CLIENT_SECRET: FAKE_PROFILE_CLIENT_SECRET }) as Record<string, string | undefined>
  const maintenance = { AUTH0_MANAGEMENT_URL: fake.url, AUTH0_MAINTENANCE_CLIENT_ID: FAKE_MAINTENANCE_CLIENT_ID, AUTH0_MAINTENANCE_CLIENT_SECRET: FAKE_MAINTENANCE_CLIENT_SECRET, AUTH0_ISSUER: settings.AUTH0_ISSUER, AUTH0_ALLOWED_CLIENT_IDS: settings.AUTH0_ALLOWED_CLIENT_IDS, JOTBUN_ENV: 'local' }
  // One at a time: wrangler dev picks some of its local ports as it starts.
  ;[http, jobs, security, deletion] = await sequence([
    async () => startDevWorker({ config: built('server'), vars: settings, hyperdrive: { HYPERDRIVE: await edge.db.loginUrl(['gogospend_app', 'gogospend_bootstrap']) }, persistTo }),
    async () => startDevWorker({
      config: built('jotbun_jobs'),
      vars: { JOTBUN_ENV: 'local' },
      hyperdrive: { HYPERDRIVE_JOBS: await edge.db.loginUrl(['gogospend_jobs']), HYPERDRIVE_LEASED_READ: await edge.db.loginUrl(['gogospend_leased_read']) },
      persistTo,
      scheduled: true,
      probe: '/cdn-cgi/local/scheduled?cron=0+0+1+1+*',
    }),
    async () => startDevWorker({ config: built('jotbun_security'), vars: maintenance, hyperdrive: { HYPERDRIVE_SECURITY: await edge.db.loginUrl(['gogospend_jobs', 'gogospend_security']) }, persistTo, scheduled: true, probe: '/cdn-cgi/local/scheduled?cron=0+0+1+1+*' }),
    async () => startDevWorker({
      config: built('jotbun_deletion'),
      vars: { ...maintenance, ERASURE_REGISTRY_LOOKUP_KEY: randomBytes(32).toString('base64url') },
      hyperdrive: { HYPERDRIVE_DELETION: await edge.db.loginUrl(['gogospend_jobs', 'gogospend_security']), HYPERDRIVE_ERASURE_REGISTRY: await edge.db.loginUrl(['gogospend_erasure_registry']) },
      persistTo,
      scheduled: true,
      probe: '/cdn-cgi/local/scheduled?cron=0+0+1+1+*',
    }),
  ])
}, 240_000)

afterAll(async () => {
  for (const worker of [http, jobs, security, deletion]) worker?.stop()
  await fake?.close()
  await edge?.close()
  if (persistTo) rmSync(persistTo, { recursive: true, force: true })
})

const now = () => Math.floor(Date.now() / 1000)
const headers = async (user: SignedUp, extra: Record<string, string> = {}) => ({
  'x-gogospend-client': 'android/1.0.0',
  authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
  'x-gogospend-session': user.binding,
  ...extra,
})
const post = async (user: SignedUp, path: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(`${http.url}${path}`, { method: 'POST', headers: { ...(await headers(user, extra)), 'content-type': 'application/json' }, body: JSON.stringify(body) })
const get = async (user: SignedUp, path: string) => fetch(`${http.url}${path}`, { headers: await headers(user) })
/** Fires a role Worker's Cron handler, as a Cron Trigger would, and waits for it to finish. */
const cron = async (worker: DevWorker) => {
  const res = await fetch(`${worker.url}/cdn-cgi/local/scheduled?cron=*+*+*+*+*&format=json`)
  const result = await res.text()
  // The handler's outcome, and the Worker's own log, explain a failed run.
  expect(res.status, `${result}\n${worker.logs().slice(-2000)}`).toBe(200)
  expect(JSON.parse(result), worker.logs().slice(-2000)).toMatchObject({ outcome: 'ok' })
}

async function proof(user: SignedUp, purpose: string, commandId: string): Promise<string> {
  const challenge = await (await post(user, '/v1/auth/challenges', { request_id: randomUUID(), purpose, command_id: commandId })).json()
  const idToken = await edge.issuer.sign({ iss: edge.issuer.issuer, sub: user.who.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 })
  return (await (await post(user, '/v1/auth/proofs', { challenge_id: challenge.challenge_id, id_token: idToken })).json()).proof_id
}

describe('the HTTP Worker in workerd', () => {
  it('signs a new member in through the Auth0 profile check', async () => {
    const who = edge.fx.identity()
    const [provider, subjectId] = who.subject.split('|')
    fake.profiles.set(who.subject, { user_id: who.subject, email_verified: true, identities: [{ connection: 'google-oauth2', provider, user_id: subjectId }] })
    const token = { 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await edge.issuer.accessToken({ sub: who.subject })}`, 'content-type': 'application/json' }
    const challenge = await (await fetch(`${http.url}/v1/auth/challenges`, { method: 'POST', headers: token, body: JSON.stringify({ request_id: randomUUID(), purpose: 'bootstrap', command_id: randomUUID() }) })).json()
    const idToken = await edge.issuer.sign({ iss: edge.issuer.issuer, sub: who.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 })
    const signedIn = await fetch(`${http.url}/v1/auth/bootstrap`, { method: 'POST', headers: token, body: JSON.stringify({ challenge_id: challenge.challenge_id, id_token: idToken }) })
    expect(signedIn.status, http.logs().slice(-2000)).toBe(201)
    const { binding } = await signedIn.json()
    expect((await fetch(`${http.url}/v1/me`, { headers: { ...token, 'x-gogospend-session': binding } })).status).toBe(200)
    expect(fake.requests.some((request) => request.url.startsWith(`/api/v2/users/${encodeURIComponent(who.subject)}`))).toBe(true)
  })
})

describe('the background Workers in workerd', () => {
  it('the jobs Worker builds a snapshot into the R2 bucket the HTTP Worker serves it from', async () => {
    const user = await edge.member()
    const wallet = randomUUID()
    expect((await post(user, '/v1/wallets', { id: wallet, name: 'เงินสด', opening_minor: '0', tracking_start: '2026-10-01' }, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' })).status).toBe(201)
    const requested = await post(user, '/v1/sync/snapshots', {}, { 'idempotency-key': randomUUID() })
    expect(requested.status).toBe(202)
    const { snapshot_id: id } = await requested.json()

    await cron(jobs)

    const ready = await (await get(user, `/v1/sync/snapshots/${id}`)).json()
    expect(ready.status).toBe('ready')
    const chunk = await get(user, `/v1/sync/snapshot-chunks/${encodeURIComponent(ready.chunks[0].grant)}`)
    expect(chunk.status).toBe(200)
    expect(JSON.stringify(await chunk.json())).toContain(wallet)
    expect(jobs.logs()).not.toMatch(/job worker: .*failed/)
  })

  it('the security Worker revokes provider sessions after a global logout', async () => {
    const user = await edge.member()
    const commandId = randomUUID()
    const proofId = await proof(user, 'global_logout', commandId)
    expect((await post(user, '/v1/me/global-logout', { proof_id: proofId }, { 'idempotency-key': commandId })).status).toBe(202)
    fake.deviceCredentials.set('dc_workerd', { id: 'dc_workerd', user_id: user.who.subject, client_id: TEST_CLIENT_ID, type: 'refresh_token' })

    await cron(security)

    await new Promise((resolve) => setTimeout(resolve, 500))
    const { rows: debugRows } = await edge.db.admin((client) => client.query(`SELECT kind, status, attempts, last_error, run_after <= now() AS due FROM jobs WHERE account_id = $1`, [user.accountId]))
    expect(fake.deviceCredentials.has('dc_workerd'), `${JSON.stringify(debugRows)}\n${JSON.stringify(fake.requests.slice(-5))}\n${security.logs().slice(-3000)}`).toBe(false)
    expect(security.logs()).not.toMatch(/security worker: .*failed/)
  })

  it('the deletion Worker erases an account, with its R2 objects', async () => {
    const user = await edge.member()
    const [provider, subjectId] = user.who.subject.split('|')
    fake.profiles.set(user.who.subject, { user_id: user.who.subject, email_verified: true, identities: [{ connection: 'Username-Password-Authentication', provider, user_id: subjectId }] })
    const commandId = randomUUID()
    const proofId = await proof(user, 'deletion', commandId)
    expect((await post(user, '/v1/me/deletion', { proof_id: proofId }, { 'idempotency-key': commandId })).status).toBe(202)
    const [job] = await deletionJobOf(edge.db, user.accountId)
    for (let pass = 0; pass < 10 && !(await deletionRequestOf(edge.db, user.accountId))?.purged_at; pass += 1) {
      await runNow(edge.db, job.id)
      await cron(deletion)
    }
    expect((await deletionRequestOf(edge.db, user.accountId))?.purged_at, deletion.logs().slice(-3000)).toBeTruthy()
    expect(fake.deletedUsers).toContain(user.who.subject)
    expect(deletion.logs()).not.toMatch(/deletion worker: .*failed/)
  })
})
