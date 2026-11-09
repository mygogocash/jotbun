import { ContractValidationError, IMPORT_IMAGE_ROW_ID, RECEIPT_RETENTION_CONSENT, bangkokDate, isUuid } from '@gogospend/contracts'
import type {
  CommandAck,
  ConfirmImportBatch,
  ConfirmImportBatchResult,
  EntityChange,
  ImportMapping,
  ImportReceiptChoice,
  ImportRowPatch,
  ImportSelectionProgress,
  ImportSelectionSnapshot,
  ImportSelectionStatus,
  PatchImportRowsResult,
} from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { routeId, stateProblem } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'
import { CONFIRM_KIND, FREEZE_KIND, PATCH_KIND, REVIEW_ENTITY, SELECTION_ENTITY, parseConfirmBody, parseFreezeBody, parsePatchBody } from '@api/imports/confirmation.service'

import type { VaultCall } from '../../v1/protocol'
import { entityHead } from '../commands/entity-state'
import { commandInput, runCommand } from '../commands/executor'
import type { AuditMetadata, VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'
import { COLUMNS, toDto, transactionRow } from '../domain/transactions'
import type { TransactionRow } from '../domain/transactions'
import { prepareReceipt, ready } from './attachments'
import type { PreparedCopy, StoredCopy } from './attachments'
import type { FileContext } from './context'

// Import review and confirmation on the vault (1B-T10): ports of
// ConfirmationService (patchRows, freezeSelection, confirm, progress) and of
// migration 0018's routines (gogospend_patch_import_rows,
// gogospend_freeze_import_selection). Each command runs 1A's seven steps in
// UserVault#call's one block, so the checks and the writes of a batch see one
// state. Row ids bind as one JSON parameter (ruling R57); a confirmed row is
// written one statement per row, inside the batch's one command.

/** Row problems named in one refusal (ConfirmationService's MAX_ROW_PROBLEMS: the rest are found once these are fixed). */
const MAX_ROW_PROBLEMS = 50

/** A list of row ids, bound as one JSON parameter (ruling R57). */
const IN_IDS = 'IN (SELECT value FROM json_each(?))'

/** The fields a correction can name, in the order the routine replaces them. */
const PATCH_FIELDS = ['occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note'] as const

/** What a confirmation's prepare step answers: 1B-T9's PreparedCopy, or `refused` when the batch's read-only checks would refuse it, so nothing was reserved. */
export type ConfirmPrepared = PreparedCopy | { kind: 'refused' }

/**
 * What the confirmation's command step gets for its receipt (the API's
 * PreparedReceipt, or null): null when the batch asks for none or its
 * read-only checks refused it before any copy; `none` when nothing was
 * copied (the receipt exists, the command is a resend, or no image is left
 * to copy); `copied` with what the copy's HEAD reported.
 */
export type ConfirmReceipt = null | { kind: 'none' } | ({ kind: 'copied' } & StoredCopy)

/** A 422 naming at most 50 rows (in file order) and why each cannot be used. */
function rowProblems(problems: ReadonlyMap<string, string>, messageKey: string): ProblemException {
  return new ProblemException(422, 'VALIDATION_FAILED', { messageKey, fields: Object.fromEntries([...problems].slice(0, MAX_ROW_PROBLEMS)) })
}

const hasOwn = (map: Readonly<Record<string, string>>, key: string | null): key is string => key !== null && Object.prototype.hasOwnProperty.call(map, key)

/** A step body from the Worker's own confirmation code: an object, or the call is refused before anything is written. */
function stepBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('a confirmation step body is an object')
  return body as Record<string, unknown>
}

const isPast = (c: FileContext, at: string) => Date.parse(at) <= c.now.getTime()

type PreviewRow = { job_id: string; status: string; review_revision: string; expires_at: string }

