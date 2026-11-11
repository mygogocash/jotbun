// Import review and confirmation (1B-T10). Ports the 30 cases of
// apps/api/src/imports/import-confirmation.integration.spec.ts under the
// not-applicable rule (26 ported, some in changed form; 4 not applicable), 21
// cases of apps/api/src/imports/import-preview.integration.spec.ts (17 ported, 4
// not applicable; 1B-T5 took the other 17), the review and confirmation case of
// apps/edge/test/jobs.db.test.ts, the plan's five cases and the planner's thirteen.
// A preview comes from seedPreview (the vault's own recordPreview), or, where
// the API parses a file to test the parse, from an upload and the parse
// consumer with a fake parser (1B-T5). The API's retention steps are
// pruneImports and pruneUploads at a chosen vault clock (1B-T11 runs them on
// the alarm).
import { env } from 'cloudflare:workers'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { IMPORT_CONFIRM_BATCH_MAX_ROWS, RECEIPT_RETENTION_CONSENT, bangkokDate, isImportJobDto, isImportPreview, isImportReviewSnapshot, isImportSelectionSnapshot } from '@gogospend/contracts'
import type { CommandAck, ConfirmImportBatchResult, ImportMapping, ImportPreview, ImportSelectionProgress } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { FeatureGates } from '@api/common/feature-gates'
import { toPreviewRecord } from '@api/imports/parse-outcome'
import type { CandidateRecord } from '@api/imports/parse-outcome'
import type { ParsedRow } from '@api/imports/parsers/protocol'

import { handleParseBatch } from '../../src/background/parse-consumer'
import { confirmRoute } from '../../src/v1/files/receipts'
import type { VaultCall, VaultReply } from '../../src/v1/protocol'
import { vaultSession } from '../../src/v1/worker-routes'
import type { VaultSession } from '../../src/v1/worker-routes'
import { pruneUploads } from '../../src/vault/files/intake'
import { importsDueAt, pruneImports } from '../../src/vault/files/previews'
import { DAY, HOUR, MIN, csvRows, fakeParser, fileAt, parseBatch, parsedCsv, seedPreview, setVaultClock, storedKeys, upload, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { BASE, TEST_POLICIES, startV1, vaultOf } from './support/v1-client'
import type { TestUser } from './support/v1-client'

type Body = Record<string, any>
type Reply = { status: number; body: Body }

const json = async (res: Response): Promise<Reply> => {
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Body) : {} }
}

/** The problem body without its per-request id, to compare "not found" answers. */
const problemOf = (body: Body) => ({ ...body, request_id: '' })

/** A front door with uploads on; a `starts` route starts nothing (the tests deliver parse messages themselves). */
async function setup() {
  const v1 = await startV1(undefined, { env: { IMPORT_UPLOADS_ENABLED: 'true' }, startWork: 'manual' })
  return { v1, money: moneyFixtures(v1) }
}
type Kit = Awaited<ReturnType<typeof setup>>

// ---------------------------------------------------------------------------
// Synthetic files: the API spec's generic layout with two wallet labels, two
// expense and one income category label, and exact two-decimal amounts.
// ---------------------------------------------------------------------------

type FileRow = { id: string; date: string; type: 'expense' | 'income'; category: string; minor: bigint; note: string; merchant: string; wallet: string }

function fileRows(n: number, options: { note?: (i: number) => string; merchant?: (i: number) => string } = {}): FileRow[] {
  const rows: FileRow[] = []
  for (let i = 0; i < n; i += 1) {
    const income = i % 7 === 3
    rows.push({
      // The header is row 1, so the i-th data row is row i + 2.
      id: `row:${i + 2}`,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      type: income ? 'income' : 'expense',
      category: income ? 'salary' : i % 2 === 0 ? 'food' : 'travel',
      minor: BigInt(((i * 7919) % 9_999_999) + 1),
      note: options.note ? options.note(i) : `row ${i + 1}`,
      merchant: options.merchant ? options.merchant(i) : `shop ${i % 13}`,
      wallet: i % 3 === 0 ? 'Bank' : 'Cash',
    })
  }
  return rows
}

/** What the parser reads from these rows, normalized as the parse server normalizes them (toPreviewRecord), on the Bangkok date `today`. */
function recordOf(rows: ParsedRow[], today = '2026-12-31'): CandidateRecord[] {
  return toPreviewRecord({ ok: true, layout: 'generic', rows, file_issues: [], image: null, header_fingerprint: null, usage: { max_rss_kb: 1024, cpu_ms: 5 } }, today).candidates
}

const parsedOf = (rows: readonly FileRow[]): ParsedRow[] =>
  rows.map((row) => ({ source_row_id: row.id, occurred_on: row.date, type: row.type, amount_minor: row.minor.toString(), wallet_label: row.wallet, category_label: row.category, merchant: row.merchant, note: row.note, issues: [] }))

/** A receipt photo's one review-only row, as the parser answers it. */
const RECEIPT_ROW: ParsedRow = {
  source_row_id: 'image:1', occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null,
  issues: [{ field: 'occurred_on', code: 'missing_date' }, { field: 'type', code: 'missing_type' }, { field: 'amount_minor', code: 'missing_amount' }, { field: 'wallet_label', code: 'missing_wallet' }],
}

/** The six rows the parser reads from the API's MEOWJOT sample (meowjot-export-sample.csv). */
const MEOWJOT_ROWS: ParsedRow[] = [
  { source_row_id: 'row:2', occurred_on: '2025-12-01', type: 'expense', amount_minor: '29000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'บริษัท สบาย สบาย จำกัด', note: 'ข้าวมันไก่', issues: [] },
  { source_row_id: 'row:3', occurred_on: '2025-12-02', type: 'expense', amount_minor: '23000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'คอฟฟี่ แอนด์ โค', note: null, issues: [] },
  { source_row_id: 'row:4', occurred_on: '2025-12-03', type: 'expense', amount_minor: '2000', wallet_label: 'กรุงไทย', category_label: 'สุขภาพ, ดูแลตัวเอง', merchant: 'การกีฬาสุขภาพดี', note: null, issues: [] },
  { source_row_id: 'row:5', occurred_on: '2025-12-03', type: 'income', amount_minor: '200000', wallet_label: null, category_label: 'ค่าจ้าง', merchant: null, note: null, issues: [{ field: 'wallet_label', code: 'missing_wallet' }] },
  { source_row_id: 'row:6', occurred_on: '2025-12-04', type: 'expense', amount_minor: '100000', wallet_label: 'KBANK PLATINUM', category_label: 'ช้อปปิ้ง', merchant: 'EASY MALL', note: null, issues: [] },
  { source_row_id: 'row:7', occurred_on: '2025-12-05', type: 'income', amount_minor: '35000', wallet_label: 'KBANK PLATINUM', category_label: 'เงินคืน', merchant: 'THE CLOTH SHOP', note: null, issues: [] },
]

/** A row of a small CSV the parser reads with `date,type,amount,wallet,note[,merchant]`: an empty field is null, a missing wallet is an issue. */
function csvRow(n: number, line: string): ParsedRow {
  const [date, type, amount, wallet, note, merchant] = line.split(',')
  const issues: ParsedRow['issues'] = []
  if (!date) issues.push({ field: 'occurred_on', code: 'missing_date' })
  if (!type) issues.push({ field: 'type', code: 'missing_type' })
  if (!wallet) issues.push({ field: 'wallet_label', code: 'missing_wallet' })
  const [whole, cents] = amount.split('.')
  return {
    source_row_id: `row:${n}`,
    occurred_on: date || null,
    type: (type || null) as ParsedRow['type'],
    amount_minor: String(BigInt(whole) * 100n + BigInt(cents)),
    wallet_label: wallet || null,
    category_label: null,
    merchant: merchant || null,
    note: note || null,
    issues,
  }
}
const csvRowsOf = (lines: readonly string[]): ParsedRow[] => lines.map((line, i) => csvRow(i + 2, line))

/**
 * Uploads a CSV and parses it with the parse consumer and a fake parser that
 * answers these rows, as the API's runParse parses with the real child.
 * Returns the import's id.
 */
async function parsedUpload(kit: Kit, user: TestUser, rows: ParsedRow[], opts: { layout?: 'generic' | 'meowjot' } = {}): Promise<string> {
  const reply = await upload(kit.v1, user, csvRows(Math.max(rows.length, 1)))
  expect(reply.status).toBe(202)
  const jobId = reply.body.job_id as string
  const { parser } = fakeParser(parsedCsv(rows, { layout: opts.layout }))
  await handleParseBatch(parseBatch(user, jobId), env, { parser })
  return jobId
}

/** An accepted upload that has not been parsed. */
async function acceptedUpload(kit: Kit, user: TestUser): Promise<string> {
  const reply = await upload(kit.v1, user, csvRows(6))
  expect(reply.status).toBe(202)
  return reply.body.job_id as string
}

const preview = async (kit: Kit, user: TestUser, id: string, query = '') => json(await kit.v1.as(user).get(`/v1/imports/${id}/preview${query}`))

async function previewOf(kit: Kit, user: TestUser, id: string, query = ''): Promise<ImportPreview> {
  const res = await preview(kit, user, id, query)
  expect(res.status).toBe(200)
  expect(isImportPreview(res.body)).toBe(true)
  return res.body as ImportPreview
}

const count = async (user: TestUser, table: string) => (await vaultRows<{ n: number }>(user, `SELECT count(*) AS n FROM ${table}`))[0].n

// ---------------------------------------------------------------------------
// The review and confirmation routes
// ---------------------------------------------------------------------------

type Setup = { user: TestUser; jobId: string; rows: FileRow[]; wallets: { cash: string; bank: string }; mapping: ImportMapping }

/** A member with Cash and Bank wallets and a parsed import of `rows`. */
async function parsedImport(kit: Kit, rows: FileRow[], user?: TestUser): Promise<Setup> {
  const owner = user ?? (await kit.money.member())
  const wallets = { cash: await kit.money.wallet(owner, { name: 'Cash' }), bank: await kit.money.wallet(owner, { name: 'Bank' }) }
  const jobId = await seedPreview(owner, recordOf(parsedOf(rows)))
  if (rows.length <= 100) {
    const read = await previewOf(kit, owner, jobId)
    expect([read.status, read.candidates.length]).toEqual(['ready', rows.length])
  } else {
    const [stored] = await vaultRows<{ status: string; candidate_count: number }>(owner, 'SELECT status, candidate_count FROM import_previews WHERE job_id = ?', jobId)
    expect(stored).toEqual({ status: 'ready', candidate_count: rows.length })
  }
  const mapping: ImportMapping = {
    wallets: { Cash: wallets.cash, Bank: wallets.bank },
    categories: { expense: { food: builtinId(owner, 'food'), travel: builtinId(owner, 'travel') }, income: { salary: builtinId(owner, 'salary') } },
  }
  return { user: owner, jobId, rows, wallets, mapping }
}

const freeze = async (kit: Kit, setup: Setup, ids: readonly string[], options: { revision?: string; key?: string; mapping?: ImportMapping } = {}) =>
  json(await kit.v1.as(setup.user).post(`/v1/imports/${setup.jobId}/selections`, { review_revision: options.revision ?? '1', selected_row_ids: ids, mapping: options.mapping ?? setup.mapping }, { key: options.key }))

async function frozen(kit: Kit, setup: Setup, ids: readonly string[], options: { revision?: string; mapping?: ImportMapping } = {}): Promise<string> {
  const res = await freeze(kit, setup, ids, options)
  expect([res.status, res.body.code]).toEqual([201, undefined])
  return (res.body as CommandAck).entity_id
}

type ConfirmOptions = { frozenRevision?: string; key?: string; receipt?: unknown }

const batchOf = (selectionId: string, ids: readonly string[], options: ConfirmOptions = {}) => ({
  selection_id: selectionId,
  frozen_revision: options.frozenRevision ?? '1',
  batch_row_ids: ids,
  ...(options.receipt === undefined ? {} : { receipt: options.receipt }),
})

const confirm = async (kit: Kit, setup: Setup, selectionId: string, ids: readonly string[], options: ConfirmOptions = {}) =>
  json(await kit.v1.as(setup.user).post(`/v1/imports/${setup.jobId}/confirmations`, batchOf(selectionId, ids, options), { key: options.key }))

async function confirmed(kit: Kit, setup: Setup, selectionId: string, ids: readonly string[], options: ConfirmOptions = {}): Promise<ConfirmImportBatchResult> {
  const res = await confirm(kit, setup, selectionId, ids, options)
  expect([res.status, res.body.code]).toEqual([200, undefined])
  return res.body as ConfirmImportBatchResult
}

const patchRows = async (kit: Kit, setup: Setup, revision: number, rows: unknown[], key?: string) =>
  json(await kit.v1.as(setup.user).patch(`/v1/imports/${setup.jobId}/rows`, { rows }, { ifMatch: revision, key }))

const progressOf = async (kit: Kit, user: TestUser, jobId: string, selectionId: string) => json(await kit.v1.as(user).get(`/v1/imports/${jobId}/selections/${selectionId}`))

const transactionId = (setup: Setup, sourceRowId: string) => derivedUuid(setup.user.sub, 'import-transaction', setup.jobId, sourceRowId)
const ids = (rows: readonly FileRow[]) => rows.map((row) => row.id)
const chunks = <T>(items: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

type ImportRecord = { id: string; type: string; amount_minor: string; occurred_on: string; wallet_id: string; category_id: string; note: string | null; merchant: string | null; version: number }

const importTransactions = (setup: Setup) =>
  vaultRows<ImportRecord>(
    setup.user,
    `SELECT t.id, t.type, CAST(t.amount_minor AS TEXT) AS amount_minor, t.occurred_on, t.wallet_id, t.category_id, t.note, t.merchant, t.version
       FROM transactions t JOIN import_row_progress g ON g.transaction_id = t.id WHERE g.job_id = ? ORDER BY t.id`,
    setup.jobId,
  )

/** Archives a wallet that already holds records: its opening balance is corrected so the derived balance is zero (a wallet archives only at zero). */
async function archiveWalletWithRecords(kit: Kit, setup: Setup, walletId: string): Promise<void> {
  const [row] = await vaultRows<{ opening: string; delta: string }>(
    setup.user,
    `SELECT CAST(w.opening_minor AS TEXT) AS opening,
            CAST(coalesce((SELECT sum(CASE t.type WHEN 'income' THEN t.amount_minor ELSE -t.amount_minor END) FROM transactions t WHERE t.wallet_id = w.id AND t.deleted_at IS NULL), 0) AS TEXT) AS delta
       FROM wallets w WHERE w.id = ?`,
    walletId,
  )
  const opening = (BigInt(row.opening) - BigInt(row.delta)).toString()
  const wallet = await json(await kit.v1.as(setup.user).get(`/v1/wallets/${walletId}`))
  const version = (wallet.body as { version: number }).version
  const corrected = await json(await kit.v1.as(setup.user).patch(`/v1/wallets/${walletId}`, { opening_minor: opening, correction_reason: 'balance_reconciliation' }, { ifMatch: version }))
  expect(corrected.status).toBe(200)
  const archived = await json(await kit.v1.as(setup.user).post(`/v1/wallets/${walletId}/archive`, {}, { ifMatch: version + 1 }))
  expect([archived.status, archived.body.code]).toEqual([200, undefined])
}

/** One step sent straight to the person's vault, as the Worker's vaultSession sends it (the request's first, charged call). */
function stepCall(user: TestUser, route: VaultCall['route'], body: unknown, opts: { params?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<VaultReply> {
  return vaultOf(user).call({
    route,
    access: 'current_policy',
    charge: 'write',
    claims: { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' },
    policies: TEST_POLICIES,
    params: opts.params ?? {},
    query: {},
    headers: opts.headers ?? {},
    body,
  })
}

const commandHeaders = (key: string = randomUUID()) => ({ 'idempotency-key': key, 'x-gogospend-command-schema': '1' })

/** pruneImports at `ms` (the API's retention steps imports.previews and imports.selections; 1B-T11 runs it on the alarm). True when it wrote anything. */
const prune = (user: TestUser, ms = Date.now()) =>
  runInDurableObject(vaultOf(user), (_vault, state) => {
    const c = fileAt(state, ms)
    pruneImports(c)
    return c.touched === true
  })

const dueAt = (user: TestUser, ms = Date.now()) => runInDurableObject(vaultOf(user), (_vault, state) => importsDueAt(fileAt(state, ms)))

/** Moves a preview `days` into the past (the API spec's overdue). */
const ageAll = (user: TestUser, jobId: string, days: number) =>
  vaultExec(
    user,
    `UPDATE import_previews SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, ?1), expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, ?1) WHERE job_id = ?2`,
    `-${days} days`,
    jobId,
  )

const receiptKeys = (user: TestUser) => vaultRows<{ key: string; status: string }>(user, "SELECT key, status FROM vault_objects WHERE purpose = 'receipt' ORDER BY key")

// ===========================================================================
// Ported from import-confirmation.integration.spec.ts
// ===========================================================================

describe('nothing is saved before a confirmation batch commits', () => {
  it('parse, corrections and the freeze alone save no transaction', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    expect(await count(s.user, 'transactions')).toBe(0)
    const patched = await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'checked by hand' }])
    expect([patched.status, patched.body.review_revision]).toEqual([200, '2'])
    const selectionId = await frozen(kit, s, ids(s.rows), { revision: '2' })
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await count(s.user, 'import_row_progress')).toBe(0)
    expect(await count(s.user, 'import_selection_rows')).toBe(6)
    // The change log has the correction revision and the selection, and nothing financial.
    const changes = await vaultRows<{ entity: string; snapshot: string }>(s.user, "SELECT entity, snapshot FROM entity_changes WHERE entity LIKE 'import%' ORDER BY revision")
    expect(changes.map((change) => change.entity)).toEqual(['import_review', 'import_selection'])
    expect(isImportReviewSnapshot(JSON.parse(changes[0]?.snapshot ?? 'null'))).toBe(true)
    expect(JSON.parse(changes[1]?.snapshot ?? 'null')).toEqual({ id: selectionId, job_id: s.jobId, frozen_revision: '2', row_count: 6, committed_count: 0 })
    expect(await vaultRows(s.user, "SELECT 1 FROM entity_changes WHERE entity = 'transaction'")).toEqual([])
  })

  it('progress shows a frozen selection with every row remaining', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const res = await progressOf(kit, s.user, s.jobId, selectionId)
    expect(res.status).toBe(200)
    expect(res.body as ImportSelectionProgress).toEqual({ selection_id: selectionId, job_id: s.jobId, frozen_revision: '1', row_count: 3, status: 'open', committed: [], remaining: ids(s.rows) })
  })
})

