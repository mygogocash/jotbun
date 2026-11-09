// Helpers for the files tests. 1B-T5, T8, T9 and T10 add their upload,
// seeding, fake-parser and ten-times-ledger helpers below TINY_JPEG.
import { env } from 'cloudflare:workers'
import { createExecutionContext, createMessageBatch, getQueueResult, runInDurableObject } from 'cloudflare:test'
import { createHash, randomUUID } from 'node:crypto'

import { previewFromOutcome, toPreviewRecord } from '@api/imports/parse-outcome'
import type { CandidateRecord, PreviewRecord } from '@api/imports/parse-outcome'
import type { ParseServiceReply } from '@api/imports/parse-server'
import type { ParserRunOutcome } from '@api/imports/parser-runner'
import type { ParseFormat, ParsedRow } from '@api/imports/parsers/protocol'
import { changeGroupBytes } from '@api/sync/change-writer'

import type { ParseMessage, ParserPort } from '../../../src/background/parse-consumer'
import type { FileContext } from '../../../src/vault/files/context'
import type { VaultBucket } from '../../../src/vault/files/keys'
import type { ParsedPreview } from '../../../src/vault/files/parse'
import type { UserVault } from '../../../src/vault/user-vault'
import { vaultOf } from './v1-client'
import type { TestUser, V1Client } from './v1-client'

/**
 * A valid 1×1 baseline greyscale JPEG (159 bytes, made with libjpeg's
 * `cjpeg -baseline -optimize`): SOI, the JFIF APP0, DQT, SOF0, two DHT, SOS,
 * one byte of scan data and EOI. It carries no other APPn segment, so the
 * parser's metadata rules accept it as a sanitized image.
 */
export const TINY_JPEG: Uint8Array = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x3f, 0xff, 0xd9,
])

// ---------------------------------------------------------------------------
// 1B-T5: uploads and the parse pipeline
// ---------------------------------------------------------------------------

export const MiB = 1024 * 1024
export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** The parser child's memory budget (PARSER_CHILD_MEMORY_MIB, 512 MiB), in KB; parser-runner.ts itself cannot load in workerd. */
export const PARSER_MEMORY_BUDGET_KB = 512 * 1024

/** The vault's id for this person: the second segment of every object key (B1). */
export const vaultIdOf = (user: TestUser): string => env.VAULT.idFromName(user.sub).toString()

/** A background method's view of this vault at `ms`, as UserVault#fileContext builds it with the clock given. */
export const fileAt = (state: DurableObjectState, ms: number): FileContext => ({ sql: state.storage.sql, storage: state.storage, now: new Date(ms), vaultId: state.id.toString() })

/** Rows of one SQL read in the person's vault. */
export function vaultRows<T = Record<string, unknown>>(user: TestUser, query: string, ...bindings: unknown[]): Promise<T[]> {
  return runInDurableObject(vaultOf(user), (_vault, state) => state.storage.sql.exec<T>(query, ...bindings).toArray())
}

/** One statement in the person's vault. */
export async function vaultExec(user: TestUser, query: string, ...bindings: unknown[]): Promise<void> {
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.sql.exec(query, ...bindings).toArray()
  })
}

/** Sets the vault's clock to `ms` (a fixed instant), or back to the real clock with null. */
export async function setVaultClock(user: TestUser, ms: number | null): Promise<void> {
  await runInDurableObject(vaultOf(user), (vault: UserVault) => {
    vault.clock = ms === null ? () => new Date() : () => new Date(ms)
  })
}

