import { ContractValidationError, EXPORT_CSV_COLUMNS, EXPORT_DOWNLOAD_PATH, EXPORT_MAX_OPEN, EXPORT_TTL_HOURS, assertKnownFields, exportFileName, isUuid } from '@gogospend/contracts'
import type { CommandAck, ExportDto, ExportFilter, ExportGrant, ExportRequestSnapshot } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { ProblemException } from '@api/common/api-problem.filter'
import type { LeasedExportRow } from '@api/database/leased-account-read'
import { CsvTooLarge, CsvWriter } from '@api/exports/csv-writer'
import type { CsvBody } from '@api/exports/csv-writer'
import { exportRowCells } from '@api/exports/export-handler'
import { parseHistoryRequest } from '@api/history/history-query'

import { assertFreshSignIn } from '../../v1/fresh-sign-in'
import type { VaultCall } from '../../v1/protocol'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultContext } from '../context'
import { MAX_PURGE_PASSES, PURGE_BATCH, purgeEntities } from '../retention'
import { touch } from './context'
import type { FileContext } from './context'
import { vaultGrants } from './grants'
import { vaultObjectKey } from './keys'
import type { VaultBucket } from './keys'
import { RESERVATION_GRACE_MS, publishObject, putConcatenated, reserveObject } from './objects'
import type { BuildOutcome } from './work'

// Exports on the vault (1B-T6): ports of ExportService (the request, status,
// grant and file), ExportHandler.run (writeExport) and the export half of
// gogospend_retention_purge_account (pruneExports). ExportWorkflow's step
// calls UserVault#writeExport; the Worker streams the download (downloads.ts).

// ExportService's two names and parseExportFilter, restated: @api/exports/export.service
// cannot load in workerd (its database imports reach drizzle-orm/node-postgres and
// pg). test/exports-port.test.ts pins all three to the API's, in Node.

/** The export entity (ExportService's EXPORT_ENTITY). */
export const EXPORT_ENTITY = 'export'
/** The export request's command kind (ExportService's EXPORT_REQUEST_KIND). */
export const EXPORT_REQUEST_KIND = 'export.request'

/** The export period, with exactly the history filter's date validation (ExportService's parseExportFilter). */
export function parseExportFilter(input: Record<string, unknown>): ExportFilter {
  const { filter } = parseHistoryRequest({ from: input.from, through: input.through })
  return { from: filter.from, through: filter.through }
}

/** The vault's export limit (B21): half the API's MAX_EXPORT_BYTES, because the vault holds the parts and one copy while it stores the file. */
export const VAULT_EXPORT_MAX_BYTES = 32 * 1024 * 1024
/** The stored file's content type, and the download's. */
export const EXPORT_CONTENT_TYPE = 'text/csv; charset=utf-8'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** A ready file is deleted this long after it is ready. */
const EXPORT_TTL_MS = EXPORT_TTL_HOURS * HOUR_MS
/** A pending export older than this has failed (`error`): its Workflow did not finish (ruling R33). */
export const EXPORT_PENDING_MS = DAY_MS
/** An export request is purged this long after it was made (the API's retention purge). */
export const EXPORT_PURGE_MS = 30 * DAY_MS
/** The file's name inside its key: export/<vault id>/<export id>/<attempt token>/export.csv (B1, B4). */
const OBJECT_NAME = 'export.csv'

/** What writeExport needs of the vault: a fresh context for each block, the bucket, and whether the vault is active. */
export type ExportWriter = { context(): FileContext; bucket: VaultBucket; active(c: FileContext): boolean }

/** The stored file a current grant names (the API's StoredExportFile). */
export type StoredExportFile = { key: string; bytes: number; sha256: string; fileName: string }

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * POST /v1/exports (the controller and ExportService.request). The command
 * headers are read first (ruling R41), then the body: only proof_id, from and
 * through; proof_id is a UUID and is otherwise unused (B8). The export's id is
 * derived from the account and the command id, so a resent command names the
 * same export. Inside the command, after the receipt lookup (so a resent
 * export still replays): at most EXPORT_MAX_OPEN pending exports (429 with a
 * retry), then a sign-in from the last five minutes (B7, 401
 * REAUTH_REQUIRED), then the pending row and its `export` entity change.
 */
