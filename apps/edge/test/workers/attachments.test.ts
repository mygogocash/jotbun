// Receipt attachments (1B-T9). Ports the 45 cases of
// apps/api/src/attachments/attachments.integration.spec.ts under the
// not-applicable rule (40 ported, some in changed form; 5 not applicable),
// then the plan's six cases, the planner's four, the controller's two R96
// cases (a HEAD, and refused downloads), and at the end the 1B-T9 review's
// pins (brief download-pins: m-1, m-3 and n-1 to n-4). Images come from
// seedImportImage (a parsed receipt photo's preview, written straight into the
// vault). The Worker reaches R2 through a hooked bucket, so a case can watch or
// change what the copy and the download see, as the API spec patches its
// store; the vault keeps its own binding. The API's per-process limits are the
// isolate's: COPY_SLOTS and RECEIPT_SLOTS are filled to their limits, and
// RECEIPT_LIMITS (read at use time) shortens the deadlines.
import { env } from 'cloudflare:workers'
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { ATTACHMENT_DOWNLOAD_PATH, ATTACHMENT_GRANT_MINUTES, RECEIPT_RETENTION_CONSENT, isAttachmentGrant, isSyncChangesPage, isTransactionSnapshot } from '@gogospend/contracts'
import type { AttachmentGrant, DeletedHistoryPage, HistoryPage, SyncChangesPage, TransactionDto } from '@gogospend/contracts'

import { ObjectStoreError } from '@api/storage/object-store'

import { RECEIPT_SLOTS } from '../../src/v1/files/downloads'
import { COPY_SLOTS, RECEIPT_LIMITS } from '../../src/v1/files/receipts'
import type { VaultCall, VaultReply, VaultRouteId } from '../../src/v1/protocol'
import { RECEIPT_COPY_GRACE_MS, attachmentsDueAt, pruneAttachments } from '../../src/vault/files/attachments'
import type { VaultBucket } from '../../src/vault/files/keys'
import { deleteDueObjects } from '../../src/vault/files/objects'
import { purgeVaultObjects } from '../../src/vault/files/purge'
import type { UserVault } from '../../src/vault/user-vault'
import { DAY, HOUR, MIN, fileAt, gate, seedImportImage, setVaultClock, storedKeys, vaultExec, vaultIdOf, vaultRows } from './support/files'
import type { SeededImage } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { TEST_POLICIES, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

type Body = Record<string, any>
type Reply = { status: number; body: Body; headers: Headers }

const CONSENT = { consent: RECEIPT_RETENTION_CONSENT }
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts))

const json = async (res: Response): Promise<Reply> => {
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Body) : {}, headers: res.headers }
}

/** The problem body without its per-request id, to compare "not found" answers. */
const problemOf = (body: Body) => ({ ...body, request_id: undefined })

// ---------------------------------------------------------------------------
// The Worker's bucket, hooked
// ---------------------------------------------------------------------------

type Got = Awaited<ReturnType<VaultBucket['get']>>
type Put = VaultBucket['put']
type BucketHooks = {
  get?: (key: string, real: () => Promise<Got>) => Promise<Got>
  put?: (key: string, value: Parameters<Put>[1], options: Parameters<Put>[2], real: () => ReturnType<Put>) => ReturnType<Put>
  head?: (key: string, real: () => ReturnType<VaultBucket['head']>) => ReturnType<VaultBucket['head']>
}

/** The R2 binding with optional hooks around get, put and head (the API spec's patchStore); writes to receipt keys are counted. */
function hookedBucket(hooks: BucketHooks, counted: { writes: number }): VaultBucket {
  const bucket = env.OBJECTS
  return {
    get: (key) => (hooks.get ? hooks.get(key, () => bucket.get(key)) : bucket.get(key)),
    put: (key, value, options) => {
      if (key.startsWith('receipt/')) counted.writes += 1
      return hooks.put ? hooks.put(key, value, options, () => bucket.put(key, value, options)) : bucket.put(key, value, options)
    },
    head: (key) => (hooks.head ? hooks.head(key, () => bucket.head(key)) : bucket.head(key)),
    delete: (keys) => bucket.delete(keys),
    list: (options) => bucket.list(options),
  }
}

/** A front door whose Worker routes reach R2 through a hooked bucket. */
async function setup() {
  const hooks: BucketHooks = {}
  const counted = { writes: 0 }
  const v1 = await startV1(undefined, { env: { OBJECTS: hookedBucket(hooks, counted) } })
  return {
    v1,
    money: moneyFixtures(v1),
    hooks,
    /** Writes of receipt bytes so far (the copy's PUTs). */
    receiptWrites: () => counted.writes,
    reset: () => {
      delete hooks.get
      delete hooks.put
      delete hooks.head
    },
  }
}
type Kit = Awaited<ReturnType<typeof setup>>

/** A get hook that serves `body()` for one receipt key, with the size and digest the vault recorded (the API spec's `serving`). */
function served(key: string, image: SeededImage, body: () => AsyncIterable<Uint8Array>, only: () => boolean = () => true): NonNullable<BucketHooks['get']> {
  return async (asked, real) => {
    if (asked !== key || !only()) return real()
    const object = await env.OBJECTS.head(asked)
    if (!object) return null
    return {
      key: asked,
      size: image.bytes.length,
      uploaded: object.uploaded,
      customMetadata: { sha256: image.sha256 },
      httpMetadata: object.httpMetadata,
      body: body() as unknown as ReadableStream<Uint8Array>,
      arrayBuffer: async () => image.bytes.slice().buffer as ArrayBuffer,
    }
  }
}

/** `bytes` in four parts (the API spec's `thirds`). */
const quarters = (bytes: Uint8Array): Uint8Array[] => {
  const size = Math.ceil(bytes.length / 4)
  return [0, 1, 2, 3].map((i) => bytes.subarray(i * size, (i + 1) * size)).filter((part) => part.length > 0)
}

/** Runs `run` with some receipt limits changed, then puts them back. */
async function withLimits<T>(changes: Partial<typeof RECEIPT_LIMITS>, run: () => Promise<T>): Promise<T> {
  const saved = { ...RECEIPT_LIMITS }
  Object.assign(RECEIPT_LIMITS, changes)
  try {
    return await run()
  } finally {
    Object.assign(RECEIPT_LIMITS, saved)
  }
}

// ---------------------------------------------------------------------------
// Members, records and the routes
// ---------------------------------------------------------------------------