/** Every key in R2 under `prefix`, sorted. */
export async function storedKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.OBJECTS.list({ prefix, ...(cursor ? { cursor } : {}) })
    keys.push(...page.objects.map((object) => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys.sort()
}

/** The person's quarantined objects in R2. */
export const quarantined = (user: TestUser, jobId = ''): Promise<string[]> => storedKeys(`import_quarantine/${vaultIdOf(user)}/${jobId ? `${jobId}/` : ''}`)
/** The person's sanitized import images in R2. */
export const imagesOf = (user: TestUser, jobId = ''): Promise<string[]> => storedKeys(`import_image/${vaultIdOf(user)}/${jobId ? `${jobId}/` : ''}`)

/** The quarantine keys the vault still holds as reserved or published. */
export const liveRegistry = (user: TestUser) =>
  vaultRows<{ key: string; status: string }>(user, "SELECT key, status FROM vault_objects WHERE purpose = 'import_quarantine' AND status IN ('reserved', 'published') ORDER BY key")

/** The person's upload rows with a parse state: the vault's import_parse jobs. */
export const parseJobs = (user: TestUser) => vaultRows<{ job_id: string; parse_state: string }>(user, 'SELECT job_id, parse_state FROM import_uploads WHERE parse_state IS NOT NULL ORDER BY created_at')

/** One upload's row. */
export async function uploadRowOf(user: TestUser, jobId: string): Promise<Record<string, unknown>> {
  const [row] = await vaultRows(user, 'SELECT * FROM import_uploads WHERE job_id = ?', jobId)
  return row
}

export type UploadOptions = {
  type?: string
  name?: string
  /** Sent as is (already percent-encoded, or deliberately malformed). */
  rawName?: string
  key?: string
  /** Send no content-length (a chunked body). */
  chunked?: boolean
  /** A content-length to declare instead of the real one. */
  declaredLength?: number
}

export type Reply = { status: number; body: Record<string, any>; headers: Headers }

/**
 * POST /v1/imports through UserClient.request, with the content type (text/csv
 * by default), the percent-encoded file name, an idempotency key and, for a
 * byte body, its content-length.
 */
export async function upload(client: V1Client, user: TestUser, body: Uint8Array | ReadableStream<Uint8Array>, opts: UploadOptions = {}): Promise<Reply> {
  const headers: Record<string, string> = {
    'content-type': opts.type ?? 'text/csv',
    'x-gogospend-file-name': opts.rawName ?? encodeURIComponent(opts.name ?? 'statement.csv'),
    'idempotency-key': opts.key ?? randomUUID(),
  }
  if (opts.declaredLength !== undefined) headers['content-length'] = String(opts.declaredLength)
  else if (body instanceof Uint8Array && !opts.chunked) headers['content-length'] = String(body.byteLength)
  const res = await client.as(user).request('POST', '/v1/imports', { body: body as BodyInit, headers })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : {}, headers: res.headers }
}

/** A request body that yields what `source` yields; `onCancel` runs when the reader gives up on it. */
export function streamOf(source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, onCancel?: () => void): ReadableStream<Uint8Array> {
  const iterator = Symbol.asyncIterator in source ? (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]() : (source as Iterable<Uint8Array>)[Symbol.iterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      onCancel?.()
    },
  })
}

/** `total` bytes of `body` in 64 KiB pieces. */
export function* pieces(body: Uint8Array, size = 64 * 1024): Iterable<Uint8Array> {
  for (let at = 0; at < body.length; at += size) yield body.subarray(at, at + size)
}

/** A promise the test opens. */
export function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

/** Yields `body` in 64 KiB pieces, and once `pauseAfter` bytes went out, waits for `then` before the rest. */
export function pausedBody(body: Uint8Array, pauseAfter: number, then: () => Promise<void>): ReadableStream<Uint8Array> {
  return streamOf(
    (async function* () {
      let sent = 0
      let paused = false
      for (const piece of pieces(body)) {
        yield piece
        sent += piece.length
        if (!paused && sent >= pauseAfter) {
          paused = true
          await then()
        }
      }
    })(),
  )
}

/** `head` now, then `rest` once released: a body that stalls. */
export function stalledBody(head: Uint8Array, rest: Uint8Array, released: Promise<void>): ReadableStream<Uint8Array> {
  return streamOf(
    (async function* () {
      yield head
      await released
      yield rest
    })(),
  )
}