describe('foreign jobs, selections and rows', () => {
  it('another account cannot correct, freeze, confirm or read an import, and a foreign row or wallet is refused', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(4))
    const own = await parsedImport(kit, fileRows(2))
    const intruder = own.user
    const intruderWallet = own.wallets.cash
    const theirs: Setup = { ...s, user: intruder }
    expect((await patchRows(kit, theirs, 1, [{ source_row_id: 'row:2', note: 'mine now' }])).status).toBe(404)
    expect((await freeze(kit, theirs, ['row:2'])).status).toBe(404)
    const selectionId = await frozen(kit, s, ['row:2', 'row:3'])
    expect((await confirm(kit, theirs, selectionId, ['row:2'])).status).toBe(404)
    expect((await progressOf(kit, intruder, s.jobId, selectionId)).status).toBe(404)
    // The intruder's own import cannot name the owner's selection either.
    expect((await confirm(kit, own, selectionId, ['row:2'])).status).toBe(404)
    expect((await progressOf(kit, s.user, own.jobId, selectionId)).status).toBe(404)
    // A row the preview does not have, and a wallet the owner does not own.
    const unknown = await freeze(kit, s, ['row:2', 'row:99'])
    expect([unknown.status, unknown.body.code]).toEqual([422, 'VALIDATION_FAILED'])
    const foreignWallet = await freeze(kit, s, ['row:2'], { mapping: { ...s.mapping, wallets: { Cash: intruderWallet, Bank: intruderWallet } } })
    expect([foreignWallet.status, foreignWallet.body.code]).toEqual([422, 'VALIDATION_FAILED'])
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await count(intruder, 'import_row_progress')).toBe(0)
  })

  it('the app login cannot write selections or candidates directly, nor record progress that is not its frozen row', async () => {
    // Changed form: a vault has no logins (its only writer is its own code), so the roles half does not apply;
    // the guard half does: 1B-T2's trigger refuses progress whose record is not the frozen row.
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(2))
    const selectionId = await frozen(kit, s, ['row:2'])
    const other = await kit.money.record(s.user, { type: 'expense', amount_minor: '100', occurred_on: '2026-02-01', wallet_id: s.wallets.cash, category_id: builtinId(s.user, 'food') })
    await expect(
      vaultExec(
        s.user,
        'INSERT INTO import_row_progress (job_id, source_row_id, selection_id, transaction_id, command_id, committed_at) VALUES (?, ?, ?, ?, ?, ?)',
        s.jobId,
        'row:2',
        selectionId,
        other,
        randomUUID(),
        new Date().toISOString(),
      ),
    ).rejects.toThrow(/a confirmed row is its frozen row saved as a new transaction/)
    expect(await count(s.user, 'import_row_progress')).toBe(0)
  })
})