async function memberWithRecords(kit: Kit, count = 1): Promise<{ user: TestUser; records: string[] }> {
  const user = await kit.money.member()
  const wallet = await kit.money.wallet(user)
  const records: string[] = []
  for (let i = 0; i < count; i += 1) {
    records.push(await kit.money.record(user, { type: 'expense', amount_minor: String(6500 + i), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') }))
  }
  return { user, records }
}

const retain = async (v1: V1Client, user: TestUser, recordId: string, body: Body, ifMatch: number | null, key?: string) =>
  json(await v1.as(user).post(`/v1/transactions/${recordId}/attachment`, body, { ifMatch, key }))
const replace = async (v1: V1Client, user: TestUser, recordId: string, body: Body, ifMatch: number | null, key?: string) =>
  json(await v1.as(user).put(`/v1/transactions/${recordId}/attachment`, body, { ifMatch, key }))
const remove = async (v1: V1Client, user: TestUser, recordId: string, ifMatch: number | null, key?: string) => json(await v1.as(user).del(`/v1/transactions/${recordId}/attachment`, { ifMatch, key }))
const grantOf = async (v1: V1Client, user: TestUser, attachmentId: string) => json(await v1.as(user).get(`/v1/attachments/${attachmentId}/grant`))

async function retained(kit: Kit, user: TestUser, recordId: string, image: SeededImage, ifMatch: number): Promise<Body> {
  const res = await retain(kit.v1, user, recordId, { attachment_id: image.attachmentId, ...CONSENT }, ifMatch)
  expect(res.status).toBe(200)
  return res.body
}

const recordOf = async (v1: V1Client, user: TestUser, id: string): Promise<TransactionDto> => {
  const res = await json(await v1.as(user).get(`/v1/transactions/${id}`))
  expect(res.status).toBe(200)
  return res.body as TransactionDto
}

type Download = { status: number; headers: Headers; body: Uint8Array; complete: boolean }

/** A download read to its end, reporting whether the body arrived whole (or was cut off). */
async function download(v1: V1Client, user: TestUser, url: string): Promise<Download> {
  const res = await v1.as(user).get(url)
  const chunks: Uint8Array[] = []
  let complete = true
  if (res.body) {
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    } catch {
      complete = false
    }
  }
  return { status: res.status, headers: res.headers, body: concat(...chunks), complete }
}
const problemBody = (raw: Download) => JSON.parse(new TextDecoder().decode(raw.body)) as Body

/** One step sent straight to the person's vault, as vaultSession sends it: a later step of a current_policy request unless the options say otherwise. */
function stepCall(
  user: TestUser,
  route: VaultRouteId,
  body: unknown,
  opts: { charge?: VaultCall['charge']; as?: TestUser; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<VaultReply> {
  const who = opts.as ?? user
  return vaultOf(user).call({
    route,
    access: 'current_policy',
    charge: opts.charge ?? 'step',
    claims: { accountId: who.sub, sessionId: who.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' },
    policies: TEST_POLICIES,
    params: opts.params ?? {},
    query: {},
    headers: opts.headers ?? {},
    body,
  })
}

/** The command headers of a receipt command step: a fresh key, schema 1 and the record's version. */
const commandAt = (version: number) => ({ 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': `"${version}"` })

/** A retain command step with a prepared copy, as the Worker sends it after its copy. */
const retainStep = (user: TestUser, recordId: string, attachmentId: string, prepared: { key: string; bytes: number; sha256: string } | null, version = 1) =>
  stepCall(user, 'attachments.retain', { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT, prepared }, { params: { id: recordId }, headers: commandAt(version), charge: 'write' })

/** A prepare step's reply body. */
const preparedOf = (reply: VaultReply) => (reply as { body: { kind: string; key: string; source_key: string; bytes: number; sha256: string } }).body

// ---------------------------------------------------------------------------
// What the vault and R2 hold
// ---------------------------------------------------------------------------

/** The vault's receipt keys (the API's object_publications rows of purpose `receipt`), oldest first. */
async function receiptRows(user: TestUser, now = Date.now()) {
  const rows = await vaultRows<{ key: string; status: string; delete_after: number | null; created_at: number }>(
    user,
    "SELECT key, status, delete_after, created_at FROM vault_objects WHERE purpose = 'receipt' ORDER BY created_at, key",
  )
  return rows.map((row) => ({ key: row.key, status: row.status, attachment_id: row.key.split('/')[2], forever: row.delete_after === null, due: row.delete_after !== null && row.delete_after <= now }))
}

const storedReceipts = (user: TestUser) => storedKeys(`receipt/${vaultIdOf(user)}/`)
const storedBytes = async (key: string) => new Uint8Array(await ((await env.OBJECTS.get(key)) as NonNullable<Got>).arrayBuffer())

async function attachmentOf(user: TestUser, id: string) {
  const [row] = await vaultRows<{ status: string; object_key: string; content_type: string; bytes: string; sha256: string; width: number; height: number; source_job_id: string; released_at: string | null }>(
    user,
    'SELECT status, object_key, content_type, CAST(bytes AS TEXT) AS bytes, sha256, width, height, source_job_id, released_at FROM attachments WHERE id = ?',
    id,
  )
  if (!row) return undefined
  const { released_at: releasedAt, ...rest } = row
  return { ...rest, released: releasedAt !== null }
}

/** A retained receipt's object key (asserting it is retained first). */
async function receiptKeyOf(user: TestUser, id: string): Promise<string> {
  const row = await attachmentOf(user, id)
  expect(row).toEqual(expect.objectContaining({ status: 'retained' }))
  return (row as { object_key: string }).object_key
}

const heldBy = async (user: TestUser, attachmentId: string) =>
  (await vaultRows<{ transaction_id: string }>(user, 'SELECT transaction_id FROM transaction_attachments WHERE attachment_id = ? ORDER BY transaction_id', attachmentId)).map((row) => row.transaction_id)

const latestSnapshot = async (user: TestUser, recordId: string): Promise<Record<string, unknown> | undefined> => {
  const [row] = await vaultRows<{ snapshot: string }>(user, "SELECT snapshot FROM entity_changes WHERE entity = 'transaction' AND entity_id = ? ORDER BY revision DESC LIMIT 1", recordId)
  return row ? (JSON.parse(row.snapshot) as Record<string, unknown>) : undefined
}

const auditOf = async (user: TestUser, commandId: string) => JSON.parse((await vaultRows<{ metadata: string }>(user, 'SELECT metadata FROM audit_events WHERE command_id = ?', commandId))[0].metadata) as Record<string, string>

/** deleteDueObjects at `ms` on the real bucket (the API spec's publication.sweep; 1B-T11 runs it on the alarm). */
const sweep = (user: TestUser, ms = Date.now()) => runInDurableObject(vaultOf(user), (_vault, state) => deleteDueObjects({ context: () => fileAt(state, ms), bucket: env.OBJECTS }))

/** pruneAttachments at `ms` (the API's retention step attachments.obsolete; 1B-T11 runs it on the alarm). */
const prune = (user: TestUser, ms = Date.now()) => runInDurableObject(vaultOf(user), (_vault, state) => pruneAttachments(fileAt(state, ms)))

// ===========================================================================
// Ported from attachments.integration.spec.ts
// ===========================================================================

describe('ownership: another account can neither use nor learn of a receipt', () => {
  it('foreign_attachment_grant_is_denied', async () => {
    const kit = await setup()
    const { user: owner, records } = await memberWithRecords(kit)
    const image = await seedImportImage(owner)
    await retained(kit, owner, records[0], image, 1)
    const ownGrant = await grantOf(kit.v1, owner, image.attachmentId)
    expect(ownGrant.status).toBe(200)
    const intruder = await kit.money.member()

    const foreign = await grantOf(kit.v1, intruder, image.attachmentId)
    expect(foreign.status).toBe(404)
    // The same answer as an id nobody has: nothing says the receipt exists.
    const unknown = await grantOf(kit.v1, intruder, randomUUID())
    expect(problemOf(foreign.body)).toEqual(problemOf(unknown.body))
    // The owner's grant is bound to the owner's account and session.
    const stolen = await download(kit.v1, intruder, (ownGrant.body as AttachmentGrant).url)
    expect(stolen.status).toBe(404)
    expect(problemOf(problemBody(stolen))).toEqual(problemOf(unknown.body))
  })

  it('cross-owner association is denied with 404 and no existence leak, and copies nothing', async () => {
    const kit = await setup()
    const { user: owner, records: ownerRecords } = await memberWithRecords(kit)
    const ownerImage = await seedImportImage(owner)
    await retained(kit, owner, ownerRecords[0], ownerImage, 1)
    const { user: intruder, records: intruderRecords } = await memberWithRecords(kit)
    const intruderImage = await seedImportImage(intruder)
    const writes = kit.receiptWrites()

    // Another account's receipt onto one's own record: the same 404 as an unknown id.
    const foreignImage = await retain(kit.v1, intruder, intruderRecords[0], { attachment_id: ownerImage.attachmentId, ...CONSENT }, 1)
    const unknownImage = await retain(kit.v1, intruder, intruderRecords[0], { attachment_id: randomUUID(), ...CONSENT }, 1)
    expect(foreignImage.status).toBe(404)
    expect(problemOf(foreignImage.body)).toEqual(problemOf(unknownImage.body))
    // One's own image onto another account's record: the same 404 as an unknown record.
    const foreignRecord = await retain(kit.v1, intruder, ownerRecords[0], { attachment_id: intruderImage.attachmentId, ...CONSENT }, 2)
    const unknownRecord = await retain(kit.v1, intruder, randomUUID(), { attachment_id: intruderImage.attachmentId, ...CONSENT }, 2)
    expect(foreignRecord.status).toBe(404)
    expect(problemOf(foreignRecord.body)).toEqual(problemOf(unknownRecord.body))

    expect(kit.receiptWrites() - writes).toBe(0)
    expect(await receiptRows(intruder)).toEqual([])
    expect(await storedReceipts(intruder)).toEqual([])
    expect(await vaultRows(intruder, 'SELECT 1 FROM attachments')).toEqual([])
    expect((await recordOf(kit.v1, intruder, intruderRecords[0])).version).toBe(1)
    expect(await heldBy(owner, ownerImage.attachmentId)).toEqual([ownerRecords[0]])
    expect((await recordOf(kit.v1, owner, ownerRecords[0])).version).toBe(2)
    // Below the commands: the retained-receipt trigger refuses the owner's receipt in the intruder's vault, and so does the foreign key on its own.
    const crossInsert = (state: DurableObjectState) =>
      state.storage.sql.exec('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', intruderRecords[0], ownerImage.attachmentId, new Date().toISOString()).toArray()
    await expect(runInDurableObject(vaultOf(intruder), (_vault, state) => crossInsert(state))).rejects.toThrow(/retained receipt/)
    const withoutTrigger = await runInDurableObject(vaultOf(intruder), (_vault, state) => {
      let outcome = 'inserted'
      try {
        state.storage.transactionSync(() => {
          state.storage.sql.exec('DROP TRIGGER transaction_attachments_retained_insert')
          try {
            crossInsert(state)
          } catch (error) {
            outcome = (error as Error).message
          }
          throw new Error('roll back')
        })
      } catch {
        // The block rolled back, the trigger with it.
      }
      return outcome
    })
    expect(withoutTrigger).toMatch(/FOREIGN KEY/)
    expect(await vaultRows(intruder, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'transaction_attachments_retained_insert'")).toHaveLength(1)
  })

  it('a preview image nobody retained, a quarantined upload and an import id never get a grant', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const image = await seedImportImage(user)
    for (const id of [image.attachmentId, image.jobId, randomUUID()]) expect((await grantOf(kit.v1, user, id)).status).toBe(404)
    expect((await grantOf(kit.v1, user, 'not-a-uuid')).status).toBe(404)
    // The preview names the image by its opaque id only (its route and attachable_until are 1B-T10's).
    expect(image.attachmentId).not.toBe(image.jobId)
    expect(image.key).not.toContain(image.attachmentId)
  })
})

describe('retaining a receipt', () => {
  it('needs explicit consent and the record version, and makes the receipt part of the record', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user, { width: 40, height: 30 })
    for (const body of [{ attachment_id: image.attachmentId }, { attachment_id: image.attachmentId, consent: 'yes' }]) {
      const refused = await retain(kit.v1, user, records[0], body, 1)
      expect(refused.status).toBe(422)
      expect(refused.body.fields).toEqual(expect.objectContaining({ consent: expect.any(String) }))
    }
    expect((await retain(kit.v1, user, records[0], { attachment_id: 'nope', ...CONSENT }, 1)).status).toBe(422)
    expect((await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, null)).status).toBe(422)
    expect(await receiptRows(user)).toEqual([])

    const key = randomUUID()
    const ack = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key)
    expect(ack.status).toBe(200)
    expect(ack.body).toEqual(expect.objectContaining({ command_id: key, entity_id: records[0], version: 2, outcome: 'updated', entity_state: 'active' }))

    const record = await recordOf(kit.v1, user, records[0])
    expect(record).toEqual(expect.objectContaining({ version: 2, attachment_id: image.attachmentId }))
    expect(isTransactionSnapshot(record)).toBe(true)
    // Sync carries the receipt on the record's next version.
    const snapshot = await latestSnapshot(user, records[0])
    expect(snapshot).toEqual(expect.objectContaining({ version: 2, attachment_id: image.attachmentId }))
    expect(isTransactionSnapshot(snapshot)).toBe(true)
    const page = (await json(await kit.v1.as(user).get('/v1/sync/changes'))).body
    expect(isSyncChangesPage(page)).toBe(true)
    const groups = (page as SyncChangesPage).groups
    expect(groups[groups.length - 1]?.changes[0]).toEqual(expect.objectContaining({ entity: 'transaction', id: records[0], version: 2 }))
    // The consent is on the audit trail as a short code.
    expect(await auditOf(user, key)).toEqual(expect.objectContaining({ consent: RECEIPT_RETENTION_CONSENT }))

    // A copy under the receipt purpose, published with no expiry, byte for byte the sanitized image.
    const [row] = await receiptRows(user)
    expect(row).toEqual(expect.objectContaining({ status: 'published', attachment_id: image.attachmentId, forever: true }))
    expect(row.key).toMatch(new RegExp(`^receipt/${vaultIdOf(user)}/${image.attachmentId}/[0-9a-f-]{36}/image\\.jpg$`))
    expect(await storedBytes(row.key)).toEqual(image.bytes)
    expect(await attachmentOf(user, image.attachmentId)).toEqual({
      status: 'retained', object_key: row.key, content_type: 'image/jpeg', bytes: String(image.bytes.length), sha256: image.sha256,
      width: 40, height: 30, source_job_id: image.jobId, released: false,
    })
  })

  it('copies inside the store, registered before the copy, and the receipt outlives the import image and the preview', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const calls: string[] = []
    const seenAtPut: (string | undefined)[] = []
    const purposeOf = (key: string) => key.split('/')[0]
    kit.hooks.get = (key, real) => {
      calls.push(`read ${purposeOf(key)}`)
      return real()
    }
    kit.hooks.put = async (key, _value, _options, real) => {
      calls.push(`write ${purposeOf(key)}`)
      seenAtPut.push((await vaultRows<{ status: string }>(user, 'SELECT status FROM vault_objects WHERE key = ?', key))[0]?.status)
      return real()
    }
    kit.hooks.head = (key, real) => {
      calls.push(`head ${purposeOf(key)}`)
      return real()
    }
    try {
      await retained(kit, user, records[0], image, 1)
    } finally {
      kit.reset()
    }
    // The R2 binding has no server-side copy (R2ObjectStore.copy reads through the Worker): one read of the
    // import image, one create-only write of the receipt, registered first, and the HEAD that checks it.
    expect(calls).toEqual(['read import_image', 'write receipt', 'head receipt'])
    expect(seenAtPut).toEqual(['reserved'])
    expect(await storedBytes(await receiptKeyOf(user, image.attachmentId))).toEqual(image.bytes)

    // The import image goes at its 24-hour deadline; the preview at 7 days.
    await sweep(user, Date.now() + 25 * HOUR)
    expect(await storedKeys(`import_image/${vaultIdOf(user)}/`)).toEqual([])
    await vaultExec(user, "UPDATE import_previews SET status = 'expired', expired_at = ? WHERE job_id = ?", new Date().toISOString(), image.jobId)
    await sweep(user, Date.now() + 30 * DAY)
    expect(await storedReceipts(user)).toHaveLength(1)

    const grant = await grantOf(kit.v1, user, image.attachmentId)
    expect(grant.status).toBe(200)
    expect(isAttachmentGrant(grant.body)).toBe(true)
    const body = grant.body as AttachmentGrant
    expect(body).toEqual(expect.objectContaining({ content_type: 'image/jpeg', bytes: image.bytes.length, sha256: image.sha256 }))
    expect(body.url.startsWith(ATTACHMENT_DOWNLOAD_PATH)).toBe(true)
    expect(body.url).not.toContain(user.sub)
    expect(Math.abs(Date.parse(body.expires_at) - (Date.now() + ATTACHMENT_GRANT_MINUTES * 60_000))).toBeLessThan(5_000)
    const file = await download(kit.v1, user, body.url)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('image/jpeg')
    expect(file.headers.get('cache-control')).toBe('no-store')
    expect(file.body).toEqual(image.bytes)
    // Five minutes later the grant is spent.
    await setVaultClock(user, Date.now() + ATTACHMENT_GRANT_MINUTES * 60_000 + 1_000)
    expect((await download(kit.v1, user, body.url)).status).toBe(404)
    await setVaultClock(user, null)
    expect((await download(kit.v1, user, body.url)).status).toBe(200)
  })

  it('is versioned and idempotent: a stale version keeps nothing, a resend replays, a second receipt needs replace', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const stale = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 2)
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('VERSION_CONFLICT')
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    // Nothing was copied for it (prepare saw the stale version), so nothing is left to delete.
    expect((await receiptRows(user)).every((row) => row.status === 'reserved' && row.due)).toBe(true)
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])

    const key = randomUUID()
    const first = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key)
    expect(first.status).toBe(200)
    const again = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1, key)
    expect([again.status, again.body]).toEqual([200, first.body])
    // The resend copied nothing.
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'published', forever: true })])
    await sweep(user)
    expect(await storedReceipts(user)).toHaveLength(1)
    expect((await retain(kit.v1, user, records[0], { attachment_id: randomUUID(), ...CONSENT }, 1, key)).body.code).toBe('IDEMPOTENCY_MISMATCH')

    const second = await seedImportImage(user)
    // A command id that already committed never copies anything, whatever image it names (1B-T10's confirmation prepares without a record).
    expect(await stepCall(user, 'attachments.prepare', { attachment_id: second.attachmentId, command_id: key })).toEqual({ ok: true, status: 200, body: { kind: 'none' } })
    expect((await receiptRows(user)).filter((row) => row.attachment_id === second.attachmentId)).toEqual([])
    const present = await retain(kit.v1, user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 2)
    expect([present.status, present.body.message_key]).toEqual([422, 'errors.attachment_present'])
    expect((await recordOf(kit.v1, user, records[0])).attachment_id).toBe(image.attachmentId)
    // The refusal was decided before anything was copied: no spare copy exists.
    expect((await receiptRows(user)).filter((row) => row.attachment_id === second.attachmentId)).toEqual([])
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([await receiptKeyOf(user, image.attachmentId)])
  })

  it('never publishes a copy that differs from the import image', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    // The stored import image no longer matches its registration.
    const tampered = concat(image.bytes, new TextEncoder().encode('tampered'))
    await env.OBJECTS.delete(image.key)
    await env.OBJECTS.put(image.key, tampered, { customMetadata: { sha256: sha256Of(tampered) } })
    const refused = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    expect([refused.status, refused.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    const rows = await receiptRows(user)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.status === 'reserved' && row.due)).toBe(true)
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])
  })

  it("the retain routine publishes only this account's own unexpired copy at its generation, matching the image", async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const reserved = preparedOf(await stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() }))
    expect(reserved.kind).toBe('copy')
    await env.OBJECTS.put(reserved.key, image.bytes)
    const expired = { ok: false, status: 422, problem: { messageKey: 'errors.attachment_expired' } }
    const copy = (bytes: number, sha256: string) => ({ key: reserved.key, bytes, sha256 })
    expect(await retainStep(user, records[0], image.attachmentId, copy(image.bytes.length, 'ab'.repeat(32)))).toMatchObject(expired)
    expect(await retainStep(user, records[0], image.attachmentId, copy(image.bytes.length + 1, image.sha256))).toMatchObject(expired)
    // A vault has no lifecycle generation; a copy past its deadline is not usable either.
    await vaultExec(user, 'UPDATE vault_objects SET delete_after = ? WHERE key = ?', Date.now() - 1_000, reserved.key)
    expect(await retainStep(user, records[0], image.attachmentId, copy(image.bytes.length, image.sha256))).toMatchObject(expired)
    await vaultExec(user, 'UPDATE vault_objects SET delete_after = ? WHERE key = ?', Date.now() + 5 * MIN, reserved.key)
    // Another attachment's reservation is not this one's copy, even for the same bytes.
    const other = await seedImportImage(user)
    expect(await retainStep(user, records[0], other.attachmentId, copy(image.bytes.length, image.sha256))).toMatchObject(expired)
    // Nor is a reservation of another format for this receipt.
    const png = `receipt/${vaultIdOf(user)}/${image.attachmentId}/${randomUUID()}/image.png`
    await vaultExec(user, "INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'receipt', 'reserved', ?, ?)", png, Date.now() + 3 * MIN, Date.now())
    expect(await retainStep(user, records[0], image.attachmentId, { key: png, bytes: image.bytes.length, sha256: image.sha256 })).toMatchObject(expired)
    expect(await retainStep(user, records[0], image.attachmentId, copy(image.bytes.length, image.sha256))).toMatchObject({ ok: true, status: 200, body: { version: 2 } })
    // Once the receipt exists, a copy made for it for nothing is due at once.
    const spare = `receipt/${vaultIdOf(user)}/${image.attachmentId}/${randomUUID()}/image.jpg`
    await vaultExec(user, "INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'receipt', 'reserved', ?, ?)", spare, Date.now() + 3 * MIN, Date.now())
    expect(await retainStep(user, records[1], image.attachmentId, { key: spare, bytes: image.bytes.length, sha256: image.sha256 })).toMatchObject({ ok: true, status: 200 })
    expect((await receiptRows(user)).find((row) => row.key === spare)).toEqual(expect.objectContaining({ status: 'reserved', due: true }))
  })

  it('an account has at most four copies in flight; a fifth retain is told when to retry', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const images: SeededImage[] = []
    for (let i = 0; i < 5; i += 1) images.push(await seedImportImage(user))
    const kinds: string[] = []
    for (const image of images.slice(0, 4)) kinds.push(preparedOf(await stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() })).kind)
    expect(kinds).toEqual(['copy', 'copy', 'copy', 'copy'])
    // A reservation lasts three minutes: the copy's one-minute deadline plus its command.
    const lifetimes = await vaultRows<{ ms: number }>(user, "SELECT delete_after - created_at AS ms FROM vault_objects WHERE purpose = 'receipt'")
    expect(lifetimes.map((row) => row.ms)).toEqual([180_000, 180_000, 180_000, 180_000])
    expect(await stepCall(user, 'attachments.prepare', { attachment_id: images[4].attachmentId, command_id: randomUUID() })).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED' })
    const limited = await retain(kit.v1, user, records[0], { attachment_id: images[4].attachmentId, ...CONSENT }, 1)
    expect([limited.status, limited.body.code]).toEqual([429, 'RATE_LIMITED'])
    // Retry when the oldest copy in flight reaches its deadline, not before.
    expect(limited.body.retry_after_seconds).toBeGreaterThan(160)
    expect(limited.body.retry_after_seconds).toBeLessThanOrEqual(180)
    expect(await attachmentOf(user, images[4].attachmentId)).toBeUndefined()
    // Once those copies are due (abandoned), retaining goes ahead.
    await vaultExec(user, "UPDATE vault_objects SET delete_after = ? WHERE purpose = 'receipt'", Date.now() - 1_000)
    expect((await retain(kit.v1, user, records[0], { attachment_id: images[4].attachmentId, ...CONSENT }, 1)).status).toBe(200)
  })

  it('refuses an image past its window, and a deleted record', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    // One minute left: inside the two minutes a copy needs (the preview's attachable_until is 1B-T10's).
    const image = await seedImportImage(user, { expiresInMs: MIN })
    const late = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    expect([late.status, late.body.message_key, late.body.fields]).toEqual([422, 'errors.attachment_expired', { attachment_id: 'errors.attachment_expired' }])
    expect(await receiptRows(user)).toEqual([])

    const fresh = await seedImportImage(user)
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 1 })).status).toBe(200)
    const deleted = await retain(kit.v1, user, records[1], { attachment_id: fresh.attachmentId, ...CONSENT }, 2)
    expect([deleted.status, deleted.body.code]).toEqual([409, 'ENTITY_DELETED'])
    expect(await attachmentOf(user, fresh.attachmentId)).toBeUndefined()
  })
})