/** Polls `read` until `ok` holds or 5 seconds pass. */
export async function eventually<T>(read: () => Promise<T>, ok: (value: T) => boolean, ms = 5_000): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const value = await read()
    if (ok(value) || Date.now() > until) return value
    await new Promise((done) => setTimeout(done, 20))
  }
}

/** Synthetic CSV text of exactly `bytes` bytes. */
export function csvText(bytes: number): Uint8Array {
  const line = new TextEncoder().encode('2026-03-01,expense,food,65.00,synthetic coffee\n')
  const out = new Uint8Array(bytes)
  for (let at = 0; at < bytes; at += line.length) out.set(line.subarray(0, Math.min(line.length, bytes - at)), at)
  return out
}

/**
 * A header plus `count` synthetic expense rows: csvRows of
 * @api/imports/fixtures/synthetic-parse, which cannot load in workerd (it imports sharp).
 */
export function csvRows(count: number, header = 'date,type,category,amount,note,wallet'): Uint8Array {
  const lines = [header]
  for (let i = 0; i < count; i += 1) lines.push(`2026-01-${String((i % 28) + 1).padStart(2, '0')},expense,food,${(i % 900) + 1}.25,row ${i + 1},Cash`)
  return new TextEncoder().encode(`${lines.join('\n')}\n`)
}

/** Accepted uploads `minutesAgo`, straight into the vault (quota fixtures), parsed and named seed.csv. */
export async function seedAccepted(user: TestUser, rows: { bytes: number; minutesAgo: number }[]): Promise<void> {
  const now = Date.now()
  for (const row of rows) {
    const at = now - row.minutesAgo * MIN
    await vaultExec(
      user,
      `INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, format, bytes, sha256, part_count, parse_state, created_at, receive_deadline, accepted_at, expires_at)
       VALUES (?, ?, 'accepted', 'seed.csv', 'text/csv', 'csv', ?, ?, ?, 'parsed', ?, ?, ?, ?)`,
      randomUUID(),
      randomUUID(),
      row.bytes,
      'ab'.repeat(32),
      Math.max(1, Math.ceil(row.bytes / MiB)),
      new Date(at).toISOString(),
      new Date(at + 10 * MIN).toISOString(),
      new Date(at + MIN).toISOString(),
      new Date(at + MIN + DAY).toISOString(),
    )
  }
}

const shifted = (column: string) => `${column} = strftime('%Y-%m-%dT%H:%M:%fZ', ${column}, ?1)`

/** Moves an upload's times `minutes` into the past. */
export async function ageUpload(user: TestUser, jobId: string, minutes: number): Promise<void> {
  await vaultExec(
    user,
    `UPDATE import_uploads SET ${['created_at', 'receive_deadline', 'accepted_at', 'expires_at'].map(shifted).join(', ')} WHERE job_id = ?2`,
    `-${minutes} minutes`,
    jobId,
  )
}

/** Moves the seeded uploads (seed.csv) `hours` into the past, so their quota window moves on. */
export async function ageSeeds(user: TestUser, hours: number): Promise<void> {
  await vaultExec(user, `UPDATE import_uploads SET ${['created_at', 'receive_deadline', 'accepted_at', 'expires_at'].map(shifted).join(', ')} WHERE file_name = 'seed.csv'`, `-${hours * 60} minutes`)
}

/** The bucket, with a hook after each PUT and around each GET (a spy for the Worker or the consumer). */
export function spyBucket(hooks: { afterPut?: (key: string, bytes: number) => Promise<void> | void; beforePut?: (key: string) => Promise<void> | void; onGet?: (key: string) => void }): VaultBucket {
  const bucket = env.OBJECTS
  return {
    put: async (key, value, options) => {
      await hooks.beforePut?.(key)
      const stored = await bucket.put(key, value, options)
      await hooks.afterPut?.(key, value === null ? 0 : value.byteLength)
      return stored
    },
    head: (key) => bucket.head(key),
    get: (key) => {
      hooks.onGet?.(key)
      return bucket.get(key)
    },
    delete: (keys) => bucket.delete(keys),
    list: (options) => bucket.list(options),
  }
}

