// Statement uploads on the vault (1B-T5): the API's UploadIntake streams the
// body into R2 quarantine through the Worker route, and each of its database
// steps is a vault step. Ports apps/api/src/imports/upload-intake.integration.spec.ts
// by name and assertion; the vault's own rules (prune, starter) run on the
// vault clock inside runInDurableObject. Cases about PostgreSQL roles, Node's
// HTTP server, lifecycle generations and the worker's alert line are not
// applicable (the receipt lists them).
import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { IMPORT_LIMIT_MESSAGE_KEYS, IMPORT_UPLOAD_MAX_BYTES, isImportJobDto } from '@gogospend/contracts'
import type { ImportJobDto } from '@gogospend/contracts'

import { FeatureGates } from '@api/common/feature-gates'
import { SYNTHETIC, meteredStream } from '@api/imports/fixtures/synthetic-uploads'

import type { ParseMessage } from '../../src/background/parse-consumer'
import { R2ObjectStore } from '../../src/server/storage/r2-object-store'
import { MAX_UPLOADS_PER_ISOLATE, uploadsInFlight } from '../../src/v1/files/uploads'
import { VAULT_STEP_ROUTES } from '../../src/v1/routes'
import { RAW_UPLOAD_TTL_MS, UPLOAD_ROW_TTL_MS, beginUpload, finishUpload, pruneUploads, reserveUploadPart, uploadsDueAt } from '../../src/vault/files/intake'
import { RESERVATION_GRACE_MS, deleteDueObjects } from '../../src/vault/files/objects'
import { PARSE_RESEND_MS, parseSource } from '../../src/vault/files/parse'
import { PARSE_STARTER, START_RETRY_MS, WORK_STARTERS, startPendingWork } from '../../src/vault/files/work'
import type { PendingWorkHost } from '../../src/vault/files/work'
import type { UserVault } from '../../src/vault/user-vault'
import {
  DAY,
  HOUR,
  MIN,
  MiB,
  ageSeeds,
  ageUpload,
  csvText,
  eventually,
  fileAt,
  gate,
  liveRegistry,
  parseJobs,
  pausedBody,
  pieces,
  quarantined,
  seedAccepted,
  spyBucket,
  stalledBody,
  streamOf,
  upload,
  uploadRowOf,
  vaultIdOf,
  vaultRows,
} from './support/files'
import type { Reply } from './support/files'
import { member, startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const CAP = IMPORT_UPLOAD_MAX_BYTES
const ON = { IMPORT_UPLOADS_ENABLED: 'true' }

/** The Worker with uploads released and no pending-work start, so a test decides when parses start. */
const client = (extra: Record<string, unknown> = {}) => startV1(undefined, { env: { ...ON, ...extra }, startWork: 'manual' })

const transactionCount = async (user: TestUser) => (await vaultRows<{ n: number }>(user, 'SELECT count(*) AS n FROM transactions'))[0].n
const rowsOf = (user: TestUser) => vaultRows<{ status: string; outcome_code: string | null }>(user, 'SELECT status, outcome_code FROM import_uploads ORDER BY created_at')
const receiving = async (user: TestUser) => (await vaultRows<{ n: number }>(user, "SELECT count(*) AS n FROM import_uploads WHERE status = 'receiving'"))[0].n

/** Runs one of the vault's file functions at `ms` on the person's vault. */
const inVault = <T>(user: TestUser, run: (state: DurableObjectState, vault: UserVault) => T | Promise<T>) => runInDurableObject(vaultOf(user), (vault: UserVault, state) => run(state, vault))

/** deleteDueObjects at `ms`, on the vault's own bucket. */
const sweep = (user: TestUser, ms = Date.now()) => inVault(user, (state, vault) => deleteDueObjects({ context: () => fileAt(state, ms), bucket: vault.bucket }))

describe('POST /v1/imports streams into bounded private quarantine', () => {
  it('oversized_stream_is_rejected_before_buffering', async () => {
    let stored = 0
    const v1 = await client({ OBJECTS: spyBucket({ afterPut: (_key, bytes) => void (stored += bytes) }) })
    const user = await member(v1)
    const response = await upload(v1, user, streamOf(meteredStream(SYNTHETIC.csv, CAP + 1).stream), { chunked: true })
    const bytesBufferedBeyondCap = Math.max(0, stored - CAP)
    expect(response.status).toBe(413)
    expect(bytesBufferedBeyondCap).toBe(0)
    expect(response.body.code).toBe('UPLOAD_TOO_LARGE')
    expect(await quarantined(user)).toEqual([])
    expect(await liveRegistry(user)).toEqual([])
    expect(await parseJobs(user)).toEqual([])
    expect(await rowsOf(user)).toEqual([{ status: 'rejected', outcome_code: 'too_large' }])
  }, 30_000)

  it('a declared Content-Length over 12 MiB is refused before the body is read', async () => {
    const v1 = await client()
    const user = await member(v1)
    const response = await upload(v1, user, SYNTHETIC.csv, { declaredLength: CAP + 1 })
    expect(response.status).toBe(413)
    expect(response.body.code).toBe('UPLOAD_TOO_LARGE')
    expect(await rowsOf(user)).toEqual([])
  })

  it('accepts a CSV into private quarantine and queues exactly one parse job; nothing is parsed or saved', async () => {
    const v1 = await client()
    const user = await member(v1)
    const before = await transactionCount(user)
    // The API's legacy sample is a file on disk; workerd reads none, so the synthetic CSV stands in.
    const response = await upload(v1, user, SYNTHETIC.csv, { name: 'spendee-th-sample.csv' })
    expect(response.status).toBe(202)
    const accepted = response.body as ImportJobDto
    expect(isImportJobDto(accepted)).toBe(true)
    expect(accepted).toMatchObject({ status: 'queued', format: 'csv', file_name: 'spendee-th-sample.csv', bytes: SYNTHETIC.csv.byteLength })
    expect(Date.parse(accepted.expires_at) - Date.parse(accepted.received_at)).toBe(24 * HOUR)
    expect(JSON.stringify(accepted)).not.toMatch(/import_quarantine|part-/)

    // Quarantine: server-generated keys only, registered and published until expiry, holding exactly the upload.
    const keys = await quarantined(user)
    expect(keys).toEqual([expect.stringMatching(new RegExp(`^import_quarantine/${vaultIdOf(user)}/${accepted.job_id}/[0-9a-f-]{36}/part-0000$`))])
    expect(keys.join()).not.toContain('spendee')
    const registry = await vaultRows<{ key: string; status: string; delete_after: number; bytes: number }>(user, 'SELECT key, status, delete_after, bytes FROM vault_objects ORDER BY key')
    expect(registry.map((row) => [row.key, row.status, row.bytes])).toEqual([[keys[0], 'published', SYNTHETIC.csv.byteLength]])
    expect(new Date(registry[0].delete_after).toISOString()).toBe(accepted.expires_at)
    const whole = new Uint8Array(await ((await env.OBJECTS.get(keys[0])) as unknown as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer())
    expect(createHash('sha256').update(whole).digest('hex')).toBe(createHash('sha256').update(SYNTHETIC.csv).digest('hex'))

    // One parse job (the import's own id), queued, never sent while the Worker starts nothing; nothing parsed.
    expect(await parseJobs(user)).toEqual([{ job_id: accepted.job_id, parse_state: 'queued' }])
    expect(await uploadRowOf(user, accepted.job_id)).toMatchObject({ parse_attempts: 0, enqueued_at: null })
    expect(await vaultRows(user, 'SELECT 1 FROM import_previews')).toEqual([])
    expect(await transactionCount(user)).toBe(before)
    const read = await v1.as(user).get(`/v1/imports/${accepted.job_id}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(accepted)
  })

  it.each<[string, Uint8Array, { name?: string; rawName?: string; type?: string }, number, string]>([
    ['a PNG named and declared as JPEG', SYNTHETIC.png, { name: 'receipt.jpg', type: 'image/jpeg' }, 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a HEIC photo named and declared as JPEG', SYNTHETIC.heic, { name: 'receipt.jpg', type: 'image/jpeg' }, 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a ZIP named and declared as CSV', SYNTHETIC.xlsx, { name: 'statement.csv' }, 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a declared HEIC type', SYNTHETIC.heic, { name: 'IMG_0001.heic', type: 'image/heic' }, 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a path-like name', SYNTHETIC.csv, { name: '../../etc/passwd.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an encoded backslash path', SYNTHETIC.csv, { rawName: '..%5C..%5Cboot.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an undecodable name', SYNTHETIC.csv, { rawName: 'bad%E0%A4%A.csv' }, 422, 'INVALID_FILE_NAME'],
    ['an empty body', new Uint8Array(0), {}, 422, 'UPLOAD_EMPTY'],
  ])('refuses %s: nothing quarantined, published, parsed or saved', async (_label, body, options, status, code) => {
    const v1 = await client()
    const user = await member(v1)
    const before = await transactionCount(user)
    const response = await upload(v1, user, body, options)
    expect([response.status, response.body.code]).toEqual([status, code])
    expect(await quarantined(user)).toEqual([])
    expect(await liveRegistry(user)).toEqual([])
    expect(await parseJobs(user)).toEqual([])
    expect(await transactionCount(user)).toBe(before)
    // A refused upload keeps no file name.
    expect(await vaultRows(user, 'SELECT file_name FROM import_uploads WHERE file_name IS NOT NULL')).toEqual([])
  })

  it('keeps Thai file names as labels and replays an accepted key without a second job', async () => {
    const v1 = await client()
    const user = await member(v1)
    const key = randomUUID()
    const first = await upload(v1, user, SYNTHETIC.csvBom, { key, name: 'รายการ มีนาคม.csv' })
    expect(first.status).toBe(202)
    expect(first.body.file_name).toBe('รายการ มีนาคม.csv')
    const again = await upload(v1, user, SYNTHETIC.csvBom, { key, name: 'รายการ มีนาคม.csv' })
    expect(again.status).toBe(202)
    expect(again.body).toEqual(first.body)
    const other = await upload(v1, user, SYNTHETIC.csv, { key, name: 'other.csv' })
    expect([other.status, other.body.code]).toEqual([409, 'IDEMPOTENCY_MISMATCH'])
    expect(await parseJobs(user)).toHaveLength(1)
    expect(await rowsOf(user)).toHaveLength(1)
    // The same key from another account is a different upload.
    const stranger = await member(v1)
    const theirs = await upload(v1, stranger, SYNTHETIC.csv, { key })
    expect(theirs.status).toBe(202)
    expect(theirs.body.job_id).not.toBe(first.body.job_id)
  })

  it('is disabled by default: 404 with the body unread and nothing recorded', async () => {
    const off = await startV1(undefined, { startWork: 'manual' })
    const user = await member(off)
    const response = await upload(off, user, SYNTHETIC.csv)
    expect([response.status, response.body.code]).toEqual([404, 'NOT_FOUND'])
    expect(await rowsOf(user)).toEqual([])
  })
})

describe('per-account quotas hold under concurrent uploads', () => {
  it('at most 5 upload attempts in 15 minutes', async () => {
    const v1 = await client()
    const user = await member(v1)
    // In concurrent pairs (an account streams at most 2 at once): the third pair races for the last slot.
    const replies: Reply[] = []
    for (let pair = 0; pair < 4; pair += 1) {
      replies.push(...(await Promise.all([0, 1].map((index) => upload(v1, user, SYNTHETIC.csv, { name: `s${pair}-${index}.csv` })))))
    }
    expect(replies.map((reply) => reply.status).sort()).toEqual([202, 202, 202, 202, 202, 429, 429, 429])
    expect(replies.slice(4, 6).map((reply) => reply.status).sort()).toEqual([202, 429])
    for (const reply of replies.filter((r) => r.status === 429)) {
      expect(reply.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.uploads })
      expect(reply.body.retry_after_seconds).toBeGreaterThan(0)
      expect(reply.body.retry_after_seconds).toBeLessThanOrEqual(15 * 60)
      expect(reply.headers.get('retry-after')).toBe(String(reply.body.retry_after_seconds))
    }
    expect(await rowsOf(user)).toHaveLength(5)
    expect(await parseJobs(user)).toHaveLength(5)
  })

  it('at most 50 MiB of accepted bytes per 24 hours, decided under the account lock', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, [
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 12 * MiB, minutesAgo: 60 },
      { bytes: 2 * MiB - 3 * 1024, minutesAgo: 60 },
    ])
    const body = new Uint8Array(2048).fill(0x61)
    body.set(SYNTHETIC.csv)
    const replies = await Promise.all([upload(v1, user, body, { chunked: true }), upload(v1, user, body, { chunked: true })])
    expect(replies.map((reply) => reply.status).sort()).toEqual([202, 429])
    const refused = replies.find((reply) => reply.status === 429) as Reply
    expect(refused.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.bytes })
    // Room returns when the seeded uploads (accepted 59 minutes ago) leave the 24-hour window.
    expect(refused.body.retry_after_seconds).toBeGreaterThan(23 * 3600)
    expect(refused.body.retry_after_seconds).toBeLessThanOrEqual(23 * 3600 + 60)
    expect(await quarantined(user)).toHaveLength(1)
    expect(await liveRegistry(user)).toHaveLength(1)
    // A declared length that cannot fit is refused before streaming.
    const declared = await upload(v1, user, body)
    expect(declared.body.message_key).toBe(IMPORT_LIMIT_MESSAGE_KEYS.bytes)
  })

  it('at most 10 parse jobs per 24 hours', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, Array.from({ length: 10 }, () => ({ bytes: 100, minutesAgo: 120 })))
    const reply = await upload(v1, user, SYNTHETIC.csv)
    expect(reply.status).toBe(429)
    expect(reply.body).toMatchObject({ code: 'UPLOAD_LIMIT_REACHED', message_key: IMPORT_LIMIT_MESSAGE_KEYS.parse_jobs })
    // The oldest seeded upload was accepted 119 minutes ago.
    expect(reply.body.retry_after_seconds).toBeGreaterThan(22 * 3600)
    expect(reply.body.retry_after_seconds).toBeLessThanOrEqual(22 * 3600 + 60)
    expect(await vaultRows(user, "SELECT 1 FROM import_uploads WHERE file_name IS NOT 'seed.csv'")).toEqual([])
  })
})

describe('job ids belong to their account', () => {
  it('another account gets the same 404 for an existing import as for an unknown id', async () => {
    const v1 = await client()
    const owner = await member(v1)
    const stranger = await member(v1)
    const accepted = (await upload(v1, owner, SYNTHETIC.csv)).body as ImportJobDto
    expect((await v1.as(owner).get(`/v1/imports/${accepted.job_id}`)).status).toBe(200)
    const foreign = await v1.as(stranger).get(`/v1/imports/${accepted.job_id}`)
    const unknown = await v1.as(stranger).get(`/v1/imports/${randomUUID()}`)
    const foreignBody = (await foreign.json()) as Record<string, unknown>
    expect([foreign.status, foreignBody.code, foreignBody.message_key]).toEqual([404, 'NOT_FOUND', 'errors.not_found'])
    expect({ ...foreignBody, request_id: '' }).toEqual({ ...((await unknown.json()) as Record<string, unknown>), request_id: '' })
    expect((await v1.as(stranger).get('/v1/imports/not-a-uuid')).status).toBe(404)
    // A refused upload never becomes a readable import either.
    const refused = await upload(v1, owner, SYNTHETIC.png, { name: 'receipt.jpg', type: 'image/jpeg' })
    expect(refused.status).toBe(422)
    const [rejected] = await vaultRows<{ job_id: string }>(owner, "SELECT job_id FROM import_uploads WHERE status = 'rejected'")
    expect((await v1.as(owner).get(`/v1/imports/${rejected.job_id}`)).status).toBe(404)
  })
})

describe('cancelled, failed and expired uploads are swept', () => {
  it('expires quarantine after 24 hours through the import_expire job: objects deleted, the parse job cancelled', async () => {
    const v1 = await client()
    const user = await member(v1)
    const key = randomUUID()
    const accepted = (await upload(v1, user, SYNTHETIC.png, { name: 'receipt.png', type: 'image/png', key })).body as ImportJobDto
    expect(await quarantined(user)).toHaveLength(1)
    const due = Date.parse(accepted.expires_at)
    // Not due yet: nothing changes. At its expiry, pruneUploads ends it and the alarm's delete removes its parts.
    await inVault(user, (state) => pruneUploads(fileAt(state, due - 1)))
    expect(await parseJobs(user)).toEqual([{ job_id: accepted.job_id, parse_state: 'queued' }])
    await inVault(user, (state) => pruneUploads(fileAt(state, due + HOUR)))
    await sweep(user, due + HOUR)
    expect(await quarantined(user)).toEqual([])
    expect(await liveRegistry(user)).toEqual([])
    expect(await parseJobs(user)).toEqual([{ job_id: accepted.job_id, parse_state: 'cancelled' }])
    const read = (await (await v1.as(user).get(`/v1/imports/${accepted.job_id}`)).json()) as ImportJobDto
    expect(read).toMatchObject({ job_id: accepted.job_id, status: 'expired', file_name: null })
    expect(await vaultRows(user, 'SELECT status, sha256, bytes FROM import_uploads WHERE job_id = ?', accepted.job_id)).toEqual([{ status: 'expired', sha256: null, bytes: SYNTHETIC.png.byteLength }])
    // Its name is gone, so the same key replays the expired import under any name (never under another type).
    const replay = await upload(v1, user, SYNTHETIC.png, { name: 'renamed.png', type: 'image/png', key })
    expect([replay.status, replay.body.status, replay.body.job_id]).toEqual([202, 'expired', accepted.job_id])
  })

  it('an expiry job that is not due yet changes nothing', async () => {
    const v1 = await client()
    const user = await member(v1)
    const accepted = (await upload(v1, user, SYNTHETIC.csv)).body as ImportJobDto
    // The upload itself is only 23 hours old.
    await inVault(user, (state) => pruneUploads(fileAt(state, Date.parse(accepted.received_at) + 23 * HOUR)))
    await sweep(user, Date.parse(accepted.received_at) + 23 * HOUR)
    expect(await quarantined(user)).toHaveLength(1)
    expect(((await (await v1.as(user).get(`/v1/imports/${accepted.job_id}`)).json()) as ImportJobDto).status).toBe('queued')
  })

  it('the P1 sweep deletes quarantine past its 24-hour registry deadline even if the expiry job never runs', async () => {
    const v1 = await client()
    const user = await member(v1)
    await upload(v1, user, SYNTHETIC.csv)
    expect(await sweep(user)).toBe(0)
    expect(await sweep(user, Date.now() + 25 * HOUR)).toBe(1)
    expect(await quarantined(user)).toEqual([])
    expect(await liveRegistry(user)).toEqual([])
  })

  it('a client that goes away mid-stream leaves nothing in quarantine', async () => {
    const v1 = await client()
    const user = await member(v1)
    const reply = await upload(v1, user, streamOf(meteredStream(SYNTHETIC.csv, 4 * MiB, { failAt: 2.5 * MiB }).stream), { chunked: true })
    // The API's client is gone and reads nothing; the Worker's answer is the intake's.
    expect([reply.status, reply.body.code]).toEqual([400, 'UPLOAD_INCOMPLETE'])
    expect(await rowsOf(user)).toEqual([{ status: 'failed', outcome_code: 'upload_incomplete' }])
    expect(await vaultRows(user, 'SELECT file_name FROM import_uploads')).toEqual([{ file_name: null }])
    expect(await quarantined(user)).toEqual([])
    expect(await parseJobs(user)).toEqual([])
    // Its reservations are due now, so the next sweep closes them.
    await sweep(user)
    expect(await liveRegistry(user)).toEqual([])
  })

  it('an upload whose session ended while it streamed is not accepted and leaves nothing', async () => {
    const v1 = await client()
    const user = await member(v1)
    const reply = await upload(
      v1,
      user,
      pausedBody(await bytesOf(SYNTHETIC.csv, 3 * MiB), 1.5 * MiB, async () => {
        await eventually(() => quarantined(user), (keys) => keys.length > 0)
        // The session signs out while its upload streams.
        expect((await v1.as(user).post('/v1/me/logout')).status).toBe(204)
      }),
      { chunked: true },
    )
    expect([reply.status, reply.body.code]).toEqual([401, 'SESSION_REQUIRED'])
    expect(await quarantined(user)).toEqual([])
    expect(await parseJobs(user)).toEqual([])
    expect(await rowsOf(user)).toEqual([{ status: 'failed', outcome_code: 'session_ended' }])
  })

  it('an API that died between a PUT and finishing: the reservation is swept after its deadline, and the upload counts as failed', async () => {
    const v1 = await client()
    const user = await member(v1)
    // Simulate the dead Worker with the vault's own functions: begin, reserve, PUT - and nothing else.
    const jobId = randomUUID()
    const token = randomUUID()
    const now = Date.now()
    const key = await inVault(user, (state) => {
      expect(beginUpload(fileAt(state, now), { jobId, intakeToken: token, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })).toMatchObject({ kind: 'started' })
      return reserveUploadPart(fileAt(state, now), jobId, token, 0)
    })
    expect(key).toBe(`import_quarantine/${vaultIdOf(user)}/${jobId}/${token}/part-0000`)
    await new R2ObjectStore(env.OBJECTS).putStream(String(key), SYNTHETIC.csv)
    // Before the deadline the registry protects it; after it, the alarm's delete removes it.
    expect(await sweep(user)).toBe(0)
    expect(await quarantined(user)).toEqual([key])
    expect(await sweep(user, now + 30 * MIN)).toBe(1)
    expect(await quarantined(user)).toEqual([])
    // The dead upload is marked failed once its deadline passed, when the account next uploads.
    await ageUpload(user, jobId, 20)
    expect((await upload(v1, user, SYNTHETIC.csv)).status).toBe(202)
    expect(await vaultRows(user, 'SELECT status, outcome_code FROM import_uploads WHERE job_id = ?', jobId)).toEqual([{ status: 'failed', outcome_code: 'deadline_passed' }])
  })
})

describe('review fixes: stalled uploads and request timeouts', () => {
  it('an account streams at most 2 uploads at once (429 in_progress), so stalled uploads cannot starve other accounts', async () => {
    const v1 = await client()
    const [a, b, bystander] = [await member(v1), await member(v1), await member(v1)]
    const release = gate()
    const held: Promise<Reply>[] = []
    try {
      for (const user of [a, b]) {
        held.push(upload(v1, user, stalledBody(csvText(200), csvText(200), release.opened), { chunked: true }))
        held.push(upload(v1, user, stalledBody(csvText(200), csvText(200), release.opened), { chunked: true }))
        expect(await eventually(() => receiving(user), (n) => n === 2)).toBe(2)
        const third = await upload(v1, user, stalledBody(csvText(200), csvText(200), release.opened), { chunked: true })
        expect([third.status, third.body.code, third.body.message_key]).toEqual([429, 'UPLOAD_LIMIT_REACHED', IMPORT_LIMIT_MESSAGE_KEYS.in_progress])
        expect(third.body.retry_after_seconds).toBeGreaterThan(0)
        expect(third.body.retry_after_seconds).toBeLessThanOrEqual(60)
      }
      expect((await upload(v1, bystander, SYNTHETIC.csv)).status).toBe(202)
    } finally {
      release.open()
    }
    expect((await Promise.all(held)).map((reply) => reply.status)).toEqual([202, 202, 202, 202])
  }, 60_000)

  it('after an error reply the server closes the connection instead of reading an endless body', async () => {
    // The Worker's analogue: once the intake refuses, it stops reading and cancels the body.
    const v1 = await client()
    const user = await member(v1)
    let cancelled = false
    let pulled = 0
    const endless = streamOf(
      (function* () {
        yield SYNTHETIC.png
        for (;;) {
          pulled += 1
          yield csvText(64 * 1024)
        }
      })(),
      () => {
        cancelled = true
      },
    )
    const reply = await upload(v1, user, endless, { chunked: true, name: 'big.csv' })
    expect([reply.status, cancelled]).toEqual([422, true])
    expect(pulled).toBeLessThan(4)
  })
})

describe('review fixes: quotas while streaming and refusals that are not permanent', () => {
  it('a chunked upload is refused as soon as it passes the bytes left today, before any part is written', async () => {
    let stored = 0
    const v1 = await client({ OBJECTS: spyBucket({ afterPut: (_key, bytes) => void (stored += bytes) }) })
    const user = await member(v1)
    await seedAccepted(user, [...Array.from({ length: 4 }, () => ({ bytes: 12 * MiB, minutesAgo: 60 })), { bytes: 2 * MiB - 1024, minutesAgo: 60 }])
    const reply = await upload(v1, user, streamOf(pieces(csvText(CAP))), { chunked: true })
    expect([reply.status, reply.body.message_key]).toEqual([429, IMPORT_LIMIT_MESSAGE_KEYS.bytes])
    expect(reply.body.retry_after_seconds).toBeGreaterThan(23 * 3600)
    expect(stored).toBe(0)
    expect(await vaultRows(user, 'SELECT 1 FROM vault_objects')).toEqual([])
  }, 30_000)

  it('a quota refusal does not stick to its key: the same key gets 429 with a retry time, then succeeds once room returns', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, [...Array.from({ length: 4 }, () => ({ bytes: 12 * MiB, minutesAgo: 60 })), { bytes: 2 * MiB - 3 * 1024, minutesAgo: 60 }])
    const key = randomUUID()
    const body = csvText(4 * 1024)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reply = await upload(v1, user, body, { chunked: true, key })
      expect([reply.status, reply.body.message_key]).toEqual([429, IMPORT_LIMIT_MESSAGE_KEYS.bytes])
      expect(reply.body.retry_after_seconds).toBeGreaterThan(23 * 3600)
    }
    await ageSeeds(user, 24)
    const later = await upload(v1, user, body, { chunked: true, key })
    expect(later.status).toBe(202)
    expect(await vaultRows(user, "SELECT job_id FROM import_uploads WHERE parse_state IS NOT NULL AND file_name IS NOT 'seed.csv'")).toEqual([{ job_id: later.body.job_id }])
  })

  it('a parse-job refusal decided at finish does not stick to its key either', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, Array.from({ length: 9 }, () => ({ bytes: 1024, minutesAgo: 60 })))
    // Another upload takes the last slot while this one streams.
    const key = randomUUID()
    const refused = await upload(
      v1,
      user,
      pausedBody(await bytesOf(SYNTHETIC.csv, 3 * MiB), 1.5 * MiB, async () => {
        await eventually(() => quarantined(user), (keys) => keys.length > 0)
        await seedAccepted(user, [{ bytes: 1024, minutesAgo: 1 }])
      }),
      { chunked: true, key },
    )
    expect([refused.status, refused.body.message_key]).toEqual([429, IMPORT_LIMIT_MESSAGE_KEYS.parse_jobs])
    expect(refused.body.retry_after_seconds).toBeGreaterThan(22 * 3600)
    const again = await upload(v1, user, SYNTHETIC.csv, { key })
    expect([again.status, again.body.message_key]).toEqual([429, IMPORT_LIMIT_MESSAGE_KEYS.parse_jobs])
    expect(again.body.retry_after_seconds).toBeGreaterThan(22 * 3600)
    await ageSeeds(user, 24)
    expect((await upload(v1, user, SYNTHETIC.csv, { key })).status).toBe(202)
  })

  it('the 10 parse jobs per day hold under concurrent uploads', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, Array.from({ length: 9 }, () => ({ bytes: 1024, minutesAgo: 60 })))
    const replies = await Promise.all(Array.from({ length: 4 }, async () => upload(v1, user, streamOf(meteredStream(SYNTHETIC.csv, 2 * MiB).stream), { chunked: true })))
    expect(replies.map((reply) => reply.status).sort()).toEqual([202, 429, 429, 429])
    const [today] = await vaultRows<{ n: number }>(user, 'SELECT count(*) AS n FROM import_uploads WHERE accepted_at > ?', new Date(Date.now() - DAY).toISOString())
    expect(today.n).toBe(10)
  }, 30_000)
})

describe('review fixes: fencing through the real upload', () => {
  it('every quarantine part is registered before its PUT', async () => {
    const unregistered: string[] = []
    let puts = 0
    let owner: TestUser | null = null
    const v1 = await client({
      OBJECTS: spyBucket({
        beforePut: async (key) => {
          if (!owner || !key.startsWith(`import_quarantine/${vaultIdOf(owner)}/`)) return
          puts += 1
          const [row] = await vaultRows<{ status: string }>(owner, 'SELECT status FROM vault_objects WHERE key = ?', key)
          if (row?.status !== 'reserved') unregistered.push(key)
        },
      }),
    })
    const user = await member(v1)
    owner = user
    const reply = await upload(v1, user, streamOf(meteredStream(SYNTHETIC.csv, 2.5 * MiB).stream), { chunked: true })
    expect(reply.status).toBe(202)
    expect(puts).toBe(3)
    expect(unregistered).toEqual([])
  })

  it('a receive deadline that passed while the body streamed refuses the next part', async () => {
    let puts = 0
    let owner: TestUser | null = null
    const v1 = await client({ OBJECTS: spyBucket({ beforePut: (key) => void (owner && key.includes(vaultIdOf(owner)) && (puts += 1)) }) })
    const user = await member(v1)
    owner = user
    const reply = await upload(
      v1,
      user,
      pausedBody(await bytesOf(SYNTHETIC.csv, 3 * MiB), 1.5 * MiB, async () => {
        await eventually(() => quarantined(user), (keys) => keys.length === 1)
        const [row] = await vaultRows<{ job_id: string }>(user, "SELECT job_id FROM import_uploads WHERE status = 'receiving'")
        await ageUpload(user, row.job_id, 20)
      }),
      { chunked: true },
    )
    expect([reply.status, reply.body.code]).toEqual([409, 'UPLOAD_FAILED'])
    expect(puts).toBe(1)
    expect(await rowsOf(user)).toEqual([{ status: 'failed', outcome_code: 'reservation_refused' }])
    expect(await quarantined(user)).toEqual([])
  })

  it('finish accepts only the parts reserved by the same upload, with sizes that add up', async () => {
    const v1 = await client()
    const user = await member(v1)
    const otherReply = await upload(v1, user, SYNTHETIC.csv)
    expect(otherReply.status).toBe(202)
    const other = otherReply.body as ImportJobDto
    const [{ object_key: otherKey }] = await vaultRows<{ object_key: string }>(user, 'SELECT object_key FROM import_parts WHERE job_id = ?', other.job_id)
    const jobId = randomUUID()
    const token = randomUUID()
    const sha = 'ab'.repeat(32)
    await inVault(user, (state) => {
      const c = () => fileAt(state, Date.now())
      beginUpload(c(), { jobId, intakeToken: token, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })
      const finish = (parts: { index: number; key: string; bytes: number; sha256: string }[], bytes: number) => finishUpload(c(), { jobId, intakeToken: token, format: 'csv', bytes, sha256: sha, parts })
      expect(() => finish([{ index: 0, key: otherKey, bytes: SYNTHETIC.csv.byteLength, sha256: sha }], SYNTHETIC.csv.byteLength)).toThrow(/do not match/)
      const key = String(reserveUploadPart(c(), jobId, token, 0))
      expect(() => finish([{ index: 0, key, bytes: 10, sha256: sha }], 11)).toThrow(/do not match/)
    })
    expect(await vaultRows(user, 'SELECT status FROM import_uploads WHERE job_id = ?', jobId)).toEqual([{ status: 'receiving' }])
    expect(await parseJobs(user)).toHaveLength(1)
  })
})

describe('review fixes: maintenance, retention and alerts', () => {
  it('fails uploads left receiving past their deadline (clearing their names) without waiting for another upload', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = randomUUID()
    const token = randomUUID()
    const now = Date.now()
    const key = await inVault(user, (state) => {
      beginUpload(fileAt(state, now), { jobId, intakeToken: token, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })
      return String(reserveUploadPart(fileAt(state, now), jobId, token, 0))
    })
    expect(key).toBe(`import_quarantine/${vaultIdOf(user)}/${jobId}/${token}/part-0000`)
    await new R2ObjectStore(env.OBJECTS).putStream(key, SYNTHETIC.csv)
    await inVault(user, (state) => pruneUploads(fileAt(state, now + 10 * MIN - 1)))
    expect(await vaultRows(user, 'SELECT status FROM import_uploads WHERE job_id = ?', jobId)).toEqual([{ status: 'receiving' }])
    await inVault(user, (state) => pruneUploads(fileAt(state, now + 10 * MIN)))
    expect(await vaultRows(user, 'SELECT status, outcome_code, file_name FROM import_uploads WHERE job_id = ?', jobId)).toEqual([{ status: 'failed', outcome_code: 'deadline_passed', file_name: null }])
    // Its reservation is due now, so the next delete removes the object.
    await sweep(user, now + 10 * MIN)
    expect(await quarantined(user)).toEqual([])
    expect(await liveRegistry(user)).toEqual([])
  })

  it('a parsed import keeps its file name for its 7-day preview window only (the retention hook)', async () => {
    const v1 = await client()
    const user = await member(v1)
    await seedAccepted(user, [{ bytes: 100, minutesAgo: 9 * 24 * 60 }, { bytes: 100, minutesAgo: 60 }])
    const seeds = await vaultRows<{ job_id: string }>(user, 'SELECT job_id FROM import_uploads ORDER BY accepted_at')
    await inVault(user, (state) => pruneUploads(fileAt(state, Date.now())))
    expect(await vaultRows(user, 'SELECT status, file_name FROM import_uploads ORDER BY accepted_at')).toEqual([
      { status: 'accepted', file_name: null },
      { status: 'accepted', file_name: 'seed.csv' },
    ])
    expect(await (await v1.as(user).get(`/v1/imports/${seeds[0].job_id}`)).json()).toMatchObject({ status: 'parsed', file_name: null })
  })
})

describe('1B-T5: the vault side of uploads', () => {
  it("an upload streams into 1 MiB quarantine parts under the vault's prefix, each published for 24 hours", async () => {
    const v1 = await client()
    const user = await member(v1)
    const body = csvText(2.5 * MiB)
    const reply = await upload(v1, user, body)
    expect(reply.status).toBe(202)
    const accepted = reply.body as ImportJobDto
    const prefix = `import_quarantine/${vaultIdOf(user)}/${accepted.job_id}/`
    const objects = (await env.OBJECTS.list({ prefix })).objects
    expect(objects.map((object) => object.size)).toEqual([MiB, MiB, 0.5 * MiB])
    expect(objects.reduce((sum, object) => sum + object.size, 0)).toBe(body.byteLength)
    const rows = await vaultRows<{ key: string; status: string; delete_after: number }>(user, 'SELECT key, status, delete_after FROM vault_objects ORDER BY key')
    expect(rows.map((row) => row.key)).toEqual(objects.map((object) => object.key))
    for (const row of rows) expect([row.status, row.delete_after]).toEqual(['published', Date.parse(accepted.received_at) + 86_400_000])
  })

  it('uploads are 404 before authentication while IMPORT_UPLOADS_ENABLED is off', async () => {
    const off = await startV1(undefined, { startWork: 'manual' })
    const res = await off.raw(new Request('http://vault.test/v1/imports', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-gogospend-file-name': 'statement.csv' }, body: SYNTHETIC.csv }))
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([404, 'NOT_FOUND'])
    // Released, the same request without a token is refused for its token instead.
    const on = await client()
    const unauthenticated = await on.raw(new Request('http://vault.test/v1/imports', { method: 'POST', headers: { 'content-type': 'text/csv', 'x-gogospend-client': 'ios/1.0.0', 'x-gogospend-file-name': 'statement.csv' }, body: SYNTHETIC.csv }))
    expect(unauthenticated.status).toBe(401)
  })

  it("an accepted upload's parse message carries only the vault and job ids, and is sent once", async () => {
    const v1 = await client()
    const user = await member(v1)
    const accepted = (await upload(v1, user, SYNTHETIC.csv)).body as ImportJobDto
    const sent: ParseMessage[] = []
    const capture = { send: async (message: ParseMessage) => void sent.push(message) } as Queue<ParseMessage>
    const run = () =>
      inVault(user, (state, vault) => {
        const host: PendingWorkHost = { env: { PARSE_QUEUE: capture }, erased: false, context: () => fileAt(state, Date.now()), active: (c) => vault.isActive(c), gates: async () => new FeatureGates() }
        return startPendingWork(host)
      })
    expect(await run()).toEqual({ started: 1, failed: 0, held: false })
    expect(sent).toEqual([{ vault: vaultIdOf(user), job: accepted.job_id }])
    expect((await uploadRowOf(user, accepted.job_id)).enqueued_at).not.toBeNull()
    expect(await run()).toEqual({ started: 0, failed: 0, held: false })
    expect(sent).toHaveLength(1)
    expect(WORK_STARTERS).toContain(PARSE_STARTER)
  })

  it('a queued import whose message stopped arriving is sent again an hour later, and one whose message keeps arriving is not', async () => {
    const v1 = await client()
    const user = await member(v1)
    const lost = ((await upload(v1, user, SYNTHETIC.csv, { name: 'lost.csv' })).body as ImportJobDto).job_id
    const seen = ((await upload(v1, user, SYNTHETIC.csv, { name: 'seen.csv' })).body as ImportJobDto).job_id
    const crashed = ((await upload(v1, user, SYNTHETIC.csv, { name: 'crashed.csv' })).body as ImportJobDto).job_id
    const t = Date.now()
    const sent: string[] = []
    const capture = { send: async (message: ParseMessage) => void sent.push(message.job) } as Queue<ParseMessage>
    const startAt = (ms: number) =>
      inVault(user, (state, vault) => startPendingWork({ env: { PARSE_QUEUE: capture }, erased: false, context: () => fileAt(state, ms), active: (c) => vault.isActive(c), gates: async () => new FeatureGates() }, [PARSE_STARTER]))
    await startAt(t)
    expect(sent.sort()).toEqual([lost, seen, crashed].sort())
    sent.length = 0
    // The consumer sees `seen` at t + 50 min (held), and `crashed` starts parsing at t and its consumer dies.
    await inVault(user, (state) => {
      expect(parseSource(fileAt(state, t + 50 * MIN), seen, ['csv'])).toEqual({ kind: 'held' })
      expect(parseSource(fileAt(state, t), crashed, [])).toMatchObject({ kind: 'parse', attempt: 1 })
    })
    expect(await inVault(user, (state) => PARSE_STARTER.dueAt(fileAt(state, t)))).toBe(t + PARSE_RESEND_MS)
    await startAt(t + 60 * MIN - 1)
    expect(sent).toEqual([])
    await startAt(t + 60 * MIN)
    expect(sent.sort()).toEqual([lost, crashed].sort())
    expect(await inVault(user, (state) => PARSE_STARTER.dueAt(fileAt(state, t + 60 * MIN)))).toBe(t + 50 * MIN + PARSE_RESEND_MS)
  })

  it('after pruneUploads at uploadsDueAt, the next uploadsDueAt is later or null', async () => {
    const v1 = await client()
    const user = await member(v1)
    const t = Date.now()
    await inVault(user, (state) => {
      // A receiving upload (its deadline at t + 10 min), an accepted one (its raw expiry at t + 24 h) and a failed one (dropped 30 days after it ended).
      const c = fileAt(state, t)
      beginUpload(c, { jobId: randomUUID(), intakeToken: randomUUID(), fileName: 'receiving.csv', declaredType: 'text/csv', declaredBytes: null })
    })
    const accepted = (await upload(v1, user, SYNTHETIC.csv)).body as ImportJobDto
    await upload(v1, user, SYNTHETIC.png, { name: 'receipt.jpg', type: 'image/jpeg' })
    const dues: number[] = []
    for (let round = 0; round < 10; round += 1) {
      const due = await inVault(user, (state) => uploadsDueAt(fileAt(state, t)))
      if (due === null) break
      dues.push(due)
      await inVault(user, (state) => pruneUploads(fileAt(state, due)))
      const next = await inVault(user, (state) => uploadsDueAt(fileAt(state, due)))
      expect(next === null || next > due).toBe(true)
    }
    expect(dues[0]).toBe(t + 10 * MIN)
    expect(dues).toContain(Date.parse(accepted.expires_at))
    expect(dues.at(-1)).toBeGreaterThanOrEqual(Date.parse(accepted.expires_at) + UPLOAD_ROW_TTL_MS)
    expect(await vaultRows(user, 'SELECT 1 FROM import_uploads')).toEqual([])
  })

  it('finish publishes only parts whose reservations are still before their deadline', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = randomUUID()
    const token = randomUUID()
    const now = Date.now()
    const sha = createHash('sha256').update(SYNTHETIC.csv).digest('hex')
    const result = await inVault(user, (state) => {
      beginUpload(fileAt(state, now), { jobId, intakeToken: token, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })
      const key = String(reserveUploadPart(fileAt(state, now), jobId, token, 0))
      // A failed delete or a writer that gave the key up made it due before the finish.
      state.storage.sql.exec('UPDATE vault_objects SET delete_after = ? WHERE key = ?', now + MIN, key)
      const parts = [{ index: 0, key, bytes: SYNTHETIC.csv.byteLength, sha256: sha }]
      try {
        state.storage.transactionSync(() => finishUpload(fileAt(state, now + MIN), { jobId, intakeToken: token, format: 'csv', bytes: SYNTHETIC.csv.byteLength, sha256: sha, parts }))
        return 'published'
      } catch {
        return 'refused'
      }
    })
    expect(result).toBe('refused')
    expect(await vaultRows(user, 'SELECT status FROM vault_objects')).toEqual([{ status: 'reserved' }])
    expect(await vaultRows(user, 'SELECT status FROM import_uploads WHERE job_id = ?', jobId)).toEqual([{ status: 'receiving' }])
  })

  it('reservePart, abort and discard still run after the session ended; begin and finish do not', () => {
    expect(Object.entries(VAULT_STEP_ROUTES).filter(([id]) => id.startsWith('imports.')).map(([id, step]) => [id, step?.anySession === true])).toEqual([
      ['imports.begin', false],
      ['imports.reservePart', true],
      ['imports.finish', false],
      ['imports.abort', true],
      ['imports.discarded', true],
      ['imports.bytesRetry', true],
    ])
  })

  it('an isolate takes at most 16 uploads at once; the next is 503 with a retry', async () => {
    const v1 = await client()
    const release = gate()
    const held: Promise<Reply>[] = []
    try {
      for (let pair = 0; pair < MAX_UPLOADS_PER_ISOLATE / 2; pair += 1) {
        const user = await member(v1)
        for (let i = 0; i < 2; i += 1) held.push(upload(v1, user, stalledBody(csvText(200), csvText(200), release.opened), { chunked: true }))
      }
      expect(await eventually(async () => uploadsInFlight(), (n) => n === MAX_UPLOADS_PER_ISOLATE)).toBe(MAX_UPLOADS_PER_ISOLATE)
      const next = await upload(v1, await member(v1), SYNTHETIC.csv)
      expect([next.status, next.body.code, next.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
    } finally {
      release.open()
    }
    expect((await Promise.all(held)).every((reply) => reply.status === 202)).toBe(true)
    expect(uploadsInFlight()).toBe(0)
  }, 60_000)

  it("a part is reserved until its upload's receive deadline plus the grace", async () => {
    expect(RAW_UPLOAD_TTL_MS).toBe(24 * HOUR)
    expect(RESERVATION_GRACE_MS).toBe(15 * MIN)
    expect(START_RETRY_MS).toBe(MIN)
    const v1 = await client()
    const user = await member(v1)
    const jobId = randomUUID()
    const token = randomUUID()
    const now = Date.now()
    await inVault(user, (state) => {
      beginUpload(fileAt(state, now), { jobId, intakeToken: token, fileName: 'statement.csv', declaredType: 'text/csv', declaredBytes: null })
      reserveUploadPart(fileAt(state, now + MIN), jobId, token, 0)
    })
    expect(await vaultRows(user, 'SELECT delete_after FROM vault_objects')).toEqual([{ delete_after: now + 10 * MIN + RESERVATION_GRACE_MS }])
  })
})

/** `total` bytes starting with `head`, filled with a CSV-safe letter (meteredStream's body, as one array). */
async function bytesOf(head: Uint8Array, total: number): Promise<Uint8Array> {
  const out = new Uint8Array(total).fill(0x61)
  out.set(head)
  return out
}