describe('replace and remove are versioned against the record', () => {
  it('replace moves the record to its next version and queues the image it dropped', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const first = await seedImportImage(user)
    const second = await seedImportImage(user, { format: 'png', width: 20, height: 10 })
    await retained(kit, user, records[0], first, 1)
    const firstKey = await receiptKeyOf(user, first.attachmentId)

    const stale = await replace(kit.v1, user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 1)
    expect([stale.status, stale.body.code]).toEqual([409, 'VERSION_CONFLICT'])
    expect((await replace(kit.v1, user, records[0], { attachment_id: second.attachmentId }, 2)).status).toBe(422)
    expect((await recordOf(kit.v1, user, records[0])).attachment_id).toBe(first.attachmentId)

    const key = randomUUID()
    const ack = await replace(kit.v1, user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 2, key)
    expect(ack.status).toBe(200)
    expect(ack.body).toEqual(expect.objectContaining({ entity_id: records[0], version: 3, outcome: 'updated' }))
    expect(await recordOf(kit.v1, user, records[0])).toEqual(expect.objectContaining({ version: 3, attachment_id: second.attachmentId }))
    expect(await latestSnapshot(user, records[0])).toEqual(expect.objectContaining({ version: 3, attachment_id: second.attachmentId }))
    expect(await auditOf(user, key)).toEqual({ consent: RECEIPT_RETENTION_CONSENT, previous: 'released' })

    // The dropped receipt is released for good and its object queued for deletion. The trigger cannot
    // read the vault clock, so its release is stamped by pruneAttachments (B20).
    expect(await attachmentOf(user, first.attachmentId)).toEqual(expect.objectContaining({ status: 'released', released: false }))
    await prune(user)
    expect(await attachmentOf(user, first.attachmentId)).toEqual(expect.objectContaining({ status: 'released', released: true }))
    const rows = await receiptRows(user)
    expect(rows.find((row) => row.key === firstKey)).toEqual(expect.objectContaining({ status: 'published', due: true, forever: false }))
    expect((await grantOf(kit.v1, user, first.attachmentId)).status).toBe(404)
    await sweep(user)
    const stored = await storedReceipts(user)
    expect(stored).not.toContain(firstKey)
    expect(stored).toEqual([await receiptKeyOf(user, second.attachmentId)])
    const grant = (await grantOf(kit.v1, user, second.attachmentId)).body as AttachmentGrant
    expect(grant.content_type).toBe('image/png')

    const same = await replace(kit.v1, user, records[0], { attachment_id: second.attachmentId, ...CONSENT }, 3)
    expect([same.status, same.body.message_key]).toEqual([422, 'errors.attachment_unchanged'])
  })

  it('remove is versioned, deletes the image with no undo, and cannot be repeated', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const key = await receiptKeyOf(user, image.attachmentId)

    const stale = await remove(kit.v1, user, records[0], 1)
    expect([stale.status, stale.body.code]).toEqual([409, 'VERSION_CONFLICT'])
    expect(await heldBy(user, image.attachmentId)).toEqual([records[0]])

    const ack = await remove(kit.v1, user, records[0], 2)
    expect(ack.status).toBe(200)
    expect(ack.body).toEqual(expect.objectContaining({ entity_id: records[0], version: 3, outcome: 'updated' }))
    const record = await recordOf(kit.v1, user, records[0])
    expect(record.version).toBe(3)
    expect('attachment_id' in record).toBe(false)
    const snapshot = await latestSnapshot(user, records[0])
    expect(snapshot && 'attachment_id' in snapshot).toBe(false)
    expect(isTransactionSnapshot(snapshot)).toBe(true)

    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }))
    expect((await receiptRows(user))[0]).toEqual(expect.objectContaining({ key, due: true }))
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])

    const twice = await remove(kit.v1, user, records[0], 3)
    expect([twice.status, twice.body.message_key]).toEqual([422, 'errors.attachment_missing'])
    // No undo: the removed receipt cannot be attached again, even while its import image still exists.
    const undo = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 3)
    expect([undo.status, undo.body.message_key]).toEqual([422, 'errors.attachment_removed'])
    expect(await storedReceipts(user)).toEqual([])
  })
})

