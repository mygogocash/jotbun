// The parse pipeline (1B-T5, B6): the queue consumer, the vault's parse
// methods and the stateless parser behind them. The Workers runtime has no
// container, so a fake parser answers what the parse server answers for each
// outcome (previewFromOutcome); the outcomes themselves are 1B-T1's server
// tests and the API's parser tests. Ports 17 cases of
// apps/api/src/imports/import-preview.integration.spec.ts (1B-T10 takes the
// other 21); the preview route is 1B-T10's, so stored rows are read here.
import { env } from 'cloudflare:workers'
import { createExecutionContext, createMessageBatch, getQueueResult, runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { isUuid } from '@gogospend/contracts'
import type { ImportJobDto } from '@gogospend/contracts'

import { FeatureGates } from '@api/common/feature-gates'
import { SYNTHETIC } from '@api/imports/fixtures/synthetic-uploads'
import { sanitizedImageHeader } from '@api/imports/parse-outcome'
import type { ParseServiceReply } from '@api/imports/parse-server'
import type { ParserRunOutcome } from '@api/imports/parser-runner'

import { PARSE_RETRY_SECONDS, handleParseBatch } from '../../src/background/parse-consumer'
import type { ParseMessage, ParserPort } from '../../src/background/parse-consumer'
import { isParseServiceReply } from '../../src/background/statement-parser'
import worker from '../../src/roles/vault'
import type { EdgeConfigJson } from '../../src/v1/config'
import type { V1Env } from '../../src/v1/env'
import { deleteDueObjects, dueObjectKeys } from '../../src/vault/files/objects'
import { PARSE_MAX_ATTEMPTS, failParse, parseSource, reserveImageKey } from '../../src/vault/files/parse'
import { PARSE_STARTER } from '../../src/vault/files/work'
import type { UserVault } from '../../src/vault/user-vault'
import {
  DAY,
  HOUR,
  JPEG_WITH_EXIF,
  MIN,
  TINY_JPEG,
  XLSX_TYPE,
  ageUpload,
  csvRows,
  fakeParser,
  fileAt,
  imagesOf,
  outcomeOf,
  parseBatch,
  parsedCsv,
  quarantined,
  receiptReply,
  serverReply,
  setVaultClock,
  SIX_ROWS,
  spyBucket,
  upload,
  vaultExec,
  vaultIdOf,
  vaultRows,
} from './support/files'
import { moneyFixtures } from './support/money-fixtures'
import { TEST_POLICIES, member, startV1, vaultOf } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

const ON = { IMPORT_UPLOADS_ENABLED: 'true' }
const OPEN: EdgeConfigJson = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }
/** config:v1 with these scopes paused: background code reads it through readGates. */
const pausing = (paused: ('ocr' | 'jobs' | 'imports')[], retry?: number): EdgeConfigJson => ({ ...OPEN, gates: { paused, ...(retry ? { retry_after_seconds: retry } : {}) } })

const client = (config: EdgeConfigJson = OPEN) => startV1(config, { env: ON, startWork: 'manual' })

/** Uploads `body` and answers the accepted import's id. */
async function accept(v1: V1Client, user: TestUser, body: Uint8Array, opts: { name?: string; type?: string } = {}): Promise<string> {
  const reply = await upload(v1, user, body, opts)
  expect(reply.status).toBe(202)
  return (reply.body as ImportJobDto).job_id
}

const acceptImage = (v1: V1Client, user: TestUser, image: Uint8Array = TINY_JPEG) => accept(v1, user, image, { name: 'receipt.jpg', type: 'image/jpeg' })

/** The Worker's env with `extra` in front (bindings kept). */
function consumerEnv(extra: Partial<V1Env>): V1Env {
  return new Proxy(env, { get: (target, prop, receiver) => (typeof prop === 'string' && prop in extra ? extra[prop as keyof V1Env] : Reflect.get(target, prop, receiver)) }) as V1Env
}

/** One delivery of the import's message to the consumer. */
async function deliver(user: TestUser, jobId: string, parser: ParserPort, opts: { gates?: FeatureGates; env?: Partial<V1Env>; attempts?: number } = {}) {
  const batch = parseBatch(user, jobId, opts.attempts ?? 1)
  await handleParseBatch(batch, opts.env ? consumerEnv(opts.env) : env, { parser, ...(opts.gates ? { gates: async () => opts.gates as FeatureGates } : {}) })
  return outcomeOf(batch)
}

