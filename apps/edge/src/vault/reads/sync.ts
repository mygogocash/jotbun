// The delta feed: whole committed change groups after a cursor, ported from
// SyncQuery (apps/api/src/sync/sync-query.ts). A page holds whole groups only,
// in revision order, at most `limit` groups and SYNC_PAGE_BYTES serialized. A
// group is chosen by its stored size before any change is read, so a page reads
// about its budget, not every group the limit allows.
import { MAX_CHANGE_GROUP_BYTES, SYNC_PAGE_BYTES } from '@gogospend/contracts'
import type { CommittedChangeGroup, EntityChange, EntityState, SyncChangesPage } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { decodeSyncPosition, encodeSyncCursor } from '@api/sync/sync-cursor'
import { parseSyncRequest } from '@api/sync/sync-query'

import type { VaultContext } from '../context'

// The lifecycle generation a cursor carries. A vault has no lifecycle until 1B's deletion, so it is always 0.
const GENERATION = 0

// Room for the page's own fields around its groups (PAGE_OVERHEAD_BYTES in sync-query.ts).
const PAGE_OVERHEAD_BYTES = 1024

type GroupRow = { revision: string; group_bytes: number | null }
type ChangeRow = { revision: string; command_id: string; entity: string; entity_id: string; version: number; state: EntityState; snapshot: string | null }

/**
 * GET /v1/sync/changes. The cursor names the last group a client holds. A
 * position below the retention line (pruned_through), ahead of the vault, or
 * from another lifecycle generation is 410 RESYNC_REQUIRED: groups at or below
 * the line may be incomplete. Every change is re-checked against its entity's
 * persisted DTO before it is served, as SyncQuery does. A revision never passes
 * through a JS number: it is read as text and bound as text.
 */
export function syncChanges(c: VaultContext, query: unknown): SyncChangesPage {
  const request = parseSyncRequest(query as Record<string, unknown>)
  const accountId = c.claims.accountId
  const state = c.sql
    .exec<{ revision: string; pruned_through: string }>('SELECT CAST(revision AS TEXT) AS revision, CAST(pruned_through AS TEXT) AS pruned_through FROM sync_state WHERE id = 1')
    .one()
  const position = request.cursor === undefined ? { revision: '0', generation: GENERATION } : decodeSyncPosition(accountId, request.cursor)
  if (position.generation !== GENERATION || BigInt(position.revision) > BigInt(state.revision) || BigInt(position.revision) < BigInt(state.pruned_through)) {
    throw new ProblemException(410, 'RESYNC_REQUIRED')
  }

  // One row per candidate group, the next limit + 1 of them, so has_more is exact. Each candidate's
  // stored size decides the page before any change is read. The columns are qualified: an unqualified
  // ORDER BY revision would sort by the TEXT alias, as strings ('10' before '2').
  const candidates = c.sql
    .exec<GroupRow>(
      'SELECT CAST(c.revision AS TEXT) AS revision, c.group_bytes FROM entity_changes c WHERE c.ordinal = 0 AND c.revision > CAST(? AS INTEGER) ORDER BY c.revision LIMIT ?',
      position.revision,
      request.limit + 1,
    )
    .toArray()
  const wanted: string[] = []
  let planned = PAGE_OVERHEAD_BYTES
  for (const candidate of candidates.slice(0, request.limit)) {
    const size = (candidate.group_bytes ?? MAX_CHANGE_GROUP_BYTES) + 1
    if (wanted.length > 0 && planned + size > SYNC_PAGE_BYTES) break
    planned += size
    wanted.push(candidate.revision)
  }

  const groups: CommittedChangeGroup[] = []
  if (wanted.length > 0) {
    // The chosen revisions bind as one JSON parameter (R57), as text, so no revision passes through a JS number.
    const rows = c.sql
      .exec<ChangeRow>(
        `SELECT CAST(c.revision AS TEXT) AS revision, c.command_id, c.entity, c.entity_id, c.version, c.state, c.snapshot FROM entity_changes c
          WHERE c.revision IN (SELECT CAST(value AS INTEGER) FROM json_each(?)) ORDER BY c.revision, c.ordinal`,
        JSON.stringify(wanted),
      )
      .toArray()
    // The stored size is an upper bound of what is served; keep the exact check anyway.
    let bytes = PAGE_OVERHEAD_BYTES
    for (let start = 0; start < rows.length; ) {
      let end = start
      while (end < rows.length && rows[end].revision === rows[start].revision) end += 1
      const group: CommittedChangeGroup = { revision: rows[start].revision, command_id: rows[start].command_id, changes: rows.slice(start, end).map((row) => changeOf(c, row)) }
      const size = Buffer.byteLength(JSON.stringify(group)) + 1
      if (groups.length > 0 && bytes + size > SYNC_PAGE_BYTES) break
      bytes += size
      groups.push(group)
      start = end
    }
  }
  const last = groups.length > 0 ? groups[groups.length - 1].revision : position.revision
  return {
    groups,
    next_cursor: encodeSyncCursor(accountId, last, GENERATION),
    has_more: groups.length < candidates.length,
  }
}

/** One stored change as the page serves it, re-checked against its entity's persisted DTO (SyncQuery.change). */
function changeOf(c: VaultContext, row: ChangeRow): EntityChange {
  const snapshot: unknown = row.snapshot === null ? null : JSON.parse(row.snapshot)
  const change: EntityChange = { entity: row.entity, id: row.entity_id, version: row.version, state: row.state, snapshot }
  const definition = c.registry.entity(row.entity)
  const dto = snapshot as { id?: unknown; version?: unknown } | null
  const valid =
    definition !== undefined &&
    (change.state === 'purged'
      ? snapshot === null
      : dto !== null && typeof dto === 'object' && dto.id === change.id && (dto.version === undefined || dto.version === change.version) && definition.validate(snapshot))
  if (!valid) throw new Error(`A stored ${row.entity} change no longer matches its persisted DTO.`)
  return change
}