describe('shared references prevent premature deletion', () => {
  it('a receipt two records hold is one object, deleted only after both let go', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    await retained(kit, user, records[1], image, 1)
    expect(await heldBy(user, image.attachmentId)).toEqual([...records].sort())
    await sweep(user)
    expect(await storedReceipts(user)).toHaveLength(1)

    const firstKey = randomUUID()
    expect((await remove(kit.v1, user, records[0], 2, firstKey)).status).toBe(200)
    expect(await auditOf(user, firstKey)).toEqual({ previous: 'shared' })
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    expect((await receiptRows(user)).filter((row) => row.status === 'published')).toEqual([expect.objectContaining({ forever: true, due: false })])
    await sweep(user)
    expect(await storedReceipts(user)).toHaveLength(1)
    expect((await grantOf(kit.v1, user, image.attachmentId)).status).toBe(200)

    const secondKey = randomUUID()
    expect((await remove(kit.v1, user, records[1], 2, secondKey)).status).toBe(200)
    expect(await auditOf(user, secondKey)).toEqual({ previous: 'released' })
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }))
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])
  })

  it('two records retaining one image at once keep one receipt, made by one copy', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    // The first copy is held until the second request has had time to ask, so the second finds it in flight.
    const hold = gate()
    const inside = gate()
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    const writes = kit.receiptWrites()
    let statuses: number[]
    try {
      const first = retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
      expect(await Promise.race([inside.opened.then(() => 'copying'), first.then((res) => `answered ${res.status}`)])).toBe('copying')
      const second = retain(kit.v1, user, records[1], { attachment_id: image.attachmentId, ...CONSENT }, 1)
      await delay(250)
      hold.open()
      statuses = (await Promise.all([first, second])).map((res) => res.status)
    } finally {
      hold.open()
      kit.reset()
    }
    expect(statuses).toEqual([200, 200])
    // The second waited for the copy already in flight instead of making its own.
    expect(kit.receiptWrites() - writes).toBe(1)
    expect(await heldBy(user, image.attachmentId)).toEqual([...records].sort())
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([await receiptKeyOf(user, image.attachmentId)])
  })

  it('the 30-day purge of a deleted record releases its receipt only when no other record holds it', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    await retained(kit, user, records[1], image, 1)
    const age = (id: string) => vaultExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date(Date.now() - 31 * DAY).toISOString(), id)

    expect((await kit.v1.as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200)
    await age(records[0])
    // 1A-T8b's purge, on the vault's alarm.
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await heldBy(user, image.attachmentId)).toEqual([records[1]])
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    await sweep(user)
    expect(await storedReceipts(user)).toHaveLength(1)

    expect((await kit.v1.as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 2 })).status).toBe(200)
    await age(records[1])
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await heldBy(user, image.attachmentId)).toEqual([])
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }))
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])
  })
})

describe('a deleted record keeps its receipt for the undo window', () => {
  it('grants wait until the record is restored; the object is never queued meanwhile', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200)

    const denied = await grantOf(kit.v1, user, image.attachmentId)
    expect(denied.status).toBe(404)
    expect(problemOf(denied.body)).toEqual(problemOf((await grantOf(kit.v1, user, randomUUID())).body))
    expect(await heldBy(user, image.attachmentId)).toEqual([records[0]])
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'published', forever: true })])
    // The deleted record's snapshot still names its receipt (restorable).
    expect(await latestSnapshot(user, records[0])).toEqual(expect.objectContaining({ attachment_id: image.attachmentId }))

    expect((await kit.v1.as(user).post(`/v1/transactions/${records[0]}/restore`, {}, { ifMatch: 3 })).status).toBe(200)
    const grant = await grantOf(kit.v1, user, image.attachmentId)
    expect(grant.status).toBe(200)
    const file = await download(kit.v1, user, (grant.body as AttachmentGrant).url)
    expect(file.body).toEqual(image.bytes)
  })

  it('a grant issued before the record was deleted no longer downloads', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const grant = (await grantOf(kit.v1, user, image.attachmentId)).body as AttachmentGrant
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200)
    expect((await download(kit.v1, user, grant.url)).status).toBe(404)
  })
})