/** One parse message for this person's import, as the vault's starter sends it, with its retry delays recorded. */
export function parseBatch(user: TestUser, jobId: string, attempts = 1): MessageBatch<ParseMessage> {
  const batch = createMessageBatch<ParseMessage>('jotbun-statement-parse', [{ id: randomUUID(), timestamp: new Date(), attempts, body: { vault: vaultIdOf(user), job: jobId } }])
  const delays: (number | undefined)[] = []
  for (const message of batch.messages) {
    const retry = message.retry.bind(message)
    // getQueueResult (vitest-plugin 1.4.7) records a retry but not its delay, so the delay is kept here.
    message.retry = (options) => {
      delays.push(options?.delaySeconds)
      retry(options)
    }
  }
  retryDelays.set(batch, delays)
  return batch
}

const retryDelays = new WeakMap<object, (number | undefined)[]>()

/** What happened to a one-message batch: acknowledged, or retried with its delay. */
export async function outcomeOf(batch: MessageBatch<ParseMessage>): Promise<{ acked: boolean; retried: boolean; delaySeconds: number | null }> {
  const result = await getQueueResult(batch, createExecutionContext())
  const delays = retryDelays.get(batch) ?? []
  return { acked: result.explicitAcks.length === 1, retried: result.retryMessages.length === 1, delaySeconds: delays.at(-1) ?? null }
}

/** A parser that answers `replies` in turn (the last one again once they run out), counting its calls. */
export function fakeParser(replies: ParseServiceReply | ParseServiceReply[] | ((input: { format: ParseFormat; today: string; bytes: Uint8Array }) => Promise<ParseServiceReply>)) {
  const calls: { format: ParseFormat; today: string; bytes: number }[] = []
  const list = Array.isArray(replies) ? replies : null
  const parser: ParserPort = {
    async parse(input) {
      calls.push({ format: input.format, today: input.today, bytes: input.bytes.byteLength })
      if (typeof replies === 'function') return replies(input)
      if (list) return list[Math.min(calls.length, list.length) - 1]
      return replies as ParseServiceReply
    },
  }
  return { parser, calls }
}

/** What the parse server answers for these rows of a table file (through toPreviewRecord). */
export function parsedCsv(rows: ParsedRow[], options: { layout?: 'generic' | 'meowjot'; today?: string } = {}): ParseServiceReply {
  const record = toPreviewRecord({ ok: true, layout: options.layout ?? 'generic', rows, file_issues: [], image: null, header_fingerprint: null, usage: { max_rss_kb: 1024, cpu_ms: 5 } }, options.today ?? '2026-12-31')
  return { kind: 'parsed', record, image: null }
}

/** What the parse server answers for a parser run's outcome (previewFromOutcome), as the server's own tests pin it. */
export function serverReply(format: ParseFormat, outcome: ParserRunOutcome, today = '2026-12-31'): ParseServiceReply {
  const decided = previewFromOutcome(format, outcome, PARSER_MEMORY_BUDGET_KB, today)
  if (decided.kind === 'retry') return { kind: 'retry', code: decided.code }
  if (decided.kind !== 'record') throw new Error('an aborted parse has no reply')
  const image = decided.image
  const size = decided.record.preview.image
  return { kind: 'parsed', record: decided.record, image: image && size ? { format: image.format, width: size.width, height: size.height, base64: image.bytes.toString('base64') } : null }
}