export function requestExport(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, EXPORT_REQUEST_KIND, null, 'forbidden')
  const body = assertKnownFields(call.body, ['proof_id', 'from', 'through'])
  if (!isUuid(body.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id')
  const filter = parseExportFilter(body)
  const id = derivedUuid(c.claims.accountId, 'export-request', command.commandId)
  const snapshot: ExportRequestSnapshot = { id, from: filter.from, through: filter.through }
  return runCommand(c, { ...command, payload: snapshot }, () => {
    const { open } = c.sql.exec<{ open: number }>("SELECT count(*) AS open FROM exports WHERE status = 'pending'").one()
    if (open >= EXPORT_MAX_OPEN) throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: 60 })
    assertFreshSignIn(c.claims, Math.floor(c.now.getTime() / 1000))
    c.sql.exec("INSERT INTO exports (id, from_date, through_date, requested_at, status) VALUES (?, ?, ?, ?, 'pending')", id, snapshot.from, snapshot.through, c.now.toISOString())
    touch(c)
    return { entityId: id, version: 1, changes: [{ entity: EXPORT_ENTITY, id, version: 1, state: 'active', snapshot }] }
  })
}

type ExportRow = {
  id: string
  from_date: string
  through_date: string
  requested_at: string
  status: 'pending' | 'ready' | 'failed'
  failure: 'too_large' | 'error' | null
  bytes: string | null
  sha256: string | null
  row_count: number | null
  high_water: string | null
  expires_at: string | null
}

/**
 * GET /v1/exports/:id (ExportService.statusIn): `pending`; `failed` with its
 * reason; `ready` while the file is ahead of its expiry, with the revision it
 * was read at, its row count, size, SHA-256 and expiry; `expired` after. Null
 * for an unknown id. A vault that is not active never gets here: call()
 * refuses it first.
 */
export function exportStatus(c: FileContext, id: string): ExportDto | null {
  const [row] = c.sql
    .exec<ExportRow>(
      `SELECT id, from_date, through_date, requested_at, status, failure, CAST(bytes AS TEXT) AS bytes, sha256, row_count, CAST(high_water AS TEXT) AS high_water, expires_at
         FROM exports WHERE id = ?`,
      id,
    )
    .toArray()
  if (!row) return null
  const base = { export_id: row.id, from: row.from_date, through: row.through_date, requested_at: row.requested_at }
  if (row.status === 'pending') return { ...base, status: 'pending' }
  if (row.status === 'failed') return { ...base, status: 'failed', reason: row.failure === 'too_large' ? 'too_large' : 'error' }
  const expiresAt = row.expires_at as string
  if (Date.parse(expiresAt) <= c.now.getTime()) return { ...base, status: 'expired' }
  return { ...base, status: 'ready', as_of_revision: row.high_water as string, row_count: row.row_count as number, bytes: Number(row.bytes), sha256: row.sha256 as string, expires_at: expiresAt }
}

/** GET /v1/exports/:id/grant (ExportService.grant): a five-minute download path for a ready, unexpired export, never past the file's expiry; null otherwise. */
export function exportGrant(c: VaultContext, id: string): ExportGrant | null {
  const dto = exportStatus(c, id)
  if (dto?.status !== 'ready') return null
  const { grant, expiresAt } = vaultGrants(c, 'export').issue(c.claims.accountId, { snapshotId: id, index: 0 }, c.now, new Date(dto.expires_at))
  return { url: `${EXPORT_DOWNLOAD_PATH}${grant}`, expires_at: expiresAt.toISOString() }
}

/** The stored file a current grant names (ExportService.file), only while the export is ready and unexpired; null otherwise. */
export function exportFile(c: VaultContext, grant: string): StoredExportFile | null {
  const target = vaultGrants(c, 'export').verify(c.claims.accountId, grant, c.now)
  if (!target || target.index !== 0) return null
  const [row] = c.sql
    .exec<{ object_key: string; bytes: string; sha256: string; from_date: string; through_date: string }>(
      "SELECT object_key, CAST(bytes AS TEXT) AS bytes, sha256, from_date, through_date FROM exports WHERE id = ? AND status = 'ready' AND expires_at > ?",
      target.snapshotId,
      c.now.toISOString(),
    )
    .toArray()
  return row ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256, fileName: exportFileName({ from: row.from_date, through: row.through_date }) } : null
}

type ExportRowSql = {
  record_id: string
  record_type: LeasedExportRow['type']
  occurred_on: string
  amount_minor: string
  wallet_id: string | null
  wallet_name: string | null
  category_id: string | null
  category_builtin_key: string | null
  category_label: string | null
  source_wallet_id: string | null
  source_wallet_name: string | null
  destination_wallet_id: string | null
  destination_wallet_name: string | null
  merchant: string | null
  note: string | null
  record_version: number
}

/**
 * gogospend_leased_export_rows on the vault: the live records dated within the
 * period, both edges included, in (occurred_on, id) order, with the names of
 * the wallets and categories they reference. Amounts leave as exact text.
 */