describe('the frozen selection and its batches', () => {
  it('a 5,000-row frozen selection succeeds, but a 501-row confirmation batch is rejected', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(5_000))
    const started = Date.now()
    const res = await freeze(kit, s, ids(s.rows))
    // The planner's bound: the freeze stays linear in the file (one primary-key lookup per row), as the advice does (M1).
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(res.status).toBe(201)
    const ack = res.body as CommandAck
    expect(ack).toMatchObject({ outcome: 'created', entity_state: 'active', version: 1 })
    expect(await count(s.user, 'import_selection_rows')).toBe(5_000)
    const key = randomUUID()
    const tooMany = await confirm(kit, s, ack.entity_id, ids(s.rows).slice(0, IMPORT_CONFIRM_BATCH_MAX_ROWS + 1), { key })
    expect([tooMany.status, tooMany.body.code, tooMany.body.fields]).toEqual([422, 'VALIDATION_FAILED', { batch_row_ids: 'VALIDATION_FAILED' }])
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await vaultRows(s.user, 'SELECT 1 FROM command_receipts WHERE command_id = ?', key)).toEqual([])
    const first = await confirmed(kit, s, ack.entity_id, ids(s.rows).slice(0, IMPORT_CONFIRM_BATCH_MAX_ROWS))
    expect([first.committed?.length, first.remaining?.length]).toEqual([500, 4_500])
    expect(await count(s.user, 'transactions')).toBe(500)
  }, 60_000)

  it('second_batch_uses_same_frozen_selection', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(5_000))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const results: ConfirmImportBatchResult[] = []
    let remaining = ids(s.rows)
    while (remaining.length > 0 && results.length < 10) {
      const result = await confirmed(kit, s, selectionId, remaining.slice(0, 500))
      results.push(result)
      remaining = result.remaining ?? []
    }
    const [first, second] = results
    const committedRowIds = results.flatMap((result) => result.committed ?? [])
    expect(first?.selection_id).toBe(second?.selection_id)
    expect(new Set(committedRowIds).size).toBe(5000)
    expect(results).toHaveLength(10)
    expect(new Set(results.map((result) => result.selection_id))).toEqual(new Set([selectionId]))
    expect(results.every((result) => result.conflicted?.length === 0 && result.frozen_revision === '1')).toBe(true)
    // One version per batch on the selection, and one record per row.
    expect(results.map((result) => result.ack?.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(await count(s.user, 'transactions')).toBe(5_000)
    expect(await count(s.user, 'import_row_progress')).toBe(5_000)
  }, 120_000)

  it('a changed frozen revision, a stale selection and rows outside the selection conflict, and committed rows are never rewritten', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    const selectionId = await frozen(kit, s, ['row:2', 'row:3', 'row:4', 'row:5'])
    const wrongRevision = await confirm(kit, s, selectionId, ['row:2'], { frozenRevision: '2' })
    expect([wrongRevision.status, wrongRevision.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT'])
    const outside = await confirm(kit, s, selectionId, ['row:2', 'row:6'])
    expect([outside.status, outside.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT'])
    expect(await count(s.user, 'transactions')).toBe(0)

    const first = await confirmed(kit, s, selectionId, ['row:2', 'row:3'])
    expect(first.committed).toEqual(['row:2', 'row:3'])
    const before = await importTransactions(s)

    // A correction after the freeze makes the selection stale; a committed row cannot be corrected.
    const committedRow = await patchRows(kit, s, 1, [{ source_row_id: 'row:2', amount_minor: '1' }])
    expect([committedRow.status, committedRow.body.code]).toEqual([409, 'IMPORT_ROW_COMMITTED'])
    const corrected = await patchRows(kit, s, 1, [{ source_row_id: 'row:4', note: 'corrected after the freeze' }])
    expect([corrected.status, corrected.body.review_revision]).toEqual([200, '2'])
    const stale = await confirm(kit, s, selectionId, ['row:4'])
    expect([stale.status, stale.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT'])
    expect(await count(s.user, 'transactions')).toBe(2)
    const staleFreeze = await freeze(kit, s, ['row:4'], { revision: '1' })
    expect([staleFreeze.status, staleFreeze.body.code, staleFreeze.body.current]).toEqual([409, 'VERSION_CONFLICT', { review_revision: '2' }])

    // A new selection at revision 2, mapping Cash to the Bank wallet: rows
    // already committed are acknowledged as they were, untouched.
    const remapped: ImportMapping = { ...s.mapping, wallets: { Cash: s.wallets.bank, Bank: s.wallets.bank } }
    const next = await frozen(kit, s, ['row:2', 'row:3', 'row:4', 'row:5'], { revision: '2', mapping: remapped })
    const result = await confirmed(kit, s, next, ['row:2', 'row:3', 'row:4', 'row:5'], { frozenRevision: '2' })
    expect(result.committed).toEqual(['row:2', 'row:3', 'row:4', 'row:5'])
    const after = await importTransactions(s)
    expect(after).toHaveLength(4)
    for (const record of before) expect(after).toContainEqual(record)
    const row4 = after.find((record) => record.id === transactionId(s, 'row:4'))
    expect(row4).toMatchObject({ note: 'corrected after the freeze', wallet_id: s.wallets.bank, version: 1 })
  })

  it('overlapping retries acknowledge committed rows and continue the untouched ones', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(10))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const all = ids(s.rows)
    const key = randomUUID()
    const first = await confirmed(kit, s, selectionId, all.slice(0, 5), { key })
    // The same command again replays; an overlapping new command saves only what is new.
    const replay = await confirmed(kit, s, selectionId, all.slice(0, 5), { key })
    expect(replay).toEqual(first)
    const overlap = await confirmed(kit, s, selectionId, all.slice(2, 8))
    expect(overlap.committed).toEqual(all.slice(2, 8))
    expect(overlap.remaining).toEqual(all.slice(8))
    expect(await count(s.user, 'transactions')).toBe(8)
    // Two overlapping commands at once: every row once.
    const [a, b] = await Promise.all([confirm(kit, s, selectionId, all.slice(6, 10)), confirm(kit, s, selectionId, all.slice(8, 10))])
    expect([a.status, b.status]).toEqual([200, 200])
    expect((a.body as ConfirmImportBatchResult).committed).toEqual(all.slice(6, 10))
    expect((b.body as ConfirmImportBatchResult).committed).toEqual(all.slice(8, 10))
    const records = await importTransactions(s)
    expect(records.map((record) => record.id).sort()).toEqual(all.map((row) => transactionId(s, row)).sort())
    expect(await count(s.user, 'import_row_progress')).toBe(10)
    // The same key with another body is a mismatch, never a second save.
    const mismatch = await confirm(kit, s, selectionId, all.slice(0, 4), { key })
    expect([mismatch.status, mismatch.body.code]).toEqual([409, 'IDEMPOTENCY_MISMATCH'])
  })

  it('a record id already used is never written again, even if its progress row were lost', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    const selectionId = await frozen(kit, s, ids(s.rows))
    await confirmed(kit, s, selectionId, ['row:2'])
    // Simulated loss of the progress row: the record (and its head) remain.
    await vaultExec(s.user, "DELETE FROM import_row_progress WHERE job_id = ? AND source_row_id = 'row:2'", s.jobId)
    const again = await confirmed(kit, s, selectionId, ['row:2', 'row:3'])
    expect([again.committed, again.conflicted]).toEqual([['row:3'], ['row:2']])
    expect(await count(s.user, 'transactions')).toBe(2)
  })

  it('a kill after commit and before the response, retried with the original key and body, has the same outcome', async () => {
    // Changed form: the vault commits the batch and its answer never reaches the client (the Worker's call is dropped).
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(8))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const key = randomUUID()
    const lost = await stepCall(s.user, 'imports.confirm', { batch: batchOf(selectionId, ids(s.rows).slice(0, 5)), prepared: null }, { params: { id: s.jobId }, headers: commandHeaders(key) })
    expect(lost.ok).toBe(true)
    expect(await count(s.user, 'transactions')).toBe(5)
    const retried = await confirmed(kit, s, selectionId, ids(s.rows).slice(0, 5), { key })
    const again = await confirmed(kit, s, selectionId, ids(s.rows).slice(0, 5), { key })
    expect(retried).toEqual(again)
    expect(retried.committed).toEqual(ids(s.rows).slice(0, 5))
    expect(retried.remaining).toEqual(ids(s.rows).slice(5))
    const [receipt] = await vaultRows<{ entity_id: string; entity_version: number; revision: string }>(s.user, 'SELECT entity_id, entity_version, CAST(revision AS TEXT) AS revision FROM command_receipts WHERE command_id = ?', key)
    expect(retried.ack).toMatchObject({ command_id: key, entity_id: receipt?.entity_id, version: receipt?.entity_version, committed_revision: receipt?.revision, outcome: 'updated', entity_state: 'active' })
    expect(await count(s.user, 'transactions')).toBe(5)
  })

  it('a batch over the change-group budget is refused before commit, and smaller batches with new keys save it', async () => {
    const kit = await setup()
    const long = (i: number) => `${'💸'.repeat(498)}${String(i % 100).padStart(2, '0')}`
    const s = await parsedImport(kit, fileRows(500, { note: long, merchant: () => 'ร้าน'.repeat(30) }))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const key = randomUUID()
    const big = await confirm(kit, s, selectionId, ids(s.rows), { key })
    expect([big.status, big.body.code]).toEqual([413, 'COMMAND_TOO_LARGE'])
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await vaultRows(s.user, 'SELECT 1 FROM command_receipts WHERE command_id = ?', key)).toEqual([])
    for (const half of chunks(ids(s.rows), 250)) expect((await confirmed(kit, s, selectionId, half)).committed).toEqual(half)
    expect(await count(s.user, 'transactions')).toBe(500)
  }, 60_000)

  it('a row whose wallet was archived after the freeze is conflicted; the rest are saved', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const bank = await json(await kit.v1.as(s.user).get(`/v1/wallets/${s.wallets.bank}`))
    expect((await json(await kit.v1.as(s.user).post(`/v1/wallets/${s.wallets.bank}/archive`, {}, { ifMatch: (bank.body as { version: number }).version }))).status).toBe(200)
    const result = await confirmed(kit, s, selectionId, ids(s.rows))
    const bankRows = s.rows.filter((row) => row.wallet === 'Bank').map((row) => row.id)
    expect(result.conflicted).toEqual(bankRows)
    expect(result.committed).toEqual(ids(s.rows).filter((id) => !bankRows.includes(id)))
    expect(result.remaining).toEqual([])
    expect(await count(s.user, 'transactions')).toBe(6 - bankRows.length)
  })

  it('a re-freeze after a partial confirmation does not re-validate rows already committed, even if their wallet or category was archived since', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    const all = ids(s.rows)
    const firstSelection = await frozen(kit, s, all)
    // row:2 (Bank, food) and row:3 (Cash, travel) become records.
    expect((await confirmed(kit, s, firstSelection, ['row:2', 'row:3'])).committed).toEqual(['row:2', 'row:3'])
    const before = await importTransactions(s)

    await archiveWalletWithRecords(kit, s, s.wallets.bank)
    const foodId = builtinId(s.user, 'food')
    const categories = (await json(await kit.v1.as(s.user).get('/v1/categories'))).body as unknown as { id: string; version: number }[]
    const food = categories.find((category) => category.id === foodId)
    const archivedFood = await json(await kit.v1.as(s.user).post(`/v1/categories/${foodId}/archive`, {}, { ifMatch: food?.version }))
    expect([archivedFood.status, archivedFood.body.code]).toEqual([200, undefined])

    // Only the rows still to be written are problems: row:4 (food), row:5 (Bank) and row:6 (food).
    const refused = await freeze(kit, s, all)
    expect([refused.status, refused.body.code]).toEqual([422, 'VALIDATION_FAILED'])
    expect(refused.body.fields).toEqual({ 'row:4': 'errors.category_archived', 'row:5': 'errors.wallet_archived', 'row:6': 'errors.category_archived' })

    // Dropping them, the full selection of committed rows plus the one open row freezes.
    const second = await frozen(kit, s, ['row:2', 'row:3', 'row:7'])
    const result = await confirmed(kit, s, second, ['row:2', 'row:3', 'row:7'])
    expect(result.committed).toEqual(['row:2', 'row:3', 'row:7'])
    expect(result.conflicted).toEqual([])
    const after = await importTransactions(s)
    expect(after).toHaveLength(3)
    for (const record of before) expect(after).toContainEqual(record)
  })

  it('a re-freeze of only committed rows succeeds after their wallet and category are archived', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(4))
    const firstSelection = await frozen(kit, s, ids(s.rows))
    expect((await confirmed(kit, s, firstSelection, ['row:2'])).committed).toEqual(['row:2'])
    await archiveWalletWithRecords(kit, s, s.wallets.bank)
    const second = await frozen(kit, s, ['row:2'])
    const result = await confirmed(kit, s, second, ['row:2'])
    expect([result.committed, result.conflicted, result.remaining]).toEqual([['row:2'], [], []])
    expect(await count(s.user, 'transactions')).toBe(1)
  })

  it("a row dated before its wallet's tracking start, moved after the freeze, is conflicted", async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const cash = await json(await kit.v1.as(s.user).get(`/v1/wallets/${s.wallets.cash}`))
    const moved = await json(await kit.v1.as(s.user).patch(`/v1/wallets/${s.wallets.cash}`, { tracking_start: '2026-04-01' }, { ifMatch: (cash.body as { version: number }).version }))
    expect(moved.status).toBe(200)
    const result = await confirmed(kit, s, selectionId, ids(s.rows))
    const early = s.rows.filter((row) => row.wallet === 'Cash' && row.date < '2026-04-01').map((row) => row.id)
    expect(early.length).toBeGreaterThan(0)
    expect(result.conflicted).toEqual(early)
    expect(await count(s.user, 'transactions')).toBe(6 - early.length)
  })

  it('the database refuses stale, unknown and committed rows even when its routines are called directly', async () => {
    // Changed form: the vault's routines are its commands' own code (ported cases above refuse stale, unknown and
    // committed rows); its tables refuse them too: the guard trigger and the progress table's key.
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    const selectionId = await frozen(kit, s, ['row:2', 'row:3'])
    await confirmed(kit, s, selectionId, ['row:3'])
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:4', note: 'later' }])).status).toBe(200)
    const frozenRow = async (selection: string, sourceRowId: string) =>
      (await vaultRows<Record<string, string | null>>(
        s.user,
        'SELECT type, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, wallet_id, category_id, note, merchant FROM import_selection_rows WHERE selection_id = ? AND source_row_id = ?',
        selection,
        sourceRowId,
      ))[0]
    const recordAndProgress = (id: string, row: Record<string, string | null> | undefined, sourceRowId: string, selection: string) =>
      runInDurableObject(vaultOf(s.user), (_vault, state) => {
        state.storage.transactionSync(() => {
          const at = new Date().toISOString()
          state.storage.sql.exec(
            "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, version, created_at, updated_at) VALUES (?, ?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, 1, ?, ?)",
            id, row?.type ?? null, row?.amount_minor ?? null, row?.occurred_on ?? null, row?.wallet_id ?? null, row?.category_id ?? null, row?.note ?? null, row?.merchant ?? null, at, at,
          )
          state.storage.sql.exec('INSERT INTO import_row_progress (job_id, source_row_id, selection_id, transaction_id, command_id, committed_at) VALUES (?, ?, ?, ?, ?, ?)', s.jobId, sourceRowId, selection, id, randomUUID(), at)
        })
      })
    // A record that is exactly the frozen row, recorded as progress of a selection the preview has moved past.
    await expect(recordAndProgress(transactionId(s, 'row:2'), await frozenRow(selectionId, 'row:2'), 'row:2', selectionId)).rejects.toThrow(/a confirmed row is its frozen row saved as a new transaction/)
    // A committed source row stays committed once: a later selection cannot record it again.
    const later = await frozen(kit, s, ['row:3'], { revision: '2' })
    await expect(recordAndProgress(randomUUID(), await frozenRow(later, 'row:3'), 'row:3', later)).rejects.toThrow(/UNIQUE constraint failed: import_row_progress/)
    expect(await count(s.user, 'transactions')).toBe(1)
  })

  it('every selected row needs its labels mapped, and transfers cannot be confirmed from a file', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(4))
    const unmapped = await freeze(kit, s, ids(s.rows), { mapping: { ...s.mapping, wallets: { Cash: s.wallets.cash } } })
    expect([unmapped.status, unmapped.body.code]).toEqual([422, 'VALIDATION_FAILED'])
    expect(unmapped.body.fields).toEqual(Object.fromEntries(s.rows.filter((row) => row.wallet === 'Bank').map((row) => [row.id, 'errors.import_wallet_unmapped'])))
    const noCategory = await freeze(kit, s, ids(s.rows), { mapping: { ...s.mapping, categories: { expense: {}, income: s.mapping.categories.income } } })
    expect(noCategory.body.fields).toEqual(Object.fromEntries(s.rows.filter((row) => row.type === 'expense').map((row) => [row.id, 'errors.import_category_unmapped'])))
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', type: 'transfer' }])).status).toBe(200)
    const transfer = await freeze(kit, s, ['row:2'], { revision: '2' })
    expect([transfer.status, transfer.body.code, transfer.body.fields]).toEqual([422, 'VALIDATION_FAILED', { 'row:2': 'errors.import_row_transfer' }])
    expect(await count(s.user, 'import_selections')).toBe(0)
  })
})