const jobOf = async (user: TestUser, jobId: string) =>
  (await vaultRows<{ parse_state: string; parse_attempts: number; parse_failure: string | null }>(user, 'SELECT parse_state, parse_attempts, parse_failure FROM import_uploads WHERE job_id = ?', jobId))[0]

const previewOf = async (user: TestUser, jobId: string): Promise<Record<string, unknown> | undefined> =>
  (
    await vaultRows<Record<string, unknown>>(
      user,
      `SELECT status, layout, issues, candidate_count, review_required_count, CAST(expense_total_minor AS TEXT) AS expense, CAST(income_total_minor AS TEXT) AS income,
              CAST(transfer_total_minor AS TEXT) AS transfer, image_key, image_width, image_height, image_attachment_id, review_revision, created_at, expires_at
         FROM import_previews WHERE job_id = ?`,
      jobId,
    )
  )[0]

const candidatesOf = (user: TestUser, jobId: string) =>
  vaultRows<Record<string, unknown>>(
    user,
    `SELECT source_row_id, ordinal, occurred_on, type, CAST(amount_minor AS TEXT) AS amount_minor, wallet_label, category_label, merchant, note, issues, review_required
       FROM import_candidates WHERE job_id = ? ORDER BY ordinal`,
    jobId,
  )

const countOf = async (user: TestUser, table: string) => (await vaultRows<{ n: number }>(user, `SELECT count(*) AS n FROM ${table}`))[0].n
const statusOf = async (v1: V1Client, user: TestUser, jobId: string) => ((await (await v1.as(user).get(`/v1/imports/${jobId}`)).json()) as ImportJobDto).status

const NOT_STARTED: ParseServiceReply = { kind: 'retry', code: 'not_started' }
const UNAVAILABLE: ParseServiceReply = { kind: 'retry', code: 'parser_unavailable' }
const ONE_ROW = parsedCsv([{ source_row_id: 'row:2', occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: null, merchant: null, note: null, issues: [] }])

describe('a parsed upload becomes a reviewable preview and nothing else', () => {
  it('parsing_has_no_financial_side_effect', async () => {
    const v1 = await client()
    const money = moneyFixtures(v1)
    const user = await money.member()
    await money.wallet(user, { name: 'กสิกรไทย', tracking_start: '2025-01-01' })
    const counts = async () => ({
      transactions: await countOf(user, 'transactions'),
      wallets: await countOf(user, 'wallets'),
      categories: await countOf(user, 'categories'),
      changes: await countOf(user, 'entity_changes'),
      receipts: await countOf(user, 'command_receipts'),
    })
    const before = await counts()
    const jobId = await accept(v1, user, csvRows(6), { name: 'meowjot.csv' })
    // The vault bounds a parse to three attempts (the API's import_parse max_attempts).
    expect(PARSE_MAX_ATTEMPTS).toBe(3)
    expect(await deliver(user, jobId, fakeParser(parsedCsv(SIX_ROWS, { layout: 'meowjot' })).parser)).toMatchObject({ acked: true, retried: false })
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
    expect(await counts()).toEqual(before)
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'ready' })
    expect(await countOf(user, 'import_candidates')).toBe(6)
  })
})

