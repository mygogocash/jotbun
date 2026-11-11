import { IMPORT_CONTENT_TYPES, IMPORT_FORMATS, IMPORT_QUARANTINE_TTL_HOURS, IMPORT_QUOTAS, IMPORT_UPLOAD_MAX_BYTES } from '@gogospend/contracts'
import type { ImportFormat, ImportJobDto, ImportLimit, ImportStatus } from '@gogospend/contracts'

import type { BeginInput, BeginResult, FinishInput, FinishResult, IntakeOutcomeCode } from '@api/imports/import.repository'

import { touch } from './context'
import type { FileContext } from './context'
import { vaultObjectKey } from './keys'
import { RESERVATION_GRACE_MS, reserveObject, tombstoneObjects } from './objects'

// Statement uploads in the vault (1B-T5): ports of the 0014 routines
// (gogospend_begin_import_upload, _reserve_import_part, _finish_import_upload,
// _abort_import_upload, _discard_import_parts, _import_bytes_wait, the quota
// helpers and _fail_stale_import_uploads), on the vault clock. A vault holds
// one account, so the account lock is the call's own transaction and there is
// no lifecycle generation. Every quota, limit and outcome code is the API's.
// Each part of an upload is one row of import_parts and one vault_objects key
// (B4), `import_quarantine/<vaultId>/<job>/<intake token>/part-NNNN` (B1).

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** An upload's body must arrive within this long of its start (the API's receive_deadline). */
export const UPLOAD_RECEIVE_MS = 10 * MINUTE_MS
/** An accepted upload's raw parts are kept this long. */
export const RAW_UPLOAD_TTL_MS = IMPORT_QUARANTINE_TTL_HOURS * HOUR_MS
/** A file name is a display label kept this long after acceptance (the API's maintenance: 8 days). */
export const UPLOAD_NAME_TTL_MS = 8 * DAY_MS
/** A finished upload row is dropped this long after it ended (gogospend_prune_import_uploads). */
export const UPLOAD_ROW_TTL_MS = 30 * DAY_MS

const ATTEMPT_WINDOW_MS = IMPORT_QUOTAS.uploadWindowMinutes * MINUTE_MS
const PART_MAX_BYTES = 1024 * 1024
const MAX_PARTS = 12
const SHA256_HEX = /^[0-9a-f]{64}$/

const LIMITS: Record<string, ImportLimit> = { limit_uploads: 'uploads', limit_bytes: 'bytes', limit_parse_jobs: 'parse_jobs', limit_in_progress: 'in_progress' }

const iso = (ms: number) => new Date(ms).toISOString()
const secondsUntil = (c: FileContext, ms: number) => Math.max(1, Math.ceil((ms - c.now.getTime()) / 1000))

type UploadRow = {
  job_id: string
  intake_token: string
  status: 'receiving' | 'accepted' | 'rejected' | 'failed' | 'expired'
  outcome_code: string | null
  file_name: string | null
  declared_type: string
  format: ImportFormat | null
  bytes: string | null
  parse_state: 'queued' | 'parsing' | 'parsed' | 'failed' | 'cancelled' | null
  receive_deadline: string
  accepted_at: string | null
  expires_at: string | null
}

function uploadRow(c: FileContext, jobId: string): UploadRow | undefined {
  return c.sql
    .exec<UploadRow>(
      'SELECT job_id, intake_token, status, outcome_code, file_name, declared_type, format, CAST(bytes AS TEXT) AS bytes, parse_state, receive_deadline, accepted_at, expires_at FROM import_uploads WHERE job_id = ?',
      jobId,
    )
    .toArray()[0]
}

/** The client-visible state of an accepted import: expired, or its parse state (importStatus in import.repository.ts). */
function statusOf(row: UploadRow): ImportStatus {
  if (row.status === 'expired') return 'expired'
  return row.parse_state ?? 'cancelled'
}

function dtoOf(row: UploadRow): ImportJobDto {
  return {
    job_id: row.job_id,
    status: statusOf(row),
    format: row.format as ImportFormat,
    file_name: row.file_name,
    bytes: Number(row.bytes),
    received_at: row.accepted_at as string,
    expires_at: row.expires_at as string,
  }
}