describe('receipts (P2c) kept with a confirmed image row', () => {
  /** A member with Cash and a parsed receipt photo (its one review-only row). */
  async function receiptImport(kit: Kit, owner?: TestUser) {
    const user = owner ?? (await kit.money.member())
    const cash = owner ? '' : await kit.money.wallet(user, { name: 'Cash' })
    const jobId = await seedPreview(user, recordOf([RECEIPT_ROW]), { image: true })
    const read = await previewOf(kit, user, jobId)
    expect(read.candidates.map((row) => row.source_row_id)).toEqual(['image:1'])
    const attachmentId = read.summary?.image?.attachment_id as string
    expect(attachmentId).toMatch(/^[0-9a-f-]{36}$/)
    const s: Setup = { user, jobId, rows: [], wallets: { cash, bank: '' }, mapping: { wallets: { Cash: cash }, categories: { expense: { food: builtinId(user, 'food') }, income: {} } } }
    return { s, attachmentId }
  }

  /** The image row corrected into a Cash food expense (revision 2) and frozen. */
  async function frozenReceipt(kit: Kit, s: Setup): Promise<string> {
    const corrected = await patchRows(kit, s, 1, [{ source_row_id: 'image:1', occurred_on: '2026-03-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash', category_label: 'food' }])
    expect(corrected.status).toBe(200)
    return frozen(kit, s, ['image:1'], { revision: '2' })
  }

  it('the record an image row becomes holds the kept receipt, in the same command, only with consent', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const other = await receiptImport(kit, s.user)
    const selectionId = await frozenReceipt(kit, s)
    const noConsent = await confirm(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: 'yes' } })
    expect([noConsent.status, noConsent.body.message_key]).toEqual([422, 'errors.consent_required'])
    const elsewhere = await confirm(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: other.attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    expect([elsewhere.status, elsewhere.body.message_key]).toEqual([422, 'errors.import_receipt_not_this_import'])
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await count(s.user, 'attachments')).toBe(0)
    // Refused by the read-only checks, before any copy: nothing was reserved, not even a due one.
    expect(await receiptKeys(s.user)).toEqual([])

    const key = randomUUID()
    const receipt = { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT }
    const result = await confirmed(kit, s, selectionId, ['image:1'], { frozenRevision: '2', key, receipt })
    expect(result.committed).toEqual(['image:1'])
    const recordId = transactionId(s, 'image:1')
    const record = await json(await kit.v1.as(s.user).get(`/v1/transactions/${recordId}`))
    expect(record.body).toMatchObject({ id: recordId, amount_minor: '6500', occurred_on: '2026-03-03', version: 1, attachment_id: attachmentId })
    const [change] = await vaultRows<{ snapshot: string }>(s.user, "SELECT snapshot FROM entity_changes WHERE entity = 'transaction' AND entity_id = ?", recordId)
    expect((JSON.parse(change?.snapshot ?? '{}') as { attachment_id?: string }).attachment_id).toBe(attachmentId)
    const [audit] = await vaultRows<{ metadata: string }>(s.user, 'SELECT metadata FROM audit_events WHERE command_id = ?', key)
    expect(JSON.parse(audit?.metadata ?? '{}')).toMatchObject({ consent: RECEIPT_RETENTION_CONSENT, rows: '1' })
    // A replay keeps exactly one receipt and one published copy.
    expect(await confirmed(kit, s, selectionId, ['image:1'], { frozenRevision: '2', key, receipt })).toEqual(result)
    expect(await vaultRows(s.user, 'SELECT status FROM attachments')).toEqual([{ status: 'retained' }])
    expect((await receiptKeys(s.user)).filter((row) => row.status === 'published')).toHaveLength(1)
    expect((await json(await kit.v1.as(s.user).get(`/v1/attachments/${attachmentId}/grant`))).status).toBe(200)
  })

  it('an invalid batch makes no copy: a wrong revision, a stale selection or an unknown selection never reaches the receipt copy', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    const receipt = { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT }

    const wrongRevision = await confirm(kit, s, selectionId, ['image:1'], { frozenRevision: '1', receipt })
    expect([wrongRevision.status, wrongRevision.body.code]).toEqual([409, 'IMPORT_SELECTION_CONFLICT'])
    const unknown = await confirm(kit, s, randomUUID(), ['image:1'], { frozenRevision: '2', receipt })
    expect(unknown.status).toBe(404)
    // Corrected after the freeze: the selection is stale.
    expect((await patchRows(kit, s, 2, [{ source_row_id: 'image:1', note: 'later' }])).status).toBe(200)
    const stale = await confirm(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt })
    expect([stale.status, stale.body.message_key]).toEqual([409, 'errors.import_selection_stale'])

    expect(await receiptKeys(s.user)).toEqual([])
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await count(s.user, 'attachments')).toBe(0)
    // Nothing was spent or half-done: after freezing again the same receipt still works.
    const again = await frozen(kit, s, ['image:1'], { revision: '3' })
    const done = await confirmed(kit, s, again, ['image:1'], { frozenRevision: '3', receipt })
    expect(done.committed).toEqual(['image:1'])
    expect(await vaultRows(s.user, 'SELECT status FROM attachments')).toEqual([{ status: 'retained' }])
    expect(await receiptKeys(s.user)).toHaveLength(1)
  })

  it('a receipt that can no longer be kept refuses the batch, and the record can be saved without it', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    // The sanitized image is past its window (less than two minutes left).
    await vaultExec(s.user, "UPDATE vault_objects SET delete_after = ? WHERE purpose = 'import_image' AND instr(key, ?) > 0", Date.now() + MIN, `/${s.jobId}/`)
    const late = await confirm(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    expect([late.status, late.body.message_key]).toEqual([422, 'errors.attachment_expired'])
    expect(await count(s.user, 'transactions')).toBe(0)
    const alone = await confirmed(kit, s, selectionId, ['image:1'], { frozenRevision: '2' })
    expect(alone.committed).toEqual(['image:1'])
    const record = await json(await kit.v1.as(s.user).get(`/v1/transactions/${transactionId(s, 'image:1')}`))
    expect(record.body.attachment_id).toBeUndefined()
    expect(await count(s.user, 'attachments')).toBe(0)
  })

  it('a receipt goes only with its image row', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(2))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const res = await confirm(kit, s, selectionId, ids(s.rows), { receipt: { attachment_id: randomUUID(), consent: RECEIPT_RETENTION_CONSENT } })
    expect([res.status, res.body.fields]).toEqual([422, { receipt: 'VALIDATION_FAILED' }])
  })

  // The plan's case: one copy, attached to the record the image row becomes.
  it('a confirmation with a receipt copies the import image once and attaches it to the image row\'s record', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    const result = await confirmed(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    expect(result.committed).toEqual(['image:1'])
    const copies = await storedKeys(`receipt/${vaultIdOf(s.user)}/${attachmentId}/`)
    expect(copies).toHaveLength(1)
    expect(await receiptKeys(s.user)).toEqual([{ key: copies[0], status: 'published' }])
    const record = await json(await kit.v1.as(s.user).get(`/v1/transactions/${transactionId(s, 'image:1')}`))
    expect(record.body.attachment_id).toBe(attachmentId)
    expect(await vaultRows(s.user, 'SELECT transaction_id, attachment_id FROM transaction_attachments')).toEqual([{ transaction_id: transactionId(s, 'image:1'), attachment_id: attachmentId }])
  })

  // The planner's: the 503 of a batch whose read-only checks refused before any copy, but whose command passes.
  it('a confirmation whose receipt was never prepared answers 503 and saves nothing, and one with nothing copied is refused as expired', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    const batch = batchOf(selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    const unprepared = await stepCall(s.user, 'imports.confirm', { batch, prepared: null }, { params: { id: s.jobId }, headers: commandHeaders() })
    expect(unprepared).toMatchObject({ ok: false, status: 503, code: 'SERVICE_UNAVAILABLE', problem: { retryAfterSeconds: 1 } })
    const uncopied = await stepCall(s.user, 'imports.confirm', { batch, prepared: { kind: 'none' } }, { params: { id: s.jobId }, headers: commandHeaders() })
    expect(uncopied).toMatchObject({ ok: false, status: 422, code: 'VALIDATION_FAILED', problem: { messageKey: 'errors.attachment_expired' } })
    expect(await count(s.user, 'transactions')).toBe(0)
    expect(await count(s.user, 'import_row_progress')).toBe(0)
    expect(await count(s.user, 'attachments')).toBe(0)
  })

  // The planner's: the Worker's side of that 503, through confirmRoute with the vault session wrapped.
  it('a selection frozen while its confirmation was being prepared answers 503 with a retry, never saving the image record without its receipt', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'image:1', occurred_on: '2026-03-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash', category_label: 'food' }])).status).toBe(200)
    // A selection's id follows from the account and the freeze's command id, so a batch can name it before it exists.
    const freezeKey = randomUUID()
    const selectionId = derivedUuid(s.user.sub, 'import-selection', freezeKey)
    const claims = { accountId: s.user.sub, sessionId: s.user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios' }
    const session = vaultSession(env, claims, TEST_POLICIES, 'current_policy', 'write')
    const steps: string[] = []
    const vault: VaultSession = {
      ...session,
      async call(route, input) {
        const reply = await session.call(route, input)
        steps.push(route)
        // The freeze lands after the prepare step refused (no such selection yet) and before the command step.
        if (steps.length === 1) expect((await freeze(kit, s, ['image:1'], { revision: '2', key: freezeKey })).status).toBe(201)
        return reply
      },
    }
    const reply = await confirmRoute({
      env,
      request: new Request(`${BASE}/v1/imports/${s.jobId}/confirmations`, { method: 'POST' }),
      claims,
      policies: TEST_POLICIES,
      gates: new FeatureGates(),
      params: { id: s.jobId },
      query: {},
      headers: commandHeaders(),
      body: batchOf(selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } }),
      vault,
      waitUntil: () => undefined,
    })
    expect(reply).toMatchObject({ ok: false, status: 503, code: 'SERVICE_UNAVAILABLE', problem: { retryAfterSeconds: 1 } })
    expect(steps).toEqual(['imports.confirmPrepare', 'imports.confirm'])
    expect(await receiptKeys(s.user)).toEqual([])
    expect(await count(s.user, 'transactions')).toBe(0)
  })

  // The planner's: a copy the batch's command did not use is given back at once (the Worker's release).
  it('a copy the confirmation did not use is due at once', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    // The wallet is archived after the freeze: the image row is conflicted, so neither its record nor the receipt is saved.
    const cash = await json(await kit.v1.as(s.user).get(`/v1/wallets/${s.wallets.cash}`))
    expect((await json(await kit.v1.as(s.user).post(`/v1/wallets/${s.wallets.cash}/archive`, {}, { ifMatch: (cash.body as { version: number }).version }))).status).toBe(200)
    const result = await confirmed(kit, s, selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    expect([result.committed, result.conflicted]).toEqual([[], ['image:1']])
    const copies = await vaultRows<{ status: string; delete_after: number }>(s.user, "SELECT status, delete_after FROM vault_objects WHERE purpose = 'receipt'")
    expect(copies.map((copy) => copy.status)).toEqual(['reserved'])
    expect(copies[0]?.delete_after).toBeLessThanOrEqual(Date.now())
    expect(await count(s.user, 'attachments')).toBe(0)
  })

  // The planner's: both confirmation steps check the session (1B-T9 review m-1).
  it('the confirmation steps check the session: after sign-out nothing is reserved or saved', async () => {
    const kit = await setup()
    const { s, attachmentId } = await receiptImport(kit)
    const selectionId = await frozenReceipt(kit, s)
    const batch = batchOf(selectionId, ['image:1'], { frozenRevision: '2', receipt: { attachment_id: attachmentId, consent: RECEIPT_RETENTION_CONSENT } })
    expect((await kit.v1.as(s.user).post('/v1/me/logout')).status).toBe(204)
    const key = randomUUID()
    const prepared = await stepCall(s.user, 'imports.confirmPrepare', { command_id: key, batch }, { params: { id: s.jobId } })
    expect(prepared).toMatchObject({ ok: false, status: 401, code: 'SESSION_REQUIRED' })
    const committed = await stepCall(s.user, 'imports.confirm', { batch, prepared: { kind: 'none' } }, { params: { id: s.jobId }, headers: commandHeaders(key) })
    expect(committed).toMatchObject({ ok: false, status: 401, code: 'SESSION_REQUIRED' })
    expect(await receiptKeys(s.user)).toEqual([])
    expect(await count(s.user, 'transactions')).toBe(0)
  })
})

describe('review corrections', () => {
  it('are versioned commands that clear the corrected issues and recompute the totals', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    const key = randomUUID()
    const res = await patchRows(kit, s, 1, [{ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null }, { source_row_id: 'row:3', occurred_on: '2026-03-03', note: '' }], key)
    expect(res.status).toBe(200)
    expect(res.body.review_revision).toBe('2')
    expect(res.body.ack).toMatchObject({ command_id: key, entity_id: s.jobId, outcome: 'updated', version: 1 })
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null }, { source_row_id: 'row:3', occurred_on: '2026-03-03', note: '' }], key)).body).toEqual(res.body)
    const read = await previewOf(kit, s.user, s.jobId)
    expect(read.review_revision).toBe('2')
    expect(read.candidates[0]).toMatchObject({ source_row_id: 'row:2', amount_minor: '12345', wallet_label: null, review_required: true })
    expect(read.candidates[1]).toMatchObject({ source_row_id: 'row:3', occurred_on: '2026-03-03', note: null })
    const expense = s.rows.slice(1).filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.minor, 12345n)
    expect(read.summary?.totals.expense_minor).toBe(expense.toString())
    const stale = await patchRows(kit, s, 1, [{ source_row_id: 'row:4', note: 'late' }])
    expect([stale.status, stale.body.code, stale.body.current]).toEqual([409, 'VERSION_CONFLICT', { review_revision: '2' }])
    const tooMany = await patchRows(kit, s, 2, Array.from({ length: 501 }, (_, i) => ({ source_row_id: `row:${i + 2}`, note: 'x' })))
    expect([tooMany.status, tooMany.body.code]).toEqual([422, 'VALIDATION_FAILED'])
    expect((await patchRows(kit, s, 2, [{ source_row_id: 'row:99', note: 'x' }])).status).toBe(422)
  })

  // The planner's: only the issues of the fields a correction names are cleared.
  it('a correction clears the issues of the fields it names and keeps the others', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await seedPreview(
      user,
      recordOf([
        { source_row_id: 'row:2', occurred_on: null, type: 'expense', amount_minor: '100', wallet_label: null, category_label: 'food', merchant: null, note: null, issues: [{ field: 'occurred_on', code: 'missing_date' }, { field: 'wallet_label', code: 'missing_wallet' }] },
        // Every value it needs, and an issue on its note: it still needs review.
        { source_row_id: 'row:3', occurred_on: '2026-03-02', type: 'expense', amount_minor: '200', wallet_label: 'Cash', category_label: 'food', merchant: null, note: null, issues: [{ field: 'note', code: 'invalid_text' }] },
      ]),
    )
    const s: Setup = { user, jobId, rows: [], wallets: { cash: '', bank: '' }, mapping: { wallets: {}, categories: { expense: {}, income: {} } } }
    const issuesOf = (read: ImportPreview, row: string) => read.issues.filter((issue) => issue.source_row_id === row).map((issue) => issue.code)
    const flags = (read: ImportPreview) => [read.candidates.map((candidate) => candidate.review_required), read.summary?.review_required_count]
    const parsed = await previewOf(kit, user, jobId)
    expect([issuesOf(parsed, 'row:2'), issuesOf(parsed, 'row:3')]).toEqual([['missing_date', 'missing_wallet'], ['invalid_text']])
    expect(flags(parsed)).toEqual([[true, true], 2])
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', wallet_label: 'Cash' }, { source_row_id: 'row:3', amount_minor: '250' }])).status).toBe(200)
    const once = await previewOf(kit, user, jobId)
    expect([issuesOf(once, 'row:2'), issuesOf(once, 'row:3')]).toEqual([['missing_date'], ['invalid_text']])
    expect(flags(once)).toEqual([[true, true], 2])
    expect((await patchRows(kit, s, 2, [{ source_row_id: 'row:2', occurred_on: '2026-03-01' }])).status).toBe(200)
    const twice = await previewOf(kit, user, jobId)
    expect([issuesOf(twice, 'row:2'), issuesOf(twice, 'row:3')]).toEqual([[], ['invalid_text']])
    expect(flags(twice)).toEqual([[false, true], 1])
  })
})