describe('rejected files leave nothing to confirm', () => {
  it('a workbook with a formula is rejected as a whole: no candidate, image or transaction', async () => {
    const v1 = await client()
    const user = await member(v1)
    const before = await countOf(user, 'transactions')
    const jobId = await accept(v1, user, SYNTHETIC.xlsx, { name: 'book.xlsx', type: XLSX_TYPE })
    const formulas = serverReply('xlsx', { kind: 'result', result: { ok: false, code: 'formulas', usage: { max_rss_kb: 1024, cpu_ms: 5 } } })
    expect(await deliver(user, jobId, fakeParser(formulas).parser)).toMatchObject({ acked: true })
    expect(await previewOf(user, jobId)).toMatchObject({
      status: 'rejected', layout: null, issues: '["formulas"]', candidate_count: 0, review_required_count: 0, expense: '0', income: '0', transfer: '0', image_key: null, review_revision: 1,
    })
    expect(await candidatesOf(user, jobId)).toEqual([])
    expect(await imagesOf(user)).toEqual([])
    expect(await countOf(user, 'transactions')).toBe(before)
  })

  it('a valid workbook parses through the same path', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, SYNTHETIC.xlsx, { name: 'book.xlsx', type: XLSX_TYPE })
    // What the parse server answers for the API's XLSX_STATEMENT_ROWS.
    const rows = parsedCsv([
      { source_row_id: 'row:2', occurred_on: '2025-01-01', type: 'expense', amount_minor: '12050', wallet_label: 'เงินสด', category_label: 'อาหาร', merchant: null, note: 'ข้าวสังเคราะห์', issues: [] },
      { source_row_id: 'row:3', occurred_on: '2024-02-29', type: 'income', amount_minor: '1500000', wallet_label: 'ธนาคารสังเคราะห์', category_label: 'เงินเดือน', merchant: null, note: 'synthetic pay', issues: [] },
      { source_row_id: 'row:4', occurred_on: '2026-03-03', type: 'expense', amount_minor: '4250', wallet_label: 'เงินสด', category_label: 'เดินทาง', merchant: null, note: null, issues: [] },
    ])
    await deliver(user, jobId, fakeParser(rows).parser)
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'ready' })
    expect((await candidatesOf(user, jobId)).map((row) => [row.occurred_on, row.type, row.amount_minor])).toEqual([
      ['2025-01-01', 'expense', '12050'],
      ['2024-02-29', 'income', '1500000'],
      ['2026-03-03', 'expense', '4250'],
    ])
  })

  it.each<[string, ParserRunOutcome, string]>([
    ['a child killed at its 30-second deadline', { kind: 'timeout' }, 'parse_timeout'],
    ['a crashed child', { kind: 'crashed' }, 'parse_failed'],
    ['output that is not the protocol', { kind: 'output_invalid' }, 'parse_failed'],
    ['output over its cap', { kind: 'output_too_large' }, 'parse_resource_limit'],
    [
      'a parse that exceeded the 512 MiB budget',
      { kind: 'result', result: { ok: true, layout: 'generic', rows: [], file_issues: [], image: null, header_fingerprint: null, usage: { max_rss_kb: 600 * 1024, cpu_ms: 10 } } },
      'parse_resource_limit',
    ],
  ])('%s fails visibly as a rejected preview, never with guessed fields', async (_label, outcome, code) => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    expect(await deliver(user, jobId, fakeParser(serverReply('csv', outcome)).parser)).toMatchObject({ acked: true })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', issues: JSON.stringify([code]), candidate_count: 0 })
    expect(await countOf(user, 'import_candidates')).toBe(0)
  })

  it('a quarantined part that does not match its registered digest is never parsed', async () => {
    const v1 = await client()
    const user = await member(v1)
    const body = csvRows(6)
    const jobId = await accept(v1, user, body)
    const [key] = await quarantined(user, jobId)
    const altered = body.slice()
    altered[altered.length - 3] = altered[altered.length - 3] === 0x31 ? 0x32 : 0x31
    await env.OBJECTS.delete(key)
    await env.OBJECTS.put(key, altered)
    const spy = fakeParser(ONE_ROW)
    expect(await deliver(user, jobId, spy.parser)).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'failed', parse_failure: 'quarantine_corrupt' })
    expect(spy.calls).toHaveLength(0)
    expect(await statusOf(v1, user, jobId)).toBe('failed')
    expect(await countOf(user, 'import_previews')).toBe(0)
  })

  it('a part whose registered digest disagrees with the stored object is never parsed', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    // The object is intact (the whole-file digest still matches); only the registry's per-part digest differs.
    await vaultExec(user, "UPDATE vault_objects SET sha256 = ? WHERE purpose = 'import_quarantine'", '0'.repeat(64))
    const spy = fakeParser(ONE_ROW)
    expect(await deliver(user, jobId, spy.parser)).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'failed', parse_failure: 'quarantine_corrupt' })
    expect(spy.calls).toHaveLength(0)
  })

  it('a raw file past its 24-hour expiry is not read, even if its parse job is still queued', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    await ageUpload(user, jobId, 25 * 60)
    let reads = 0
    expect(await deliver(user, jobId, fakeParser(ONE_ROW).parser, { env: { OBJECTS: spyBucket({ onGet: () => void (reads += 1) }) } })).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'failed', parse_failure: 'import_unavailable' })
    expect(reads).toBe(0)
    expect(await countOf(user, 'import_previews')).toBe(0)
  })

  it('a parse job cancelled while its child runs (expiry, deletion, maintenance) records nothing', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const cancelling = fakeParser(async () => {
      await vaultExec(user, "UPDATE import_uploads SET parse_state = 'cancelled' WHERE job_id = ?", jobId)
      return ONE_ROW
    })
    expect(await deliver(user, jobId, cancelling.parser)).toMatchObject({ acked: true })
    expect(await countOf(user, 'import_previews')).toBe(0)
    expect(await countOf(user, 'import_candidates')).toBe(0)
    expect(await statusOf(v1, user, jobId)).toBe('cancelled')
  })

  it('a lease lost after the image PUT publishes nothing; the sweep deletes the object', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const bucket = spyBucket({
      afterPut: async (key) => {
        if (key.startsWith('import_image/')) await vaultExec(user, "UPDATE import_uploads SET parse_state = 'cancelled' WHERE job_id = ?", jobId)
      },
    })
    expect(await deliver(user, jobId, fakeParser(receiptReply(TINY_JPEG)).parser, { env: { OBJECTS: bucket } })).toMatchObject({ acked: true })
    expect(await countOf(user, 'import_previews')).toBe(0)
    const keys = await imagesOf(user)
    expect(keys).toHaveLength(1)
    expect(await vaultRows(user, 'SELECT status FROM vault_objects WHERE key = ?', keys[0])).toEqual([{ status: 'reserved' }])
    await runInDurableObject(vaultOf(user), (vault: UserVault, state) => deleteDueObjects({ context: () => fileAt(state, Date.now() + HOUR), bucket: vault.bucket }))
    expect(await imagesOf(user)).toEqual([])
  })
})