/** The prefix of one upload attempt's parts: only its own intake token's keys. */
function attemptPrefix(c: FileContext, jobId: string, intakeToken: string): string {
  return `${vaultObjectKey('import_quarantine', c.vaultId, jobId, intakeToken, 'part-0000').slice(0, -'part-0000'.length)}`
}

function partKey(c: FileContext, jobId: string, intakeToken: string, index: number): string {
  return vaultObjectKey('import_quarantine', c.vaultId, jobId, intakeToken, `part-${String(index).padStart(4, '0')}`)
}

/** Makes the still-reserved parts of the given uploads due now (their reservations are given up). */
function partsDueNow(c: FileContext, jobIds: readonly string[]): void {
  if (jobIds.length === 0) return
  c.sql.exec(
    "UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE status = 'reserved' AND key IN (SELECT object_key FROM import_parts WHERE job_id IN (SELECT value FROM json_each(?)))",
    c.now.getTime(),
    JSON.stringify(jobIds),
  )
}

/**
 * gogospend_fail_stale_import_uploads for one vault: uploads still receiving at
 * their deadline fail as `deadline_passed`, their names are cleared and their
 * unpublished parts are due now. Returns how many failed.
 */
function failStaleUploads(c: FileContext): number {
  const now = iso(c.now.getTime())
  const stale = c.sql
    .exec<{ job_id: string }>(
      "UPDATE import_uploads SET status = 'failed', outcome_code = 'deadline_passed', file_name = NULL, finished_at = ? WHERE status = 'receiving' AND receive_deadline <= ? RETURNING job_id",
      now,
      now,
    )
    .toArray()
    .map((row) => row.job_id)
  partsDueNow(c, stale)
  if (stale.length > 0) touch(c)
  return stale.length
}

/** Seconds until a parse slot frees when 10 are taken in the last 24 hours (accepted uploads, plus, when asked, uploads still receiving); null when one is free. */
function parseRetry(c: FileContext, countReceiving: boolean): number | null {
  const now = c.now.getTime()
  // The window holds at most the quota's rows, so the read is small.
  const frees = c.sql
    .exec<{ at: string; kind: string }>(
      "SELECT accepted_at AS at, 'accepted' AS kind FROM import_uploads WHERE accepted_at > ? UNION ALL SELECT receive_deadline AS at, 'receiving' AS kind FROM import_uploads WHERE ? AND status = 'receiving' AND receive_deadline > ?",
      iso(now - DAY_MS),
      countReceiving ? 1 : 0,
      iso(now),
    )
    .toArray()
    .map((row) => Date.parse(row.at) + (row.kind === 'accepted' ? DAY_MS : 0))
    .sort((a, b) => b - a)
  const tenth = frees[IMPORT_QUOTAS.parseJobsPerDay - 1]
  return tenth === undefined ? null : secondsUntil(c, tenth)
}

/** Seconds until `need` more accepted bytes fit in the 24-hour window (when enough earlier uploads leave it); null when they fit. */
function bytesRetry(c: FileContext, need: number): number | null {
  const now = c.now.getTime()
  const accepted = c.sql
    .exec<{ accepted_at: string; bytes: string }>('SELECT accepted_at, CAST(bytes AS TEXT) AS bytes FROM import_uploads WHERE accepted_at > ? ORDER BY accepted_at, job_id', iso(now - DAY_MS))
    .toArray()
    .map((row) => ({ accepted_at: row.accepted_at, bytes: Number(row.bytes) }))
  const used = accepted.reduce((sum, row) => sum + row.bytes, 0)
  if (used + need <= IMPORT_QUOTAS.acceptedBytesPerDay) return null
  let leaving = 0
  for (const row of accepted) {
    leaving += row.bytes
    if (used - leaving + need <= IMPORT_QUOTAS.acceptedBytesPerDay) return secondsUntil(c, Date.parse(row.accepted_at) + DAY_MS)
  }
  return secondsUntil(c, now + DAY_MS)
}

/**
 * gogospend_import_quota: the first limit a new attempt (or a retry of a key a
 * 24-hour limit refused, `jobId`) would break, with the seconds until room
 * returns; null when it may start. In order: 2 uploads streaming at once, 5
 * attempts in 15 minutes, 10 parse jobs a day (counting uploads still
 * receiving), 50 MiB accepted a day (the declared length, or 1 byte).
 */