describe('expiry and retention', () => {
  it('an expired preview cannot be frozen or confirmed, and retention removes its frozen copies and synced records', async () => {
    // Changed form: pruneImports at a chosen vault clock does what the API's `imports.selections` retention step does
    // (the 1B-T10 review's n-2).
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'kept' }])).status).toBe(200)
    const selectionId = await frozen(kit, s, ids(s.rows), { revision: '2' })
    await ageAll(s.user, s.jobId, 8)
    await vaultExec(s.user, "UPDATE import_selections SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') WHERE job_id = ?", s.jobId)
    const refreeze = await freeze(kit, s, ids(s.rows), { revision: '2' })
    expect([refreeze.status, refreeze.body.code]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE'])
    const late = await confirm(kit, s, selectionId, ['row:2'], { frozenRevision: '2' })
    expect([late.status, late.body.code]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE'])
    const heads = () => vaultRows<{ entity: string; state: string }>(s.user, "SELECT entity, state FROM entity_heads WHERE entity LIKE 'import%' ORDER BY entity")
    const line = async () => (await vaultRows<{ line: string }>(s.user, 'SELECT CAST(pruned_through AS TEXT) AS line FROM sync_state'))[0]?.line
    const before = await line()
    // At the preview's expiry the frozen copies (private fields) go at once ...
    expect(await prune(s.user)).toBe(true)
    expect(await count(s.user, 'import_selections')).toBe(0)
    expect(await count(s.user, 'import_selection_rows')).toBe(0)
    // ... while the compact synced records stay inside the 30-day delta window (no forced resync).
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'active' }, { entity: 'import_selection', state: 'active' }])
    expect(await line()).toBe(before)
    await vaultExec(s.user, "UPDATE entity_changes SET committed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 days') WHERE entity LIKE 'import%'")
    expect(await prune(s.user)).toBe(true)
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'purged' }, { entity: 'import_selection', state: 'purged' }])
    expect(await prune(s.user)).toBe(false)
  })
})

describe('a 5,000-row synthetic import', () => {
  it('confirms in batches of 500 through one interruption and restart, and reconciles exact wallet and category totals', async () => {
    // Changed form: the fifth batch commits in the vault and its answer is lost (the Worker's call is dropped);
    // the restart evicts the vault and starts a new front door.
    let kit = await setup()
    const s = await parsedImport(kit, fileRows(5_000))
    const selectionId = await frozen(kit, s, ids(s.rows))
    let remaining = ids(s.rows)
    let batches = 0
    let interrupted: { key: string; rows: string[] } | null = null
    while (remaining.length > 0 && batches < 10) {
      const batch = remaining.slice(0, 500)
      const key = randomUUID()
      if (batches === 4 && !interrupted) {
        const lost = await stepCall(s.user, 'imports.confirm', { batch: batchOf(selectionId, batch), prepared: null }, { params: { id: s.jobId }, headers: commandHeaders(key) })
        expect(lost.ok).toBe(true)
        interrupted = { key, rows: batch }
        await evictDurableObject(vaultOf(s.user))
        kit = await setup()
        // The client resolves the unknown outcome with the original key and body first.
        const resolved = await confirmed(kit, s, selectionId, interrupted.rows, { key: interrupted.key })
        expect(resolved.committed).toEqual(batch)
        remaining = resolved.remaining ?? []
        batches += 1
        continue
      }
      const result = await confirmed(kit, s, selectionId, batch, { key })
      expect(result.committed).toEqual(batch)
      remaining = result.remaining ?? []
      batches += 1
    }
    expect(batches).toBe(10)
    expect(interrupted).not.toBeNull()
    expect(await count(s.user, 'transactions')).toBe(5_000)
    expect(await count(s.user, 'import_row_progress')).toBe(5_000)

    const signed = (row: FileRow) => (row.type === 'income' ? row.minor : -row.minor)
    const expectedWallets = { [s.wallets.cash]: 0n, [s.wallets.bank]: 0n }
    const expectedCategories: Record<string, bigint> = {}
    for (const row of s.rows) {
      const wallet = row.wallet === 'Cash' ? s.wallets.cash : s.wallets.bank
      expectedWallets[wallet] += signed(row)
      const category = builtinId(s.user, row.category)
      expectedCategories[category] = (expectedCategories[category] ?? 0n) + row.minor
    }
    expect(await kit.money.balances(s.user)).toEqual(Object.fromEntries(Object.entries(expectedWallets).map(([id, total]) => [id, total.toString()])))
    const categories = await vaultRows<{ category_id: string; total: string }>(s.user, 'SELECT category_id, CAST(sum(amount_minor) AS TEXT) AS total FROM transactions GROUP BY category_id')
    expect(Object.fromEntries(categories.map((row) => [row.category_id, row.total]))).toEqual(Object.fromEntries(Object.entries(expectedCategories).map(([id, total]) => [id, total.toString()])))
    const progress = await progressOf(kit, s.user, s.jobId, selectionId)
    expect(progress.body).toMatchObject({ status: 'open', remaining: [] })
    expect((progress.body as ImportSelectionProgress).committed).toHaveLength(5_000)
  }, 180_000)
})

describe('privacy of receipts and synced progress', () => {
  it('receipts, audit rows and synced progress carry no candidate fields', async () => {
    const kit = await setup()
    const rows = fileRows(4, { note: (i) => `secret-note-${i}`, merchant: (i) => `secret-shop-${i}` })
    const s = await parsedImport(kit, rows)
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'secret-patched-note' }])).status).toBe(200)
    const selectionId = await frozen(kit, s, ids(rows), { revision: '2' })
    await confirmed(kit, s, selectionId, ids(rows), { frozenRevision: '2' })
    const changes = await vaultRows<{ entity: string; snapshot: string }>(s.user, "SELECT entity, snapshot FROM entity_changes WHERE entity LIKE 'import%'")
    expect(changes.length).toBeGreaterThanOrEqual(3)
    for (const change of changes) {
      const snapshot: unknown = JSON.parse(change.snapshot)
      expect(change.entity === 'import_review' ? isImportReviewSnapshot(snapshot) : isImportSelectionSnapshot(snapshot)).toBe(true)
    }
    const receipts = await vaultRows(s.user, 'SELECT command_id, kind, schema_version, entity, entity_id, entity_version, outcome, entity_state, revision FROM command_receipts')
    const audit = await vaultRows(s.user, 'SELECT kind, metadata FROM audit_events')
    const text = JSON.stringify({ changes, receipts, audit })
    for (const secret of ['secret-note', 'secret-shop', 'secret-patched-note', 'Cash', 'Bank', 'food', 'salary']) expect(text).not.toContain(secret)
  })

  it('registers selection retention, and the new tables cascade from accounts', async () => {
    // Changed form: a vault holds one account and its erase deletes it whole (B22). Its retention is pruneImports,
    // whose due time names a frozen selection's expiry; the confirmation tables cascade from the upload row
    // pruneUploads drops 30 days after the raw file's expiry, and the record stays.
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(2))
    const selectionId = await frozen(kit, s, ids(s.rows))
    await confirmed(kit, s, selectionId, ['row:2'])
    const [selection] = await vaultRows<{ expires_at: string }>(s.user, 'SELECT expires_at FROM import_selections WHERE selection_id = ?', selectionId)
    expect(await dueAt(s.user)).toBe(Date.parse(selection?.expires_at ?? ''))
    const [upload_] = await vaultRows<{ expires_at: string }>(s.user, 'SELECT expires_at FROM import_uploads WHERE job_id = ?', s.jobId)
    await runInDurableObject(vaultOf(s.user), (_vault, state) => pruneUploads(fileAt(state, Date.parse(upload_?.expires_at ?? '') + 30 * DAY)))
    for (const table of ['import_uploads', 'import_previews', 'import_candidates', 'import_selections', 'import_selection_rows', 'import_row_progress']) expect([table, await count(s.user, table)]).toEqual([table, 0])
    expect(await count(s.user, 'transactions')).toBe(1)
  })
})

// The plan's two scale cases (ruling R57).
describe('one command per batch, and lists bound as one parameter', () => {
  it('a confirmation batch of 500 rows commits as one command under one revision', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(500))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const key = randomUUID()
    const result = await confirmed(kit, s, selectionId, ids(s.rows), { key })
    expect(result.committed).toHaveLength(500)
    expect(await count(s.user, 'transactions')).toBe(500)
    expect(await count(s.user, 'import_row_progress')).toBe(500)
    const revisions = await vaultRows<{ revision: string; n: number }>(
      s.user,
      "SELECT CAST(revision AS TEXT) AS revision, count(*) AS n FROM entity_changes WHERE entity IN ('transaction', 'import_selection') AND revision > (SELECT min(revision) FROM entity_changes WHERE entity = 'import_selection') GROUP BY revision",
    )
    expect(revisions).toEqual([{ revision: result.ack?.committed_revision, n: 501 }])
    const [selection] = await vaultRows<{ snapshot: string }>(s.user, "SELECT snapshot FROM entity_changes WHERE entity = 'import_selection' AND CAST(revision AS TEXT) = ?", result.ack?.committed_revision)
    expect(JSON.parse(selection?.snapshot ?? 'null')).toEqual({ id: selectionId, job_id: s.jobId, frozen_revision: '1', row_count: 500, committed_count: 500 })
    const progress = await vaultRows<{ n: number }>(s.user, 'SELECT count(*) AS n FROM import_row_progress WHERE command_id = ? AND transaction_id IS NOT NULL', key)
    expect(progress).toEqual([{ n: 500 }])
    const resent = await confirmed(kit, s, selectionId, ids(s.rows), { key })
    expect(resent.ack).toEqual(result.ack)
    expect(await count(s.user, 'transactions')).toBe(500)
    expect(await vaultRows(s.user, 'SELECT CAST(revision AS TEXT) AS revision FROM sync_state')).toEqual([{ revision: result.ack?.committed_revision }])
  }, 60_000)

  it('a selection naming 1,000 rows freezes', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(1_200))
    const res = await freeze(kit, s, ids(s.rows).slice(0, 1_000))
    expect(res.status).toBe(201)
    const progress = await progressOf(kit, s.user, s.jobId, (res.body as CommandAck).entity_id)
    expect([progress.status, progress.body.row_count, progress.body.remaining?.length]).toEqual([200, 1_000, 1_000])
  }, 60_000)
})

// ===========================================================================
// Ported from import-preview.integration.spec.ts (1B-T5 ported the other 17)
// ===========================================================================