/** A receipt photo's reply: the sanitized image (claimed `width` × `height`) and its one review-only row. */
export function receiptReply(image: Uint8Array, width = 1, height = 1): ParseServiceReply {
  const base64 = Buffer.from(image).toString('base64')
  const record = toPreviewRecord(
    {
      ok: true,
      layout: 'receipt',
      file_issues: ['receipt_fields_unread'],
      header_fingerprint: null,
      usage: { max_rss_kb: 1024, cpu_ms: 5 },
      image: { format: 'jpeg', width, height, base64 },
      rows: [
        {
          source_row_id: 'image:1', occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null,
          issues: [{ field: 'occurred_on', code: 'missing_date' }, { field: 'type', code: 'missing_type' }, { field: 'amount_minor', code: 'missing_amount' }, { field: 'wallet_label', code: 'missing_wallet' }],
        },
      ],
    },
    '2026-12-31',
  )
  return { kind: 'parsed', record, image: { format: 'jpeg', width, height, base64 } }
}

/** TINY_JPEG with an EXIF (APP1) segment after its SOI: metadata the parser should have removed. */
export const JPEG_WITH_EXIF: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, ...TINY_JPEG.subarray(2)])

/** Six synthetic statement rows (the API's MEOWJOT sample has six). */
export const SIX_ROWS: ParsedRow[] = Array.from({ length: 6 }, (_, i) => ({
  source_row_id: `row:${i + 2}`,
  occurred_on: `2026-01-0${i + 1}`,
  type: i % 3 === 2 ? 'income' : 'expense',
  amount_minor: String((i + 1) * 1000 + 50),
  wallet_label: 'กสิกรไทย',
  category_label: 'Food',
  merchant: null,
  note: `synthetic row ${i + 1}`,
  issues: [],
}))

// ---------------------------------------------------------------------------
// 1B-T9: receipt attachments
// ---------------------------------------------------------------------------

/** A valid 1×1 greyscale PNG (67 bytes: the signature, IHDR, one IDAT and IEND). */
export const TINY_PNG: Uint8Array = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
  0x55, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x68, 0x00, 0x00, 0x00,
  0x82, 0x00, 0x81, 0xda, 0x45, 0x08, 0x3b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/** A preview's sanitized image as seedImportImage left it: its ids, its import_image key, and its bytes and SHA-256. */
export type SeededImage = { jobId: string; attachmentId: string; key: string; bytes: Uint8Array; sha256: string; contentType: 'image/jpeg' | 'image/png' }

/**
 * A receipt photo's import as the parse pipeline (1B-T5) leaves it, written
 * straight into the vault: an accepted, parsed `import_uploads` row, a `ready`
 * receipt preview naming its image by a fresh `image_attachment_id`, and the
 * image (TINY_JPEG, or TINY_PNG, or `bytes` as given) stored at its
 * `import_image` key with its SHA-256 and registered `published` for 24 hours
 * (or `expiresInMs`). The preview claims `width` × `height` (1 × 1 by default),
 * as a parser reply does; nothing on the receipt path decodes the image.
 */
export async function seedImportImage(user: TestUser, opts: { expiresInMs?: number; format?: 'jpeg' | 'png'; width?: number; height?: number; bytes?: Uint8Array } = {}): Promise<SeededImage> {
  const png = opts.format === 'png'
  const bytes = opts.bytes ?? (png ? TINY_PNG : TINY_JPEG)
  const contentType = png ? 'image/png' : 'image/jpeg'
  const jobId = randomUUID()
  const attachmentId = randomUUID()
  const key = `import_image/${vaultIdOf(user)}/${jobId}/${randomUUID()}/image.${png ? 'png' : 'jpg'}`
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const now = Date.now()
  const at = (ms: number) => new Date(ms).toISOString()
  await env.OBJECTS.put(key, bytes, { sha256, customMetadata: { sha256 }, httpMetadata: { contentType } })
  await runInDurableObject(vaultOf(user), (_vault, state) => {
    state.storage.transactionSync(() => {
      const sql = state.storage.sql
      sql.exec(
        `INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at)
         VALUES (?, ?, 'accepted', ?, ?, ?, ?, ?, 1, 'parsed', 1, ?, ?, ?, ?)`,
        jobId, randomUUID(), png ? 'receipt.png' : 'receipt.jpg', contentType, png ? 'png' : 'jpeg', bytes.byteLength, sha256, at(now - MIN), at(now + 9 * MIN), at(now - MIN), at(now - MIN + DAY),
      )
      sql.exec(
        `INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, image_key, image_width, image_height, image_attachment_id, review_revision, created_at, expires_at)
         VALUES (?, 'ready', 'receipt', '["receipt_fields_unread"]', 0, 0, ?, ?, ?, ?, 1, ?, ?)`,
        jobId, key, opts.width ?? 1, opts.height ?? 1, attachmentId, at(now), at(now + 7 * DAY),
      )
      sql.exec("INSERT INTO vault_objects (key, purpose, status, delete_after, bytes, sha256, created_at) VALUES (?, 'import_image', 'published', ?, ?, ?, ?)", key, now + (opts.expiresInMs ?? DAY), bytes.byteLength, sha256, now)
    })
  })
  return { jobId, attachmentId, key, bytes, sha256, contentType }
}

