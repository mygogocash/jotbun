// Retention on the vault's alarm (§6.2 "Deletes and retention" and "Alarms"),
// ported from apps/api/drizzle/0015_privacy.sql: gogospend_retention_purge_account
// and gogospend_purge_entities (deleted records 30 days after deletion),
// gogospend_prune_account (superseded changes 30 days on) and
// gogospend_drop_receipt_digests (request digests after the 30-day outbox
// lifetime; the receipts stay). Each job's due time comes from the data, the
// vault keeps the due jobs in `schedule` (with 1B-T11's file jobs), and
// UserVault#rearm sets the alarm to the earliest. Every job is its own
// transactionSync block, opened here, so none of these functions may run inside
// another block (R21). Revisions stay text: they are read as CAST(... AS TEXT)
// and bound as CAST(? AS INTEGER). Id lists bind as one JSON parameter (R57).
import { RESTORE_WINDOW_DAYS, SYNC_RETENTION_DAYS } from '@gogospend/contracts'
import type { EntityChange } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { changeGroupBytes } from '@api/sync/change-writer'

import { logFailure } from '../v1/log'
import type { VaultContext } from './context'
import type { FileContext } from './files/context'
import { FILE_JOBS, fileJobsDue } from './files/jobs'

/** What the retention jobs read and write. A VaultContext is one, and so is 1B's FileContext. */
export type RetentionContext = Pick<VaultContext, 'sql' | 'storage' | 'now'>

export type RetentionJob = 'purge' | 'prune_changes' | 'drop_digests'

/** The jobs in the order the alarm runs them, the API's order (records.purge, sync.change_log, commands.receipt_digests). */
export const RETENTION_JOBS: readonly RetentionJob[] = ['purge', 'prune_changes', 'drop_digests']

const DAY_MS = 86_400_000
/** A deleted record is purged once its restore window has passed. */
export const PURGE_AFTER_MS = RESTORE_WINDOW_DAYS * DAY_MS
/** A superseded change is kept this long; older cursors resync. */
export const CHANGE_RETENTION_MS = SYNC_RETENTION_DAYS * DAY_MS
/** The API's 30-day outbox lifetime: a receipt's request digest is dropped after it. */
export const RECEIPT_DIGEST_MS = 30 * DAY_MS
/** At most this many records go into one purge change group (the API's batch). */
export const PURGE_BATCH = 1_000
/** At most this many purge groups per alarm; anything left stays due, so the next alarm continues. */
export const MAX_PURGE_PASSES = 100
/** After a job fails, the alarm comes back no sooner than this, so a failing job is never retried in a loop. */
export const RETENTION_RETRY_MS = 60_000

const isoAgo = (c: RetentionContext, ms: number): string => new Date(c.now.getTime() - ms).toISOString()

/** The earliest timestamp a query returns (`at`), plus `ms`, or undefined when there is none. */
function dueAfter(c: RetentionContext, ms: number, query: string): number | undefined {
  const at = c.sql.exec<{ at: string | null }>(query).toArray()[0]?.at
  const time = at ? Date.parse(at) : Number.NaN
  return Number.isFinite(time) ? time + ms : undefined
}

/** Only an active account keeps retention: one being deleted is left to its erasure, and an erased vault holds nothing. */
function accountIsActive(c: RetentionContext): boolean {
  return c.sql.exec<{ status: string }>('SELECT status FROM account_state WHERE id = 1').toArray()[0]?.status === 'active'
}

/** True when some change is superseded: every head keeps exactly one change row (its own), so any extra row is a superseded one. */
function hasSupersededChange(c: RetentionContext): boolean {
  return c.sql.exec<{ n: number }>('SELECT (SELECT count(*) FROM entity_changes) - (SELECT count(*) FROM entity_heads) AS n').one().n > 0
}

/**
 * When each job next has something to do, in epoch milliseconds (an absent job
 * has nothing to do):
 * - purge: the earliest live deleted_at, plus 30 days;
 * - prune_changes: while some change is superseded, the oldest change group
 *   above the retention line, plus 30 days (the API's
 *   gogospend_retention_candidates rule). Each prune moves the line past every
 *   group that old, so the next due time is always later than the prune;
 * - drop_digests: the earliest receipt still holding a digest, plus 30 days.
 * An account that is not active has nothing due.
 */