/** The import's preview, ready and unexpired: 404 for none, 409 IMPORT_PREVIEW_UNAVAILABLE otherwise (ConfirmationService.readyPreview). */
function readyPreview(c: VaultContext, jobId: string): PreviewRow {
  const [preview] = c.sql.exec<PreviewRow>('SELECT job_id, status, CAST(review_revision AS TEXT) AS review_revision, expires_at FROM import_previews WHERE job_id = ?', jobId).toArray()
  if (!preview) throw new ProblemException(404, 'NOT_FOUND')
  if (preview.status !== 'ready' || isPast(c, preview.expires_at)) {
    throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: preview.status === 'rejected' ? 'errors.import_preview_rejected' : 'errors.import_preview_expired' })
  }
  return preview
}

type CandidateRow = {
  source_row_id: string
  occurred_on: string | null
  type: string | null
  amount_minor: string | null
  wallet_label: string | null
  category_label: string | null
  merchant: string | null
  note: string | null
  issues: string
}

/**
 * gogospend_patch_import_rows, in the command's block: each named field of
 * each listed row is replaced (one UPDATE per row, ruling R57), a corrected
 * field's issues are cleared and the row's review flag recomputed, then the
 * preview's review count and exact totals are recomputed from the stored
 * candidates and its review revision moves forward by one. Returns the new
 * revision. A row that is not a candidate, or a preview no longer ready at
 * `revision`, throws: the command refused both before.
 */
function correctRows(c: VaultContext, jobId: string, revision: number, rows: readonly ImportRowPatch[]): string {
  const current = new Map(
    c.sql
      .exec<CandidateRow>(
        `SELECT source_row_id, occurred_on, type, CAST(amount_minor AS TEXT) AS amount_minor, wallet_label, category_label, merchant, note, issues
           FROM import_candidates WHERE job_id = ? AND source_row_id ${IN_IDS}`,
        jobId,
        JSON.stringify(rows.map((row) => row.source_row_id)),
      )
      .toArray()
      .map((row) => [row.source_row_id, row]),
  )
  for (const patch of rows) {
    const row = current.get(patch.source_row_id)
    if (!row) throw new Error('every corrected row is a candidate of this preview')
    const corrected = new Set<string>(PATCH_FIELDS.filter((field) => patch[field] !== undefined))
    const next = { ...row }
    for (const field of corrected) next[field as (typeof PATCH_FIELDS)[number]] = patch[field as (typeof PATCH_FIELDS)[number]] as string | null
    const issues = (JSON.parse(row.issues) as { field: string | null }[]).filter((issue) => !corrected.has(issue.field ?? ''))
    const review = next.occurred_on === null || next.type === null || next.amount_minor === null || next.wallet_label === null || issues.length > 0
    const updated = c.sql
      .exec(
        `UPDATE import_candidates SET occurred_on = ?, type = ?, amount_minor = CAST(? AS INTEGER), wallet_label = ?, category_label = ?, merchant = ?, note = ?, issues = ?, review_required = ?
          WHERE job_id = ? AND source_row_id = ? RETURNING source_row_id`,
        next.occurred_on,
        next.type,
        next.amount_minor,
        next.wallet_label,
        next.category_label,
        next.merchant,
        next.note,
        JSON.stringify(issues),
        review ? 1 : 0,
        jobId,
        patch.source_row_id,
      )
      .toArray()
    if (updated.length !== 1) throw new Error('every corrected row is a candidate of this preview')
  }
  const [moved] = c.sql
    .exec<{ revision: string }>(
      `UPDATE import_previews SET review_revision = review_revision + 1,
              review_required_count = (SELECT count(*) FROM import_candidates WHERE job_id = ?1 AND review_required = 1),
              expense_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'expense'),
              income_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'income'),
              transfer_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'transfer')
        WHERE job_id = ?1 AND status = 'ready' AND review_revision = ?2
        RETURNING CAST(review_revision AS TEXT) AS revision`,
      jobId,
      revision,
    )
    .toArray()
  if (!moved) throw new Error('corrections apply to a ready preview at its current revision')
  return moved.revision
}

