import type { ImportCandidate, ImportDuplicateAdvice, ImportField, ImportIssue, ImportLayout, ImportPreview, ImportPreviewStatus, parseImportPreviewPaging } from '@gogospend/contracts'

import { REVIEW_ENTITY, SELECTION_ENTITY } from '@api/imports/confirmation.service'

import { PURGE_BATCH, purgeEntities } from '../retention'
import { SOURCE_MARGIN_MS } from './attachments'
import { touch } from './context'
import type { FileContext } from './context'
import { vaultPrefix } from './keys'

// Import previews on the vault (1B-T10): a port of PreviewQuery (the review
// read, its paging and its duplicate advice), with the preview image's
// `attachable_until` from 0017's gogospend_import_image_attachable_until, and
// the import retention on the vault clock: 0016's
// gogospend_expire_due_import_previews and 0018's
// gogospend_prune_import_selections with gogospend_import_records_due.

/** A page of a preview's candidates (parseImportPreviewPaging's answer); null reads the whole preview. */
export type PreviewPaging = NonNullable<ReturnType<typeof parseImportPreviewPaging>>

const DAY_MS = 86_400_000
/** The import's synced records (its review revision, its selections' counts) go this long after their last change, once their preview or selection is gone. */
export const IMPORT_RECORDS_MS = 30 * DAY_MS

// A parse failure that means the quarantined file could not be read (PreviewQuery's UNAVAILABLE).
const UNAVAILABLE = new Set(['quarantine_corrupt', 'quarantine_missing', 'storage_unavailable', 'import_unavailable'])

type HeadRow = {
  job_id: string
  upload_status: string
  parse_state: string | null
  parse_failure: string | null
  status: 'ready' | 'rejected' | 'expired' | null
  layout: ImportLayout | null
  issues: string | null
  candidate_count: number | null
  review_required_count: number | null
  expense: string | null
  income: string | null
  transfer: string | null
  image_width: number | null
  image_height: number | null
  image_attachment_id: string | null
  image_due: number | null
  review_revision: string | null
  expires_at: string | null
}

type CandidateRow = {
  source_row_id: string
  ordinal: number
  occurred_on: string | null
  type: ImportCandidate['type']
  amount_minor: string | null
  wallet_label: string | null
  category_label: string | null
  merchant: string | null
  note: string | null
  review_required: number
  issues: string
}

type RowIssue = { field: ImportField | null; code: string }

const CANDIDATE_COLUMNS = `source_row_id, ordinal, occurred_on, type, CAST(amount_minor AS TEXT) AS amount_minor,
  wallet_label, category_label, merchant, note, review_required, issues`

/** The client-visible state of an import that has no recorded preview (PreviewQuery's pendingStatus, from the vault's parse state). */
function pendingStatus(head: HeadRow): ImportPreviewStatus {
  if (head.upload_status === 'expired') return 'expired'
  switch (head.parse_state) {
    case 'queued':
      return 'queued'
    case 'parsing':
      return 'parsing'
    case 'failed':
    case 'parsed':
      return 'failed'
    default:
      return 'cancelled'
  }
}

/** One candidate as the API serves it, in its key order (the stored issues are served apart). */
function candidateOf(row: CandidateRow): ImportCandidate {
  return {
    source_row_id: row.source_row_id,
    ordinal: row.ordinal,
    occurred_on: row.occurred_on,
    type: row.type,
    amount_minor: row.amount_minor,
    wallet_label: row.wallet_label,
    category_label: row.category_label,
    merchant: row.merchant,
    note: row.note,
    review_required: row.review_required === 1,
  }
}

/** A row's stored issues as preview issues, in their stored order. */
function rowIssues(row: { source_row_id: string; issues: string }): ImportIssue[] {
  return (JSON.parse(row.issues) as RowIssue[]).map((issue) => ({ code: issue.code, source_row_id: row.source_row_id, field: issue.field }))
}

/**
 * DUPLICATE_ADVICE_SQL on the vault. For each candidate with a date, a type
 * and an amount (only the page's rows, by ordinal, when `range` is given):
 * at most 5 of the vault's active records with the same date, type and
 * amount, in id order (`existing_transaction`), and at most 5 other rows of
 * the whole file with the same date, type, amount, wallet, merchant and note,
 * in file order, a null matching a null as PARTITION BY groups it
 * (`same_file`). Advice is in file order, `existing_transaction` first. One
 * read of the records (at most 5 per date, type and amount the file names)
 * and one pass over the candidates through the cursor, so it stays linear in
 * the file and the records (M1).
 */