function quotaRefusal(c: FileContext, jobId: string, declaredBytes: number | null): { code: string; retryAfterSeconds: number } | null {
  const now = c.now.getTime()
  const streaming = c.sql
    .exec<{ n: number; first: string | null }>("SELECT count(*) AS n, min(receive_deadline) AS first FROM import_uploads WHERE job_id <> ? AND status = 'receiving' AND receive_deadline > ?", jobId, iso(now))
    .one()
  if (streaming.n >= IMPORT_QUOTAS.uploadsInProgress && streaming.first !== null) {
    return { code: 'limit_in_progress', retryAfterSeconds: Math.min(60, secondsUntil(c, Date.parse(streaming.first))) }
  }
  const [fifth] = c.sql
    .exec<{ created_at: string }>('SELECT created_at FROM import_uploads WHERE job_id <> ? AND created_at > ? ORDER BY created_at DESC LIMIT 1 OFFSET ?', jobId, iso(now - ATTEMPT_WINDOW_MS), IMPORT_QUOTAS.uploadsPerWindow - 1)
    .toArray()
  if (fifth) return { code: 'limit_uploads', retryAfterSeconds: secondsUntil(c, Date.parse(fifth.created_at) + ATTEMPT_WINDOW_MS) }
  const parse = parseRetry(c, true)
  if (parse !== null) return { code: 'limit_parse_jobs', retryAfterSeconds: parse }
  const bytes = bytesRetry(c, declaredBytes ?? 1)
  if (bytes !== null) return { code: 'limit_bytes', retryAfterSeconds: bytes }
  return null
}

function acceptedBytesToday(c: FileContext): number {
  return Number(c.sql.exec<{ used: string }>('SELECT CAST(coalesce(sum(bytes), 0) AS TEXT) AS used FROM import_uploads WHERE accepted_at > ?', iso(c.now.getTime() - DAY_MS)).one().used)
}

/**
 * gogospend_begin_import_upload. Stale uploads fail first; a retry of the same
 * id answers its state (`replay` for an accepted or expired upload,
 * `in_progress`, or the earlier refusal), except that a key refused only by a
 * 24-hour limit is tried again as a new attempt; then the quotas decide, and
 * nothing is recorded when one refuses; otherwise the attempt is recorded as
 * receiving for 10 minutes.
 */
export function beginUpload(c: FileContext, input: BeginInput): BeginResult {
  failStaleUploads(c)
  const row = uploadRow(c, input.jobId)
  if (row) {
    if (row.status === 'receiving') return { kind: 'in_progress', retryAfterSeconds: secondsUntil(c, Date.parse(row.receive_deadline)) }
    if (row.status === 'accepted' || row.status === 'expired') return { kind: 'replay', upload: { dto: dtoOf(row), fileName: row.file_name, declaredType: row.declared_type } }
    if (!(row.status === 'rejected' && (row.outcome_code === 'limit_bytes' || row.outcome_code === 'limit_parse_jobs'))) {
      return { kind: 'ended', status: row.status as 'rejected' | 'failed', code: row.outcome_code ?? 'intake_error' }
    }
  }
  const refusal = quotaRefusal(c, input.jobId, input.declaredBytes)
  if (refusal) return { kind: 'limited', limit: LIMITS[refusal.code], retryAfterSeconds: refusal.retryAfterSeconds }
  const remainingBytes = Math.max(IMPORT_QUOTAS.acceptedBytesPerDay - acceptedBytesToday(c), 0)
  const now = c.now.getTime()
  if (row) {
    // A key refused by a limit starts again as a new attempt: the old attempt's parts are given up.
    partsDueNow(c, [input.jobId])
    c.sql.exec('DELETE FROM import_parts WHERE job_id = ?', input.jobId)
    c.sql.exec(
      "UPDATE import_uploads SET status = 'receiving', outcome_code = NULL, finished_at = NULL, intake_token = ?, file_name = ?, declared_type = ?, declared_bytes = ?, created_at = ?, receive_deadline = ? WHERE job_id = ?",
      input.intakeToken,
      input.fileName,
      input.declaredType,
      input.declaredBytes,
      iso(now),
      iso(now + UPLOAD_RECEIVE_MS),
      input.jobId,
    )
  } else {
    c.sql.exec(
      "INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, declared_bytes, created_at, receive_deadline) VALUES (?, ?, 'receiving', ?, ?, ?, ?, ?)",
      input.jobId,
      input.intakeToken,
      input.fileName,
      input.declaredType,
      input.declaredBytes,
      iso(now),
      iso(now + UPLOAD_RECEIVE_MS),
    )
  }
  touch(c)
  return { kind: 'started', remainingBytes }
}