/**
 * PATCH /v1/imports/:id/rows (ConfirmationService.patchRows): corrections to
 * rows not committed yet, made against review revision n (If-Match). The
 * import's `import_review` entity moves to version n for revision n + 1
 * (revision 1 is the parse itself), so a replay reports the same revision.
 */
export function patchImportRows(c: VaultContext, call: VaultCall): PatchImportRowsResult {
  const jobId = routeId(call.params.id ?? '')
  const command = commandInput(call, PATCH_KIND, null, 'required')
  const rows = parsePatchBody(call.body, bangkokDate(c.now))
  const expected = command.expectedVersion
  if (expected === undefined) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match must be the review revision.', 'if_match')
  const ack = runCommand(c, { ...command, payload: { id: jobId, rows } }, () => {
    const preview = readyPreview(c, jobId)
    if (preview.review_revision !== String(expected)) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } })
    const ids = JSON.stringify(rows.map((row) => row.source_row_id))
    const known = new Set(c.sql.exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_candidates WHERE job_id = ? AND source_row_id ${IN_IDS}`, jobId, ids).toArray().map((row) => row.source_row_id))
    const unknown = rows.map((row) => row.source_row_id).filter((id) => !known.has(id))
    if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown')
    const committed = c.sql
      .exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_row_progress WHERE job_id = ? AND source_row_id ${IN_IDS} ORDER BY source_row_id`, jobId, ids)
      .toArray()
    if (committed.length > 0) {
      throw new ProblemException(409, 'IMPORT_ROW_COMMITTED', { fields: Object.fromEntries(committed.slice(0, MAX_ROW_PROBLEMS).map((row) => [row.source_row_id, 'errors.import_row_committed'])) })
    }
    const revision = correctRows(c, jobId, expected, rows)
    const version = (entityHead(c, REVIEW_ENTITY, jobId)?.version ?? 0) + 1
    if (String(version + 1) !== revision) throw new Error('An import review revision moved without a correction command.')
    return {
      entityId: jobId,
      version,
      changes: [{ entity: REVIEW_ENTITY, id: jobId, version, state: 'active', snapshot: { id: jobId, review_revision: revision } }],
      audit: { rows: String(rows.length) },
    }
  })
  return { ack, review_revision: String(ack.version + 1) }
}

type SelectableRow = { source_row_id: string; type: string | null; amount_minor: string | null; occurred_on: string | null; wallet_label: string | null; category_label: string | null }
type FrozenRef = { source_row_id: string; wallet_id: string; category_id: string }

/**
 * ConfirmationService.checkSelectable: every chosen row is a candidate (422
 * `errors.import_rows_unknown` otherwise) with a date, an expense or income
 * direction and an amount, and labels the mapping names; every mapped wallet
 * and category is this vault's, active and of the row's direction; no date is
 * before its wallet's tracking start or after today in Bangkok. A row already
 * committed only has to carry its frozen copy (labels mapped to an existing
 * wallet and category of its direction). Problems are named in file order (422
 * `errors.import_selection_invalid`). Returns each row's wallet and category.
 * The candidates are read through the cursor, never all at once.
 */
