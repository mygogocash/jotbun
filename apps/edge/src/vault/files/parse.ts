import { IMPORT_IMAGE_TTL_HOURS, IMPORT_PREVIEW_TTL_DAYS, bangkokDate } from '@gogospend/contracts'

import type { PreviewRecord } from '@api/imports/parse-outcome'
import type { ImageFormat, ParseFormat } from '@api/imports/parsers/protocol'

import { touch } from './context'
import type { FileContext } from './context'
import { vaultObjectKey } from './keys'
import { RESERVATION_GRACE_MS, publishObject, reserveObject } from './objects'

// The parse pipeline's vault side (1B-T5, B6): ports of
// gogospend_import_parse_source and gogospend_record_import_preview, with the
// attempts counted here and not by the queue. Background methods: each runs
// in a short transactionSync block of the UserVault method that calls it.

/** A parse is tried at most this many times (the API's import_parse max_attempts). */
export const PARSE_MAX_ATTEMPTS = 3
/** A queued import whose message no consumer has seen for this long is sent again (ruling R32). */
export const PARSE_RESEND_MS = 3_600_000
/** A parse never starts on a raw file with less than this left before it expires. */
export const MIN_RAW_LIFETIME_MS = 5 * 60_000

const DAY_MS = 86_400_000
const PREVIEW_TTL_MS = IMPORT_PREVIEW_TTL_DAYS * DAY_MS
const IMAGE_TTL_MS = IMPORT_IMAGE_TTL_HOURS * 3_600_000
const IMAGE_EXTENSIONS: Readonly<Record<ImageFormat, string>> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

export type ParseSource =
  | { kind: 'parse'; attempt: number; format: ParseFormat; bytes: number; sha256: string; today: string; parts: { key: string; bytes: number; sha256: string }[] }
  | { kind: 'held' }
  | { kind: 'skip' }

export type ParsedPreview = { record: PreviewRecord; image: { key: string; bytes: number; sha256: string; width: number; height: number } | null }

type JobRow = { status: string; parse_state: string | null; parse_attempts: number; format: ParseFormat; bytes: string; sha256: string; part_count: number; expires_at: string }

const iso = (ms: number) => new Date(ms).toISOString()

function jobRow(c: FileContext, jobId: string): JobRow | undefined {
  return c.sql
    .exec<JobRow>('SELECT status, parse_state, parse_attempts, format, CAST(bytes AS TEXT) AS bytes, sha256, part_count, expires_at FROM import_uploads WHERE job_id = ?', jobId)
    .toArray()[0]
}

/** The prefix every image key of one import starts with. */
function imagePrefix(c: FileContext, jobId: string): string {
  return `import_image/${c.vaultId}/${jobId}/`
}

/**
 * What the consumer should do with a parse message, in this order: a job that
 * is not an accepted upload queued or parsing is skipped; a raw file with less
 * than MIN_RAW_LIFETIME_MS left fails the job (`import_unavailable`), even for
 * a held format; a held format spends no attempt; a job out of attempts fails;
 * otherwise the job is parsing with one more attempt, and its published parts
 * are named in order with the sizes and digests the registry holds. `held` and
 * `parse` both stamp `enqueued_at`, so a message the consumer keeps seeing is
 * never sent again (ruling R32). A part missing from the registry fails the
 * job as `quarantine_missing`.
 */
export function parseSource(c: FileContext, jobId: string, held: readonly ParseFormat[]): ParseSource {
  const row = jobRow(c, jobId)
  if (!row || row.status !== 'accepted' || (row.parse_state !== 'queued' && row.parse_state !== 'parsing')) return { kind: 'skip' }
  const now = c.now.getTime()
  if (Date.parse(row.expires_at) - now < MIN_RAW_LIFETIME_MS) {
    failParse(c, jobId, 'import_unavailable')
    return { kind: 'skip' }
  }
  if (held.includes(row.format)) {
    c.sql.exec("UPDATE import_uploads SET parse_state = 'queued', enqueued_at = ?, enqueued_attempts = parse_attempts WHERE job_id = ?", iso(now), jobId)
    touch(c)
    return { kind: 'held' }
  }
  if (row.parse_attempts >= PARSE_MAX_ATTEMPTS) {
    failParse(c, jobId, 'import_unavailable')
    return { kind: 'skip' }
  }
  const parts = c.sql
    .exec<{ key: string; bytes: string; sha256: string }>(
      "SELECT o.key, CAST(o.bytes AS TEXT) AS bytes, o.sha256 FROM import_parts p JOIN vault_objects o ON o.key = p.object_key AND o.status = 'published' WHERE p.job_id = ? ORDER BY p.part_index",
      jobId,
    )
    .toArray()
    .map((part) => ({ key: part.key, bytes: Number(part.bytes), sha256: part.sha256 }))
  if (parts.length !== row.part_count) {
    failParse(c, jobId, 'quarantine_missing')
    return { kind: 'skip' }
  }
  const attempt = row.parse_attempts + 1
  c.sql.exec("UPDATE import_uploads SET parse_state = 'parsing', parse_attempts = ?, enqueued_at = ?, enqueued_attempts = ? WHERE job_id = ?", attempt, iso(now), attempt, jobId)
  touch(c)
  return { kind: 'parse', attempt, format: row.format, bytes: Number(row.bytes), sha256: row.sha256, today: bangkokDate(c.now), parts }
}