/**
 * gogospend_reserve_import_part: registers part `index` (0 to 11) of an upload
 * still receiving under this intake token, before its deadline, in an active
 * vault. The key is reserved until the deadline plus RESERVATION_GRACE_MS, and
 * registered before its PUT (B4). Null when the upload cannot continue.
 */
export function reserveUploadPart(c: FileContext, jobId: string, intakeToken: string, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) return null
  const [account] = c.sql.exec<{ status: string }>('SELECT status FROM account_state WHERE id = 1').toArray()
  if (account?.status !== 'active') return null
  const row = uploadRow(c, jobId)
  const now = c.now.getTime()
  if (!row || row.intake_token !== intakeToken || row.status !== 'receiving' || Date.parse(row.receive_deadline) <= now) return null
  const key = partKey(c, jobId, intakeToken, index)
  reserveObject(c, key, 'import_quarantine', Date.parse(row.receive_deadline) + RESERVATION_GRACE_MS - now)
  c.sql.exec('INSERT INTO import_parts (job_id, part_index, object_key) VALUES (?, ?, ?)', jobId, index, key)
  return key
}

/**
 * gogospend_finish_import_upload. The upload must still be receiving under this
 * token before its deadline (`refused` otherwise); its parts must be exactly
 * its own reservations part-0000 onwards, with sizes that add up; the 24-hour
 * quotas are checked again (`limited`: the upload is rejected). Then the parts
 * are published for 24 hours in one set-based statement over the job's
 * import_parts rows, only while each reservation is still before its deadline
 * (`delete_after > now`, as publishObject), and the import is queued.
 */