function checkSelectable(c: VaultContext, jobId: string, ids: readonly string[], mapping: ImportMapping): FrozenRef[] {
  const list = JSON.stringify(ids)
  const committed = new Set(c.sql.exec<{ source_row_id: string }>(`SELECT source_row_id FROM import_row_progress WHERE job_id = ? AND source_row_id ${IN_IDS}`, jobId, list).toArray().map((row) => row.source_row_id))
  const walletIds = [...new Set(Object.values(mapping.wallets))]
  const categoryIds = [...new Set([...Object.values(mapping.categories.expense), ...Object.values(mapping.categories.income)])]
  const wallets = new Map(
    c.sql.exec<{ id: string; archived: number; tracking_start: string }>(`SELECT id, archived, tracking_start FROM wallets WHERE id ${IN_IDS}`, JSON.stringify(walletIds)).toArray().map((row) => [row.id, row]),
  )
  const categories = new Map(c.sql.exec<{ id: string; type: string; archived: number }>(`SELECT id, type, archived FROM categories WHERE id ${IN_IDS}`, JSON.stringify(categoryIds)).toArray().map((row) => [row.id, row]))
  const today = bangkokDate(c.now)
  const known = new Set<string>()
  const problems = new Map<string, string>()
  const frozen: FrozenRef[] = []
  const candidates = c.sql.exec<SelectableRow>(
    `SELECT source_row_id, type, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, wallet_label, category_label
       FROM import_candidates WHERE job_id = ? AND source_row_id ${IN_IDS} ORDER BY ordinal`,
    jobId,
    list,
  )
  for (const row of candidates) {
    known.add(row.source_row_id)
    const problem = ((): string | null => {
      if (row.type === 'transfer') return 'errors.import_row_transfer'
      if (row.type === null || row.amount_minor === null || row.occurred_on === null) return 'errors.import_row_incomplete'
      if (!hasOwn(mapping.wallets, row.wallet_label)) return 'errors.import_wallet_unmapped'
      const byType = row.type === 'income' ? mapping.categories.income : mapping.categories.expense
      if (!hasOwn(byType, row.category_label)) return 'errors.import_category_unmapped'
      const wallet = wallets.get(mapping.wallets[row.wallet_label])
      if (!wallet) return 'errors.wallet_not_found'
      const open = !committed.has(row.source_row_id)
      if (open && wallet.archived === 1) return 'errors.wallet_archived'
      const category = categories.get(byType[row.category_label])
      if (!category) return 'errors.category_not_found'
      if (category.type !== row.type) return 'errors.category_type_mismatch'
      if (open && category.archived === 1) return 'errors.category_archived'
      frozen.push({ source_row_id: row.source_row_id, wallet_id: wallet.id, category_id: category.id })
      if (!open) return null
      if (row.occurred_on < wallet.tracking_start) return 'errors.date_before_tracking_start'
      if (row.occurred_on > today) return 'errors.date_in_future'
      return null
    })()
    if (problem) problems.set(row.source_row_id, problem)
  }
  const unknown = ids.filter((id) => !known.has(id))
  if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown')
  if (problems.size > 0) throw rowProblems(problems, 'errors.import_selection_invalid')
  return frozen
}

/**
 * gogospend_freeze_import_selection, in the command's block: the selection
 * (with its preview's expiry: frozen copies go when the candidates go) and
 * one frozen row per chosen candidate, with the wallet and category its labels
 * map to, in one INSERT that selects from one JSON parameter (ruling R57). The
 * CROSS JOIN keeps the JSON list as the outer loop, so each row is one
 * primary-key lookup of its candidate (SQLite may otherwise scan the list once
 * per candidate: 5,000 rows took seconds). The tables' checks, foreign keys and
 * the category-type trigger guard each row. Returns how many rows it froze.
 */
function freezeRows(c: VaultContext, selectionId: string, preview: PreviewRow, revision: string, frozen: readonly FrozenRef[]): number {
  c.sql.exec(
    'INSERT INTO import_selections (selection_id, job_id, frozen_revision, row_count, created_at, expires_at) VALUES (?, ?, CAST(? AS INTEGER), ?, ?, ?)',
    selectionId,
    preview.job_id,
    revision,
    frozen.length,
    c.now.toISOString(),
    preview.expires_at,
  )
  c.sql.exec(
    `INSERT INTO import_selection_rows (selection_id, source_row_id, ordinal, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant)
     SELECT ?, k.source_row_id, k.ordinal, k.type, k.amount_minor, k.occurred_on, json_extract(m.value, '$.wallet_id'), json_extract(m.value, '$.category_id'), k.note, k.merchant
       FROM json_each(?) m CROSS JOIN import_candidates k ON k.job_id = ? AND k.source_row_id = json_extract(m.value, '$.source_row_id')`,
    selectionId,
    JSON.stringify(frozen),
    preview.job_id,
  )
  const { n } = c.sql.exec<{ n: number }>('SELECT count(*) AS n FROM import_selection_rows WHERE selection_id = ?', selectionId).one()
  if (n !== frozen.length) throw new Error('every selected row is a candidate of this preview')
  return n
}