function duplicateAdvice(c: FileContext, jobId: string, range: { first: number; last: number } | null): ImportDuplicateAdvice[] {
  const existing = new Map<string, string[]>()
  const records = c.sql.exec<{ id: string; occurred_on: string; type: string; amount_minor: string }>(
    `SELECT id, occurred_on, type, amount_minor FROM (
       SELECT t.id, t.occurred_on, t.type, CAST(t.amount_minor AS TEXT) AS amount_minor,
              row_number() OVER (PARTITION BY t.occurred_on, t.type, t.amount_minor ORDER BY t.id) AS n
         FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (t.occurred_on, t.type, t.amount_minor) IN (
                SELECT occurred_on, type, amount_minor FROM import_candidates
                 WHERE job_id = ? AND occurred_on IS NOT NULL AND type IS NOT NULL AND amount_minor IS NOT NULL)
     ) WHERE n <= 5 ORDER BY n`,
    jobId,
  )
  for (const record of records) {
    const key = JSON.stringify([record.occurred_on, record.type, record.amount_minor])
    const ids = existing.get(key) ?? []
    ids.push(record.id)
    existing.set(key, ids)
  }
  const twins = new Map<string, string[]>()
  const asked: { source_row_id: string; existing: string; twins: string }[] = []
  const candidates = c.sql.exec<{ source_row_id: string; ordinal: number; occurred_on: string; type: string; amount_minor: string; wallet_label: string | null; merchant: string | null; note: string | null }>(
    `SELECT source_row_id, ordinal, occurred_on, type, CAST(amount_minor AS TEXT) AS amount_minor, wallet_label, merchant, note
       FROM import_candidates WHERE job_id = ? AND occurred_on IS NOT NULL AND type IS NOT NULL AND amount_minor IS NOT NULL ORDER BY ordinal`,
    jobId,
  )
  for (const row of candidates) {
    const key = JSON.stringify([row.occurred_on, row.type, row.amount_minor, row.wallet_label, row.merchant, row.note])
    // The first six rows of a group name every row's first five others.
    const group = twins.get(key) ?? []
    if (group.length < 6) group.push(row.source_row_id)
    twins.set(key, group)
    if (range === null || (row.ordinal >= range.first && row.ordinal <= range.last)) {
      asked.push({ source_row_id: row.source_row_id, existing: JSON.stringify([row.occurred_on, row.type, row.amount_minor]), twins: key })
    }
  }
  const advice: ImportDuplicateAdvice[] = []
  for (const row of asked) {
    const matches = existing.get(row.existing)
    if (matches) advice.push({ source_row_id: row.source_row_id, kind: 'existing_transaction', matches: [...matches] })
    const others = (twins.get(row.twins) ?? []).filter((id) => id !== row.source_row_id).slice(0, 5)
    if (others.length > 0) advice.push({ source_row_id: row.source_row_id, kind: 'same_file', matches: others })
  }
  return advice
}

/**
 * GET /v1/imports/:id/preview (PreviewQuery.read): this vault's accepted
 * import as a reviewable preview, or null for an unknown or unaccepted one.
 * Before a preview exists it reads queued, parsing, failed (with its issue),
 * cancelled or expired. Past its expiry the preview reads `expired` with no
 * rows, even before pruneImports runs (M4). Duplicate advice never changes or
 * hides a candidate. `paging` null is the whole preview; a page narrows the
 * candidates only, while the summary and the issues stay whole-file and the
 * advice names the page's rows. The image can be retained until its
 * `import_image` object is due less two minutes, while more than two minutes
 * are left (0017's gogospend_import_image_attachable_until); null otherwise.
 */