describe('receipt images are sanitized and expire unattached', () => {
  it('publishes a metadata-free re-encoding for 24 hours and a review-only candidate', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const parsedAt = Date.now()
    expect(await deliver(user, jobId, fakeParser(receiptReply(TINY_JPEG)).parser)).toMatchObject({ acked: true })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'ready', layout: 'receipt', candidate_count: 1, review_required_count: 1, image_width: 1, image_height: 1, issues: '["receipt_fields_unread"]' })
    expect(await candidatesOf(user, jobId)).toEqual([
      {
        source_row_id: 'image:1', ordinal: 1, occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, review_required: 1,
        issues: JSON.stringify([{ field: 'occurred_on', code: 'missing_date' }, { field: 'type', code: 'missing_type' }, { field: 'amount_minor', code: 'missing_amount' }, { field: 'wallet_label', code: 'missing_wallet' }]),
      },
    ])
    const keys = await imagesOf(user, jobId)
    expect(keys).toEqual([expect.stringMatching(/\/image\.jpg$/)])
    const sanitized = Buffer.from(await ((await env.OBJECTS.get(keys[0])) as unknown as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer())
    expect(sanitizedImageHeader(sanitized, 'jpeg')).toEqual({ width: 1, height: 1 })
    const [registry] = await vaultRows<{ status: string; purpose: string; delete_after: number }>(user, 'SELECT status, purpose, delete_after FROM vault_objects WHERE key = ?', keys[0])
    expect([registry.status, registry.purpose]).toEqual(['published', 'import_image'])
    expect(Math.abs(registry.delete_after - (parsedAt + DAY))).toBeLessThan(60_000)
    expect(await previewOf(user, jobId)).toMatchObject({ image_key: keys[0] })
    // Unattached after 24 hours: the alarm's delete removes it.
    const sweepAt = (ms: number) => runInDurableObject(vaultOf(user), (vault: UserVault, state) => deleteDueObjects({ context: () => fileAt(state, ms), bucket: vault.bucket }))
    await sweepAt(Date.now())
    expect(await imagesOf(user)).toEqual(keys)
    await sweepAt(Date.now() + 25 * HOUR)
    expect(await imagesOf(user)).toEqual([])
  })
})

