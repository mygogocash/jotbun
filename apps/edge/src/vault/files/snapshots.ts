import { ContractValidationError, SNAPSHOT_SCHEMA_VERSION, SNAPSHOT_TTL_HOURS, assertKnownFields, isEntityChange, isUuid } from '@gogospend/contracts'
import type { EntityChange, EntityState, Revision, SnapshotDto } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { MAX_SNAPSHOT_BYTES } from '@api/sync/snapshot-builder'
import { encodeSyncCursor } from '@api/sync/sync-cursor'

import type { VaultCall, VaultReply } from '../../v1/protocol'
import type { VaultContext } from '../context'
import { jsonbOrder } from '../reads/sync'
import { touch } from './context'
import type { FileContext } from './context'
import { vaultGrants } from './grants'
import { vaultObjectKey } from './keys'
import type { VaultBucket } from './keys'
import { RESERVATION_GRACE_MS, publishObject, putConcatenated, reserveObject } from './objects'
import type { BuildOutcome } from './work'

// Resync snapshots on the vault (1B-T8): ports of SnapshotRepository (the
// request, status and chunk lookup), gogospend_request_snapshot,
// SnapshotBuilder.build with gogospend_record_snapshot (buildSnapshot), and the
// snapshot half of the retention purge (pruneSnapshots). SnapshotWorkflow's
// step calls UserVault#buildSnapshot; the Worker streams a chunk (downloads.ts).

/** A chunk closes once its entities would pass this many bytes (the API's DEFAULT_CHUNK_BYTES). */
export const SNAPSHOT_CHUNK_BYTES = 1024 * 1024
/** A chunk's content type, stored with it and served with it. */
export const SNAPSHOT_CONTENT_TYPE = 'application/json'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** A ready snapshot's chunks are published for SNAPSHOT_TTL_HOURS. */
const SNAPSHOT_TTL_MS = SNAPSHOT_TTL_HOURS * HOUR_MS
/** A request reuses a snapshot that became ready less than this long ago (gogospend_request_snapshot's hour, judged by ready_at). */
export const SNAPSHOT_REUSE_MS = HOUR_MS
/** ... and only while it expires more than this from now (gogospend_request_snapshot's 23 hours). */
const SNAPSHOT_REUSE_LEFT_MS = 23 * HOUR_MS
/** A pending snapshot this old has failed: its Workflow did not finish. */
export const SNAPSHOT_PENDING_MS = DAY_MS
/** A ready snapshot's row is kept this long past its expiry, then deleted (the API's manifest sweep); its objects went at expiry. */
export const SNAPSHOT_KEEP_MS = 7 * DAY_MS

/**
 * The purge watermark, in SQL: the revision of the latest retention purge (a
 * purge writes `purged` changes, and a purged head never moves again), else 0.
 * A snapshot read below it may still hold purged data (the API's purge_revision).
 */
const PURGE_WATERMARK = "(SELECT coalesce(max(revision), 0) FROM entity_changes WHERE state = 'purged')"

/** What buildSnapshot needs of the vault: a fresh context for each block, the bucket, and whether the vault is active. */
export type SnapshotWriter = { context(): FileContext; bucket: VaultBucket; active(c: FileContext): boolean }

/** The stored chunk a current grant names (the API's StoredChunk). */
export type StoredChunk = { key: string; bytes: number; sha256: string }

const iso = (ms: number) => new Date(ms).toISOString()

/** The revision of the latest retention purge, as text; '0' when none ran. */
export function purgeWatermark(c: FileContext): Revision {
  return c.sql.exec<{ revision: string }>(`SELECT CAST(${PURGE_WATERMARK} AS TEXT) AS revision`).one().revision
}

/**
 * POST /v1/sync/snapshots (SyncController.request and gogospend_request_snapshot).
 * The body takes no field, then the Idempotency-Key must be a UUID (422 on
 * `idempotency-key`). The snapshot's id is derived from the account and the
 * key, so a resent request names the same snapshot. In order: a row with that
 * id answers itself; a snapshot that became ready within the last hour, still
 * expires more than 23 hours from now and is not below the purge watermark is
 * reused; else the open (pending) build; else a new pending row. The reply is
 * the snapshot's status, 200 when it is ready and 202 otherwise. A vault that
 * is not active never gets here: call() refuses it first.
 */