// ---------------------------------------------------------------------------
// 1B-T10: import review and confirmation
// ---------------------------------------------------------------------------

/**
 * The job id of an accepted, parsed upload whose preview holds `candidates`,
 * written as the parse pipeline (1B-T5) writes it: an accepted upload row left
 * `parsing` on its first attempt, then the vault's own recordPreview, which
 * stores the preview (revision 1, 7 days, exact totals from the stored
 * candidates) and marks the upload parsed. With `image`, the preview is a
 * receipt photo's: TINY_JPEG is stored at the key reserveImageKey gave, and
 * recordPreview publishes it for 24 hours as the preview's 1 × 1 image under a
 * fresh image_attachment_id. The person must already be a member.
 */
export async function seedPreview(user: TestUser, candidates: CandidateRecord[], opts: { image?: boolean } = {}): Promise<string> {
  const image = opts.image === true
  const jobId = randomUUID()
  const now = Date.now()
  const at = (ms: number) => new Date(ms).toISOString()
  await vaultExec(
    user,
    `INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at)
     VALUES (?, ?, 'accepted', ?, ?, ?, 1024, ?, 1, 'parsing', 1, ?, ?, ?, ?)`,
    jobId, randomUUID(), image ? 'receipt.jpg' : 'statement.csv', image ? 'image/jpeg' : 'text/csv', image ? 'jpeg' : 'csv', 'ab'.repeat(32), at(now - MIN), at(now + 9 * MIN), at(now - MIN), at(now - MIN + DAY),
  )
  let stored: ParsedPreview['image'] = null
  if (image) {
    const key = await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.reserveImageKey(jobId, 'jpeg'))
    if (key === null) throw new Error('seedPreview: no image key was reserved')
    const sha256 = createHash('sha256').update(TINY_JPEG).digest('hex')
    await env.OBJECTS.put(key, TINY_JPEG, { sha256, customMetadata: { sha256 }, httpMetadata: { contentType: 'image/jpeg' } })
    stored = { key, bytes: TINY_JPEG.byteLength, sha256, width: 1, height: 1 }
  }
  const record: PreviewRecord = {
    preview: { status: 'ready', layout: image ? 'receipt' : 'generic', issues: image ? ['receipt_fields_unread'] : [], image: image ? { width: 1, height: 1 } : null, header_fingerprint: null },
    candidates,
  }
  const { recorded } = await runInDurableObject(vaultOf(user), (vault: UserVault) => vault.recordPreview(jobId, { record, image: stored }))
  if (!recorded) throw new Error('seedPreview: the preview was not recorded')
  return jobId
}

// ---------------------------------------------------------------------------
// 1B-T8: resync snapshots and the ten-times ledger
// ---------------------------------------------------------------------------

/** The Thai note and merchant on every seeded record, so every record's line holds multi-byte UTF-8 (B14). */
const LEDGER_NOTE = 'ข้าวมันไก่ต้มกับน้ำซุปร้อน มื้อกลางวันที่ร้านประจำ'
const LEDGER_MERCHANT = 'ร้านข้าวมันไก่ประตูน้ำ'