/**
 * POST /v1/imports/:id/selections (ConfirmationService.freezeSelection):
 * freezes the whole chosen set at the preview's current review revision. It
 * saves no record. The selection id follows from the account and the command,
 * so a retried freeze names the same selection.
 */
export function freezeImportSelection(c: VaultContext, call: VaultCall): CommandAck {
  const jobId = routeId(call.params.id ?? '')
  const command = commandInput(call, FREEZE_KIND, null, 'forbidden')
  const request = parseFreezeBody(call.body)
  const id = derivedUuid(c.claims.accountId, 'import-selection', command.commandId)
  return runCommand(c, { ...command, payload: { id, job_id: jobId, ...request } }, () => {
    const preview = readyPreview(c, jobId)
    if (preview.review_revision !== request.review_revision) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } })
    const count = freezeRows(c, id, preview, request.review_revision, checkSelectable(c, jobId, request.selected_row_ids, request.mapping))
    const { committed } = c.sql
      .exec<{ committed: number }>(`SELECT count(*) AS committed FROM import_row_progress WHERE job_id = ? AND source_row_id ${IN_IDS}`, jobId, JSON.stringify(request.selected_row_ids))
      .one()
    const snapshot: ImportSelectionSnapshot = { id, job_id: jobId, frozen_revision: request.review_revision, row_count: count, committed_count: committed }
    return { entityId: id, version: 1, changes: [{ entity: SELECTION_ENTITY, id, version: 1, state: 'active', snapshot }], audit: { rows: String(count) } }
  })
}

type SelectionRow = { selection_id: string; job_id: string; frozen_revision: string; row_count: number; preview_status: string; review_revision: string; expires_at: string }
type BatchRow = {
  source_row_id: string
  ordinal: number | null
  occurred_on: string | null
  committed: number
  wallet_archived: number | null
  tracking_start: string | null
  category_archived: number | null
}

/** The selection with its preview's state, or null for one this vault does not hold. */
function selectionOf(c: FileContext, selectionId: string): SelectionRow | null {
  const [row] = c.sql
    .exec<SelectionRow>(
      `SELECT s.selection_id, s.job_id, CAST(s.frozen_revision AS TEXT) AS frozen_revision, s.row_count,
              p.status AS preview_status, CAST(p.review_revision AS TEXT) AS review_revision, p.expires_at
         FROM import_selections s JOIN import_previews p ON p.job_id = s.job_id
        WHERE s.selection_id = ?`,
      selectionId,
    )
    .toArray()
  return row ?? null
}

/** The selection's rows in file order, each with whether the import committed it (from any selection), read through the cursor. */
function selectionRows(c: FileContext, selection: SelectionRow): Iterable<{ source_row_id: string; committed: number }> {
  return c.sql.exec<{ source_row_id: string; committed: number }>(
    `SELECT r.source_row_id, (g.source_row_id IS NOT NULL) AS committed
       FROM import_selection_rows r
       LEFT JOIN import_row_progress g ON g.job_id = ? AND g.source_row_id = r.source_row_id
      WHERE r.selection_id = ?
      ORDER BY r.ordinal`,
    selection.job_id,
    selection.selection_id,
  )
}

/** The batch's selection, still matching the ready, unexpired preview at the frozen revision the batch names (ConfirmationService.openSelection). */
function openSelection(c: VaultContext, batch: ConfirmImportBatch, jobId: string): SelectionRow {
  const selection = selectionOf(c, batch.selection_id)
  if (!selection || selection.job_id !== jobId) throw new ProblemException(404, 'NOT_FOUND')
  if (selection.preview_status !== 'ready' || isPast(c, selection.expires_at)) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' })
  if (batch.frozen_revision !== selection.frozen_revision) {
    throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_frozen_revision_mismatch', current: { frozen_revision: selection.frozen_revision } })
  }
  if (selection.review_revision !== selection.frozen_revision) {
    // The preview was corrected after this freeze: freeze the current revision again.
    throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_selection_stale', current: { review_revision: selection.review_revision } })
  }
  return selection
}