describe('retention and erasure (P5)', () => {
  it('account erasure deletes every retained receipt object', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const first = await seedImportImage(user)
    const second = await seedImportImage(user)
    await retained(kit, user, records[0], first, 1)
    await retained(kit, user, records[1], second, 1)
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[1]}`, { ifMatch: 2 })).status).toBe(200)
    expect(await storedReceipts(user)).toHaveLength(2)

    // 1C's deletion: the vault's prefixes are purged (1B-T2's purgeVaultObjects), then the vault is erased (B22).
    expect(await purgeVaultObjects(env.OBJECTS, vaultIdOf(user))).toBeGreaterThanOrEqual(2)
    await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.erase())
    expect(await storedReceipts(user)).toEqual([])
    expect(await vaultRows(user, 'SELECT 1 FROM attachments')).toEqual([])
    expect(await vaultRows(user, 'SELECT 1 FROM transaction_attachments')).toEqual([])
  })

  it('the retention step releases a receipt nothing holds and drops released rows 30 days on, once their object is gone', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const held = await seedImportImage(user)
    await retained(kit, user, records[1], held, 1)
    await retained(kit, user, records[0], image, 1)
    const key = await receiptKeyOf(user, image.attachmentId)
    // An association that went without its trigger (the safety net's case), in one block.
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      state.storage.transactionSync(() => {
        const sql = state.storage.sql
        const trigger = sql.exec<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'transaction_attachments_unheld_delete'").one().sql
        sql.exec('DROP TRIGGER transaction_attachments_unheld_delete')
        sql.exec('DELETE FROM transaction_attachments WHERE transaction_id = ?', records[0])
        sql.exec(trigger)
      })
    })
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    // The held receipt is the older one, and it is left alone.
    await vaultExec(user, "UPDATE attachments SET retained_at = strftime('%Y-%m-%dT%H:%M:%fZ', retained_at, '-1 day') WHERE id = ?", held.attachmentId)
    await prune(user)
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released', released: true }))
    expect((await receiptRows(user)).find((row) => row.key === key)).toEqual(expect.objectContaining({ due: true }))
    expect(await attachmentOf(user, held.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))

    // 30 days on, but its object is not deleted yet: the row stays.
    await vaultExec(user, "UPDATE attachments SET released_at = ? WHERE status = 'released'", new Date(Date.now() - 31 * DAY).toISOString())
    await prune(user)
    expect(await attachmentOf(user, image.attachmentId)).toEqual(expect.objectContaining({ status: 'released' }))
    await sweep(user)
    await prune(user)
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    expect(await attachmentOf(user, held.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
  })
})

describe('copying is bounded (P2c review fixes M1, M2)', () => {
  it('serializes reservations: five at once from one account reserve exactly four', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const images: SeededImage[] = []
    for (let i = 0; i < 5; i += 1) images.push(await seedImportImage(user))
    // The vault takes one call at a time, so concurrent prepares never all see zero copies in flight.
    const outcomes = await Promise.all(images.map((image) => stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() })))
    expect(outcomes.filter((o) => o.ok && preparedOf(o).kind === 'copy')).toHaveLength(4)
    const limited = outcomes.filter((o) => !o.ok)
    expect(limited).toHaveLength(1)
    expect(await receiptRows(user)).toHaveLength(4)
    // Told when the oldest copy in flight is due, never a fixed minute.
    for (const reply of limited) {
      expect(reply).toMatchObject({ status: 429, code: 'RATE_LIMITED' })
      const seconds = (reply as { problem: { retryAfterSeconds: number } }).problem.retryAfterSeconds
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(180)
    }
  })

  it('a busy process answers 503 with when to retry, before it reserves anything', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const first = await seedImportImage(user)
    const second = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    // The isolate's other three copy slots are in use, so the first retain's copy fills it.
    const taken = [COPY_SLOTS.take(), COPY_SLOTS.take(), COPY_SLOTS.take()]
    try {
      const running = retain(kit.v1, user, records[0], { attachment_id: first.attachmentId, ...CONSENT }, 1)
      // The first retain is now inside its copy (not answered without one).
      expect(await Promise.race([inside.opened.then(() => 'copying'), running.then((res) => `answered ${res.status}`)])).toBe('copying')
      const busy = await retain(kit.v1, user, records[1], { attachment_id: second.attachmentId, ...CONSENT }, 1)
      expect([busy.status, busy.body.code, busy.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
      // Turned away before reserving: nothing to delete, nothing counted against the vault.
      expect((await receiptRows(user)).filter((row) => row.attachment_id === second.attachmentId)).toEqual([])
      hold.open()
      expect((await running).status).toBe(200)
    } finally {
      hold.open()
      for (const slot of taken) slot()
      kit.reset()
    }
    expect((await retain(kit.v1, user, records[1], { attachment_id: second.attachmentId, ...CONSENT }, 1)).status).toBe(200)
  })

  it('a process never has more copies running than its limit', async () => {
    const kit = await setup()
    const users = await Promise.all([memberWithRecords(kit), memberWithRecords(kit), memberWithRecords(kit), memberWithRecords(kit)])
    const images = await Promise.all(users.map(({ user }) => seedImportImage(user)))
    let running = 0
    let peak = 0
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) {
        running += 1
        peak = Math.max(peak, running)
        await delay(120)
      }
      return real()
    }
    kit.hooks.put = async (key, _value, _options, real) => {
      try {
        return await real()
      } finally {
        if (key.startsWith('receipt/')) running -= 1
      }
    }
    // Two of the isolate's four copy slots are in use, so two copies may run.
    const taken = [COPY_SLOTS.take(), COPY_SLOTS.take()]
    let statuses: number[]
    try {
      statuses = (await Promise.all(users.map(({ user, records }, i) => retain(kit.v1, user, records[0], { attachment_id: images[i].attachmentId, ...CONSENT }, 1)))).map((res) => res.status)
    } finally {
      for (const slot of taken) slot()
      kit.reset()
    }
    expect(peak).toBeLessThanOrEqual(2)
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(2)
    expect(statuses.every((status) => status === 200 || status === 503)).toBe(true)
  })

  it('refused retains, replaces and removals copy nothing', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 3)
    const held = await seedImportImage(user)
    await retained(kit, user, records[0], held, 1)
    const spare = await seedImportImage(user)
    const writes = kit.receiptWrites()
    // The record already holds a receipt.
    const present = await retain(kit.v1, user, records[0], { attachment_id: spare.attachmentId, ...CONSENT }, 2)
    expect([present.status, present.body.message_key]).toEqual([422, 'errors.attachment_present'])
    // Replacing with the receipt it already holds.
    const same = await replace(kit.v1, user, records[0], { attachment_id: held.attachmentId, ...CONSENT }, 2)
    expect([same.status, same.body.message_key]).toEqual([422, 'errors.attachment_unchanged'])
    // Replacing on a record with none, and removing from it.
    const missing = await replace(kit.v1, user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 1)
    expect([missing.status, missing.body.message_key]).toEqual([422, 'errors.attachment_missing'])
    expect((await remove(kit.v1, user, records[1], 1)).body.message_key).toBe('errors.attachment_missing')
    // A stale version, no consent, an unsupported schema, an unknown record.
    expect((await retain(kit.v1, user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 5)).status).toBe(409)
    expect((await retain(kit.v1, user, records[1], { attachment_id: spare.attachmentId }, 1)).status).toBe(422)
    const schema = await json(await kit.v1.as(user).post(`/v1/transactions/${records[1]}/attachment`, { attachment_id: spare.attachmentId, ...CONSENT }, { ifMatch: 1, schema: 2 }))
    expect([schema.status, schema.body.code]).toEqual([422, 'COMMAND_SCHEMA_UNSUPPORTED'])
    expect((await retain(kit.v1, user, randomUUID(), { attachment_id: spare.attachmentId, ...CONSENT }, 1)).status).toBe(404)
    // A deleted record.
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[2]}`, { ifMatch: 1 })).status).toBe(200)
    expect((await retain(kit.v1, user, records[2], { attachment_id: spare.attachmentId, ...CONSENT }, 2)).status).toBe(409)
    expect(kit.receiptWrites() - writes).toBe(0)
    expect((await receiptRows(user)).filter((row) => row.attachment_id === spare.attachmentId)).toEqual([])
    // Nothing was spent: the same image still retains.
    expect((await retain(kit.v1, user, records[1], { attachment_id: spare.attachmentId, ...CONSENT }, 1)).status).toBe(200)
  })

  it('a receipt that already exists is attached without another copy', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const writes = kit.receiptWrites()
    expect((await retain(kit.v1, user, records[1], { attachment_id: image.attachmentId, ...CONSENT }, 1)).status).toBe(200)
    expect(kit.receiptWrites() - writes).toBe(0)
  })

  it('an account has a copy budget; past it, retaining is told when the oldest copy leaves the window', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    // 100 copies reserved in the last day (all long due: none is in flight).
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      const now = Date.now()
      state.storage.transactionSync(() => {
        for (let i = 0; i < 100; i += 1) {
          state.storage.sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'receipt', 'reserved', ?, ?)", `receipt/${state.id.toString()}/${randomUUID()}/${randomUUID()}/image.jpg`, now - HOUR, now)
        }
      })
    })
    const writes = kit.receiptWrites()
    const limited = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    expect([limited.status, limited.body.code]).toEqual([429, 'RATE_LIMITED'])
    expect(limited.body.retry_after_seconds).toBeGreaterThan(24 * 3600 - 60)
    expect(limited.body.retry_after_seconds).toBeLessThanOrEqual(24 * 3600)
    expect(kit.receiptWrites() - writes).toBe(0)
    // Another account is unaffected.
    const { user: other, records: otherRecords } = await memberWithRecords(kit)
    expect((await retain(kit.v1, other, otherRecords[0], { attachment_id: (await seedImportImage(other)).attachmentId, ...CONSENT }, 1)).status).toBe(200)
  })

  it('gives one deadline to the whole copy: the HEAD that checks it runs on the same signal', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    // The copy's read and the HEAD that checks it take 300 ms each: inside the deadline alone, past it together.
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) await delay(300)
      return real()
    }
    kit.hooks.head = async (key, real) => {
      if (key.startsWith('receipt/')) await delay(300)
      return real()
    }
    const started = Date.now()
    let refused: Reply
    try {
      refused = await withLimits({ copyDeadlineMs: 400 }, () => retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1))
    } finally {
      kit.reset()
    }
    expect([refused.status, refused.body.code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
    expect(Date.now() - started).toBeLessThan(2_500)
    // Its reservation was given back at once.
    const rows = await receiptRows(user)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.status === 'reserved' && row.due)).toBe(true)
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
  })

  it('a copy the store cannot make is a 503 with no reservation left live, and never leaks the failure', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) throw new Error('provider said: bucket secret-bucket is on fire')
      return real()
    }
    let refused: Reply
    try {
      refused = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    } finally {
      kit.reset()
    }
    expect([refused.status, refused.body.code, refused.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
    expect(JSON.stringify(refused.body)).not.toMatch(/secret-bucket|on fire/)
    const rows = await receiptRows(user)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.status === 'reserved' && row.due)).toBe(true)
    expect((await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)).status).toBe(200)
  })

  it('the copy is checked as stored by the database too: a copy that is not the registered image is not published', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    // The bucket's copy comes out different (a provider fault), and the HEAD reports what is stored.
    kit.hooks.put = async (key, value, options, real) => {
      if (!key.startsWith('receipt/')) return real()
      const different = concat(image.bytes, randomBytes(8))
      return env.OBJECTS.put(key, different, { customMetadata: { sha256: sha256Of(different) } })
    }
    let refused: Reply
    try {
      refused = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    } finally {
      kit.reset()
    }
    expect([refused.status, refused.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    await sweep(user)
    expect(await storedReceipts(user)).toEqual([])
  })
})