export function finishUpload(c: FileContext, input: FinishInput): FinishResult {
  const row = uploadRow(c, input.jobId)
  const now = c.now.getTime()
  if (!row || row.intake_token !== input.intakeToken || row.status !== 'receiving' || Date.parse(row.receive_deadline) <= now) {
    return { kind: 'refused', code: 'deadline_passed' }
  }
  if (
    !Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > IMPORT_UPLOAD_MAX_BYTES || !SHA256_HEX.test(input.sha256) ||
    !(IMPORT_FORMATS as readonly string[]).includes(input.format) || IMPORT_CONTENT_TYPES[input.format] !== row.declared_type
  ) {
    throw new Error('an upload does not match its declaration')
  }
  if (!Array.isArray(input.parts) || input.parts.length < 1 || input.parts.length > MAX_PARTS) throw new Error('an upload has 1-12 parts')
  let sum = 0
  input.parts.forEach((part, index) => {
    if (part.key !== partKey(c, input.jobId, input.intakeToken, index) || !Number.isInteger(part.bytes) || part.bytes < 1 || part.bytes > PART_MAX_BYTES || !SHA256_HEX.test(part.sha256)) {
      throw new Error('quarantine parts do not match the upload')
    }
    sum += part.bytes
  })
  const keys = JSON.stringify(input.parts.map((part) => part.key))
  const { reserved } = c.sql
    .exec<{ reserved: number }>(
      "SELECT count(*) AS reserved FROM import_parts p JOIN vault_objects o ON o.key = p.object_key WHERE p.job_id = ? AND o.status = 'reserved' AND p.object_key IN (SELECT value FROM json_each(?))",
      input.jobId,
      keys,
    )
    .one()
  if (reserved !== input.parts.length || sum !== input.bytes) throw new Error('quarantine parts do not match the upload')
  let code: IntakeOutcomeCode = 'limit_parse_jobs'
  let retry = parseRetry(c, false)
  if (retry === null) {
    code = 'limit_bytes'
    retry = bytesRetry(c, input.bytes)
  }
  if (retry !== null) {
    // Its parts are discarded by the intake (abortUpload), or deleted at their deadline.
    c.sql.exec("UPDATE import_uploads SET status = 'rejected', outcome_code = ?, file_name = NULL, finished_at = ? WHERE job_id = ?", code, iso(now), input.jobId)
    touch(c)
    return { kind: 'limited', limit: code === 'limit_bytes' ? 'bytes' : 'parse_jobs', retryAfterSeconds: retry }
  }
  for (const part of input.parts) c.sql.exec('UPDATE import_parts SET bytes = ?, sha256 = ? WHERE job_id = ? AND object_key = ?', part.bytes, part.sha256, input.jobId, part.key)
  const published = c.sql
    .exec(
      `UPDATE vault_objects SET status = 'published', delete_after = ?,
              bytes = (SELECT p.bytes FROM import_parts p WHERE p.object_key = vault_objects.key),
              sha256 = (SELECT p.sha256 FROM import_parts p WHERE p.object_key = vault_objects.key)
        WHERE status = 'reserved' AND delete_after > ? AND key IN (SELECT object_key FROM import_parts WHERE job_id = ? AND bytes IS NOT NULL)
        RETURNING key`,
      now + RAW_UPLOAD_TTL_MS,
      now,
      input.jobId,
    )
    .toArray()
  if (published.length !== input.parts.length) throw new Error('a quarantine part was given up before its upload finished')
  // Reservations this upload made but did not use are due now, and forgotten here.
  c.sql.exec("UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE status = 'reserved' AND key IN (SELECT object_key FROM import_parts WHERE job_id = ? AND bytes IS NULL)", now, input.jobId)
  c.sql.exec('DELETE FROM import_parts WHERE job_id = ? AND bytes IS NULL', input.jobId)
  c.sql.exec(
    "UPDATE import_uploads SET status = 'accepted', format = ?, bytes = ?, sha256 = ?, part_count = ?, accepted_at = ?, expires_at = ?, parse_state = 'queued', parse_attempts = 0, enqueued_at = NULL, enqueued_attempts = NULL WHERE job_id = ?",
    input.format,
    input.bytes,
    input.sha256,
    input.parts.length,
    iso(now),
    iso(now + RAW_UPLOAD_TTL_MS),
    input.jobId,
  )
  touch(c)
  return { kind: 'accepted', dto: dtoOf(uploadRow(c, input.jobId) as UploadRow) }
}

/**
 * gogospend_abort_import_upload: ends an upload still receiving under this
 * token as rejected or failed, and returns the keys of its unpublished parts,
 * now due, so the intake deletes them at once and the alarm deletes any it could not.
 */
export function abortUpload(c: FileContext, jobId: string, intakeToken: string, status: 'rejected' | 'failed', code: IntakeOutcomeCode): string[] {
  if (status !== 'rejected' && status !== 'failed') throw new Error('an upload ends rejected or failed')
  const now = c.now.getTime()
  c.sql.exec(
    "UPDATE import_uploads SET status = ?, outcome_code = ?, file_name = NULL, finished_at = ? WHERE job_id = ? AND intake_token = ? AND status = 'receiving'",
    status,
    code,
    iso(now),
    jobId,
    intakeToken,
  )
  const prefix = attemptPrefix(c, jobId, intakeToken)
  const keys = c.sql
    .exec<{ key: string }>(
      "UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE status = 'reserved' AND substr(key, 1, ?) = ? AND key IN (SELECT object_key FROM import_parts WHERE job_id = ?) RETURNING key",
      now,
      prefix.length,
      prefix,
      jobId,
    )
    .toArray()
    .map((row) => row.key)
  touch(c)
  return keys.sort()
}

/** gogospend_discard_import_parts: the keys of this upload attempt the intake deleted become tombstones (one JSON parameter, R57). */
export function discardUploadParts(c: FileContext, jobId: string, intakeToken: string, keys: readonly string[]): void {
  const prefix = attemptPrefix(c, jobId, intakeToken)
  tombstoneObjects(c, keys.filter((key) => typeof key === 'string' && key.startsWith(prefix)))
}