export function nextDue(c: RetentionContext): Map<RetentionJob, number> {
  const due = new Map<RetentionJob, number>()
  if (!accountIsActive(c)) return due
  const purge = dueAfter(c, PURGE_AFTER_MS, 'SELECT min(deleted_at) AS at FROM transactions WHERE deleted_at IS NOT NULL')
  const prune = hasSupersededChange(c)
    ? dueAfter(c, CHANGE_RETENTION_MS, 'SELECT min(g.committed_at) AS at FROM entity_changes g, sync_state s WHERE s.id = 1 AND g.ordinal = 0 AND g.revision > s.pruned_through')
    : undefined
  const digests = dueAfter(c, RECEIPT_DIGEST_MS, 'SELECT min(committed_at) AS at FROM command_receipts WHERE request_digest IS NOT NULL')
  if (purge !== undefined) due.set('purge', purge)
  if (prune !== undefined) due.set('prune_changes', prune)
  if (digests !== undefined) due.set('drop_digests', digests)
  return due
}

/**
 * Writes the due jobs into `schedule`, the retention jobs of nextDue and the
 * file jobs of fileJobsDue (1B-T11; `lastStartAttemptMs` is UserVault's, for
 * start_work), and removes every job with nothing to do. Returns the earliest
 * scheduled time, or null. Plain SQL: the caller holds the block.
 */
export function reschedule(c: FileContext, lastStartAttemptMs: number | null): number | null {
  const due = new Map<string, number>([...nextDue(c), ...fileJobsDue(c, lastStartAttemptMs)])
  for (const job of [...RETENTION_JOBS, ...FILE_JOBS]) {
    const at = due.get(job)
    if (at === undefined) c.sql.exec('DELETE FROM schedule WHERE job = ?', job).toArray()
    else c.sql.exec('INSERT INTO schedule (job, due_at) VALUES (?, ?) ON CONFLICT (job) DO UPDATE SET due_at = excluded.due_at', job, at).toArray()
  }
  return c.sql.exec<{ at: number | null }>('SELECT min(due_at) AS at FROM schedule').toArray()[0]?.at ?? null
}

/**
 * Replaces entities' data with `purged` tombstones (gogospend_purge_entities).
 * The caller holds the block and has already deleted the domain rows. In one
 * new change group, with no receipt, each live or deleted head becomes purged at
 * the next version. Every earlier change of those entities is deleted, and the
 * retention line moves over them, so an older cursor resyncs. Plain SQL, no
 * registry, at most PURGE_BATCH ids. Returns the group's revision, or null when
 * nothing was left to purge.
 */
export function purgeEntities(c: RetentionContext, entity: string, ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  const list = JSON.stringify(ids)
  const heads = c.sql
    .exec<{ entity_id: string; version: number }>(
      "SELECT entity_id, version FROM entity_heads WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND state <> 'purged' ORDER BY entity_id",
      entity,
      list,
    )
    .toArray()
  if (heads.length === 0) return null
  c.sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
  const { revision } = c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').one()
  const { account_id: accountId } = c.sql.exec<{ account_id: string }>('SELECT account_id FROM account_state WHERE id = 1').one()
  const commandId = derivedUuid(accountId, 'retention-purge', revision)
  const old =
    c.sql
      .exec<{ old: string | null }>(
        'SELECT CAST(max(revision) AS TEXT) AS old FROM entity_changes WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND revision < CAST(? AS INTEGER)',
        entity,
        list,
        revision,
      )
      .toArray()[0]?.old ?? '0'
  c.sql.exec('DELETE FROM entity_changes WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND revision < CAST(? AS INTEGER)', entity, list, revision).toArray()
  const changes: EntityChange[] = heads.map((head) => ({ entity, id: head.entity_id, version: head.version + 1, state: 'purged', snapshot: null }))
  const groupBytes = changeGroupBytes(commandId, changes)
  const committedAt = c.now.toISOString()
  changes.forEach((change, ordinal) => {
    c.sql
      .exec(
        `INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
         VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?, 'purged', NULL, ?, ?)`,
        revision,
        ordinal,
        commandId,
        change.entity,
        change.id,
        change.version,
        committedAt,
        ordinal === 0 ? groupBytes : null,
      )
      .toArray()
  })
  c.sql
    .exec(
      "UPDATE entity_heads SET version = version + 1, state = 'purged', revision = CAST(? AS INTEGER) WHERE entity = ? AND entity_id IN (SELECT value FROM json_each(?)) AND state <> 'purged'",
      revision,
      entity,
      list,
    )
    .toArray()
  c.sql.exec('UPDATE sync_state SET pruned_through = max(pruned_through, CAST(? AS INTEGER)) WHERE id = 1', old).toArray()
  return revision
}