describe('receipt downloads (P2c review fixes M3, minor 1)', () => {
  type Streamed = { user: TestUser; image: SeededImage; key: string; url: string }
  async function streamed(kit: Kit): Promise<Streamed> {
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user, { format: 'png', width: 120, height: 90 })
    await retained(kit, user, records[0], image, 1)
    const key = await receiptKeyOf(user, image.attachmentId)
    return { user, image, key, url: ((await grantOf(kit.v1, user, image.attachmentId)).body as AttachmentGrant).url }
  }

  it('serves the image whole, with its length, as it always did', async () => {
    const kit = await setup()
    const { user, image, url } = await streamed(kit)
    const raw = await download(kit.v1, user, url)
    expect([raw.status, raw.complete]).toEqual([200, true])
    expect(raw.body).toEqual(image.bytes)
    expect(raw.headers.get('content-length')).toBe(String(image.bytes.length))
  })

  it('one account cannot take every download slot: its third waits while another account is served', async () => {
    const kit = await setup()
    const mine = await streamed(kit)
    const theirs = await streamed(kit)
    const open = gate()
    const reached = gate()
    let held = 0
    kit.hooks.get = served(
      mine.key,
      mine.image,
      () => {
        held += 1
        reached.open()
        return (async function* () {
          await open.opened
          yield mine.image.bytes
        })()
      },
      () => held === 0,
    )
    // One of the account's two download slots is in use elsewhere in the isolate.
    const elsewhere = RECEIPT_SLOTS.take(mine.user.sub)
    try {
      const slow = download(kit.v1, mine.user, mine.url)
      await reached.opened
      const refused = await download(kit.v1, mine.user, mine.url)
      expect([refused.status, problemBody(refused).code, problemBody(refused).retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
      expect(refused.headers.get('retry-after')).toBe('5')
      const servedOther = await download(kit.v1, theirs.user, theirs.url)
      expect([servedOther.status, servedOther.complete]).toEqual([200, true])
      open.open()
      const done = await slow
      expect([done.status, done.complete]).toEqual([200, true])
      expect(done.body).toEqual(mine.image.bytes)
      // The slot came back.
      expect((await download(kit.v1, mine.user, mine.url)).status).toBe(200)
    } finally {
      open.open()
      elsewhere()
      kit.reset()
    }
  })

  it('the process-wide cap still holds across accounts', async () => {
    const kit = await setup()
    const a = await streamed(kit)
    const b = await streamed(kit)
    const open = gate()
    const reached = gate()
    let held = 0
    kit.hooks.get = served(
      a.key,
      a.image,
      () => {
        held += 1
        reached.open()
        return (async function* () {
          await open.opened
          yield a.image.bytes
        })()
      },
      () => held === 0,
    )
    // Seven of the isolate's eight download slots are in use by other accounts.
    const others = ['x1', 'x1', 'x2', 'x2', 'x3', 'x3', 'x4'].map((account) => RECEIPT_SLOTS.take(account))
    try {
      const slow = download(kit.v1, a.user, a.url)
      await reached.opened
      expect((await download(kit.v1, b.user, b.url)).status).toBe(503)
      open.open()
      expect((await slow).status).toBe(200)
      expect((await download(kit.v1, b.user, b.url)).status).toBe(200)
    } finally {
      open.open()
      for (const slot of others) slot()
      kit.reset()
    }
  })

  it('cuts off a download that stops making progress, and frees its slot', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    const parts = quarters(image.bytes)
    expect(parts.length).toBeGreaterThanOrEqual(3)
    let calls = 0
    kit.hooks.get = served(key, image, () => {
      calls += 1
      const stall = calls === 1
      return (async function* () {
        yield parts[0]
        yield parts[1]
        yield parts[2]
        if (stall) await new Promise<void>(() => undefined)
        yield* parts.slice(3)
      })()
    })
    // One of the account's two download slots is in use elsewhere, so the next download needs the one this one frees.
    const elsewhere = RECEIPT_SLOTS.take(user.sub)
    try {
      await withLimits({ downloadIdleMs: 200 }, async () => {
        const started = Date.now()
        const cut = await download(kit.v1, user, url)
        expect(cut.complete).toBe(false)
        expect(Date.now() - started).toBeLessThan(5_000)
        // Never the whole image, never a made-up ending.
        expect(cut.body.length).toBeLessThan(image.bytes.length)
        const next = await download(kit.v1, user, url)
        expect([next.status, next.complete]).toEqual([200, true])
        expect(next.body).toEqual(image.bytes)
      })
    } finally {
      elsewhere()
      kit.reset()
    }
  })

  it('cuts off a download still running at the total limit even though it keeps trickling', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    kit.hooks.get = served(key, image, () =>
      (async function* () {
        for (let i = 0; i < image.bytes.length; i += 1) {
          await delay(25)
          yield image.bytes.subarray(i, i + 1)
        }
      })(),
    )
    try {
      await withLimits({ downloadIdleMs: 5_000, downloadTotalMs: 400 }, async () => {
        const started = Date.now()
        const cut = await download(kit.v1, user, url)
        expect(cut.complete).toBe(false)
        expect(Date.now() - started).toBeLessThan(3_000)
      })
    } finally {
      kit.reset()
    }
  })

  it('a download that never starts is a 503 problem, not an image-typed body', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    kit.hooks.get = served(key, image, () =>
      (async function* () {
        await new Promise<void>(() => undefined)
      })(),
    )
    try {
      await withLimits({ downloadIdleMs: 200 }, async () => {
        const raw = await download(kit.v1, user, url)
        expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
        expect(String(raw.headers.get('content-type'))).toMatch(/json/)
      })
    } finally {
      kit.reset()
    }
  })

  it('unavailable storage is a 503 with when to retry, and never sends the failure text', async () => {
    const kit = await setup()
    const { user, url } = await streamed(kit)
    for (const failure of [new ObjectStoreError('unavailable'), new Error('provider said: secret-bucket exploded')]) {
      kit.hooks.get = async (key, real) => {
        if (key.startsWith('receipt/')) throw failure
        return real()
      }
      try {
        const raw = await download(kit.v1, user, url)
        expect([raw.status, problemBody(raw).code, problemBody(raw).retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
        expect(String(raw.headers.get('content-type'))).not.toMatch(/image/)
        expect(new TextDecoder().decode(raw.body)).not.toMatch(/secret-bucket|exploded|Object store/)
      } finally {
        kit.reset()
      }
    }
  })

  it('a body that fails before its first byte is a 503 problem, with no error text', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    kit.hooks.get = served(key, image, () =>
      (async function* () {
        throw new Error('secret-bucket reset')
      })(),
    )
    try {
      const raw = await download(kit.v1, user, url)
      expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
      expect(new TextDecoder().decode(raw.body)).not.toContain('secret-bucket')
    } finally {
      kit.reset()
    }
  })

  it('a HEAD on a receipt download answers its headers, reads its image to the end and gives its slot back (ruling R96)', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    // Large enough to stream in many chunks: a small body drains into the response on its own and frees its slot anyway.
    const large = await seedImportImage(user, { bytes: new Uint8Array(256 * 1024).map((_, i) => (i * 31 + 7) & 0xff) })
    await retained(kit, user, records[0], large, 1)
    const grant = (await grantOf(kit.v1, user, large.attachmentId)).body as AttachmentGrant
    // Each download's body has its own byte counter, so each HEAD's entry proves its own read (the 1B-T9 review's
    // m-2, probe HD-1; the export and chunk HEAD cases count the same way).
    const reads: number[] = []
    kit.hooks.get = async (key, real) => {
      const found = await real()
      if (!found || !key.startsWith('receipt/')) return found
      const slot = reads.push(0) - 1
      const body = found.body as unknown as AsyncIterable<Uint8Array>
      const counted = (async function* () {
        for await (const chunk of body) {
          reads[slot] += chunk.byteLength
          yield chunk
        }
      })()
      return { key: found.key, size: found.size, uploaded: found.uploaded, customMetadata: found.customMetadata, httpMetadata: found.httpMetadata, body: counted, arrayBuffer: () => found.arrayBuffer() } as unknown as Got
    }
    try {
      const heads: [number, string | null, number, number][] = []
      // More HEADs than the account's two download slots.
      for (let i = 0; i < 3; i += 1) {
        const head = await kit.v1.as(user).request('HEAD', grant.url)
        heads.push([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength, reads[i]])
      }
      expect(heads).toEqual([0, 1, 2].map(() => [200, String(large.bytes.length), 0, large.bytes.length]))
      const after = await download(kit.v1, user, grant.url)
      expect([after.status, after.complete]).toEqual([200, true])
      expect(after.body).toEqual(large.bytes)
    } finally {
      kit.reset()
    }
  })

  it('downloads refused after they took a slot give the slot back', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    // The stored object no longer matches what the vault recorded: each download is refused after its slot was taken.
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, new TextEncoder().encode('swapped'))
    for (let i = 0; i < 3; i += 1) expect((await download(kit.v1, user, url)).status).toBe(404)
    // With the right bytes back, the account's slots are free again.
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, image.bytes, { customMetadata: { sha256: image.sha256 } })
    const raw = await download(kit.v1, user, url)
    expect([raw.status, raw.complete]).toEqual([200, true])
  })

  it('a corrupted object is never served as a complete download', async () => {
    const kit = await setup()
    const { user, image, key, url } = await streamed(kit)
    const parts = quarters(image.bytes).map((part) => Uint8Array.from(part))
    const last = parts[parts.length - 1]
    last[last.length - 1] ^= 0xff
    kit.hooks.get = served(key, image, () =>
      (async function* () {
        yield* parts
      })(),
    )
    try {
      const raw = await download(kit.v1, user, url)
      // The last chunk waits for the digest, so the client never receives a complete 200.
      expect(raw.complete).toBe(false)
      expect(raw.body.length).toBeLessThan(image.bytes.length)
      expect(raw.body).toEqual(image.bytes.subarray(0, raw.body.length))
    } finally {
      kit.reset()
    }
    // In one chunk nothing is sent before the check, so it is a plain 503.
    const single = Uint8Array.from(image.bytes)
    single[0] ^= 0xff
    kit.hooks.get = served(key, image, () =>
      (async function* () {
        yield single
      })(),
    )
    try {
      const raw = await download(kit.v1, user, url)
      expect([raw.status, problemBody(raw).code]).toEqual([503, 'SERVICE_UNAVAILABLE'])
    } finally {
      kit.reset()
    }
    // Too long and too short are corrupt as well.
    for (const body of [concat(image.bytes, new TextEncoder().encode('x')), image.bytes.subarray(0, image.bytes.length - 1)]) {
      kit.hooks.get = served(key, image, () =>
        (async function* () {
          yield body
        })(),
      )
      try {
        expect((await download(kit.v1, user, url)).status).toBe(503)
      } finally {
        kit.reset()
      }
    }
  })
})

describe('grants are bound to the session (P2c review fix, minor 2)', () => {
  it('a grant verifies only for the session it was issued to', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const issued = (await grantOf(kit.v1, user, image.attachmentId)).body as AttachmentGrant
    const token = issued.url.slice(ATTACHMENT_DOWNLOAD_PATH.length)
    expect(await stepCall(user, 'attachments.file', undefined, { params: { grant: token } })).toMatchObject({ ok: true, status: 200, body: { sha256: image.sha256 } })
    // The same account on another session (a vault has no session generation; signing out is the plan's case).
    expect(await stepCall(user, 'attachments.file', undefined, { params: { grant: token }, as: { sub: user.sub, sid: randomUUID() } })).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' })
    // Over HTTP the same: another member's session cannot use the first one's grant.
    const second = await kit.money.member()
    expect((await download(kit.v1, second, issued.url)).status).toBe(404)
  })
})