export function previewOf(c: FileContext, jobId: string, paging: PreviewPaging | null): ImportPreview | null {
  const now = c.now.getTime()
  const [head] = c.sql
    .exec<HeadRow>(
      `SELECT u.job_id, u.status AS upload_status, u.parse_state, u.parse_failure,
              p.status, p.layout, p.issues, p.candidate_count, p.review_required_count,
              CAST(p.expense_total_minor AS TEXT) AS expense, CAST(p.income_total_minor AS TEXT) AS income, CAST(p.transfer_total_minor AS TEXT) AS transfer,
              p.image_width, p.image_height, p.image_attachment_id,
              (SELECT o.delete_after FROM vault_objects o
                WHERE o.key = p.image_key AND p.status = 'ready' AND o.purpose = 'import_image' AND o.status = 'published' AND o.delete_after > ?) AS image_due,
              CAST(p.review_revision AS TEXT) AS review_revision, p.expires_at
         FROM import_uploads u LEFT JOIN import_previews p ON p.job_id = u.job_id
        WHERE u.job_id = ? AND u.accepted_at IS NOT NULL`,
      now + SOURCE_MARGIN_MS,
      jobId,
    )
    .toArray()
  if (!head) return null
  if (head.status === null) {
    const status = pendingStatus(head)
    const issues: ImportIssue[] = status === 'failed' ? [{ code: head.parse_failure && UNAVAILABLE.has(head.parse_failure) ? 'quarantine_unavailable' : 'parse_failed', source_row_id: null, field: null }] : []
    return { job_id: head.job_id, status, candidates: [], issues, duplicate_advice: [], review_revision: null, expires_at: null, summary: null }
  }

  // M4: past expires_at the route never serves ready rows, even before pruneImports runs.
  const expired = head.status === 'expired' || (head.expires_at !== null && Date.parse(head.expires_at) <= now)
  const summary: NonNullable<ImportPreview['summary']> = {
    layout: head.layout,
    candidate_count: head.candidate_count ?? 0,
    review_required_count: head.review_required_count ?? 0,
    totals: { expense_minor: head.expense ?? '0', income_minor: head.income ?? '0', transfer_minor: head.transfer ?? '0' },
    // P2c: the image's opaque attachment id (never its object key) and until when it can be retained.
    image:
      head.image_width !== null && head.image_height !== null && head.image_attachment_id !== null
        ? {
            width: head.image_width,
            height: head.image_height,
            attachment_id: head.image_attachment_id,
            attachable_until: head.image_due === null ? null : new Date(head.image_due - SOURCE_MARGIN_MS).toISOString(),
          }
        : null,
  }
  if (expired) {
    return { job_id: head.job_id, status: 'expired', candidates: [], issues: [], duplicate_advice: [], review_revision: head.review_revision, expires_at: head.expires_at, summary }
  }

  const issues: ImportIssue[] = (JSON.parse(head.issues ?? '[]') as string[]).map((code) => ({ code, source_row_id: null, field: null }))
  const status = head.status
  if (paging === null) {
    const candidates: ImportCandidate[] = []
    for (const row of c.sql.exec<CandidateRow>(`SELECT ${CANDIDATE_COLUMNS} FROM import_candidates WHERE job_id = ? ORDER BY ordinal`, jobId)) {
      candidates.push(candidateOf(row))
      issues.push(...rowIssues(row))
    }
    return { job_id: head.job_id, status, candidates, issues, duplicate_advice: duplicateAdvice(c, jobId, null), review_revision: head.review_revision, expires_at: head.expires_at, summary }
  }

  // A page: candidates only. Row issues stay whole-file (a reviewer needs every problem), from their own read.
  const rows = c.sql.exec<CandidateRow>(`SELECT ${CANDIDATE_COLUMNS} FROM import_candidates WHERE job_id = ? ORDER BY ordinal LIMIT ? OFFSET ?`, jobId, paging.limit, paging.offset).toArray()
  for (const row of c.sql.exec<{ source_row_id: string; issues: string }>("SELECT source_row_id, issues FROM import_candidates WHERE job_id = ? AND json_array_length(issues) > 0 ORDER BY ordinal", jobId)) {
    issues.push(...rowIssues(row))
  }
  const advice = rows.length === 0 ? [] : duplicateAdvice(c, jobId, { first: rows[0].ordinal, last: rows[rows.length - 1].ordinal })
  const total = summary.candidate_count
  const end = paging.offset + rows.length
  return {
    job_id: head.job_id,
    status,
    candidates: rows.map(candidateOf),
    issues,
    duplicate_advice: advice,
    review_revision: head.review_revision,
    expires_at: head.expires_at,
    summary,
    page: { offset: paging.offset, limit: paging.limit, total, next_offset: rows.length > 0 && end < total ? end : null },
  }
}

/** The import's synced records that are due: 30 days after their last change, once their selection is gone or their preview has expired (gogospend_import_records_due), at most PURGE_BATCH. */
function recordsDue(c: FileContext, entity: string): string[] {
  const gone =
    entity === SELECTION_ENTITY
      ? 'NOT EXISTS (SELECT 1 FROM import_selections s WHERE s.selection_id = h.entity_id)'
      : 'NOT EXISTS (SELECT 1 FROM import_previews p WHERE p.job_id = h.entity_id AND p.expires_at > ?2)'
  return c.sql
    .exec<{ entity_id: string }>(
      `SELECT h.entity_id FROM entity_heads h
         JOIN entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
        WHERE h.entity = ?1 AND h.state <> 'purged' AND g.committed_at <= ?3 AND ${gone}
        ORDER BY h.entity_id LIMIT ?4`,
      entity,
      c.now.toISOString(),
      new Date(c.now.getTime() - IMPORT_RECORDS_MS).toISOString(),
      PURGE_BATCH,
    )
    .toArray()
    .map((row) => row.entity_id)
}