/** Each batch row, in the batch's order, with its frozen row (null ordinal when it is outside the selection), whether it is committed, and its wallet and category now. */
function batchRows(c: VaultContext, selection: SelectionRow, batch: ConfirmImportBatch): BatchRow[] {
  return c.sql
    .exec<BatchRow>(
      `SELECT b.value AS source_row_id, r.ordinal, r.occurred_on, (g.source_row_id IS NOT NULL) AS committed,
              w.archived AS wallet_archived, w.tracking_start, k.archived AS category_archived
         FROM json_each(?) b
         LEFT JOIN import_selection_rows r ON r.selection_id = ? AND r.source_row_id = b.value
         LEFT JOIN import_row_progress g ON g.job_id = ? AND g.source_row_id = b.value
         LEFT JOIN wallets w ON w.id = r.wallet_id
         LEFT JOIN categories k ON k.id = r.category_id
        ORDER BY b.key`,
      JSON.stringify(batch.batch_row_ids),
      selection.selection_id,
      selection.job_id,
    )
    .toArray()
}

function assertInsideSelection(rows: readonly BatchRow[]): void {
  const outside = rows.filter((row) => row.ordinal === null).map((row) => row.source_row_id)
  if (outside.length > 0) {
    throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', {
      messageKey: 'errors.import_rows_outside_selection',
      fields: Object.fromEntries(outside.slice(0, MAX_ROW_PROBLEMS).map((id) => [id, 'errors.import_row_outside_selection'])),
    })
  }
}

/** Only this import's own receipt image (the preview's attachment id) may be kept with its record. */
function assertOwnReceipt(c: VaultContext, jobId: string, receipt: ImportReceiptChoice): void {
  const [preview] = c.sql.exec<{ attachment_id: string | null }>('SELECT image_attachment_id AS attachment_id FROM import_previews WHERE job_id = ?', jobId).toArray()
  if (!preview?.attachment_id || preview.attachment_id !== receipt.attachment_id) throw stateProblem('errors.import_receipt_not_this_import', 'receipt.attachment_id')
}

/**
 * The `imports.confirmPrepare` step (ConfirmationService.receiptAllowed, then
 * AttachmentService.prepare without a record), in one block: `refused` when
 * the batch's read-only checks would refuse it (its selection, revisions and
 * rows, and the receipt being this import's own image), so nothing is
 * reserved and the command refuses with its own error; otherwise 1B-T9's
 * prepareReceipt for the receipt (`none`, `wait` or `copy`).
 */
export function confirmPrepare(c: VaultContext, call: VaultCall): ConfirmPrepared {
  const input = stepBody(call.body)
  const jobId = routeId(String(call.params.id ?? ''))
  if (!isUuid(input.command_id)) throw new Error('a confirmation prepare step names its command')
  const batch = parseConfirmBody(input.batch)
  if (!batch.receipt) throw new Error('a confirmation prepares only a receipt')
  try {
    const selection = openSelection(c, batch, jobId)
    assertInsideSelection(batchRows(c, selection, batch))
    assertOwnReceipt(c, selection.job_id, batch.receipt)
  } catch (error) {
    if (error instanceof ProblemException) return { kind: 'refused' }
    throw error
  }
  return prepareReceipt(c, { attachment_id: batch.receipt.attachment_id, command_id: input.command_id })
}

/** The receipt a command step carries, as the Worker built it from its prepare step and copy. */
function receiptOf(value: unknown): ConfirmReceipt {
  if (value === null || value === undefined) return null
  const prepared = stepBody(value)
  if (prepared.kind === 'none') return { kind: 'none' }
  if (prepared.kind === 'copied' && typeof prepared.key === 'string' && Number.isSafeInteger(prepared.bytes) && typeof prepared.sha256 === 'string') {
    return { kind: 'copied', key: prepared.key, bytes: prepared.bytes as number, sha256: prepared.sha256 }
  }
  throw new Error('a confirmation step names what its receipt prepared')
}