describe('ownership holds for replace and remove too (P2c review fix, minor 6)', () => {
  it('another account gets the same 404 as for an unknown record, and nothing changes', async () => {
    const kit = await setup()
    const { user: owner, records } = await memberWithRecords(kit)
    const first = await seedImportImage(owner)
    await retained(kit, owner, records[0], first, 1)
    const { user: intruder, records: intruderRecords } = await memberWithRecords(kit)
    const intruderImage = await seedImportImage(intruder)
    const spare = await seedImportImage(intruder)
    await retained(kit, intruder, intruderRecords[0], intruderImage, 1)
    const writes = kit.receiptWrites()
    // The intruder's own receipt onto the owner's record: the same 404 as an unknown record.
    const foreignReplace = await replace(kit.v1, intruder, records[0], { attachment_id: spare.attachmentId, ...CONSENT }, 2)
    const unknownReplace = await replace(kit.v1, intruder, randomUUID(), { attachment_id: spare.attachmentId, ...CONSENT }, 2)
    expect(foreignReplace.status).toBe(404)
    expect(problemOf(foreignReplace.body)).toEqual(problemOf(unknownReplace.body))
    // The owner's receipt onto the intruder's own record: the same 404 as an unknown id.
    const foreignReceipt = await replace(kit.v1, intruder, intruderRecords[0], { attachment_id: first.attachmentId, ...CONSENT }, 2)
    const unknownReceipt = await replace(kit.v1, intruder, intruderRecords[0], { attachment_id: randomUUID(), ...CONSENT }, 2)
    expect(foreignReceipt.status).toBe(404)
    expect(problemOf(foreignReceipt.body)).toEqual(problemOf(unknownReceipt.body))
    const foreignRemove = await remove(kit.v1, intruder, records[0], 2)
    const unknownRemove = await remove(kit.v1, intruder, randomUUID(), 2)
    expect(foreignRemove.status).toBe(404)
    expect(problemOf(foreignRemove.body)).toEqual(problemOf(unknownRemove.body))
    expect(kit.receiptWrites() - writes).toBe(0)
    expect(await heldBy(owner, first.attachmentId)).toEqual([records[0]])
    expect((await recordOf(kit.v1, owner, records[0])).version).toBe(2)
    expect(await attachmentOf(owner, first.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    expect(await attachmentOf(intruder, intruderImage.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
    expect(await heldBy(intruder, intruderImage.attachmentId)).toEqual([intruderRecords[0]])
  })
})

describe('privileges and schema', () => {
  it('only the routines write receipts or the registry; logins see only what they should', async () => {
    // Ported in part: a vault has no logins, roles or row-level security (the receipt lists that half as not applicable).
    // Only a published receipt may have no deadline; every other key keeps one (the vault_objects CHECK).
    const kit = await setup()
    const user = await kit.money.member()
    const at = Date.now()
    const keyOf = (purpose: string) => `${purpose}/${vaultIdOf(user)}/${randomUUID()}/${randomUUID()}/x`
    await expect(vaultExec(user, "INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'export', 'published', NULL, 1, ?, ?)", keyOf('export'), 'ab'.repeat(32), at)).rejects.toThrow(/CHECK/)
    await expect(vaultExec(user, "INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'receipt', 'reserved', NULL, ?)", keyOf('receipt'), at)).rejects.toThrow(/CHECK/)
    await vaultExec(user, "INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'receipt', 'published', NULL, 1, ?, ?)", keyOf('receipt'), 'ab'.repeat(32), at)
  })
})

// ===========================================================================
// The plan's cases (Task 1B-T9, Step 1)
// ===========================================================================

describe('1B-T9: the plan', () => {
  it('a receipt grant is bound to the session that asked', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const grant = (await grantOf(kit.v1, user, image.attachmentId)).body as AttachmentGrant
    expect((await download(kit.v1, user, grant.url)).status).toBe(200)
    // Another device of the same person.
    const elsewhere = await download(kit.v1, { sub: user.sub, sid: randomUUID() }, grant.url)
    expect([elsewhere.status, problemBody(elsewhere).code]).toEqual([404, 'NOT_FOUND'])
    // The device that asked, once it signed out.
    expect((await kit.v1.as(user).post('/v1/me/logout')).status).toBe(204)
    const signedOut = await download(kit.v1, user, grant.url)
    expect([signedOut.status, problemBody(signedOut).code]).toEqual([401, 'SESSION_REQUIRED'])
  })

  it('a retained receipt shows as attachment_id wherever the record is read', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    expect((await recordOf(kit.v1, user, records[0])).attachment_id).toBe(image.attachmentId)
    const history = (await json(await kit.v1.as(user).get('/v1/history?from=2026-03-01&through=2026-03-31'))).body as HistoryPage
    expect(history.items.find((item) => item.id === records[0])?.attachment_id).toBe(image.attachmentId)
    expect(history.items.find((item) => item.id === records[1])).not.toHaveProperty('attachment_id')
    const page = (await json(await kit.v1.as(user).get('/v1/sync/changes'))).body as SyncChangesPage
    const changes = page.groups.flatMap((group) => group.changes).filter((change) => change.id === records[0])
    expect(changes[changes.length - 1]?.snapshot).toEqual(expect.objectContaining({ version: 2, attachment_id: image.attachmentId }))
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200)
    const deleted = (await json(await kit.v1.as(user).get('/v1/history/deleted'))).body as DeletedHistoryPage
    expect(deleted.items.find((item) => item.id === records[0])?.attachment_id).toBe(image.attachmentId)
  })

  it('purging a deleted record releases its receipt, stamps the release from the vault clock, and deletes its object', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const key = await receiptKeyOf(user, image.attachmentId)
    expect((await kit.v1.as(user).del(`/v1/transactions/${records[0]}`, { ifMatch: 2 })).status).toBe(200)
    const later = Date.now() + 31 * DAY
    await setVaultClock(user, later)
    // 1A-T8b's purge on the alarm, then the file jobs 1B-T11 runs there.
    expect(await runDurableObjectAlarm(vaultOf(user))).toBe(true)
    expect(await heldBy(user, image.attachmentId)).toEqual([])
    await prune(user, later)
    await sweep(user, later)
    expect(await vaultRows(user, 'SELECT status, released_at FROM attachments WHERE id = ?', image.attachmentId)).toEqual([{ status: 'released', released_at: new Date(later).toISOString() }])
    expect(await env.OBJECTS.head(key)).toBeNull()
  })

  it('a copy that is never published is due three minutes after its reservation', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const image = await seedImportImage(user)
    const t0 = Date.now()
    await setVaultClock(user, t0)
    const copy = preparedOf(await stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() }))
    expect(copy.kind).toBe('copy')
    // The copy was made, and nothing published it.
    await env.OBJECTS.put(copy.key, image.bytes)
    expect(await vaultRows(user, 'SELECT status, delete_after FROM vault_objects WHERE key = ?', copy.key)).toEqual([{ status: 'reserved', delete_after: t0 + RECEIPT_COPY_GRACE_MS }])
    await sweep(user, t0 + RECEIPT_COPY_GRACE_MS - 1)
    expect(await env.OBJECTS.head(copy.key)).not.toBeNull()
    await sweep(user, t0 + RECEIPT_COPY_GRACE_MS)
    expect(await env.OBJECTS.head(copy.key)).toBeNull()
  })

  it('copying is bounded: four in flight and a hundred a day per vault, each answered with when to retry', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const t0 = Date.now()
    await setVaultClock(user, t0)
    // Each image may still be copied for two days, so only the copy limits answer below.
    const images: SeededImage[] = []
    for (let i = 0; i < 5; i += 1) images.push(await seedImportImage(user, { expiresInMs: 2 * DAY }))
    const prepare = (image: SeededImage) => stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() })
    for (const image of images.slice(0, 4)) expect(preparedOf(await prepare(image)).kind).toBe('copy')
    // The fifth in flight waits until the oldest copy is due.
    expect(await prepare(images[4])).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED', problem: { retryAfterSeconds: 180 } })
    await setVaultClock(user, t0 + RECEIPT_COPY_GRACE_MS - 1)
    expect(await prepare(images[4])).toMatchObject({ ok: false, status: 429, problem: { retryAfterSeconds: 1 } })
    // The four are given up; 96 more were reserved and given up the same day, so the 101st waits for the oldest to leave the day.
    await setVaultClock(user, t0)
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec("UPDATE vault_objects SET delete_after = ? WHERE purpose = 'receipt'", t0)
        for (let i = 0; i < 96; i += 1) {
          state.storage.sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, created_at) VALUES (?, 'receipt', 'reserved', ?, ?)", `receipt/${state.id.toString()}/${randomUUID()}/${randomUUID()}/image.jpg`, t0, t0 + i)
        }
      })
    })
    expect(await prepare(images[4])).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED', problem: { retryAfterSeconds: 86_400 } })
    await setVaultClock(user, t0 + DAY - 1)
    expect(await prepare(images[4])).toMatchObject({ ok: false, status: 429, problem: { retryAfterSeconds: 1 } })
    // At t0 + one day the four from t0 and the first of the 96 have left the window, so a copy is reserved.
    await setVaultClock(user, t0 + DAY)
    expect(preparedOf(await prepare(images[4])).kind).toBe('copy')
  })

  it('after pruneAttachments at attachmentsDueAt, the next attachmentsDueAt is later or null', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const kept = await seedImportImage(user)
    const dropped = await seedImportImage(user)
    await retained(kit, user, records[0], kept, 1)
    await retained(kit, user, records[1], dropped, 1)
    const t0 = Date.now()
    const dueAt = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => attachmentsDueAt(fileAt(state, ms)))
    // Nothing to do while every receipt is held.
    expect(await dueAt(t0)).toBeNull()
    expect((await remove(kit.v1, user, records[1], 2)).status).toBe(200)
    const seen: number[] = []
    let due = await dueAt(t0)
    while (due !== null && seen.length < 10) {
      seen.push(due)
      await prune(user, due)
      await sweep(user, due)
      const next = await dueAt(due)
      if (next !== null) expect(next).toBeGreaterThan(due)
      due = next
    }
    // Its stamp at once, then the row 30 days after the release, once its object is gone.
    expect(seen).toEqual([t0, t0 + 30 * DAY])
    expect(await attachmentOf(user, dropped.attachmentId)).toBeUndefined()
    expect(await attachmentOf(user, kept.attachmentId)).toEqual(expect.objectContaining({ status: 'retained' }))
  })
})

// ===========================================================================
// The planner's cases
// ===========================================================================

describe('1B-T9: the planner', () => {
  it('a second prepare waits for a copy in flight, and needs none once the receipt exists: both checks run in one block', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const prepare = (record: string) => stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID(), record: { id: record, expected_version: 1, needs: 'none' } })
    const copy = preparedOf(await prepare(records[0]))
    expect(copy.kind).toBe('copy')
    // While the first copy is reserved, the same image is not copied again.
    expect(await prepare(records[1])).toEqual({ ok: true, status: 200, body: { kind: 'wait' } })
    // The first command publishes its copy and records the receipt in one block, so a later prepare finds
    // the receipt: there is no moment where the copy is published and the receipt not yet recorded.
    await env.OBJECTS.put(copy.key, image.bytes)
    expect(await retainStep(user, records[0], image.attachmentId, { key: copy.key, bytes: copy.bytes, sha256: copy.sha256 })).toMatchObject({ ok: true, status: 200 })
    expect(await prepare(records[1])).toEqual({ ok: true, status: 200, body: { kind: 'none' } })
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ key: copy.key, status: 'published', forever: true })])
  })

  it('a retain whose session ends during its copy commits nothing, and its copy is given back at once', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    kit.hooks.put = async (key, _value, _options, real) => {
      if (key.startsWith('receipt/')) await kit.v1.as(user).post('/v1/me/logout')
      return real()
    }
    let refused: Reply
    try {
      refused = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    } finally {
      kit.reset()
    }
    expect([refused.status, refused.body.code]).toEqual([401, 'SESSION_REQUIRED'])
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    // The release step still runs after the session ended (anySession): the copy is due now, not in three minutes.
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'reserved', due: true })])
  })

  it('a copy whose import image is gone by then keeps nothing and is refused as expired', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    // The import image was deleted between the reservation and the copy, so the copy reads nothing.
    kit.hooks.get = async (key, real) => (key.startsWith('import_image/') ? null : real())
    const writes = kit.receiptWrites()
    let refused: Reply
    try {
      refused = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    } finally {
      kit.reset()
    }
    expect([refused.status, refused.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(kit.receiptWrites() - writes).toBe(0)
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    // Its reservation was given back at once.
    const rows = await receiptRows(user)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.status === 'reserved' && row.due)).toBe(true)
  })

  it('a retain whose copy outlived its own reservation is refused as expired, even when a failed delete moved its deadline on', async () => {
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const t0 = Date.now()
    await setVaultClock(user, t0)
    const copy = preparedOf(await stepCall(user, 'attachments.prepare', { attachment_id: image.attachmentId, command_id: randomUUID() }))
    await env.OBJECTS.put(copy.key, image.bytes)
    // The copy's three minutes are over, and a failed R2 delete moved its deadline a minute on (1B-T4), so publishObject alone would still take it.
    await vaultExec(user, 'UPDATE vault_objects SET delete_after = ? WHERE key = ?', t0 + RECEIPT_COPY_GRACE_MS + MIN, copy.key)
    await setVaultClock(user, t0 + RECEIPT_COPY_GRACE_MS)
    const late = await retainStep(user, records[0], image.attachmentId, { key: copy.key, bytes: copy.bytes, sha256: copy.sha256 })
    expect(late).toMatchObject({ ok: false, status: 422, problem: { messageKey: 'errors.attachment_expired' } })
    expect(await attachmentOf(user, image.attachmentId)).toBeUndefined()
    expect(await vaultRows(user, 'SELECT status FROM vault_objects WHERE key = ?', copy.key)).toEqual([{ status: 'reserved' }])
  })
})