describe('the job worker never claims a parse it cannot sandbox (B1)', () => {
  it('a worker started on a runtime without network permission leaves import_parse queued, without spending an attempt', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    // A parse server whose sandbox does not hold answers not_started to every parse.
    for (let round = 0; round < 3; round += 1) await deliver(user, jobId, fakeParser(NOT_STARTED).parser, { attempts: round + 1 })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
    expect(await countOf(user, 'import_previews')).toBe(0)
  })

  it.each<[string, ParserRunOutcome, string]>([
    ['a runner that refuses an unsandboxed runtime', { kind: 'sandbox_unsupported' }, 'parser_sandbox_unsupported'],
    ['a child that could not be started', { kind: 'spawn_failed' }, 'parser_unavailable'],
  ])('%s fails the job retryably and records no preview', async (_label, outcome, code) => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const parser = fakeParser(serverReply('csv', outcome)).parser
    expect(await deliver(user, jobId, parser)).toMatchObject({ retried: true, delaySeconds: PARSE_RETRY_SECONDS })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 1 })
    await deliver(user, jobId, parser, { attempts: 2 })
    expect(await deliver(user, jobId, parser, { attempts: 3 })).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'failed', parse_attempts: 3, parse_failure: code })
    expect(await countOf(user, 'import_previews')).toBe(0)
  })

  it('a child stopped past its memory budget gives a rejected preview, never a retry', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    expect(await deliver(user, jobId, fakeParser(serverReply('csv', { kind: 'memory_limit' })).parser)).toMatchObject({ acked: true, retried: false })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', issues: '["parse_resource_limit"]', candidate_count: 0 })
  })

  it('an image whose own header disagrees with what the child said is never published', async () => {
    const v1 = await client()
    const user = await member(v1)
    // The wrong size, then metadata the child said it removed.
    const first = await acceptImage(v1, user)
    await deliver(user, first, fakeParser(receiptReply(TINY_JPEG, 4_000, 1)).parser)
    expect(await previewOf(user, first)).toMatchObject({ issues: '["parse_failed"]' })
    const second = await acceptImage(v1, user, JPEG_WITH_EXIF)
    await deliver(user, second, fakeParser(receiptReply(JPEG_WITH_EXIF, 1, 1)).parser)
    expect(await previewOf(user, second)).toMatchObject({ issues: '["parse_failed"]' })
    expect(await imagesOf(user)).toEqual([])
  })
})