/** Reserves a fresh key for the job's sanitized image, only while it is parsing; null otherwise. */
export function reserveImageKey(c: FileContext, jobId: string, format: ImageFormat): string | null {
  const row = jobRow(c, jobId)
  if (!row || row.status !== 'accepted' || row.parse_state !== 'parsing' || !(format in IMAGE_EXTENSIONS)) return null
  const key = vaultObjectKey('import_image', c.vaultId, jobId, crypto.randomUUID(), `image.${IMAGE_EXTENSIONS[format]}`)
  reserveObject(c, key, 'import_image')
  return key
}

/**
 * gogospend_record_import_preview: only while the job is parsing and before its
 * raw file expires, and an image only while its reservation is this job's and
 * still inside its own deadline (reserved at created_at, given up
 * RESERVATION_GRACE_MS later, even if a failed delete moved delete_after on).
 * Writes the preview (revision 1, 7 days), one INSERT per candidate (ruling
 * R57), the exact totals from the stored candidates, publishes the image for
 * 24 hours and marks the job parsed. Otherwise `{ recorded: false }` and
 * nothing is written. An invalid row is a table CHECK and throws (the
 * consumer retries, and the attempts bound it).
 */
export function recordPreview(c: FileContext, jobId: string, parsed: ParsedPreview): { recorded: boolean } {
  const row = jobRow(c, jobId)
  const now = c.now.getTime()
  if (!row || row.status !== 'accepted' || row.parse_state !== 'parsing' || Date.parse(row.expires_at) <= now) return { recorded: false }
  const image = parsed.image
  if (image) {
    const [reserved] = c.sql
      .exec<{ created_at: number }>("SELECT created_at FROM vault_objects WHERE key = ? AND purpose = 'import_image' AND status = 'reserved' AND delete_after > ?", image.key, now)
      .toArray()
    if (!reserved || !image.key.startsWith(imagePrefix(c, jobId)) || reserved.created_at + RESERVATION_GRACE_MS <= now) return { recorded: false }
  }
  const { preview, candidates } = parsed.record
  c.sql.exec(
    `INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, image_key, image_width, image_height, image_attachment_id, review_revision, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?)`,
    jobId,
    preview.status,
    preview.layout,
    JSON.stringify(preview.issues),
    candidates.length,
    image?.key ?? null,
    image?.width ?? null,
    image?.height ?? null,
    image ? crypto.randomUUID() : null,
    iso(now),
    iso(now + PREVIEW_TTL_MS),
  )
  for (const candidate of candidates) {
    c.sql.exec(
      `INSERT INTO import_candidates (job_id, source_row_id, ordinal, occurred_on, type, amount_minor, wallet_label, category_label, merchant, note, issues, review_required)
       VALUES (?, ?, ?, ?, ?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?)`,
      jobId,
      candidate.source_row_id,
      candidate.ordinal,
      candidate.occurred_on,
      candidate.type,
      candidate.amount_minor,
      candidate.wallet_label,
      candidate.category_label,
      candidate.merchant,
      candidate.note,
      JSON.stringify(candidate.issues),
      candidate.review_required ? 1 : 0,
    )
  }
  if (c.sql.exec('SELECT 1 FROM import_candidates WHERE job_id = ? AND ordinal > ?', jobId, candidates.length).toArray().length > 0) throw new Error('candidate ordinals are 1..n')
  c.sql.exec(
    `UPDATE import_previews SET
        review_required_count = (SELECT count(*) FROM import_candidates WHERE job_id = ?1 AND review_required = 1),
        expense_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'expense'),
        income_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'income'),
        transfer_total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM import_candidates WHERE job_id = ?1 AND type = 'transfer')
      WHERE job_id = ?1`,
    jobId,
  )
  if (image) publishObject(c, image.key, { bytes: image.bytes, sha256: image.sha256 }, now + IMAGE_TTL_MS)
  c.sql.exec("UPDATE import_uploads SET parse_state = 'parsed' WHERE job_id = ?", jobId)
  touch(c)
  return { recorded: true }
}

/** Puts a parsing job back in the queue; with `spent` false the parse never ran, so its attempt is given back. */
export function retryParse(c: FileContext, jobId: string, spent: boolean): void {
  c.sql.exec(
    "UPDATE import_uploads SET parse_state = 'queued', enqueued_at = ?, parse_attempts = CASE WHEN ? THEN parse_attempts ELSE max(parse_attempts - 1, 0) END WHERE job_id = ? AND status = 'accepted' AND parse_state = 'parsing'",
    iso(c.now.getTime()),
    spent ? 1 : 0,
    jobId,
  )
  touch(c)
}

/** Fails a queued or parsing job with `code`, and makes its unpublished image keys due now. */
export function failParse(c: FileContext, jobId: string, code: string): void {
  c.sql.exec("UPDATE import_uploads SET parse_state = 'failed', parse_failure = ? WHERE job_id = ? AND status = 'accepted' AND parse_state IN ('queued', 'parsing')", code, jobId)
  const prefix = imagePrefix(c, jobId)
  c.sql.exec("UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE status = 'reserved' AND substr(key, 1, ?) = ?", c.now.getTime(), prefix.length, prefix)
  touch(c)
}