/** gogospend_import_bytes_wait: seconds until `need` more accepted bytes fit (at least 1). */
export function uploadBytesRetry(c: FileContext, need: number): number {
  return bytesRetry(c, Math.max(Number.isFinite(need) ? need : 1, 1)) ?? 1
}

/** The caller's accepted import, or null (unknown, or never accepted). */
export function uploadStatus(c: FileContext, jobId: string): ImportJobDto | null {
  const row = uploadRow(c, jobId)
  return row && row.accepted_at !== null ? dtoOf(row) : null
}

/**
 * The upload rules on the vault clock (the API's import maintenance and
 * gogospend_prune_import_uploads, for one vault): uploads still receiving at
 * their deadline fail; an accepted import that was not parsed is expired at its
 * 24-hour expiry (a queued or running parse is cancelled, the name and digest
 * are cleared, its raw parts are due now); file names are cleared 8 days after
 * acceptance; and a finished upload's row is dropped 30 days after it ended (a
 * refusal or failure at finished_at, an accepted import at its raw expiry),
 * never one still receiving. Every rule acts at its own due time (inclusive),
 * so uploadsDueAt moves past it (ruling R37). Its own short block.
 */
export function pruneUploads(c: FileContext): void {
  c.storage.transactionSync(() => {
    const now = c.now.getTime()
    failStaleUploads(c)
    const ended = c.sql
      .exec<{ job_id: string }>(
        `UPDATE import_uploads SET status = 'expired', file_name = NULL, sha256 = NULL, finished_at = ?,
                parse_state = CASE WHEN parse_state IN ('queued', 'parsing') THEN 'cancelled' ELSE parse_state END
          WHERE status = 'accepted' AND parse_state <> 'parsed' AND expires_at <= ? RETURNING job_id`,
        iso(now),
        iso(now),
      )
      .toArray()
      .map((row) => row.job_id)
    if (ended.length > 0) {
      c.sql.exec(
        "UPDATE vault_objects SET delete_after = min(delete_after, ?) WHERE status IN ('reserved', 'published') AND key IN (SELECT object_key FROM import_parts WHERE job_id IN (SELECT value FROM json_each(?)))",
        now,
        JSON.stringify(ended),
      )
      touch(c)
    }
    const named = c.sql.exec('UPDATE import_uploads SET file_name = NULL WHERE file_name IS NOT NULL AND accepted_at IS NOT NULL AND accepted_at <= ? RETURNING job_id', iso(now - UPLOAD_NAME_TTL_MS)).toArray()
    const dropped = c.sql
      .exec("DELETE FROM import_uploads WHERE status <> 'receiving' AND coalesce(finished_at, expires_at) <= ? RETURNING job_id", iso(now - UPLOAD_ROW_TTL_MS))
      .toArray()
    if (named.length > 0 || dropped.length > 0) touch(c)
  })
}

/** The earliest time one of pruneUploads' rules applies, from the same constants; null when none will (ruling R37). */
export function uploadsDueAt(c: FileContext): number | null {
  const due = c.sql
    .exec<{ stale: string | null; expiry: string | null; named: string | null; ended: string | null }>(
      `SELECT (SELECT min(receive_deadline) FROM import_uploads WHERE status = 'receiving') AS stale,
              (SELECT min(expires_at) FROM import_uploads WHERE status = 'accepted' AND parse_state <> 'parsed') AS expiry,
              (SELECT min(accepted_at) FROM import_uploads WHERE file_name IS NOT NULL AND accepted_at IS NOT NULL) AS named,
              (SELECT min(coalesce(finished_at, expires_at)) FROM import_uploads WHERE status <> 'receiving') AS ended`,
    )
    .one()
  const times = [
    due.stale === null ? null : Date.parse(due.stale),
    due.expiry === null ? null : Date.parse(due.expiry),
    due.named === null ? null : Date.parse(due.named) + UPLOAD_NAME_TTL_MS,
    due.ended === null ? null : Date.parse(due.ended) + UPLOAD_ROW_TTL_MS,
  ].filter((time): time is number => time !== null)
  return times.length === 0 ? null : Math.min(...times)
}