describe('a paused OCR gate parks queued image parses attempt-neutrally (P2b)', () => {
  const pausedOcr = () => new FeatureGates({ paused: ['ocr'], retryAfterSeconds: 120 })

  it('releases a claimed image job (no attempt spent, nothing read or recorded) and still parses a spreadsheet', async () => {
    const v1 = await client()
    const user = await member(v1)
    const receipt = await acceptImage(v1, user)
    const sheet = await accept(v1, user, csvRows(6))
    expect(await deliver(user, sheet, fakeParser(parsedCsv(SIX_ROWS)).parser, { gates: pausedOcr() })).toMatchObject({ acked: true })
    let reads = 0
    for (let round = 0; round < 3; round += 1) {
      expect(await deliver(user, receipt, fakeParser(receiptReply(TINY_JPEG)).parser, { gates: pausedOcr(), attempts: round + 1, env: { OBJECTS: spyBucket({ onGet: () => void (reads += 1) }) } })).toMatchObject({ retried: true, delaySeconds: 120 })
    }
    expect(await jobOf(user, receipt)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
    expect(reads).toBe(0)
    expect(await imagesOf(user)).toEqual([])
    expect(await countOf(user, 'import_previews')).toBe(1)
  })

  it('parses the same job after the gate reopens, as its first attempt', async () => {
    const v1 = await client()
    const user = await member(v1)
    const receipt = await acceptImage(v1, user)
    await deliver(user, receipt, fakeParser(receiptReply(TINY_JPEG)).parser, { gates: pausedOcr() })
    expect(await jobOf(user, receipt)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
    expect(await deliver(user, receipt, fakeParser(receiptReply(TINY_JPEG)).parser, { gates: new FeatureGates(), attempts: 2 })).toMatchObject({ acked: true })
    expect(await jobOf(user, receipt)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
    expect(await previewOf(user, receipt)).toMatchObject({ status: 'ready' })
  })

  it('does not park a raw file past its expiry: it still fails visibly', async () => {
    const v1 = await client()
    const user = await member(v1)
    const receipt = await acceptImage(v1, user)
    await ageUpload(user, receipt, 25 * 60)
    expect(await deliver(user, receipt, fakeParser(receiptReply(TINY_JPEG)).parser, { gates: pausedOcr() })).toMatchObject({ acked: true })
    expect(await jobOf(user, receipt)).toMatchObject({ parse_state: 'failed', parse_failure: 'import_unavailable' })
  })
})

describe('1B-T5: the consumer and the vault', () => {
  it('a parsed CSV becomes a ready preview with its candidates, and the import reads parsed', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    await deliver(user, jobId, fakeParser(parsedCsv(SIX_ROWS)).parser)
    const preview = await previewOf(user, jobId)
    expect(preview).toMatchObject({ status: 'ready', layout: 'generic', issues: '[]', candidate_count: 6, review_required_count: 0, expense: '12200', income: '9100', transfer: '0', image_key: null, review_revision: 1 })
    expect(Date.parse(String(preview?.expires_at)) - Date.parse(String(preview?.created_at))).toBe(7 * DAY)
    expect((await candidatesOf(user, jobId)).map((row) => [row.source_row_id, row.ordinal, row.amount_minor, row.review_required])).toEqual(
      SIX_ROWS.map((row, index) => [row.source_row_id, index + 1, row.amount_minor, 0]),
    )
    expect(await statusOf(v1, user, jobId)).toBe('parsed')
  })

  it("a parsed receipt image is stored under the vault's import_image prefix for 24 hours and gets an attachment id", async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const at = Date.now()
    await setVaultClock(user, at)
    try {
      await deliver(user, jobId, fakeParser(receiptReply(TINY_JPEG)).parser)
    } finally {
      await setVaultClock(user, null)
    }
    const keys = await imagesOf(user, jobId)
    expect(keys).toEqual([expect.stringMatching(new RegExp(`^import_image/${vaultIdOf(user)}/${jobId}/[0-9a-f-]{36}/image\\.jpg$`))])
    expect(await vaultRows(user, 'SELECT status, delete_after FROM vault_objects WHERE key = ?', keys[0])).toEqual([{ status: 'published', delete_after: at + DAY }])
    expect(isUuid((await previewOf(user, jobId))?.image_attachment_id)).toBe(true)
  })

  it('an image whose bytes are not the format it claims is a rejected preview, and nothing is stored', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const mislabelled = { ...(receiptReply(TINY_JPEG) as Extract<ParseServiceReply, { kind: 'parsed' }>), image: { format: 'jpeg' as const, width: 1, height: 1, base64: Buffer.from(SYNTHETIC.png).toString('base64') } }
    await deliver(user, jobId, fakeParser(mislabelled).parser)
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', issues: '["parse_failed"]', image_key: null })
    expect(await imagesOf(user)).toEqual([])
  })

  it('a parse that keeps failing is retried and fails after three attempts', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const parser = fakeParser(UNAVAILABLE).parser
    for (const attempts of [1, 2]) {
      expect(await deliver(user, jobId, parser, { attempts })).toEqual({ acked: false, retried: true, delaySeconds: 30 })
      expect(await statusOf(v1, user, jobId)).toBe('queued')
    }
    expect(await deliver(user, jobId, parser, { attempts: 3 })).toEqual({ acked: true, retried: false, delaySeconds: null })
    expect(await statusOf(v1, user, jobId)).toBe('failed')
  })

  it('a parse that has not started spends no attempt', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    expect(await deliver(user, jobId, fakeParser(NOT_STARTED).parser)).toEqual({ acked: false, retried: true, delaySeconds: 30 })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
  })

  it('a parse that finishes after the import expired records nothing', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const [{ expires_at: expiresAt }] = await vaultRows<{ expires_at: string }>(user, 'SELECT expires_at FROM import_uploads WHERE job_id = ?', jobId)
    const late = Date.parse(expiresAt) + 1
    const slow = fakeParser(async () => {
      // The parse outlives its import: the vault's clock passes the raw file's expiry before the record.
      await setVaultClock(user, late)
      return receiptReply(TINY_JPEG)
    })
    try {
      expect(await deliver(user, jobId, slow.parser)).toMatchObject({ acked: true })
    } finally {
      await setVaultClock(user, null)
    }
    expect(await countOf(user, 'import_previews')).toBe(0)
    const [key] = await imagesOf(user, jobId)
    const due = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => dueObjectKeys(fileAt(state, ms)).map((row) => row.key))
    expect(await due(late + 15 * MIN - 1)).not.toContain(key)
    expect(await due(late + 15 * MIN)).toContain(key)
  })

  it('while ocr is paused an image parse is held without spending an attempt, and a CSV still parses', async () => {
    const v1 = await client()
    const user = await member(v1)
    const receipt = await acceptImage(v1, user)
    const sheet = await accept(v1, user, csvRows(6))
    await client(pausing(['ocr'], 120))
    for (const attempts of [1, 2, 3]) expect(await deliver(user, receipt, fakeParser(receiptReply(TINY_JPEG)).parser, { attempts })).toMatchObject({ retried: true, delaySeconds: 120 })
    expect(await jobOf(user, receipt)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
    expect(await deliver(user, sheet, fakeParser(parsedCsv(SIX_ROWS)).parser)).toMatchObject({ acked: true })
    expect(await jobOf(user, sheet)).toMatchObject({ parse_state: 'parsed' })
    // Reopened: the queue's fourth delivery is the vault's first attempt, so an unavailable parser is retried, not failed.
    await client(OPEN)
    expect(await deliver(user, receipt, fakeParser(UNAVAILABLE).parser, { attempts: 4 })).toMatchObject({ retried: true, delaySeconds: 30 })
    expect(await jobOf(user, receipt)).toMatchObject({ parse_state: 'queued', parse_attempts: 1 })
  })

  it.each<['jobs' | 'imports']>([['jobs'], ['imports']])('while %s is paused every parse is held without spending an attempt', async (scope) => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    await client(pausing([scope], 90))
    expect(await deliver(user, jobId, fakeParser(parsedCsv(SIX_ROWS)).parser)).toMatchObject({ retried: true, delaySeconds: 90 })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 0 })
    await client(OPEN)
    expect(await deliver(user, jobId, fakeParser(parsedCsv(SIX_ROWS)).parser, { attempts: 2 })).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
  })

  it('a missing quarantine part fails the import as quarantine_missing', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const [key] = await quarantined(user, jobId)
    await env.OBJECTS.delete(key)
    expect(await deliver(user, jobId, fakeParser(ONE_ROW).parser)).toMatchObject({ acked: true })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'failed', parse_failure: 'quarantine_missing' })
    expect(await statusOf(v1, user, jobId)).toBe('failed')
  })

  it("the Worker's queue handler sends a message through the container parser, which asks to retry while no container runs", async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const batch = parseBatch(user, jobId)
    await worker.queue(batch, env)
    expect(await outcomeOf(batch)).toEqual({ acked: false, retried: true, delaySeconds: 30 })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 1 })
    expect(await statusOf(v1, user, jobId)).toBe('queued')
  })

  it('an image reservation past its own deadline is never published, even when a failed delete moved it on', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const bucket = spyBucket({
      afterPut: async (key) => {
        if (!key.startsWith('import_image/')) return
        // The PUT took past the reservation's grace, and a failed delete moved its deadline a minute on.
        const [{ created_at: reservedAt }] = await vaultRows<{ created_at: number }>(user, 'SELECT created_at FROM vault_objects WHERE key = ?', key)
        await setVaultClock(user, reservedAt + 15 * MIN)
        await vaultExec(user, 'UPDATE vault_objects SET delete_after = ? WHERE key = ?', reservedAt + 16 * MIN, key)
      },
    })
    try {
      expect(await deliver(user, jobId, fakeParser(receiptReply(TINY_JPEG)).parser, { env: { OBJECTS: bucket } })).toMatchObject({ acked: true })
    } finally {
      await setVaultClock(user, null)
    }
    expect(await countOf(user, 'import_previews')).toBe(0)
    expect(await vaultRows(user, "SELECT status FROM vault_objects WHERE purpose = 'import_image'")).toEqual([{ status: 'reserved' }])
  })

  it('an attempt that throws is retried, and a job out of attempts fails without another parse', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    const broken = fakeParser(async () => {
      throw new Error('the parser connection dropped')
    })
    for (const attempts of [1, 2, 3]) expect(await deliver(user, jobId, broken.parser, { attempts })).toEqual({ acked: false, retried: true, delaySeconds: 30 })
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'queued', parse_attempts: 3 })
    expect(await deliver(user, jobId, broken.parser, { attempts: 4 })).toMatchObject({ acked: true })
    expect(broken.calls).toHaveLength(3)
    expect(await jobOf(user, jobId)).toMatchObject({ parse_state: 'failed', parse_failure: 'import_unavailable' })
  })

  it('a failed parse makes its unpublished image due at once', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const now = Date.now()
    const key = await runInDurableObject(vaultOf(user), (_vault, state) => {
      expect(parseSource(fileAt(state, now), jobId, [])).toMatchObject({ kind: 'parse', format: 'jpeg' })
      const reserved = reserveImageKey(fileAt(state, now), jobId, 'jpeg')
      failParse(fileAt(state, now + 1), jobId, 'parser_unavailable')
      return { reserved, due: dueObjectKeys(fileAt(state, now + 1)).map((row) => row.key) }
    })
    expect(key.reserved).toMatch(new RegExp(`^import_image/${vaultIdOf(user)}/${jobId}/`))
    expect(key.due).toContain(key.reserved)
  })

  it('a message that names no vault or import is dropped, and a parse server reply is checked for its shape', async () => {
    const batch = createMessageBatch<ParseMessage>('jotbun-statement-parse', [{ id: randomUUID(), timestamp: new Date(), attempts: 1, body: { vault: 'not-a-vault', job: 'x' } }])
    await handleParseBatch(batch, env, { parser: fakeParser(ONE_ROW).parser })
    expect((await getQueueResult(batch, createExecutionContext())).explicitAcks).toHaveLength(1)
    expect(isParseServiceReply(ONE_ROW)).toBe(true)
    expect(isParseServiceReply(UNAVAILABLE)).toBe(true)
    expect(isParseServiceReply({ kind: 'retry', code: 'whatever' })).toBe(false)
    expect(isParseServiceReply({ kind: 'parsed', record: null, image: null })).toBe(false)
    expect(isParseServiceReply('{}')).toBe(false)
  })

  it('an import sent twice by overlapping starts is parsed once; the second message records nothing and spends no attempt', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await accept(v1, user, csvRows(6))
    // Two starter runs that overlap (a request's waitUntil and the alarm) each read the import as unsent before either marks it, so both send it (1B-T4 follow-up).
    const now = Date.now()
    expect(await runInDurableObject(vaultOf(user), (_vault, state) => [PARSE_STARTER.unstarted(fileAt(state, now)), PARSE_STARTER.unstarted(fileAt(state, now))])).toEqual([[jobId], [jobId]])
    const parser = fakeParser(parsedCsv(SIX_ROWS))
    expect(await deliver(user, jobId, parser.parser)).toEqual({ acked: true, retried: false, delaySeconds: null })
    expect(await deliver(user, jobId, parser.parser)).toEqual({ acked: true, retried: false, delaySeconds: null })
    expect(parser.calls).toHaveLength(1)
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
    expect(await countOf(user, 'import_previews')).toBe(1)
    expect(await candidatesOf(user, jobId)).toHaveLength(6)
  })
})