// ===========================================================================
// The 1B-T9 review's pins (brief download-pins). Each is the review's probe,
// adapted to this file's helpers; its label is in a comment.
// ===========================================================================

/** The VAULT binding, with the kind of every prepare step's reply recorded in `kinds` (the review's observedVault). */
function preparesSeen(kinds: string[]): DurableObjectNamespace<UserVault> {
  const real = env.VAULT
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return (id: DurableObjectId, options?: unknown) => {
          const stub = (target.get as (...args: unknown[]) => DurableObjectStub<UserVault>)(id, options)
          return new Proxy(stub, {
            get(s, p) {
              if (p === 'call') {
                return async (call: VaultCall) => {
                  const reply = await s.call(call)
                  if (call.route === 'attachments.prepare') kinds.push(reply.ok ? (reply.body as { kind: string }).kind : String(reply.status))
                  return reply
                }
              }
              // A vault route's call (1D-T11), forwarded unbound: on an RPC stub `.bind` is itself a remote call.
              if (p === 'callWithAnalytics') return (call: VaultCall) => s.callWithAnalytics(call)
              const value = Reflect.get(s, p)
              return typeof value === 'function' ? value.bind(s) : value
            },
          })
        }
      }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as DurableObjectNamespace<UserVault>
}

describe('the 1B-T9 review: prepare checks the session, the policy and the account before it reserves or copies (m-1)', () => {
  it('a signed-out session is refused at the prepare step, and nothing is reserved or copied', async () => {
    // Probe AC-1.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    expect((await kit.v1.as(user).post('/v1/me/logout')).status).toBe(204)
    const res = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    expect([res.status, res.body.code]).toEqual([401, 'SESSION_REQUIRED'])
    expect(await receiptRows(user)).toEqual([])
    expect(kit.receiptWrites()).toBe(0)
  })

  it('a session without the current terms is refused at the prepare step of a retain and a replace, and at a removal, and nothing is reserved or copied', async () => {
    // Probe AC-2: terms v2 is published and required, and the person accepted only v1.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const v2 = { kind: 'terms' as const, version: 2, required: true, published_at: '2026-10-25T00:00:00.000Z', text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } }
    const counted = { writes: 0 }
    const later = await startV1({ policies: [...TEST_POLICIES, v2], client_versions: { ios: '1.0.0', android: '1.0.0' } }, { env: { OBJECTS: hookedBucket({}, counted) } })
    try {
      for (const res of [
        await retain(later, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1),
        await replace(later, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1),
        await remove(later, user, records[0], 1),
      ]) {
        expect([res.status, res.body.code]).toEqual([403, 'POLICY_ACCEPTANCE_REQUIRED'])
      }
      expect(await receiptRows(user)).toEqual([])
      expect(counted.writes).toBe(0)
    } finally {
      // Back to the file's config (terms v1 only) for the cases after this one.
      await setup()
    }
  })

  it('a deleting account refuses retain, replace, remove, the grant and the download without reserving or copying, and the release step still runs', async () => {
    // Probe AC-3.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const other = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    const grant = (await grantOf(kit.v1, user, image.attachmentId)).body as AttachmentGrant
    const before = await receiptRows(user)
    await vaultExec(user, "UPDATE account_state SET status = 'deleting'")
    const answers = [
      await retain(kit.v1, user, records[1], { attachment_id: other.attachmentId, ...CONSENT }, 1),
      await replace(kit.v1, user, records[0], { attachment_id: other.attachmentId, ...CONSENT }, 2),
      await remove(kit.v1, user, records[0], 2),
      await grantOf(kit.v1, user, image.attachmentId),
      await json(await kit.v1.as(user).get(grant.url)),
    ]
    expect(answers.map((a) => [a.status, a.body.code])).toEqual(Array.from({ length: 5 }, () => [403, 'ACCOUNT_UNAVAILABLE']))
    expect(await receiptRows(user)).toEqual(before)
    expect(kit.receiptWrites()).toBe(1)
    // Release gives back only a request's own unused copy, so it runs even now, and changes nothing here.
    expect(await stepCall(user, 'attachments.release', { key: before[0].key })).toMatchObject({ ok: true, status: 200 })
    expect(await receiptRows(user)).toEqual(before)
  })
})

describe('the 1B-T9 review: attachmentsDueAt keeps both of its guards (m-3, R37)', () => {
  it('a stamped release whose object is still live is not due yet; once the object is gone, the row is due 30 days after its release', async () => {
    // Probe DU-1: without "object gone" the alarm would come back at once for a row pruneAttachments cannot drop yet.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    expect((await remove(kit.v1, user, records[0], 2)).status).toBe(200)
    const t0 = Date.now()
    await prune(user, t0)
    const dueAt = () => runInDurableObject(vaultOf(user), (_vault, state) => attachmentsDueAt(fileAt(state, t0)))
    expect(await dueAt()).toBeNull()
    await sweep(user, t0)
    expect(await dueAt()).toBe(t0 + 30 * DAY)
  })

  it('a retained receipt that nothing holds makes attachmentsDueAt now, so the safety net is scheduled', async () => {
    // Probe DU-2: the hold is removed with its release trigger dropped, as a row the trigger missed would look.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await retained(kit, user, records[0], image, 1)
    await runInDurableObject(vaultOf(user), (_vault, state) => {
      state.storage.transactionSync(() => {
        const sql = state.storage.sql
        const trigger = sql.exec<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'transaction_attachments_unheld_delete'").one().sql
        sql.exec('DROP TRIGGER transaction_attachments_unheld_delete')
        sql.exec('DELETE FROM transaction_attachments WHERE transaction_id = ?', records[0])
        sql.exec(trigger)
      })
    })
    const t0 = Date.now()
    expect(await runInDurableObject(vaultOf(user), (_vault, state) => attachmentsDueAt(fileAt(state, t0)))).toBe(t0)
  })
})

describe('the 1B-T9 review: the copy path (n-1 to n-4)', () => {
  it('a request waiting on another copy of the same image gives up at copyDeadlineMs with 503', async () => {
    // Probe CP-1 (n-1): the first copy is held; the second waits, then answers 503 at its deadline (400 ms here).
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit, 2)
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    kit.hooks.get = async (key, real) => {
      if (key.startsWith('import_image/')) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    try {
      const first = retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
      await inside.opened
      const started = Date.now()
      const second = await withLimits({ copyDeadlineMs: 400 }, () => retain(kit.v1, user, records[1], { attachment_id: image.attachmentId, ...CONSENT }, 1))
      expect([second.status, second.body.code, second.body.retry_after_seconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5])
      expect(Date.now() - started).toBeLessThan(3_000)
      hold.open()
      expect((await first).status).toBe(200)
    } finally {
      hold.open()
      kit.reset()
    }
  }, 15_000)

  it('an unknown body field is refused before anything is reserved or copied, as the API controller reads the body', async () => {
    // Probe AC-5 (n-2).
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    const res = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT, prepared: { key: 'x', bytes: 1, sha256: 'ab' } }, 1)
    expect([res.status, res.body.code]).toEqual([422, 'UNKNOWN_FIELD'])
    expect(await receiptRows(user)).toEqual([])
  })

  it('the image of a preview that is no longer ready is not copied, though its image is still published', async () => {
    // Probe CP-2 (n-3): prepare's source query keeps `p.status = 'ready'`.
    const kit = await setup()
    const { user, records } = await memberWithRecords(kit)
    const image = await seedImportImage(user)
    await vaultExec(user, "UPDATE import_previews SET status = 'expired', expired_at = ? WHERE job_id = ?", new Date().toISOString(), image.jobId)
    const res = await retain(kit.v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
    expect([res.status, res.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(await receiptRows(user)).toEqual([])
    expect(kit.receiptWrites()).toBe(0)
  })

  it('a second request for an image whose copy is held only waits, until the first attaches the receipt both then hold', async () => {
    // Probe RB-2 (n-4): `two records retaining one image at once ...` above gives the second request 250 ms to ask;
    // this case waits until the vault has told it `wait` twice, so its poll is exercised on every run.
    const hooks: BucketHooks = {}
    const counted = { writes: 0 }
    const prepares: string[] = []
    const v1 = await startV1(undefined, { env: { OBJECTS: hookedBucket(hooks, counted), VAULT: preparesSeen(prepares) } })
    const money = moneyFixtures(v1)
    const user = await money.member()
    const wallet = await money.wallet(user)
    const records: string[] = []
    for (let i = 0; i < 2; i += 1) records.push(await money.record(user, { type: 'expense', amount_minor: String(6500 + i), occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food') }))
    const image = await seedImportImage(user)
    const hold = gate()
    const inside = gate()
    let heads = 0
    hooks.head = async (key, real) => {
      if (key.startsWith('receipt/') && (heads += 1) === 1) {
        inside.open()
        await hold.opened
      }
      return real()
    }
    try {
      const first = retain(v1, user, records[0], { attachment_id: image.attachmentId, ...CONSENT }, 1)
      await inside.opened
      const second = retain(v1, user, records[1], { attachment_id: image.attachmentId, ...CONSENT }, 1)
      for (let i = 0; i < 200 && prepares.filter((kind) => kind === 'wait').length < 2; i += 1) await delay(10)
      expect(prepares.filter((kind) => kind === 'wait').length).toBeGreaterThanOrEqual(2)
      expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'reserved', due: false })])
      hold.open()
      expect([(await first).status, (await second).status]).toEqual([200, 200])
    } finally {
      hold.open()
    }
    expect(counted.writes).toBe(1)
    expect([prepares[0], prepares[prepares.length - 1]]).toEqual(['copy', 'none'])
    expect(await receiptRows(user)).toEqual([expect.objectContaining({ status: 'published', forever: true })])
    expect(await vaultRows(user, 'SELECT id FROM attachments')).toHaveLength(1)
    expect(await heldBy(user, image.attachmentId)).toEqual([...records].sort())
  })
})