const EXPORT_ROWS = `SELECT t.id AS record_id, t.type AS record_type, t.occurred_on, CAST(t.amount_minor AS TEXT) AS amount_minor,
       t.wallet_id, w.name AS wallet_name, t.category_id, c.builtin_key AS category_builtin_key, c.label AS category_label,
       t.source_wallet_id, sw.name AS source_wallet_name, t.destination_wallet_id, dw.name AS destination_wallet_name,
       t.merchant, t.note, t.version AS record_version
  FROM transactions t
  LEFT JOIN wallets w ON w.id = t.wallet_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN wallets sw ON sw.id = t.source_wallet_id
  LEFT JOIN wallets dw ON dw.id = t.destination_wallet_id
 WHERE t.deleted_at IS NULL AND t.occurred_on BETWEEN ? AND ?
 ORDER BY t.occurred_on, t.id`

const toExportRow = (row: ExportRowSql): LeasedExportRow => ({
  id: row.record_id,
  type: row.record_type,
  occurredOn: row.occurred_on,
  amountMinor: row.amount_minor,
  walletId: row.wallet_id,
  walletName: row.wallet_name,
  categoryId: row.category_id,
  categoryBuiltinKey: row.category_builtin_key,
  categoryLabel: row.category_label,
  sourceWalletId: row.source_wallet_id,
  sourceWalletName: row.source_wallet_name,
  destinationWalletId: row.destination_wallet_id,
  destinationWalletName: row.destination_wallet_name,
  merchant: row.merchant,
  note: row.note,
  version: row.record_version,
})

/**
 * The period's CSV, fed row by row from the cursor (never toArray). The writer
 * lives only here: finish() returns a copy of its parts array (csv-writer.ts),
 * so once this returns, body.parts holds the only references, and emptying it
 * in putConcatenated lets the parts go.
 */
function exportCsv(c: FileContext, period: { from_date: string; through_date: string }, maxBytes: number): CsvBody {
  const writer = new CsvWriter(EXPORT_CSV_COLUMNS, { maxBytes })
  for (const row of c.sql.exec<ExportRowSql>(EXPORT_ROWS, period.from_date, period.through_date)) writer.row(exportRowCells(toExportRow(row)))
  return writer.finish()
}

type Prepared = { kind: 'skipped' } | { kind: 'too_large' } | { kind: 'write'; key: string; body: CsvBody; highWater: string }

/**
 * The read, in one block: a pending export of an active vault is read in one
 * synchronous pass at the vault's current revision (its high water), and a
 * fresh key is reserved for this attempt (B4). A file over `maxBytes` fails the
 * export as `too_large` instead.
 */
function prepareExport(c: FileContext, v: ExportWriter, id: string, maxBytes: number): Prepared {
  const [row] = c.sql.exec<{ status: string; from_date: string; through_date: string }>('SELECT status, from_date, through_date FROM exports WHERE id = ?', id).toArray()
  if (!row || row.status !== 'pending' || !v.active(c)) return { kind: 'skipped' }
  const highWater = c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').toArray()[0]?.revision ?? '0'
  let body: CsvBody
  try {
    body = exportCsv(c, row, maxBytes)
  } catch (error) {
    if (!(error instanceof CsvTooLarge)) throw error
    c.sql.exec("UPDATE exports SET status = 'failed', failure = 'too_large' WHERE id = ? AND status = 'pending'", id)
    touch(c)
    return { kind: 'too_large' }
  }
  const key = vaultObjectKey('export', c.vaultId, id, crypto.randomUUID(), OBJECT_NAME)
  reserveObject(c, key, 'export')
  return { kind: 'write', key, body, highWater }
}

/**
 * The publish, in one block with the clock read after the PUT: only while the
 * export is still pending and the vault active (otherwise `skipped`, and the
 * reserved key is deleted at its deadline), and only inside the reservation's
 * own deadline (created_at plus RESERVATION_GRACE_MS, even when a failed delete
 * moved delete_after on). Past it the write throws, so the step retries under a
 * fresh key. The file is published for EXPORT_TTL_HOURS and recorded with it.
 */
function publishExport(c: FileContext, v: ExportWriter, id: string, key: string, file: { bytes: number; sha256: string; rows: number; highWater: string }): BuildOutcome['outcome'] {
  const [row] = c.sql.exec<{ status: string }>('SELECT status FROM exports WHERE id = ?', id).toArray()
  if (!row || row.status !== 'pending' || !v.active(c)) return 'skipped'
  const now = c.now.getTime()
  const [reservation] = c.sql.exec<{ created_at: number }>("SELECT created_at FROM vault_objects WHERE key = ? AND status = 'reserved'", key).toArray()
  if (!reservation || reservation.created_at + RESERVATION_GRACE_MS <= now) throw new Error('the export file outlived its reservation')
  const expiresAt = now + EXPORT_TTL_MS
  publishObject(c, key, { bytes: file.bytes, sha256: file.sha256 }, expiresAt)
  c.sql.exec(
    "UPDATE exports SET status = 'ready', object_key = ?, bytes = ?, sha256 = ?, row_count = ?, high_water = CAST(? AS INTEGER), ready_at = ?, expires_at = ? WHERE id = ? AND status = 'pending'",
    key,
    file.bytes,
    file.sha256,
    file.rows,
    file.highWater,
    iso(now),
    iso(expiresAt),
    id,
  )
  touch(c)
  return 'ready'
}