/**
 * ConfirmationService.confirmIn, inside the command: the selection must still
 * match the ready, unexpired preview at the frozen revision, and every row must
 * be in it. Each row not committed yet whose wallet and category still take it
 * (not archived, its date inside the wallet's tracking and not after today)
 * becomes one transaction with the id the API derives for an import row, then
 * its `import_row_progress` row (1B-T2's guard trigger checks it), one
 * statement each. A record id already used is never written again. The record
 * the receipt image's row becomes holds the kept receipt, in this block.
 */
function confirmIn(c: VaultContext, commandId: string, batch: ConfirmImportBatch, jobId: string, receipt: ConfirmReceipt): VaultMutation {
  const selection = openSelection(c, batch, jobId)
  const rows = batchRows(c, selection, batch)
  assertInsideSelection(rows)
  const today = bangkokDate(c.now)
  const open = rows
    .filter((row) => !row.committed)
    .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))
    .filter((row) => !row.wallet_archived && !row.category_archived && row.tracking_start !== null && (row.occurred_on as string) >= row.tracking_start && (row.occurred_on as string) <= today)
    .map((row) => ({ source_row_id: row.source_row_id, id: derivedUuid(c.claims.accountId, 'import-transaction', selection.job_id, row.source_row_id) }))
  // A record id is never reused (a purged one keeps its head).
  const taken = new Set(c.sql.exec<{ entity_id: string }>(`SELECT entity_id FROM entity_heads WHERE entity = 'transaction' AND entity_id ${IN_IDS}`, JSON.stringify(open.map((row) => row.id))).toArray().map((row) => row.entity_id))
  const saving = open.filter((row) => !taken.has(row.id))
  const at = c.now.toISOString()
  let records = saving.map((row): TransactionRow => {
    const [record] = c.sql
      .exec<TransactionRow>(
        `INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, version, created_at, updated_at)
         SELECT ?, r.type, r.amount_minor, r.occurred_on, r.wallet_id, r.category_id, r.note, r.merchant, 1, ?, ?
           FROM import_selection_rows r WHERE r.selection_id = ? AND r.source_row_id = ?
         RETURNING ${COLUMNS}`,
        row.id,
        at,
        at,
        selection.selection_id,
        row.source_row_id,
      )
      .toArray()
    if (!record) throw new Error('Every confirmed row becomes exactly one record.')
    c.sql.exec(
      'INSERT INTO import_row_progress (job_id, source_row_id, selection_id, transaction_id, command_id, committed_at) VALUES (?, ?, ?, ?, ?, ?)',
      selection.job_id,
      row.source_row_id,
      selection.selection_id,
      row.id,
      commandId,
      at,
    )
    return record
  })
  const audit: Record<string, string> = {}
  const imageRecord = saving.find((row) => row.source_row_id === IMPORT_IMAGE_ROW_ID)
  if (batch.receipt && imageRecord && !receipt) {
    // No copy was made: the read-only checks refused (and this refuses for the same reason) or the state
    // moved since they ran. Never save the image's record without the receipt the person asked to keep.
    assertOwnReceipt(c, selection.job_id, batch.receipt)
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 1 })
  }
  if (batch.receipt && receipt && imageRecord) {
    assertOwnReceipt(c, selection.job_id, batch.receipt)
    ready(c, batch.receipt.attachment_id, receipt.kind === 'copied' ? { key: receipt.key, bytes: receipt.bytes, sha256: receipt.sha256 } : null)
    c.sql.exec('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', imageRecord.id, batch.receipt.attachment_id, at)
    records = records.map((record) => (record.id === imageRecord.id ? (transactionRow(c, record.id) as TransactionRow) : record))
    audit.consent = RECEIPT_RETENTION_CONSENT
  }
  const { committed } = c.sql
    .exec<{ committed: number }>(
      'SELECT count(*) AS committed FROM import_selection_rows r JOIN import_row_progress g ON g.job_id = ? AND g.source_row_id = r.source_row_id WHERE r.selection_id = ?',
      selection.job_id,
      selection.selection_id,
    )
    .one()
  const head = entityHead(c, SELECTION_ENTITY, selection.selection_id)
  if (!head) throw new Error('A frozen selection has its entity head.')
  const version = head.version + 1
  const snapshot: ImportSelectionSnapshot = { id: selection.selection_id, job_id: selection.job_id, frozen_revision: selection.frozen_revision, row_count: selection.row_count, committed_count: committed }
  const changes: EntityChange[] = [
    { entity: SELECTION_ENTITY, id: selection.selection_id, version, state: 'active', snapshot },
    ...records.map((record): EntityChange => ({ entity: 'transaction', id: record.id, version: record.version, state: 'active', snapshot: toDto(record) })),
  ]
  const conflicted = rows.length - rows.filter((row) => row.committed).length - saving.length
  const codes: AuditMetadata = { rows: String(saving.length), conflicted: String(conflicted), ...audit }
  return { entityId: selection.selection_id, version, changes, audit: codes }
}