/**
 * The import retention on the vault clock, in short blocks of its own, each
 * rule at its own due time (inclusive), so importsDueAt moves past it (ruling
 * R37):
 * - a preview at its expiry (7 days) has its candidates deleted, reads
 *   `expired` (stamped `expired_at`), and its import images are due now
 *   (gogospend_expire_due_import_previews);
 * - a selection at its expiry (its preview's) is deleted with its frozen rows
 *   (gogospend_prune_import_selections);
 * - the `import_selection` and `import_review` records are purged with 1A-T8b's
 *   purgeEntities, at most PURGE_BATCH per block, 30 days after their last
 *   change once their selection is gone or their preview has expired.
 * Row progress stays until pruneUploads drops the upload row, whose cascade
 * removes it. It does not check the vault's state: 1B-T11 runs it only for an
 * active vault.
 */
export function pruneImports(c: FileContext): void {
  const at = c.now.toISOString()
  c.storage.transactionSync(() => {
    const expired = c.sql
      .exec<{ job_id: string }>("UPDATE import_previews SET status = 'expired', expired_at = ? WHERE status <> 'expired' AND expires_at <= ? RETURNING job_id", at, at)
      .toArray()
      .map((row) => row.job_id)
    if (expired.length === 0) return
    const jobs = JSON.stringify(expired)
    const prefix = vaultPrefix('import_image', c.vaultId)
    c.sql.exec('DELETE FROM import_candidates WHERE job_id IN (SELECT value FROM json_each(?))', jobs)
    // An image key is import_image/<vault id>/<job id>/<attempt token>/<name> (B1).
    c.sql.exec(
      "UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE purpose = 'import_image' AND status IN ('reserved', 'published') AND substr(key, 1, ?) IN (SELECT ? || value || '/' FROM json_each(?))",
      c.now.getTime(),
      prefix.length + 37,
      prefix,
      jobs,
    )
    touch(c)
  })
  c.storage.transactionSync(() => {
    const gone = c.sql.exec('DELETE FROM import_selections WHERE expires_at <= ? RETURNING selection_id', at).toArray()
    if (gone.length > 0) touch(c)
  })
  for (const entity of [SELECTION_ENTITY, REVIEW_ENTITY]) {
    for (let more = true; more; ) {
      more = c.storage.transactionSync(() => {
        const ids = recordsDue(c, entity)
        if (ids.length === 0) return false
        purgeEntities(c, entity, ids)
        touch(c)
        return ids.length === PURGE_BATCH
      })
    }
  }
}

/**
 * When pruneImports next has work, from the same rules: the earliest unexpired
 * preview's expiry, the earliest selection's expiry, and each unpurged import
 * record's last change plus 30 days, but not before its selection or preview
 * expires; null when none will (ruling R37).
 */
export function importsDueAt(c: FileContext): number | null {
  const { preview, selection, record } = c.sql
    .exec<{ preview: string | null; selection: string | null; record: string | null }>(
      `SELECT (SELECT min(expires_at) FROM import_previews WHERE status <> 'expired') AS preview,
              (SELECT min(expires_at) FROM import_selections) AS selection,
              (SELECT min(max(strftime('%Y-%m-%dT%H:%M:%fZ', g.committed_at, '+30 days'),
                              coalesce(CASE h.entity WHEN ?1 THEN (SELECT s.expires_at FROM import_selections s WHERE s.selection_id = h.entity_id)
                                                     ELSE (SELECT p.expires_at FROM import_previews p WHERE p.job_id = h.entity_id) END, '')))
                 FROM entity_heads h
                 JOIN entity_changes g ON g.revision = h.revision AND g.entity = h.entity AND g.entity_id = h.entity_id
                WHERE h.entity IN (?1, ?2) AND h.state <> 'purged') AS record`,
      SELECTION_ENTITY,
      REVIEW_ENTITY,
    )
    .one()
  const times = [preview, selection, record].filter((time): time is string => time !== null).map((time) => Date.parse(time))
  return times.length === 0 ? null : Math.min(...times)
}