/**
 * A writer of records straight into a vault's SQL, as its commands leave them:
 * it first adds one wallet and one expense category, then `write(count)` adds
 * expense records with LEDGER_NOTE and LEDGER_MERCHANT across ten years, in
 * one transactionSync per call. Every entity gets its row, its change row (a
 * DTO its sync validator accepts, with the group's stored size) and its head,
 * under a revision of its own, as the triggers require.
 */
function ledgerWriter(state: DurableObjectState) {
  const sql = state.storage.sql
  const at = new Date().toISOString()
  const commit = (entity: string, id: string, snapshot: Record<string, unknown>) => {
    sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1')
    const commandId = randomUUID()
    sql.exec(
      `INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
       VALUES ((SELECT revision FROM sync_state WHERE id = 1), 0, ?, ?, ?, 1, 'active', ?, ?, ?)`,
      commandId, entity, id, JSON.stringify(snapshot), at, changeGroupBytes(commandId, [{ entity, id, version: 1, state: 'active', snapshot }]),
    )
    sql.exec("INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, 1, 'active', (SELECT revision FROM sync_state WHERE id = 1))", entity, id)
  }
  const wallet = randomUUID()
  const category = randomUUID()
  state.storage.transactionSync(() => {
    sql.exec("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'บัญชีออมทรัพย์', 'THB', 0, '2016-01-01', 0, 1, ?, ?)", wallet, at, at)
    commit('wallet', wallet, { id: wallet, name: 'บัญชีออมทรัพย์', currency: 'THB', opening_minor: '0', tracking_start: '2016-01-01', archived: false, version: 1 })
    sql.exec("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'อาหารกลางวัน', NULL, 0, 1, ?, ?)", category, at, at)
    commit('category', category, { id: category, type: 'expense', builtin_key: null, label: 'อาหารกลางวัน', color: null, archived: false, version: 1 })
  })
  let records = 0
  return {
    wallet,
    category,
    get records() {
      return records
    },
    write(count: number): string[] {
      const ids: string[] = []
      state.storage.transactionSync(() => {
        for (let i = 0; i < count; i += 1) {
          const id = randomUUID()
          const amount = String(1000 + (records % 99_000))
          const occurredOn = new Date(Date.UTC(2016, 0, 1) + (records % 3650) * DAY).toISOString().slice(0, 10)
          sql.exec(
            "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, version, created_at, updated_at) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            id, Number(amount), occurredOn, wallet, category, LEDGER_NOTE, LEDGER_MERCHANT, at, at,
          )
          commit('transaction', id, { id, amount_minor: amount, occurred_on: occurredOn, note: LEDGER_NOTE, merchant: LEDGER_MERCHANT, deleted_at: null, version: 1, type: 'expense', wallet_id: wallet, category_id: category })
          ids.push(id)
          records += 1
        }
      })
      return ids
    },
  }
}

/**
 * Ten times the yearly ledger (owner answer 4, B14): writes the person's vault
 * as ledgerWriter does, 1,000 records per transactionSync, until its SQLite
 * file holds at least `targetBytes` (ctx.storage.sql.databaseSize). The person
 * must already be a member. Returns how many records it wrote.
 */
export async function seedLedger(user: TestUser, targetBytes: number): Promise<{ records: number }> {
  return runInDurableObject(vaultOf(user), (_vault, state) => {
    const ledger = ledgerWriter(state)
    while (state.storage.sql.databaseSize < targetBytes) ledger.write(1000)
    return { records: ledger.records }
  })
}

/** `count` records in a new wallet and category, written as seedLedger writes them, in one transactionSync. Returns their ids in order. */
export async function seedRecords(user: TestUser, count: number): Promise<{ wallet: string; category: string; ids: string[] }> {
  return runInDurableObject(vaultOf(user), (_vault, state) => {
    const ledger = ledgerWriter(state)
    return { wallet: ledger.wallet, category: ledger.category, ids: ledger.write(count) }
  })
}