/** The batch's outcome from durable progress, in the same block (ConfirmationService.outcome): the same for a replay of the same command. */
function outcome(c: VaultContext, batch: ConfirmImportBatch, ack: CommandAck, jobId: string): ConfirmImportBatchResult {
  if (ack.entity_id !== batch.selection_id) throw new Error('A confirmation acknowledged another selection.')
  const selection = selectionOf(c, batch.selection_id)
  // Frozen copies go with the preview (7 days): the batch's rows are no longer reported.
  if (!selection) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' })
  if (selection.job_id !== jobId) throw new ProblemException(404, 'NOT_FOUND')
  const inBatch = new Set(batch.batch_row_ids)
  const committed: string[] = []
  const remaining: string[] = []
  const conflicted: string[] = []
  for (const row of selectionRows(c, selection)) {
    if (inBatch.has(row.source_row_id)) (row.committed ? committed : conflicted).push(row.source_row_id)
    else if (!row.committed) remaining.push(row.source_row_id)
  }
  return { ack, selection_id: selection.selection_id, frozen_revision: selection.frozen_revision, committed, remaining, conflicted }
}

/**
 * The `imports.confirm` step (ConfirmationService.confirm): one batch of a
 * frozen selection as one command, then its outcome read from durable
 * progress. The Worker sends the batch it parsed and what its receipt
 * prepared (null without a receipt).
 */
export function confirmImportBatch(c: VaultContext, call: VaultCall): ConfirmImportBatchResult {
  const jobId = routeId(call.params.id ?? '')
  const command = commandInput(call, CONFIRM_KIND, null, 'forbidden')
  const input = stepBody(call.body)
  const batch = parseConfirmBody(input.batch)
  const receipt = receiptOf(input.prepared)
  const { selection_id: id, ...rest } = batch
  const ack = runCommand(c, { ...command, payload: { id, ...rest } }, () => confirmIn(c, command.commandId, batch, jobId, receipt))
  return outcome(c, batch, ack, jobId)
}

/** GET /v1/imports/:id/selections/:selectionId (ConfirmationService.progress): the selection's durable progress, or null for an unknown one or another import's. */
export function selectionProgress(c: FileContext, jobId: string, selectionId: string): ImportSelectionProgress | null {
  const selection = selectionOf(c, selectionId)
  if (!selection || selection.job_id !== jobId) return null
  const committed: string[] = []
  const remaining: string[] = []
  for (const row of selectionRows(c, selection)) (row.committed ? committed : remaining).push(row.source_row_id)
  const status: ImportSelectionStatus =
    selection.preview_status !== 'ready' || isPast(c, selection.expires_at) ? 'expired' : selection.review_revision !== selection.frozen_revision ? 'stale' : 'open'
  return { selection_id: selection.selection_id, job_id: selection.job_id, frozen_revision: selection.frozen_revision, row_count: selection.row_count, status, committed, remaining }
}