describe('a parsed upload becomes a reviewable preview and nothing else', () => {
  it('serves exact candidates, issues and totals to the owner, with a 7-day expiry and revision 1', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const parsedAt = Date.now()
    const jobId = await parsedUpload(kit, user, MEOWJOT_ROWS, { layout: 'meowjot' })
    const result = await previewOf(kit, user, jobId)
    expect(result).toMatchObject({ job_id: jobId, status: 'ready', review_revision: '1', duplicate_advice: [] })
    expect(result.candidates).toEqual([
      { source_row_id: 'row:2', ordinal: 1, occurred_on: '2025-12-01', type: 'expense', amount_minor: '29000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'บริษัท สบาย สบาย จำกัด', note: 'ข้าวมันไก่', review_required: false },
      { source_row_id: 'row:3', ordinal: 2, occurred_on: '2025-12-02', type: 'expense', amount_minor: '23000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'คอฟฟี่ แอนด์ โค', note: null, review_required: false },
      { source_row_id: 'row:4', ordinal: 3, occurred_on: '2025-12-03', type: 'expense', amount_minor: '2000', wallet_label: 'กรุงไทย', category_label: 'สุขภาพ, ดูแลตัวเอง', merchant: 'การกีฬาสุขภาพดี', note: null, review_required: false },
      { source_row_id: 'row:5', ordinal: 4, occurred_on: '2025-12-03', type: 'income', amount_minor: '200000', wallet_label: null, category_label: 'ค่าจ้าง', merchant: null, note: null, review_required: true },
      { source_row_id: 'row:6', ordinal: 5, occurred_on: '2025-12-04', type: 'expense', amount_minor: '100000', wallet_label: 'KBANK PLATINUM', category_label: 'ช้อปปิ้ง', merchant: 'EASY MALL', note: null, review_required: false },
      { source_row_id: 'row:7', ordinal: 6, occurred_on: '2025-12-05', type: 'income', amount_minor: '35000', wallet_label: 'KBANK PLATINUM', category_label: 'เงินคืน', merchant: 'THE CLOTH SHOP', note: null, review_required: false },
    ])
    expect(result.issues).toEqual([{ code: 'missing_wallet', source_row_id: 'row:5', field: 'wallet_label' }])
    // Exact totals: 290 + 230 + 20 + 1,000 baht spent; 2,000 + 350 baht received.
    expect(result.summary).toEqual({ layout: 'meowjot', candidate_count: 6, review_required_count: 1, totals: { expense_minor: '154000', income_minor: '235000', transfer_minor: '0' }, image: null })
    const expiresIn = Date.parse(result.expires_at as string) - parsedAt
    expect(expiresIn).toBeGreaterThan(7 * DAY - 60_000)
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY + 60_000)
    const status = await json(await kit.v1.as(user).get(`/v1/imports/${jobId}`))
    expect(isImportJobDto(status.body)).toBe(true)
    expect(status.body.status).toBe('parsed')
  })

  it('5,000 rows parse with exact totals (no float arithmetic anywhere)', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const rows: ParsedRow[] = Array.from({ length: 5_000 }, (_, i) => ({
      source_row_id: `row:${i + 2}`, occurred_on: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, type: 'expense', amount_minor: String(((i % 900) + 1) * 100 + 25),
      wallet_label: 'Cash', category_label: 'food', merchant: null, note: `row ${i + 1}`, issues: [],
    }))
    const jobId = await parsedUpload(kit, user, rows)
    const result = await previewOf(kit, user, jobId)
    let expected = 0n
    for (let i = 0; i < 5_000; i += 1) expected += BigInt((i % 900) + 1) * 100n + 25n
    expect(result.candidates).toHaveLength(5_000)
    expect(result.summary?.totals).toEqual({ expense_minor: expected.toString(), income_minor: '0', transfer_minor: '0' })
    expect(result.candidates.reduce((sum, candidate) => sum + BigInt(candidate.amount_minor ?? '0'), 0n)).toBe(expected)
    expect(result.summary?.review_required_count).toBe(0)
  }, 60_000)

  it('before parsing there is no preview yet: queued, nothing to review', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await acceptedUpload(kit, user)
    expect(await previewOf(kit, user, jobId)).toEqual({ job_id: jobId, status: 'queued', candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null })
  })

  it('is owner-only: another account and an unknown id get the same 404', async () => {
    const kit = await setup()
    const owner = await kit.money.member()
    const stranger = await kit.money.member()
    const jobId = await parsedUpload(kit, owner, MEOWJOT_ROWS, { layout: 'meowjot' })
    const foreign = await preview(kit, stranger, jobId)
    const unknown = await preview(kit, stranger, randomUUID())
    expect([foreign.status, foreign.body.code]).toEqual([404, 'NOT_FOUND'])
    expect(problemOf(foreign.body)).toEqual(problemOf(unknown.body))
    expect((await preview(kit, stranger, 'not-a-uuid')).status).toBe(404)
    expect((await preview(kit, owner, jobId)).status).toBe(200)
  })
})

describe('duplicates are advice only', () => {
  it('names matching records and same-file twins, and keeps every row', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const cash = await kit.money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
    const existing = await kit.money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') })
    const beforeCount = await count(user, 'transactions')
    const jobId = await parsedUpload(kit, user, csvRowsOf(['2026-09-01,expense,65.00,Cash,coffee', '2026-09-01,expense,65.00,Cash,coffee', '2026-09-02,income,1000.00,Cash,pay']))
    const result = await previewOf(kit, user, jobId)
    expect(result.candidates.map((candidate) => candidate.source_row_id)).toEqual(['row:2', 'row:3', 'row:4'])
    expect(result.duplicate_advice).toEqual([
      { source_row_id: 'row:2', kind: 'existing_transaction', matches: [existing] },
      { source_row_id: 'row:2', kind: 'same_file', matches: ['row:3'] },
      { source_row_id: 'row:3', kind: 'existing_transaction', matches: [existing] },
      { source_row_id: 'row:3', kind: 'same_file', matches: ['row:2'] },
    ])
    expect(await count(user, 'transactions')).toBe(beforeCount)
    // Another account's identical record is never advice for this one.
    const other = await kit.money.member()
    const otherCash = await kit.money.wallet(other, { name: 'Cash', tracking_start: '2026-01-01' })
    await kit.money.record(other, { type: 'income', amount_minor: '100000', occurred_on: '2026-09-02', wallet_id: otherCash, category_id: builtinId(other, 'salary') })
    expect((await previewOf(kit, user, jobId)).duplicate_advice.some((advice) => advice.source_row_id === 'row:4')).toBe(false)
  })
})

describe('preview paging is additive (P2b)', () => {
  const ROWS = [
    '2026-09-01,expense,65.00,Cash,coffee',
    '2026-09-01,expense,65.00,Cash,coffee',
    '2026-09-02,income,10.00,Cash,a',
    '2026-09-03,expense,11.00,,b',
    '2026-09-04,expense,12.00,Cash,c',
    '2026-09-05,expense,13.00,Cash,d',
    '2026-09-06,expense,14.00,Cash,e',
    '2026-09-07,expense,15.00,,f',
    '2026-09-08,expense,16.00,Cash,g',
    '2026-09-09,expense,17.00,Cash,h',
    '2026-09-10,expense,18.00,Cash,twin',
    '2026-09-10,expense,18.00,Cash,twin',
  ]

  async function parsed(kit: Kit): Promise<{ user: TestUser; jobId: string; existing: string }> {
    const user = await kit.money.member()
    const cash = await kit.money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
    const existing = await kit.money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') })
    const jobId = await parsedUpload(kit, user, csvRowsOf(ROWS))
    return { user, jobId, existing }
  }

  it('no parameters is exactly the whole preview, with no page key', async () => {
    const kit = await setup()
    const { user, jobId } = await parsed(kit)
    const whole = await previewOf(kit, user, jobId)
    expect(whole.candidates).toHaveLength(ROWS.length)
    expect(Object.keys(whole).sort()).toEqual(['candidates', 'duplicate_advice', 'expires_at', 'issues', 'job_id', 'review_revision', 'status', 'summary'])
  })

  it('pages only candidates: summary and issues stay whole-file, advice follows the page rows, pages rejoin the whole', async () => {
    const kit = await setup()
    const { user, jobId, existing } = await parsed(kit)
    const whole = await previewOf(kit, user, jobId)
    expect(whole.issues.map((issue) => issue.source_row_id)).toEqual(['row:5', 'row:9'])
    expect(whole.duplicate_advice.length).toBeGreaterThan(4)

    const seen: ImportPreview['candidates'] = []
    let offset = 0
    let pages = 0
    for (; pages < 10; ) {
      const page = await previewOf(kit, user, jobId, `?offset=${offset}&limit=5`)
      pages += 1
      expect(page.page).toEqual({ offset, limit: 5, total: ROWS.length, next_offset: offset + 5 < ROWS.length ? offset + 5 : null })
      expect(page.candidates).toEqual(whole.candidates.slice(offset, offset + 5))
      expect(page.summary).toEqual(whole.summary)
      expect(page.issues).toEqual(whole.issues)
      expect({ job_id: page.job_id, status: page.status, review_revision: page.review_revision, expires_at: page.expires_at }).toEqual({ job_id: whole.job_id, status: whole.status, review_revision: whole.review_revision, expires_at: whole.expires_at })
      const onPage = new Set(page.candidates.map((candidate) => candidate.source_row_id))
      expect(page.duplicate_advice).toEqual(whole.duplicate_advice.filter((advice) => onPage.has(advice.source_row_id)))
      seen.push(...page.candidates)
      if (page.page?.next_offset === null || page.page === undefined) break
      offset = page.page.next_offset
    }
    expect(pages).toBe(3)
    expect(seen).toEqual(whole.candidates)
    const first = await previewOf(kit, user, jobId, '?limit=5')
    expect(first.duplicate_advice).toContainEqual({ source_row_id: 'row:2', kind: 'existing_transaction', matches: [existing] })
    // Twins named by a page point at rows that may be on another page.
    expect((await previewOf(kit, user, jobId, '?offset=10&limit=1')).duplicate_advice).toEqual([{ source_row_id: 'row:12', kind: 'same_file', matches: ['row:13'] }])
  })

  it('defaults the missing parameter, and a page past the end is empty', async () => {
    const kit = await setup()
    const { user, jobId } = await parsed(kit)
    const whole = await previewOf(kit, user, jobId)
    const fromStart = await previewOf(kit, user, jobId, '?limit=3')
    expect([fromStart.candidates.length, fromStart.page]).toEqual([3, { offset: 0, limit: 3, total: ROWS.length, next_offset: 3 }])
    const tail = await previewOf(kit, user, jobId, '?offset=2')
    expect(tail.candidates).toEqual(whole.candidates.slice(2))
    expect(tail.page).toEqual({ offset: 2, limit: 500, total: ROWS.length, next_offset: null })
    const beyond = await previewOf(kit, user, jobId, `?offset=${ROWS.length}&limit=5`)
    expect([beyond.candidates, beyond.duplicate_advice, beyond.page]).toEqual([[], [], { offset: ROWS.length, limit: 5, total: ROWS.length, next_offset: null }])
    expect(beyond.issues).toEqual(whole.issues)
  })

  it('refuses malformed paging as a validation error, and keeps owner-only 404s', async () => {
    const kit = await setup()
    const { user, jobId } = await parsed(kit)
    for (const query of ['?limit=0', '?limit=501', '?limit=x', '?offset=-1', '?offset=5001', '?limit=1&limit=2', '?cursor=abc', '?limit=5&foo=1']) {
      const res = await preview(kit, user, jobId, query)
      expect([query, res.status]).toEqual([query, 422])
    }
    const stranger = await kit.money.member()
    expect((await preview(kit, stranger, jobId, '?limit=5')).status).toBe(404)
    expect((await preview(kit, stranger, randomUUID(), '?limit=5')).status).toBe(404)
  })

  it('a preview that is not ready is served as before, whatever the paging', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await acceptedUpload(kit, user)
    expect(await previewOf(kit, user, jobId, '?offset=0&limit=5')).toEqual({ job_id: jobId, status: 'queued', candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null })
  })
})

describe('duplicate advice stays linear in the file and the records (M1)', () => {
  /** `times` copies of a record, straight into the vault (the API spec's cloneRecord). */
  async function cloneRecord(kit: Kit, user: TestUser, id: string, times: number): Promise<void> {
    const [row] = await vaultRows<{ type: 'expense' | 'income'; amount_minor: string; occurred_on: string; wallet_id: string; category_id: string; note: string | null }>(
      user,
      'SELECT type, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, wallet_id, category_id, note FROM transactions WHERE id = ?',
      id,
    )
    if (row) await kit.money.bulkRecords(user, Array.from({ length: times }, () => row))
  }

  const sameRows = (n: number, line: string) => recordOf(csvRowsOf(Array.from({ length: n }, () => line)))

  it('5,000 identical rows against 5,000 identical records, with statistics older than the import: answered in time, five matches each', async () => {
    // Changed form: SQLite keeps no planner statistics; the preview is recorded by the vault's recordPreview.
    const kit = await setup()
    const user = await kit.money.member()
    const cash = await kit.money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
    const existing = await kit.money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') })
    await cloneRecord(kit, user, existing, 4_999)
    const jobId = await seedPreview(user, sameRows(5_000, '2026-09-01,expense,65.00,Cash,coffee'))

    const started = Date.now()
    const res = await preview(kit, user, jobId)
    const elapsed = Date.now() - started
    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(2_000)
    const body = res.body as ImportPreview
    expect(isImportPreview(body)).toBe(true)
    expect(body.duplicate_advice).toHaveLength(10_000)
    expect(body.duplicate_advice.every((advice) => advice.matches.length === 5)).toBe(true)
    const firstRecords = (await vaultRows<{ id: string }>(user, 'SELECT id FROM transactions WHERE deleted_at IS NULL ORDER BY id LIMIT 5')).map((row) => row.id)
    const of = (id: string, kind: string) => body.duplicate_advice.find((advice) => advice.source_row_id === id && advice.kind === kind)?.matches
    expect(of('row:2', 'existing_transaction')).toEqual(firstRecords)
    expect(of('row:5001', 'existing_transaction')).toEqual(firstRecords)
    // The first five other rows, in file order.
    expect(of('row:2', 'same_file')).toEqual(['row:3', 'row:4', 'row:5', 'row:6', 'row:7'])
    expect(of('row:4', 'same_file')).toEqual(['row:2', 'row:3', 'row:5', 'row:6', 'row:7'])
    expect(of('row:5001', 'same_file')).toEqual(['row:2', 'row:3', 'row:4', 'row:5', 'row:6'])
  }, 60_000)

  it('5,000 distinct rows with statistics older than the import are answered in time', async () => {
    // Changed form: the preview is recorded with seedPreview (the vault's own recordPreview), where the API parses a
    // file of 5,000 rows (the 1B-T10 review's n-2).
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await seedPreview(
      user,
      recordOf(Array.from({ length: 5_000 }, (_, i): ParsedRow => ({ source_row_id: `row:${i + 2}`, occurred_on: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, type: 'expense', amount_minor: String(((i % 900) + 1) * 100 + 25), wallet_label: 'Cash', category_label: 'food', merchant: null, note: `row ${i + 1}`, issues: [] }))),
    )
    const started = Date.now()
    const res = await preview(kit, user, jobId)
    expect(res.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect((res.body as ImportPreview).candidates).toHaveLength(5_000)
    expect((res.body as ImportPreview).duplicate_advice).toEqual([])
  }, 60_000)

  it('names exactly what the self-join named, row for row', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const cash = await kit.money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
    const coffee = await kit.money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') })
    await cloneRecord(kit, user, coffee, 6)
    // The deleted record has the lowest id, so advice that counted it would name it first.
    const deleted = await kit.money.record(user, { id: '00000000-0000-4000-8000-000000000001', type: 'expense', amount_minor: '6500', occurred_on: '2026-09-01', wallet_id: cash, category_id: builtinId(user, 'food') })
    await vaultExec(user, 'UPDATE transactions SET deleted_at = ? WHERE id = ?', new Date().toISOString(), deleted)
    await kit.money.record(user, { type: 'income', amount_minor: '100000', occurred_on: '2026-09-02', wallet_id: cash, category_id: builtinId(user, 'salary') })
    const lines: string[] = []
    for (let i = 0; i < 8; i += 1) lines.push('2026-09-01,expense,65.00,Cash,coffee,Cafe')
    lines.push('2026-09-01,expense,65.00,,coffee,Cafe', '2026-09-01,expense,65.00,,coffee,Cafe', '2026-09-01,expense,65.00,Cash,,Cafe', '2026-09-01,expense,65.00,Cash,coffee,')
    lines.push('2026-09-02,income,1000.00,Cash,pay,', '2026-09-02,income,1000.00,Cash,pay,')
    lines.push(',expense,65.00,Cash,coffee,Cafe', ',expense,65.00,Cash,coffee,Cafe', '2026-09-03,,5.00,Cash,x,', '2026-09-03,,5.00,Cash,x,', '2026-09-01,income,65.00,Cash,coffee,Cafe')
    const jobId = await seedPreview(user, recordOf(csvRowsOf(lines)))
    // The advice as the first P2b release computed it (a self-join), kept as the reference, in SQLite.
    const pairs = await vaultRows<{ source_row_id: string; kind: string; match_id: string }>(
      user,
      `SELECT c.source_row_id, c.ordinal, 'existing_transaction' AS kind, t.id AS match_id, t.id AS match_order
         FROM import_candidates c
         JOIN transactions t ON t.occurred_on = c.occurred_on AND t.type = c.type AND t.amount_minor = c.amount_minor AND t.deleted_at IS NULL
        WHERE c.job_id = ?1
       UNION ALL
       SELECT c.source_row_id, c.ordinal, 'same_file', d.source_row_id, printf('%08d', d.ordinal)
         FROM import_candidates c
         JOIN import_candidates d ON d.job_id = c.job_id AND d.source_row_id <> c.source_row_id
                                 AND d.occurred_on = c.occurred_on AND d.type = c.type AND d.amount_minor = c.amount_minor
                                 AND d.wallet_label IS c.wallet_label AND d.merchant IS c.merchant AND d.note IS c.note
        WHERE c.job_id = ?1
       ORDER BY 2, 3, 5`,
      jobId,
    )
    const reference: { source_row_id: string; kind: string; matches: string[] }[] = []
    for (const pair of pairs) {
      const last = reference.at(-1)
      if (last && last.source_row_id === pair.source_row_id && last.kind === pair.kind) {
        if (last.matches.length < 5) last.matches.push(pair.match_id)
      } else reference.push({ source_row_id: pair.source_row_id, kind: pair.kind, matches: [pair.match_id] })
    }
    expect(reference.length).toBeGreaterThan(20)
    expect((await previewOf(kit, user, jobId)).duplicate_advice).toEqual(reference)
  })
})