/**
 * ExportHandler.run on the vault. A row that is not pending, or a vault that
 * is not active, answers `skipped`. The read and the key's reservation are one
 * block; the file is stored outside every block with putConcatenated (one put
 * of one buffer, B21); then a second block, with the clock read after the PUT
 * (publishObject's deadline check trusts c.now), publishes it and marks the
 * export ready. `peakHeldBytes` counts the parts plus the one copy
 * putConcatenated makes (none for a single part).
 */
export async function writeExport(v: ExportWriter, id: string, options: { maxBytes?: number } = {}): Promise<BuildOutcome & { peakHeldBytes?: number }> {
  const c = v.context()
  const prepared = c.storage.transactionSync(() => prepareExport(c, v, id, options.maxBytes ?? VAULT_EXPORT_MAX_BYTES))
  if (prepared.kind !== 'write') return { outcome: prepared.kind }
  const { key, body, highWater } = prepared
  const peakHeldBytes = body.parts.length > 1 ? 2 * body.bytes : body.bytes
  const stored = await putConcatenated(v.bucket, key, body.parts, body.bytes, EXPORT_CONTENT_TYPE)
  const p = v.context()
  const outcome = p.storage.transactionSync(() => publishExport(p, v, id, key, { ...stored, rows: body.rows, highWater }))
  return { outcome, peakHeldBytes }
}

/** Fails a pending export (`error`): ExportWorkflow's write threw after its retries. */
export function failExport(c: FileContext, id: string): void {
  c.sql.exec("UPDATE exports SET status = 'failed', failure = 'error' WHERE id = ? AND status = 'pending'", id)
  touch(c)
}

/** Up to PURGE_BATCH export requests made at least EXPORT_PURGE_MS ago, oldest first: their rows are deleted and their entities purged as one group. Returns how many. */
function purgeOldExports(c: FileContext): number {
  const ids = c.sql
    .exec<{ id: string }>('SELECT id FROM exports WHERE requested_at <= ? ORDER BY requested_at, id LIMIT ?', iso(c.now.getTime() - EXPORT_PURGE_MS), PURGE_BATCH)
    .toArray()
    .map((row) => row.id)
  if (ids.length === 0) return 0
  c.sql.exec('DELETE FROM exports WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
  purgeEntities(c, EXPORT_ENTITY, ids)
  touch(c)
  return ids.length
}

/**
 * The export rules on the vault clock (ruling R33): a pending export requested
 * at least a day ago fails (`error`), and an export requested at least 30 days
 * ago is deleted with its entity purged (1A-T8b's purgeEntities; the ids bind
 * as one JSON parameter, ruling R57). Each rule acts at its own due time
 * (inclusive), so exportsDueAt moves past it (ruling R37). Opens its own short
 * blocks, so it is never called inside another block.
 */
export function pruneExports(c: FileContext): void {
  c.storage.transactionSync(() => {
    const failed = c.sql.exec("UPDATE exports SET status = 'failed', failure = 'error' WHERE status = 'pending' AND requested_at <= ? RETURNING id", iso(c.now.getTime() - EXPORT_PENDING_MS)).toArray()
    if (failed.length > 0) touch(c)
  })
  for (let pass = 0; pass < MAX_PURGE_PASSES; pass += 1) {
    if (c.storage.transactionSync(() => purgeOldExports(c)) < PURGE_BATCH) return
  }
}

/** The earliest time one of pruneExports' rules applies, from the same constants; null when none will (ruling R37). */
export function exportsDueAt(c: FileContext): number | null {
  const { pending, oldest } = c.sql
    .exec<{ pending: string | null; oldest: string | null }>("SELECT (SELECT min(requested_at) FROM exports WHERE status = 'pending') AS pending, (SELECT min(requested_at) FROM exports) AS oldest")
    .one()
  const times = [pending === null ? null : Date.parse(pending) + EXPORT_PENDING_MS, oldest === null ? null : Date.parse(oldest) + EXPORT_PURGE_MS].filter((time): time is number => time !== null)
  return times.length === 0 ? null : Math.min(...times)
}
