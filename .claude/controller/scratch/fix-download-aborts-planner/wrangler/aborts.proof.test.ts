// The fix-download-aborts proof (ruling R97), never committed: run-proof.sh
// copies it to apps/edge/test/ in a proof copy of the tree, builds that copy
// with the proof entry (vault-proof.ts) and runs it with the Node config. The
// built vault Worker runs under `wrangler dev` (workerd), where every HTTP
// request is its own request and a client that goes away really goes away;
// the Workers test runtime keeps every request alive and hides the leak.
//
// Downloads: for an export, a snapshot chunk and a receipt, four GETs whose
// client goes away once the headers are in (megabytes of body still to come),
// then the same GET. Without the fix the slots stay taken and the next GET is
// 503; with it each slot is given back and the next GET is served.
//
// Retains and uploads hold their slot while the handler still runs. Under
// `wrangler dev` a handler whose client has gone runs on to its answer, so the
// slot comes back with or without the fix; the deployed runtime may cancel
// that outstanding work instead (Cloudflare's Workers limits), which is why the
// fix covers them too. Here: four retains aborted in the middle of their copy,
// then another member's retain; sixteen uploads aborted in the middle of their
// body (MAX_UPLOADS_PER_ISOLATE), then another member's upload.
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { IMPORT_FILE_NAME_HEADER, RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts'

import { TEST_AUDIENCE, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { testSettings } from './support/edge-harness'
import { startDevWorker } from './support/wrangler-dev'
import type { DevWorker } from './support/wrangler-dev'

const POLICIES = [
  { kind: 'privacy', version: 1, required: false, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

const OUT = process.env.PROOF_OUT ?? 'observations.txt'
const note = (line: string) => {
  appendFileSync(OUT, `${line}\n`)
  process.stdout.write(`${line}\n`)
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256Of = (bytes: ArrayBuffer) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex')

/** Records in the export and snapshot member's vault: about 5 MB of CSV and 7 MB of snapshot. */
const LEDGER_RECORDS = 12_000
/**
 * The snapshot's chunk size for this proof: 8 MiB. The vault's own chunks are 1 MiB (SNAPSHOT_CHUNK_BYTES), which
 * the loopback socket buffers can take whole before the abort lands; the download is the same at either size.
 */
const SNAPSHOT_CHUNK_BYTES = 8 * 1024 * 1024
/** The receipt download's image: 4 MiB, so its body is far from sent when the client goes away. */
const RECEIPT_BYTES = 4 * 1024 * 1024
/** Each aborted retain's image: 12 MiB, the largest receipt (attachments.bytes), so its copy takes long enough to abort in the middle. */
const COPY_BYTES = 12 * 1024 * 1024
/** MAX_UPLOADS_PER_ISOLATE (src/v1/files/uploads.ts). */
const UPLOADS_PER_ISOLATE = 16

const EDGE_DIR = fileURLToPath(new URL('../', import.meta.url))
const VAULT_CONFIG = 'dist/jotbun_vault/wrangler.json'

/**
 * test/support/vault-worker.ts's startVaultWorker, with uploads released
 * (IMPORT_UPLOADS_ENABLED) so the upload round can run: config:v1 written into
 * the local KV first, then `wrangler dev` on the built vault Worker.
 */
async function startProofVault(issuer: JwksFixture): Promise<DevWorker> {
  if (!existsSync(join(EDGE_DIR, VAULT_CONFIG))) throw new Error('Build the edge first: npm run build (in apps/edge)')
  const persistTo = mkdtempSync(join(tmpdir(), 'jotbun-proof-'))
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  await promisify(execFile)('npx', ['wrangler', 'kv', 'key', 'put', '--local', '--persist-to', persistTo, '-c', VAULT_CONFIG, '--binding', 'CONFIG', 'config:v1', JSON.stringify({ policies: POLICIES })], { cwd: EDGE_DIR, env })
  const worker = await startDevWorker({
    config: join(EDGE_DIR, VAULT_CONFIG),
    vars: {
      AUTH_ISSUER: issuer.issuer,
      AUTH_AUDIENCE: TEST_AUDIENCE,
      AUTH_JWKS_URL: `${issuer.issuer}.well-known/jwks.json`,
      COMMAND_DIGEST_KEY: testSettings(issuer).COMMAND_DIGEST_KEY,
      MIN_CLIENT_VERSION_IOS: '1.0.0',
      MIN_CLIENT_VERSION_ANDROID: '1.0.0',
      JOTBUN_ENV: 'test',
      IMPORT_UPLOADS_ENABLED: 'true',
    },
    persistTo,
  })
  return {
    ...worker,
    stop() {
      worker.stop()
      rmSync(persistTo, { recursive: true, force: true, maxRetries: 3 })
    },
  }
}

let issuer: JwksFixture
let vault: DevWorker

beforeAll(async () => {
  issuer = await startJwksFixture()
  vault = await startProofVault(issuer)
}, 180_000)

afterAll(async () => {
  vault?.stop()
  await issuer?.close()
})

type Member = { sub: string; sid: string; writes: number }
const newMember = (): Member => ({ sub: randomUUID(), sid: randomUUID(), writes: 0 })

async function signedIn(user: Member): Promise<Record<string, string>> {
  const now = Math.floor(Date.now() / 1000)
  const token = await issuer.sign({ iss: issuer.issuer, aud: TEST_AUDIENCE, sub: user.sub, sid: user.sid, iat: now, exp: now + 300, auth_time: now })
  return { authorization: `Bearer ${token}`, 'x-gogospend-client': 'ios/1.0.0' }
}

async function headersFor(user: Member, method: string, ifMatch?: number): Promise<Record<string, string>> {
  const headers = await signedIn(user)
  if (method !== 'GET' && method !== 'HEAD') {
    // The write budget is 60 a minute per session: a new session every 50 writes.
    user.writes += 1
    if (user.writes % 50 === 0) user.sid = randomUUID()
    headers['idempotency-key'] = randomUUID()
    headers['x-gogospend-command-schema'] = '1'
    if (ifMatch !== undefined) headers['if-match'] = `"${ifMatch}"`
  }
  return headers
}

async function call(user: Member, method: string, path: string, body?: unknown, ifMatch?: number, signal?: AbortSignal): Promise<Response> {
  const headers = await headersFor(user, method, ifMatch)
  if (body !== undefined) headers['content-type'] = 'application/json'
  return fetch(`${vault.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
}

async function ok(res: Response, status: number, what: string): Promise<any> {
  const text = await res.text()
  if (res.status !== status) throw new Error(`${what}: expected ${status}, got ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const seed = async (path: string) => ok(await fetch(`${vault.url}${path}`, { method: 'POST' }), 200, path)

async function member(): Promise<Member> {
  const user = newMember()
  await ok(await call(user, 'POST', '/v1/me/policy-acceptances', { kind: 'terms', version: 1 }), 204, 'terms')
  return user
}

/** A member with a wallet, the built-in categories and `count` records, by their ids. */
async function memberWithRecords(count: number): Promise<{ user: Member; records: string[] }> {
  const user = await member()
  const wallet = randomUUID()
  await ok(await call(user, 'POST', '/v1/wallets', { id: wallet, name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01' }), 201, 'wallet')
  const food = ((await ok(await call(user, 'POST', '/v1/categories/builtins', {}), 200, 'builtins')) as { id: string; builtin_key: string | null }[]).find((c) => c.builtin_key === 'food')?.id
  const records: string[] = []
  for (let i = 0; i < count; i += 1) {
    const id = randomUUID()
    await ok(await call(user, 'POST', '/v1/transactions', { id, type: 'expense', amount_minor: String(6500 + i), occurred_on: '2026-03-05', wallet_id: wallet, category_id: food }), 201, 'record')
    records.push(id)
  }
  return { user, records }
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
  for (let i = 0; i < 300; i += 1) {
    const value = await read()
    if (done(value)) return value
    await delay(200)
  }
  throw new Error(`${what} never finished`)
}

/** A GET whose client goes away as soon as the headers are in: its status. */
async function abortedGet(user: Member, path: string): Promise<number> {
  const controller = new AbortController()
  const res = await call(user, 'GET', path, undefined, undefined, controller.signal)
  controller.abort()
  await res.body?.cancel().catch(() => undefined)
  return res.status
}

/** A whole GET: its status, and for a 200 its size and whether its SHA-256 is the one recorded. */
async function wholeGet(user: Member, path: string, sha256: string): Promise<string> {
  const res = await call(user, 'GET', path)
  if (res.status !== 200) return `${res.status} ${(await res.text()).slice(0, 120)}`
  const body = await res.arrayBuffer()
  return `200 ${body.byteLength} bytes, sha256 ${sha256Of(body) === sha256 ? 'matches' : 'DIFFERS'}`
}

/** Four aborted GETs, then a whole GET two seconds later, and another five seconds after that. */
async function abortRound(kind: string, user: Member, path: string, sha256: string, bytes: number): Promise<string> {
  const aborted: number[] = []
  for (let i = 0; i < 4; i += 1) aborted.push(await abortedGet(user, path))
  await delay(2000)
  const after = await wholeGet(user, path, sha256)
  await delay(5000)
  const later = await wholeGet(user, path, sha256)
  note(`${kind} (${bytes} bytes): aborted GETs ${JSON.stringify(aborted)}; then GET ${after}; 5 s later GET ${later}`)
  return after.split(' ')[0]
}

/** POST /v1/imports with a CSV body: whole, or (with `signal`) 64 KiB that never ends, the way the upload tests send it. */
async function uploadCsv(user: Member, signal?: AbortSignal): Promise<Response> {
  const line = new TextEncoder().encode('2026-03-01,expense,food,65.00,synthetic coffee\n')
  const piece = new Uint8Array(64 * 1024)
  for (let at = 0; at < piece.length; at += line.length) piece.set(line.subarray(0, Math.min(line.length, piece.length - at)), at)
  const body = signal
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([...new TextEncoder().encode('date,type,category,amount,note\n'), ...piece]))
        },
      })
    : new Uint8Array([...new TextEncoder().encode('date,type,category,amount,note\n'), ...line])
  const headers: Record<string, string> = { ...(await signedIn(user)), 'content-type': 'text/csv', [IMPORT_FILE_NAME_HEADER]: encodeURIComponent('statement.csv'), 'idempotency-key': randomUUID() }
  return fetch(`${vault.url}/v1/imports`, { method: 'POST', headers, body, signal, duplex: 'half' } as RequestInit)
}

const answers: Record<string, string> = {}
const snapshotOf: { user?: Member; chunks?: { grant: string; bytes: number; sha256: string }[] } = {}

it('an export download whose client goes away gives its slot back: four aborted GETs, then a GET is served', async () => {
  const user = await member()
  note(`ledger ${JSON.stringify(await seed(`/__proof/ledger?sub=${user.sub}&count=${LEDGER_RECORDS}&on=2026-03-15`))}`)
  const requested = await ok(await call(user, 'POST', '/v1/exports', { proof_id: randomUUID(), from: '2026-03-01', through: '2026-03-31' }), 202, 'export')
  const exportId = requested.entity_id as string
  const ready = await until(async () => ok(await call(user, 'GET', `/v1/exports/${exportId}`), 200, 'export status'), (dto) => dto.status !== 'pending', 'the export')
  expect(ready.status).toBe('ready')
  const grant = await ok(await call(user, 'GET', `/v1/exports/${exportId}/grant`), 200, 'export grant')
  answers.export = await abortRound('export', user, grant.url, ready.sha256, ready.bytes)
  // The same member's snapshot, for the next case, in chunks of up to 8 MiB (proofSnapshot).
  const snapshot = await seed(`/__proof/snapshot?sub=${user.sub}&chunkBytes=${SNAPSHOT_CHUNK_BYTES}`)
  expect(snapshot.outcome).toBe('ready')
  const built = await ok(await call(user, 'GET', `/v1/sync/snapshots/${snapshot.id}`), 200, 'snapshot status')
  expect(built.status).toBe('ready')
  snapshotOf.user = user
  snapshotOf.chunks = built.chunks
}, 300_000)

it('a snapshot chunk download whose client goes away gives its slot back: four aborted GETs, then a GET is served', async () => {
  const user = snapshotOf.user as Member
  const chunks = snapshotOf.chunks ?? []
  note(`snapshot chunks ${JSON.stringify(chunks.map((chunk) => chunk.bytes))}`)
  const [chunk] = chunks
  answers.snapshot = await abortRound('snapshot chunk', user, `/v1/sync/snapshot-chunks/${chunk.grant}`, chunk.sha256, chunk.bytes)
}, 300_000)

it('a receipt download whose client goes away gives its slot back: four aborted GETs, then a GET is served', async () => {
  const { user, records } = await memberWithRecords(1)
  const image = await seed(`/__proof/image?sub=${user.sub}&bytes=${RECEIPT_BYTES}`)
  await ok(await call(user, 'POST', `/v1/transactions/${records[0]}/attachment`, { attachment_id: image.attachment_id, consent: RECEIPT_RETENTION_CONSENT }, 1), 200, 'retain')
  const grant = await ok(await call(user, 'GET', `/v1/attachments/${image.attachment_id}/grant`), 200, 'receipt grant')
  answers.receipt = await abortRound('receipt', user, grant.url, image.sha256, RECEIPT_BYTES)
}, 300_000)

it('a retain whose client goes away during its copy gives its copy slot back: four aborted retains, then another member retains', async () => {
  const { user, records } = await memberWithRecords(5)
  const images = []
  for (let i = 0; i < 5; i += 1) images.push(await seed(`/__proof/image?sub=${user.sub}&bytes=${COPY_BYTES}`))
  const retain = (who: Member, record: string, attachmentId: string, signal?: AbortSignal) =>
    call(who, 'POST', `/v1/transactions/${record}/attachment`, { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT }, 1, signal)
  // One whole retain, to time a copy of this size.
  const started = Date.now()
  await ok(await retain(user, records[0], images[0].attachment_id), 200, 'timed retain')
  const copyMs = Date.now() - started
  const abortAfter = Math.max(50, Math.round(copyMs / 2))
  const aborted: string[] = []
  for (let i = 1; i < 5; i += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), abortAfter)
    try {
      const res = await retain(user, records[i], images[i].attachment_id, controller.signal)
      aborted.push(`answered ${res.status} before the abort`)
      await res.arrayBuffer()
    } catch (error) {
      aborted.push((error as Error).name)
    } finally {
      clearTimeout(timer)
    }
    // Let a copy the request kept running end before the next, so no two run at once.
    await delay(copyMs * 2 + 1000)
  }
  const other = await memberWithRecords(2)
  const theirs = [await seed(`/__proof/image?sub=${other.user.sub}`), await seed(`/__proof/image?sub=${other.user.sub}`)]
  const after = await retain(other.user, other.records[0], theirs[0].attachment_id)
  const afterText = `${after.status} ${(await after.text()).slice(0, 80)}`
  await delay(5000)
  const later = await retain(other.user, other.records[1], theirs[1].attachment_id)
  const laterText = `${later.status} ${(await later.text()).slice(0, 80)}`
  note(`retain (${COPY_BYTES}-byte copies, one took ${copyMs} ms, each aborted after ${abortAfter} ms): aborted retains ${JSON.stringify(aborted)}; then another member's retain ${afterText}; 5 s later ${laterText}`)
  answers.retain = String(after.status)
}, 300_000)

it('an upload whose client goes away mid-body gives its place back: sixteen aborted uploads, then another member uploads', async () => {
  const aborted: string[] = []
  for (let m = 0; m < UPLOADS_PER_ISOLATE / 2; m += 1) {
    const user = await member()
    for (let i = 0; i < 2; i += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 300)
      try {
        const res = await uploadCsv(user, controller.signal)
        aborted.push(`answered ${res.status} before the abort`)
        await res.arrayBuffer()
      } catch (error) {
        aborted.push((error as Error).name)
      } finally {
        clearTimeout(timer)
      }
    }
  }
  await delay(2000)
  const after = await uploadCsv(await member())
  const afterText = `${after.status} ${(await after.text()).slice(0, 80)}`
  await delay(5000)
  const later = await uploadCsv(await member())
  const laterText = `${later.status} ${(await later.text()).slice(0, 80)}`
  const counts = aborted.reduce<Record<string, number>>((all, name) => ({ ...all, [name]: (all[name] ?? 0) + 1 }), {})
  note(`upload: aborted uploads ${JSON.stringify(counts)}; then another member's upload ${afterText}; 5 s later ${laterText}`)
  answers.upload = String(after.status)
}, 300_000)

it('the answers after the aborted requests', () => {
  note(`answers ${JSON.stringify(answers)}`)
  note(
    vault
      .logs()
      .split('\n')
      .filter((line) => /(GET|POST) \/v1\/(export-files|sync\/snapshot-chunks|attachment-files|transactions\/[^ ]+\/attachment|imports )/.test(line))
      .slice(-80)
      .join('\n'),
  )
  expect(answers).toEqual({ export: '200', snapshot: '200', receipt: '200', retain: '200', upload: '202' })
})