describe('unconfirmed candidates expire after 7 days', () => {
  it('queues one expiry job at the preview expiry, and it deletes the candidates when due', async () => {
    // As importsDueAt and pruneImports (1B-T11 runs them on the alarm).
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await parsedUpload(kit, user, MEOWJOT_ROWS, { layout: 'meowjot' })
    const ready = await previewOf(kit, user, jobId)
    const expiresAt = Date.parse(ready.expires_at as string)
    expect(await dueAt(user)).toBe(expiresAt)

    // Due by the alarm, but the preview is only minutes old: nothing changes.
    expect(await prune(user, Date.now() + MIN)).toBe(false)
    expect(await count(user, 'import_candidates')).toBe(6)

    expect(await prune(user, expiresAt)).toBe(true)
    expect(await count(user, 'import_candidates')).toBe(0)
    const expired = await previewOf(kit, user, jobId)
    expect(expired).toMatchObject({ status: 'expired', candidates: [], issues: [], duplicate_advice: [] })
  })
})

describe('a preview past its 7 days is expired, whatever happened to its expiry job (M4)', () => {
  it('an account disabled at the due time: its job ends superseded, the route says expired at once, retention deletes the candidates', async () => {
    // Changed form: a vault that is not active at the due time runs no retention (1B-T11 runs pruneImports
    // only for an active vault); once it is active again, the route says expired before pruneImports runs.
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await parsedUpload(kit, user, MEOWJOT_ROWS, { layout: 'meowjot' })
    await ageAll(user, jobId, 8)
    await vaultExec(user, "UPDATE account_state SET status = 'deleting'")
    await vaultExec(user, "UPDATE account_state SET status = 'active'")

    // Past expires_at the route never serves the rows, even before retention runs.
    expect(await count(user, 'import_candidates')).toBe(6)
    const served = await previewOf(kit, user, jobId)
    expect(served).toMatchObject({ status: 'expired', candidates: [], issues: [], duplicate_advice: [] })
    expect(served.summary).toMatchObject({ candidate_count: 6, totals: { expense_minor: '154000', income_minor: '235000', transfer_minor: '0' } })

    expect(await prune(user)).toBe(true)
    expect(await count(user, 'import_candidates')).toBe(0)
    const [row] = await vaultRows<{ status: string; expired_at: string | null }>(user, 'SELECT status, expired_at FROM import_previews WHERE job_id = ?', jobId)
    expect(row?.status).toBe('expired')
    expect(row?.expired_at).not.toBeNull()
    expect(await prune(user)).toBe(false)
  })

  it('leaves a preview inside its 7 days alone', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await parsedUpload(kit, user, MEOWJOT_ROWS, { layout: 'meowjot' })
    await prune(user)
    expect(await count(user, 'import_candidates')).toBe(6)
    expect((await previewOf(kit, user, jobId)).status).toBe('ready')
  })
})

describe('a parsed import keeps its state until its rows are pruned (minor 4)', () => {
  it('pruning its succeeded parse job does not turn it into an expired upload; its rows, preview and totals go 30 days after its raw expiry', async () => {
    // Changed form: the vault has no jobs table (the parse state stays on the upload row); the API's maintenance
    // and imports.uploads steps are pruneUploads at a chosen clock.
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await parsedUpload(kit, user, MEOWJOT_ROWS, { layout: 'meowjot' })
    const [accepted] = await vaultRows<{ accepted_at: string }>(user, 'SELECT accepted_at FROM import_uploads WHERE job_id = ?', jobId)
    const at = Date.parse(accepted?.accepted_at ?? '')
    const pruneAt = (ms: number) => runInDurableObject(vaultOf(user), (_vault, state) => pruneUploads(fileAt(state, ms)))
    // Almost 31 days on: the raw file expired just under 30 days ago.
    await pruneAt(at + 31 * DAY - 2 * HOUR)
    const [row] = await vaultRows<{ status: string; finished_at: string | null }>(user, 'SELECT status, finished_at FROM import_uploads WHERE job_id = ?', jobId)
    expect(row).toEqual({ status: 'accepted', finished_at: null })
    const status = await json(await kit.v1.as(user).get(`/v1/imports/${jobId}`))
    expect(status.body.status).toBe('parsed')
    // Not yet 30 days past the raw expiry: kept.
    expect(await count(user, 'import_previews')).toBe(1)
    await pruneAt(at + 31 * DAY + HOUR)
    expect(await count(user, 'import_uploads')).toBe(0)
    expect(await count(user, 'import_previews')).toBe(0)
    expect(await count(user, 'import_candidates')).toBe(0)
  })
})

// ===========================================================================
// Ported from apps/edge/test/jobs.db.test.ts
// ===========================================================================

describe('the parser container', () => {
  it('parses an upload the edge accepted, which the edge then reviews and confirms', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const client = kit.v1.as(user)
    const cash = randomUUID()
    const bank = randomUUID()
    expect((await client.post('/v1/wallets', { id: cash, name: 'Cash', opening_minor: '0', tracking_start: '2026-01-01' })).status).toBe(201)
    expect((await client.post('/v1/wallets', { id: bank, name: 'Bank', opening_minor: '0', tracking_start: '2026-01-01' })).status).toBe(201)
    const file = new TextEncoder().encode(['date,type,category,amount,note,merchant,wallet', '2026-10-20,expense,food,60.00,lunch,ข้าวมันไก่,Cash', '2026-10-15,income,salary,30000.00,october,บริษัท,Bank', ''].join('\n'))
    const accepted = await upload(kit.v1, user, file, { name: 'บัญชี.csv' })
    expect(accepted.status).toBe(202)
    const jobId = accepted.body.job_id as string
    // What the container answers for this file (the fake parser; the container itself is 1B-T5's deployed check).
    const { parser } = fakeParser(
      parsedCsv([
        { source_row_id: 'row:2', occurred_on: '2026-10-20', type: 'expense', amount_minor: '6000', wallet_label: 'Cash', category_label: 'food', merchant: 'ข้าวมันไก่', note: 'lunch', issues: [] },
        { source_row_id: 'row:3', occurred_on: '2026-10-15', type: 'income', amount_minor: '3000000', wallet_label: 'Bank', category_label: 'salary', merchant: 'บริษัท', note: 'october', issues: [] },
      ]),
    )
    await handleParseBatch(parseBatch(user, jobId), env, { parser })

    const read = await previewOf(kit, user, jobId)
    expect([read.status, read.candidates.length]).toEqual(['ready', 2])
    const mapping = { wallets: { Cash: cash, Bank: bank }, categories: { expense: { food: builtinId(user, 'food') }, income: { salary: builtinId(user, 'salary') } } }
    const frozenRes = await json(await client.post(`/v1/imports/${jobId}/selections`, { review_revision: '1', selected_row_ids: ['row:2', 'row:3'], mapping }))
    expect(frozenRes.status).toBe(201)
    const selectionId = frozenRes.body.entity_id as string
    const done = await json(await client.post(`/v1/imports/${jobId}/confirmations`, { selection_id: selectionId, frozen_revision: '1', batch_row_ids: ['row:2', 'row:3'] }))
    expect(done.status).toBe(200)

    const history = await json(await client.get('/v1/history?from=2026-10-01&through=2026-10-31'))
    expect(((history.body.items ?? []) as { merchant: string | null }[]).map((item) => item.merchant).sort()).toEqual(['ข้าวมันไก่', 'บริษัท'])
  })
})

// ===========================================================================
// The plan's added cases, and the planner's
// ===========================================================================

describe('expiry on the vault clock (ruling R37)', () => {
  it('a preview expires after 7 days: its candidates go, it reads expired, and an unattached image is due', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await seedPreview(user, recordOf([RECEIPT_ROW]), { image: true })
    const [stored] = await vaultRows<{ created_at: string }>(user, 'SELECT created_at FROM import_previews WHERE job_id = ?', jobId)
    const at = Date.parse(stored?.created_at ?? '') + 7 * DAY
    // An image still registered past the preview's expiry (its own 24 hours moved on) is made due by it.
    await vaultExec(user, "UPDATE vault_objects SET delete_after = ? WHERE purpose = 'import_image'", at + DAY)
    expect(await prune(user, at - 1)).toBe(false)
    expect(await count(user, 'import_candidates')).toBe(1)
    expect(await prune(user, at)).toBe(true)
    expect(await count(user, 'import_candidates')).toBe(0)
    const expired = await previewOf(kit, user, jobId)
    expect(expired).toMatchObject({ status: 'expired', candidates: [], issues: [], duplicate_advice: [] })
    // An expired preview's image can no longer be kept, though its object is still stored until the alarm deletes it.
    expect(expired.summary?.image).toMatchObject({ width: 1, height: 1, attachable_until: null })
    expect(await vaultRows(user, "SELECT status, delete_after FROM vault_objects WHERE purpose = 'import_image'")).toEqual([{ status: 'published', delete_after: at }])
  })

  it('after pruneImports at importsDueAt, the next importsDueAt is later or null', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(4))
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'checked' }])).status).toBe(200)
    const selectionId = await frozen(kit, s, ids(s.rows), { revision: '2' })
    await confirmed(kit, s, selectionId, ['row:2', 'row:3'], { frozenRevision: '2' })
    const seen: number[] = []
    let due = await dueAt(s.user)
    while (due !== null && seen.length < 10) {
      seen.push(due)
      expect(await prune(s.user, due)).toBe(true)
      const next = await dueAt(s.user, due)
      expect(next === null || next > due).toBe(true)
      due = next
    }
    expect(due).toBeNull()
    // The preview and the selection at their expiry, then each synced record 30 days after its own last change
    // (the review at the correction, the selection at the confirmation).
    expect(seen).toHaveLength(3)
    expect(await vaultRows(s.user, "SELECT entity, state FROM entity_heads WHERE entity LIKE 'import%' ORDER BY entity")).toEqual([
      { entity: 'import_review', state: 'purged' },
      { entity: 'import_selection', state: 'purged' },
    ])
  })

  // The planner's: a replay answers what the API's outcome read answers (its import's 404, the expired preview's 409).
  it('a confirmation resent to another import is not found, and one resent after its preview expired is told the preview is unavailable', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const key = randomUUID()
    await confirmed(kit, s, selectionId, ['row:2'], { key })
    const elsewhere: Setup = { ...s, jobId: await seedPreview(s.user, recordOf(parsedOf(fileRows(2)))) }
    const misdirected = await confirm(kit, elsewhere, selectionId, ['row:2'], { key })
    expect([misdirected.status, misdirected.body.code]).toEqual([404, 'NOT_FOUND'])
    const [stored] = await vaultRows<{ expires_at: string }>(s.user, 'SELECT expires_at FROM import_previews WHERE job_id = ?', s.jobId)
    expect(await prune(s.user, Date.parse(stored?.expires_at ?? ''))).toBe(true)
    const resent = await confirm(kit, s, selectionId, ['row:2'], { key })
    expect([resent.status, resent.body.code, resent.body.message_key]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE', 'errors.import_preview_expired'])
    expect(await count(s.user, 'transactions')).toBe(1)
  })

  // The planner's: the image's window as the preview serves it (0017's gogospend_import_image_attachable_until).
  it('the preview says until when its image can be kept: two minutes before the image is due, while more than two minutes are left', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const jobId = await seedPreview(user, recordOf([RECEIPT_ROW]), { image: true })
    const [image] = await vaultRows<{ delete_after: number }>(user, "SELECT delete_after FROM vault_objects WHERE purpose = 'import_image'")
    const read = await previewOf(kit, user, jobId)
    expect(read.summary?.image?.attachable_until).toBe(new Date((image?.delete_after ?? 0) - 2 * MIN).toISOString())
    await vaultExec(user, "UPDATE vault_objects SET delete_after = ? WHERE purpose = 'import_image'", Date.now() + 3 * MIN)
    expect((await previewOf(kit, user, jobId)).summary?.image?.attachable_until).not.toBeNull()
    await vaultExec(user, "UPDATE vault_objects SET delete_after = ? WHERE purpose = 'import_image'", Date.now() + MIN)
    expect((await previewOf(kit, user, jobId)).summary?.image).toMatchObject({ width: 1, height: 1, attachable_until: null })
  })
})