describe('1B-T5 fix round: a rejected receipt photo keeps its own issue, as the API records it', () => {
  const usage = { max_rss_kb: 1024, cpu_ms: 5 }

  it.each<[string, ParserRunOutcome, string]>([
    ['a photo over 20 MP', { kind: 'result', result: { ok: false, code: 'image_too_large', usage } }, 'image_too_large'],
    ['a photo that is not the format it claims', { kind: 'result', result: { ok: false, code: 'image_format_mismatch', usage } }, 'image_format_mismatch'],
    ['a photo the image child cannot decode', { kind: 'result', result: { ok: false, code: 'image_malformed', usage } }, 'image_malformed'],
    ['a photo whose child was killed at its deadline', { kind: 'timeout' }, 'parse_timeout'],
    ['a photo whose child went past its memory budget', { kind: 'memory_limit' }, 'parse_resource_limit'],
  ])('%s is stored with its own issue, never parse_failed', async (_label, outcome, code) => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const reply = serverReply('jpeg', outcome)
    // What the parse server answers (previewFromOutcome in apps/api/src/imports/parse-outcome.ts): the rejected record with its own code, and no image.
    expect(reply).toMatchObject({ kind: 'parsed', image: null, record: { preview: { status: 'rejected', issues: [code] } } })
    expect(await deliver(user, jobId, fakeParser(reply).parser)).toMatchObject({ acked: true, retried: false })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', layout: null, issues: JSON.stringify([code]), candidate_count: 0, image_key: null, image_attachment_id: null })
    expect(await candidatesOf(user, jobId)).toEqual([])
    expect(await imagesOf(user)).toEqual([])
    expect(await jobOf(user, jobId)).toEqual({ parse_state: 'parsed', parse_attempts: 1, parse_failure: null })
  })

  it('a readable photo reply without its image is still the rejected preview parse_failed', async () => {
    const v1 = await client()
    const user = await member(v1)
    const jobId = await acceptImage(v1, user)
    const receipt = receiptReply(TINY_JPEG) as Extract<ParseServiceReply, { kind: 'parsed' }>
    expect(receipt.record.preview.status).toBe('ready')
    expect(await deliver(user, jobId, fakeParser({ ...receipt, image: null }).parser)).toMatchObject({ acked: true })
    expect(await previewOf(user, jobId)).toMatchObject({ status: 'rejected', layout: null, issues: '["parse_failed"]', candidate_count: 0, image_key: null })
    expect(await imagesOf(user)).toEqual([])
  })
})