/**
 * Up to PURGE_BATCH records deleted at least 30 days ago, oldest first: their
 * rows are deleted and their entities purged as one group (the API's
 * gogospend_retention_purge_account, transactions half). Returns how many.
 */
export function purgeExpiredRecords(c: RetentionContext): number {
  const ids = c.sql
    .exec<{ id: string }>('SELECT id FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at, id LIMIT ?', isoAgo(c, PURGE_AFTER_MS), PURGE_BATCH)
    .toArray()
    .map((row) => row.id)
  if (ids.length === 0) return 0
  c.sql.exec('DELETE FROM transactions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids)).toArray()
  purgeEntities(c, 'transaction', ids)
  return ids.length
}

/**
 * The change-log prune (the latest gogospend_prune_account): the cut is the last
 * change group above the retention line committed at least 30 days ago. Every
 * change at or below the cut that is not its entity's head is deleted, and the
 * line moves to the cut. True when the line moved. The API visits only the
 * entities changed since its last pass, a PostgreSQL index shortcut. One vault
 * deletes them all in one statement, which also removes a change superseded
 * below a line that a purge moved.
 */
export function pruneChanges(c: RetentionContext): boolean {
  const cut = c.sql
    .exec<{ cut: string | null }>(
      'SELECT CAST(max(g.revision) AS TEXT) AS cut FROM entity_changes g, sync_state s WHERE s.id = 1 AND g.ordinal = 0 AND g.revision > s.pruned_through AND g.committed_at <= ?',
      isoAgo(c, CHANGE_RETENTION_MS),
    )
    .toArray()[0]?.cut
  if (!cut) return false
  c.sql
    .exec(
      `DELETE FROM entity_changes WHERE revision <= CAST(? AS INTEGER)
         AND NOT EXISTS (SELECT 1 FROM entity_heads h WHERE h.entity = entity_changes.entity AND h.entity_id = entity_changes.entity_id AND h.revision = entity_changes.revision)`,
      cut,
    )
    .toArray()
  c.sql.exec('UPDATE sync_state SET pruned_through = CAST(? AS INTEGER) WHERE id = 1', cut).toArray()
  return true
}

/** Drops the request digest of every receipt committed at least 30 days ago (gogospend_drop_receipt_digests). The receipt stays. Returns how many. */
export function dropReceiptDigests(c: RetentionContext): number {
  return c.sql
    .exec('UPDATE command_receipts SET request_digest = NULL, digest_key_id = NULL WHERE request_digest IS NOT NULL AND committed_at <= ? RETURNING command_id', isoAgo(c, RECEIPT_DIGEST_MS))
    .toArray().length
}

const RUNNERS: Record<RetentionJob, (c: RetentionContext) => void> = {
  purge: (c) => {
    for (let pass = 0; pass < MAX_PURGE_PASSES; pass += 1) {
      if (c.storage.transactionSync(() => purgeExpiredRecords(c)) < PURGE_BATCH) return
    }
  },
  prune_changes: (c) => {
    c.storage.transactionSync(() => pruneChanges(c))
  },
  drop_digests: (c) => {
    c.storage.transactionSync(() => dropReceiptDigests(c))
  },
}

/**
 * Runs every job that is due at the context's time, in RETENTION_JOBS order,
 * each in its own block. A job that throws is rolled back and logged, and the
 * others still run. Returns the jobs that failed.
 */
export function runDue(c: RetentionContext): RetentionJob[] {
  const due = nextDue(c)
  const failed: RetentionJob[] = []
  for (const job of RETENTION_JOBS) {
    const at = due.get(job)
    if (at === undefined || at > c.now.getTime()) continue
    try {
      RUNNERS[job](c)
    } catch (error) {
      logFailure(`vault_retention_${job}_failed`, error)
      failed.push(job)
    }
  }
  return failed
}