describe("the planner's cases on the review rules", () => {
  it('a rejected file reads rejected with its issue, and corrections and freezes are refused as rejected', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const reply = await upload(kit.v1, user, csvRows(2))
    expect(reply.status).toBe(202)
    const jobId = reply.body.job_id as string
    const { parser } = fakeParser({ kind: 'parsed', record: { preview: { status: 'rejected', layout: null, issues: ['malformed_csv'], image: null, header_fingerprint: null }, candidates: [] }, image: null })
    await handleParseBatch(parseBatch(user, jobId), env, { parser })
    const read = await previewOf(kit, user, jobId)
    expect(read).toMatchObject({ status: 'rejected', candidates: [], issues: [{ code: 'malformed_csv', source_row_id: null, field: null }], duplicate_advice: [], review_revision: '1' })
    expect(read.summary).toMatchObject({ layout: null, candidate_count: 0, image: null })
    const s: Setup = { user, jobId, rows: [], wallets: { cash: '', bank: '' }, mapping: { wallets: {}, categories: { expense: {}, income: {} } } }
    const patched = await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'x' }])
    expect([patched.status, patched.body.code, patched.body.message_key]).toEqual([409, 'IMPORT_PREVIEW_UNAVAILABLE', 'errors.import_preview_rejected'])
    const frozenRejected = await freeze(kit, s, ['row:2'])
    expect([frozenRejected.status, frozenRejected.body.message_key]).toEqual([409, 'errors.import_preview_rejected'])
  })

  it('a freeze names each row it cannot take and why: incomplete, after today or before tracking, an unknown or mistyped wallet or category', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const cash = await kit.money.wallet(user, { name: 'Cash', tracking_start: '2026-01-01' })
    const row = (n: number, date: string | null, extra: Partial<ParsedRow> = {}): ParsedRow => ({
      source_row_id: `row:${n}`, occurred_on: date, type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: 'food', merchant: null, note: null, issues: [], ...extra,
    })
    // Two days after today in Bangkok, kept by the parse (its own today is far ahead) and refused by the freeze.
    const later = bangkokDate(new Date(Date.now() + 2 * DAY))
    const jobId = await seedPreview(
      user,
      recordOf(
        [
          row(2, '2026-03-01'),
          row(3, later),
          row(4, '2025-12-01'),
          row(5, '2026-03-02', { category_label: 'gift' }),
          row(6, '2026-03-03', { wallet_label: 'Ghost' }),
          row(7, '2026-03-04', { category_label: 'mystery' }),
          row(8, '2026-03-05', { amount_minor: null, issues: [{ field: 'amount_minor', code: 'missing_amount' }] }),
        ],
        '9999-12-31',
      ),
    )
    const mapping: ImportMapping = { wallets: { Cash: cash, Ghost: randomUUID() }, categories: { expense: { food: builtinId(user, 'food'), gift: builtinId(user, 'gift'), mystery: randomUUID() }, income: {} } }
    const s: Setup = { user, jobId, rows: [], wallets: { cash, bank: '' }, mapping }
    const refused = await freeze(kit, s, ['row:2', 'row:3', 'row:4', 'row:5', 'row:6', 'row:7', 'row:8'])
    expect([refused.status, refused.body.code, refused.body.message_key]).toEqual([422, 'VALIDATION_FAILED', 'errors.import_selection_invalid'])
    expect(refused.body.fields).toEqual({
      'row:3': 'errors.date_in_future',
      'row:4': 'errors.date_before_tracking_start',
      'row:5': 'errors.category_type_mismatch',
      'row:6': 'errors.wallet_not_found',
      'row:7': 'errors.category_not_found',
      'row:8': 'errors.import_row_incomplete',
    })
    expect(await count(user, 'import_selections')).toBe(0)
    expect((await freeze(kit, s, ['row:2'])).status).toBe(201)
  })

  it('rows that cannot be saved now are conflicted: a category archived after the freeze, a date after today', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(6))
    const selectionId = await frozen(kit, s, ids(s.rows))
    const travel = builtinId(s.user, 'travel')
    const categories = (await json(await kit.v1.as(s.user).get('/v1/categories'))).body as unknown as { id: string; version: number }[]
    const archived = await json(await kit.v1.as(s.user).post(`/v1/categories/${travel}/archive`, {}, { ifMatch: categories.find((category) => category.id === travel)?.version }))
    expect(archived.status).toBe(200)
    // The vault's clock moves back before the batch: a row dated after its Bangkok today cannot be saved yet.
    await setVaultClock(s.user, Date.parse('2026-05-01T00:00:00.000Z'))
    const result = await confirmed(kit, s, selectionId, ids(s.rows))
    const saved = (row: FileRow) => row.category !== 'travel' && row.date <= '2026-05-01'
    expect(result.conflicted).toEqual(s.rows.filter((row) => !saved(row)).map((row) => row.id))
    expect(result.committed).toEqual(s.rows.filter(saved).map((row) => row.id))
    expect(result.conflicted).toEqual(['row:3', 'row:6', 'row:7'])
  })

  it("progress reads stale after a correction and expired past the preview's expiry, and a re-freeze counts the rows already committed", async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(4))
    const first = await frozen(kit, s, ids(s.rows))
    await confirmed(kit, s, first, ['row:2', 'row:3'])
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:4', note: 'later' }])).status).toBe(200)
    expect((await progressOf(kit, s.user, s.jobId, first)).body).toMatchObject({ status: 'stale', committed: ['row:2', 'row:3'], remaining: ['row:4', 'row:5'] })
    const second = await frozen(kit, s, ids(s.rows), { revision: '2' })
    const [change] = await vaultRows<{ snapshot: string }>(s.user, "SELECT snapshot FROM entity_changes WHERE entity = 'import_selection' AND entity_id = ?", second)
    expect(JSON.parse(change?.snapshot ?? 'null')).toEqual({ id: second, job_id: s.jobId, frozen_revision: '2', row_count: 4, committed_count: 2 })
    expect((await progressOf(kit, s.user, s.jobId, second)).body).toMatchObject({ status: 'open', committed: ['row:2', 'row:3'], remaining: ['row:4', 'row:5'] })
    await ageAll(s.user, s.jobId, 8)
    expect((await progressOf(kit, s.user, s.jobId, second)).body).toMatchObject({ status: 'expired' })
  })

  it('an import with no preview reads its parse state: parsing, failed with its issue, cancelled or expired', async () => {
    const kit = await setup()
    const user = await kit.money.member()
    const iso = (ms: number) => new Date(ms).toISOString()
    const seeded = async (status: 'accepted' | 'expired', parseState: string, failure: string | null = null) => {
      const jobId = randomUUID()
      const now = Date.now()
      await vaultExec(
        user,
        `INSERT INTO import_uploads (job_id, intake_token, status, declared_type, format, bytes, sha256, part_count, parse_state, parse_attempts, parse_failure, created_at, receive_deadline, accepted_at, expires_at)
         VALUES (?, ?, ?, 'text/csv', 'csv', 10, ?, 1, ?, 1, ?, ?, ?, ?, ?)`,
        jobId, randomUUID(), status, status === 'accepted' ? 'ab'.repeat(32) : null, parseState, failure, iso(now - MIN), iso(now + 9 * MIN), iso(now - MIN), iso(now + DAY),
      )
      return jobId
    }
    const pending = (jobId: string, status: string, issues: unknown[] = []) => ({ job_id: jobId, status, candidates: [], issues, duplicate_advice: [], review_revision: null, expires_at: null, summary: null })
    const parsing = await seeded('accepted', 'parsing')
    const unreadable = await seeded('accepted', 'failed', 'quarantine_missing')
    const unparsed = await seeded('accepted', 'failed', 'parser_unavailable')
    const cancelled = await seeded('accepted', 'cancelled')
    const expired = await seeded('expired', 'cancelled')
    expect(await previewOf(kit, user, parsing)).toEqual(pending(parsing, 'parsing'))
    expect(await previewOf(kit, user, unreadable)).toEqual(pending(unreadable, 'failed', [{ code: 'quarantine_unavailable', source_row_id: null, field: null }]))
    expect(await previewOf(kit, user, unparsed)).toEqual(pending(unparsed, 'failed', [{ code: 'parse_failed', source_row_id: null, field: null }]))
    expect(await previewOf(kit, user, cancelled)).toEqual(pending(cancelled, 'cancelled'))
    expect(await previewOf(kit, user, expired)).toEqual(pending(expired, 'expired'))
  })

  it('the synced records stay while their preview and selection are live, however old their last change', async () => {
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(3))
    expect((await patchRows(kit, s, 1, [{ source_row_id: 'row:2', note: 'kept' }])).status).toBe(200)
    await frozen(kit, s, ids(s.rows), { revision: '2' })
    await vaultExec(s.user, "UPDATE entity_changes SET committed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 days') WHERE entity LIKE 'import%'")
    const heads = () => vaultRows<{ entity: string; state: string }>(s.user, "SELECT entity, state FROM entity_heads WHERE entity LIKE 'import%' ORDER BY entity")
    expect(await prune(s.user)).toBe(false)
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'active' }, { entity: 'import_selection', state: 'active' }])
    // Their own 30 days are past, so they are due when the preview and the selection expire, not before.
    const [stored] = await vaultRows<{ expires_at: string }>(s.user, 'SELECT expires_at FROM import_previews WHERE job_id = ?', s.jobId)
    const expiresAt = Date.parse(stored?.expires_at ?? '')
    expect(await dueAt(s.user)).toBe(expiresAt)
    expect(await prune(s.user, expiresAt)).toBe(true)
    expect(await heads()).toEqual([{ entity: 'import_review', state: 'purged' }, { entity: 'import_selection', state: 'purged' }])
  })
})

describe("the 1B-T10 review's pins (brief download-pins)", () => {
  it('a correction of 500 rows at once, the most a correction takes, binds its row ids as one parameter and is saved', async () => {
    // The 1B-T10 review's m-1 (its U9), probe R57: Durable Object SQLite binds at most 100 parameters per statement,
    // so a row check with one ? per row id would answer 500 here (ruling R57).
    const kit = await setup()
    const s = await parsedImport(kit, fileRows(600))
    const rows = ids(s.rows)
      .slice(0, 500)
      .map((id) => ({ source_row_id: id, note: 'fixed' }))
    const res = await patchRows(kit, s, 1, rows)
    expect([res.status, res.body.review_revision]).toEqual([200, '2'])
    expect((await vaultRows<{ n: number }>(s.user, "SELECT count(*) AS n FROM import_candidates WHERE job_id = ? AND note = 'fixed'", s.jobId))[0].n).toBe(500)
  }, 60_000)

  it('an upload that was never accepted (still receiving, or refused at intake) has no preview: 404, as the API answers', async () => {
    // The 1B-T10 review's m-2 (its U1), probe U1: the preview reads only an accepted upload (`u.accepted_at IS NOT NULL`).
    const kit = await setup()
    const user = await kit.money.member()
    const now = Date.now()
    const at = (ms: number) => new Date(ms).toISOString()
    const receiving = randomUUID()
    const refused = randomUUID()
    await vaultExec(
      user,
      "INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, created_at, receive_deadline) VALUES (?, ?, 'receiving', 'a.csv', 'text/csv', ?, ?)",
      receiving, randomUUID(), at(now - 1000), at(now + 600_000),
    )
    await vaultExec(
      user,
      "INSERT INTO import_uploads (job_id, intake_token, status, outcome_code, declared_type, created_at, receive_deadline) VALUES (?, ?, 'rejected', 'unsupported_type', 'text/csv', ?, ?)",
      refused, randomUUID(), at(now - 1000), at(now + 600_000),
    )
    const a = await preview(kit, user, receiving)
    const b = await preview(kit, user, refused)
    expect([[a.status, a.body.code], [b.status, b.body.code]]).toEqual([[404, 'NOT_FOUND'], [404, 'NOT_FOUND']])
  })
})