export function requestSnapshot(c: VaultContext, call: VaultCall): VaultReply {
  assertKnownFields(call.body ?? {}, [])
  const key = call.headers['idempotency-key']
  if (!isUuid(key)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency-key')
  const id = derivedUuid(c.claims.accountId, 'snapshot-request', key)
  const now = c.now.getTime()
  const chosen =
    c.sql.exec<{ id: string }>('SELECT id FROM snapshots WHERE id = ?', id).toArray()[0]?.id ??
    c.sql
      .exec<{ id: string }>(
        `SELECT id FROM snapshots WHERE status = 'ready' AND ready_at > ? AND expires_at > ? AND high_water >= ${PURGE_WATERMARK} ORDER BY ready_at DESC, id LIMIT 1`,
        iso(now - SNAPSHOT_REUSE_MS),
        iso(now + SNAPSHOT_REUSE_LEFT_MS),
      )
      .toArray()[0]?.id ??
    c.sql.exec<{ id: string }>("SELECT id FROM snapshots WHERE status = 'pending' ORDER BY created_at, id LIMIT 1").toArray()[0]?.id
  if (chosen === undefined) {
    c.sql.exec("INSERT INTO snapshots (id, status, created_at) VALUES (?, 'pending', ?)", id, iso(now))
    touch(c)
  }
  const dto = snapshotStatus(c, chosen ?? id)
  if (!dto) throw new Error('a requested snapshot has no status')
  return { ok: true, status: dto.status === 'ready' ? 200 : 202, body: dto }
}

type SnapshotRow = { status: 'pending' | 'ready' | 'failed'; high_water: string | null; expires_at: string | null; current: number }

/**
 * GET /v1/sync/snapshots/:id (SnapshotRepository.status): `pending` and
 * `failed` as stored; `ready` while the snapshot is ahead of its expiry and not
 * below the purge watermark, with its high water, its delta cursor (the default
 * generation, as 1A-T8a's cursors) and a grant per chunk (five minutes, never
 * past the snapshot's expiry); `expired` after either. Null for an unknown id.
 */
export function snapshotStatus(c: VaultContext, id: string): SnapshotDto | null {
  const [row] = c.sql
    .exec<SnapshotRow>(`SELECT status, CAST(high_water AS TEXT) AS high_water, expires_at, high_water >= ${PURGE_WATERMARK} AS current FROM snapshots WHERE id = ?`, id)
    .toArray()
  if (!row) return null
  if (row.status !== 'ready') return { snapshot_id: id, status: row.status }
  const highWater = row.high_water as string
  const expiresAt = row.expires_at as string
  if (Date.parse(expiresAt) <= c.now.getTime() || row.current !== 1) return { snapshot_id: id, status: 'expired' }
  const grants = vaultGrants(c, 'snapshot')
  // At most 10,000 rows (the chunk_index check), and a snapshot's chunks are read together.
  const chunks = c.sql
    .exec<{ chunk_index: number; bytes: string; sha256: string }>('SELECT chunk_index, CAST(bytes AS TEXT) AS bytes, sha256 FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY chunk_index', id)
    .toArray()
  return {
    snapshot_id: id,
    status: 'ready',
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    high_water: highWater,
    cursor: encodeSyncCursor(c.claims.accountId, highWater),
    expires_at: expiresAt,
    chunks: chunks.map((chunk) => {
      const { grant, expiresAt: until } = grants.issue(c.claims.accountId, { snapshotId: id, index: chunk.chunk_index }, c.now, new Date(expiresAt))
      return { index: chunk.chunk_index, bytes: Number(chunk.bytes), sha256: chunk.sha256, grant, grant_expires_at: until.toISOString() }
    }),
  }
}

/** The stored chunk a current grant names (SnapshotRepository.chunk), only while its snapshot is ready, unexpired and not below the purge watermark; null otherwise. */
export function snapshotChunk(c: VaultContext, grant: string): StoredChunk | null {
  const target = vaultGrants(c, 'snapshot').verify(c.claims.accountId, grant, c.now)
  if (!target) return null
  const [row] = c.sql
    .exec<{ object_key: string; bytes: string; sha256: string }>(
      `SELECT k.object_key, CAST(k.bytes AS TEXT) AS bytes, k.sha256 FROM snapshot_chunks k JOIN snapshots s ON s.id = k.snapshot_id
        WHERE k.snapshot_id = ? AND k.chunk_index = ? AND s.status = 'ready' AND s.expires_at > ? AND s.high_water >= ${PURGE_WATERMARK}`,
      target.snapshotId,
      target.index,
      c.now.toISOString(),
    )
    .toArray()
  return row ? { key: row.object_key, bytes: Number(row.bytes), sha256: row.sha256 } : null
}

// The build (SnapshotBuilder.build on the vault).

/** One chunk while the build holds it: its encoded parts (the header, the entity lines with their commas, the close) and their total. */
type Chunk = { parts: Uint8Array[]; bytes: number }

type HeadRow = { entity: string; entity_id: string; version: number; state: EntityState; snapshot: string | null; ordinal: number | null }

/** Every head with the change row at its revision (LeasedAccountRead.entities, with no paging: the read is one synchronous pass). */
const ENTITY_READ = `SELECT h.entity, h.entity_id, h.version, h.state, c.snapshot, c.ordinal
  FROM entity_heads h LEFT JOIN entity_changes c ON c.revision = h.revision AND c.entity = h.entity AND c.entity_id = h.entity_id
 ORDER BY h.entity, h.entity_id`

const encoder = new TextEncoder()
const COMMA = encoder.encode(',')
const CLOSE = encoder.encode(']}')

/** One chunk's parts: the API's header, its entity lines joined by commas, then the close. */
function chunkOf(id: string, highWater: string, index: number, lines: Uint8Array[]): Chunk {
  const header = encoder.encode(`{"schema_version":${SNAPSHOT_SCHEMA_VERSION},"snapshot_id":${JSON.stringify(id)},"high_water":${JSON.stringify(highWater)},"index":${index},"entities":[`)
  const parts: Uint8Array[] = [header]
  lines.forEach((line, i) => {
    if (i > 0) parts.push(COMMA)
    parts.push(line)
  })
  parts.push(CLOSE)
  return { parts, bytes: parts.reduce((sum, part) => sum + part.byteLength, 0) }
}

/**
 * Every entity's latest state at the high water, read in one synchronous pass
 * over the heads' cursor (never toArray) and cut into chunks as the API cuts
 * them: an entity line counts its bytes plus one for its comma, and a chunk
 * closes before the line that would take it past `chunkBytes` (a chunk always
 * holds at least one entity; an empty vault has one empty chunk). Each change
 * must match its persisted DTO (isEntityChange), with its snapshot in jsonb key
 * order (ruling R92), and a head without its change row, unless purged, fails
 * the build. Each line is encoded to UTF-8 once, as it is read, and kept only
 * as those bytes. Null when the lines pass `maxBytes` in all.
 */
function readChunks(c: FileContext, id: string, highWater: string, chunkBytes: number, maxBytes: number): Chunk[] | null {
  const chunks: Chunk[] = []
  let lines: Uint8Array[] = []
  let size = 0
  let total = 0
  for (const row of c.sql.exec<HeadRow>(ENTITY_READ)) {
    if (row.ordinal === null && row.state !== 'purged') throw new Error('an entity head has no change row')
    const change: EntityChange = { entity: row.entity, id: row.entity_id, version: row.version, state: row.state, snapshot: row.snapshot === null ? null : jsonbOrder(JSON.parse(row.snapshot)) }
    if (!isEntityChange(change)) throw new Error(`A ${row.entity} in the snapshot does not match its persisted DTO.`)
    const line = encoder.encode(JSON.stringify(change))
    const bytes = line.byteLength + 1
    total += bytes
    if (total > maxBytes) return null
    if (lines.length > 0 && size + bytes > chunkBytes) {
      chunks.push(chunkOf(id, highWater, chunks.length, lines))
      lines = []
      size = 0
    }
    lines.push(line)
    size += bytes
  }
  if (lines.length > 0 || chunks.length === 0) chunks.push(chunkOf(id, highWater, chunks.length, lines))
  return chunks
}

type Prepared = { kind: 'skipped' } | { kind: 'too_large' } | { kind: 'store'; highWater: string; chunks: Chunk[]; keys: string[] }

/**
 * The read, in one block: a pending snapshot of an active vault is read at the
 * vault's current revision (its high water), and a fresh key per chunk is
 * reserved under one attempt token (B4). A snapshot over `maxBytes` fails as
 * too large instead.
 */
function prepareSnapshot(c: FileContext, v: SnapshotWriter, id: string, chunkBytes: number, maxBytes: number): Prepared {
  const [row] = c.sql.exec<{ status: string }>('SELECT status FROM snapshots WHERE id = ?', id).toArray()
  if (!row || row.status !== 'pending' || !v.active(c)) return { kind: 'skipped' }
  const highWater = c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').one().revision
  const chunks = readChunks(c, id, highWater, chunkBytes, maxBytes)
  if (!chunks) {
    c.sql.exec("UPDATE snapshots SET status = 'failed' WHERE id = ? AND status = 'pending'", id)
    touch(c)
    return { kind: 'too_large' }
  }
  const token = crypto.randomUUID()
  const keys = chunks.map((_chunk, index) => vaultObjectKey('sync_snapshot', c.vaultId, id, token, `chunk-${String(index).padStart(4, '0')}.json`))
  for (const key of keys) reserveObject(c, key, 'sync_snapshot')
  return { kind: 'store', highWater, chunks, keys }
}

/**
 * The record, in one block with the clock read after the PUTs
 * (gogospend_record_snapshot after 0015). Only while the snapshot is still
 * pending and the vault active (otherwise `skipped`, and the reserved keys are
 * deleted at their deadline). The high water must still be at or above the
 * retention line and the purge watermark: a view read before a purge may hold
 * purged data, so the build throws and the step retries with a fresh read, as
 * the API retries `snapshot_not_recorded`. Every key must still be inside its
 * reservation's own deadline (created_at plus RESERVATION_GRACE_MS, even when a
 * failed delete moved delete_after on); past it the build throws too. Then each
 * chunk is published for SNAPSHOT_TTL_HOURS and recorded, one statement each
 * (ruling R57), and the snapshot is ready.
 */
function recordSnapshot(c: FileContext, v: SnapshotWriter, id: string, highWater: string, stored: StoredChunk[]): BuildOutcome['outcome'] {
  const [row] = c.sql.exec<{ status: string }>('SELECT status FROM snapshots WHERE id = ?', id).toArray()
  if (!row || row.status !== 'pending' || !v.active(c)) return 'skipped'
  const [current] = c.sql
    .exec(`SELECT 1 AS ok FROM sync_state s WHERE s.id = 1 AND CAST(? AS INTEGER) BETWEEN max(s.pruned_through, ${PURGE_WATERMARK}) AND s.revision`, highWater)
    .toArray()
  if (!current) throw new Error('the snapshot was read before a purge or the retention line')
  const now = c.now.getTime()
  const { live } = c.sql
    .exec<{ live: number }>(
      "SELECT count(*) AS live FROM vault_objects WHERE key IN (SELECT value FROM json_each(?)) AND status = 'reserved' AND created_at + ? > ?",
      JSON.stringify(stored.map((chunk) => chunk.key)),
      RESERVATION_GRACE_MS,
      now,
    )
    .one()
  if (live !== stored.length) throw new Error('the snapshot chunks outlived their reservations')
  const expiresAt = now + SNAPSHOT_TTL_MS
  stored.forEach((chunk, index) => {
    publishObject(c, chunk.key, chunk, expiresAt)
    c.sql.exec('INSERT INTO snapshot_chunks (snapshot_id, chunk_index, object_key, bytes, sha256) VALUES (?, ?, ?, ?, ?)', id, index, chunk.key, chunk.bytes, chunk.sha256)
  })
  c.sql.exec(
    "UPDATE snapshots SET status = 'ready', high_water = CAST(? AS INTEGER), chunk_count = ?, ready_at = ?, expires_at = ? WHERE id = ? AND status = 'pending'",
    highWater,
    stored.length,
    iso(now),
    iso(expiresAt),
    id,
  )
  touch(c)
  return 'ready'
}

/**
 * SnapshotBuilder.build on the vault. A row that is not pending, or a vault
 * that is not active, answers `skipped`. The read and the keys' reservations
 * are one block; each chunk is stored outside every block with
 * putConcatenated, which joins its parts once and lets them go before its PUT;
 * then a second block, with the clock read after the PUTs (publishObject's
 * deadline check trusts c.now), records the chunks and marks the snapshot
 * ready. `peakHeldBytes` counts what the build keeps alive: every chunk's
 * parts from the read until its upload, plus the one copy putConcatenated
 * joins for the chunk it is storing.
 */
export async function buildSnapshot(v: SnapshotWriter, id: string, options: { chunkBytes?: number; maxBytes?: number } = {}): Promise<BuildOutcome & { peakHeldBytes?: number }> {
  const c = v.context()
  const prepared = c.storage.transactionSync(() => prepareSnapshot(c, v, id, options.chunkBytes ?? SNAPSHOT_CHUNK_BYTES, options.maxBytes ?? MAX_SNAPSHOT_BYTES))
  if (prepared.kind !== 'store') return { outcome: prepared.kind }
  const { highWater, chunks, keys } = prepared
  let held = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
  let peakHeldBytes = held
  const stored: StoredChunk[] = []
  for (const [index, chunk] of chunks.entries()) {
    peakHeldBytes = Math.max(peakHeldBytes, held + (chunk.parts.length > 1 ? chunk.bytes : 0))
    const file = await putConcatenated(v.bucket, keys[index], chunk.parts, chunk.bytes, SNAPSHOT_CONTENT_TYPE)
    held -= chunk.bytes
    stored.push({ key: keys[index], ...file })
  }
  const p = v.context()
  const outcome = p.storage.transactionSync(() => recordSnapshot(p, v, id, highWater, stored))
  return { outcome, peakHeldBytes }
}

/** Fails a pending snapshot: SnapshotWorkflow's build threw after its retries. */
export function failSnapshot(c: FileContext, id: string): void {
  c.sql.exec("UPDATE snapshots SET status = 'failed' WHERE id = ? AND status = 'pending'", id)
  touch(c)
}

/** A ready snapshot read below the purge watermark: it may hold purged data. */
const BELOW_WATERMARK = `status = 'ready' AND high_water < ${PURGE_WATERMARK}`

/**
 * The snapshot rules on the vault clock, in one short block of its own: a
 * pending snapshot created at least a day ago fails; a ready snapshot below the
 * purge watermark makes its chunk keys due now (a subquery over
 * snapshot_chunks, no id list) and is deleted, as the API's purge drops the
 * snapshots built before it; a ready snapshot a week past its expiry is
 * deleted (its chunk rows cascade; its objects were due at its expiry). Each
 * rule acts at its own due time (inclusive), so snapshotsDueAt moves past it
 * (ruling R37). The vault's state is not checked here: the alarm runs it only
 * for an active vault (1B-T11).
 */
export function pruneSnapshots(c: FileContext): void {
  c.storage.transactionSync(() => {
    const now = c.now.getTime()
    const failed = c.sql.exec("UPDATE snapshots SET status = 'failed' WHERE status = 'pending' AND created_at <= ? RETURNING id", iso(now - SNAPSHOT_PENDING_MS)).toArray()
    c.sql.exec(
      `UPDATE vault_objects SET delete_after = 0
        WHERE status <> 'tombstone' AND key IN (SELECT object_key FROM snapshot_chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE ${BELOW_WATERMARK}))`,
    )
    const stale = c.sql.exec(`DELETE FROM snapshots WHERE ${BELOW_WATERMARK} RETURNING id`).toArray()
    const old = c.sql.exec("DELETE FROM snapshots WHERE status = 'ready' AND expires_at <= ? RETURNING id", iso(now - SNAPSHOT_KEEP_MS)).toArray()
    if (failed.length + stale.length + old.length > 0) touch(c)
  })
}

/** The earliest time one of pruneSnapshots' rules applies (now, for a snapshot below the purge watermark), from the same constants; null when none will (ruling R37). */
export function snapshotsDueAt(c: FileContext): number | null {
  const { pending, stale, ready } = c.sql
    .exec<{ pending: string | null; stale: number; ready: string | null }>(
      `SELECT (SELECT min(created_at) FROM snapshots WHERE status = 'pending') AS pending,
              (SELECT count(*) FROM snapshots WHERE ${BELOW_WATERMARK}) AS stale,
              (SELECT min(expires_at) FROM snapshots WHERE status = 'ready') AS ready`,
    )
    .one()
  const times = [
    pending === null ? null : Date.parse(pending) + SNAPSHOT_PENDING_MS,
    stale > 0 ? c.now.getTime() : null,
    ready === null ? null : Date.parse(ready) + SNAPSHOT_KEEP_MS,
  ].filter((time): time is number => time !== null)
  return times.length === 0 ? null : Math.min(...times)
}
