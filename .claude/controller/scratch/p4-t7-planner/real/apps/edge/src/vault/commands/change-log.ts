import { ENTITY_STATES, MAX_CHANGE_GROUP_BYTES, isUuid } from '@gogospend/contracts'
import type { EntityChange, Revision } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { changeGroupBytes } from '@api/sync/change-writer'

import type { VaultContext } from '../context'

const MAX_CHANGES = 10_000

/**
 * Commits one command's change group under the next revision (ChangeWriter.append
 * in apps/api). The group is checked against the registry as its persisted
 * shape, and must fit MAX_CHANGE_GROUP_BYTES. The revision is bumped in
 * sync_state, then each change is written, and each entity head moves forward
 * (never backwards, never out of purged). Any throw rolls the call back. The
 * revision stays text from the database to the caller, so it is never a number. It reads only the
 * SQL, the clock and the registry, so the alarm's slip prune commits through it too (P4-T7).
 */
export function appendChanges(c: Pick<VaultContext, 'sql' | 'now' | 'registry'>, commandId: string, changes: readonly EntityChange[]): Revision {
  if (changes.length === 0 || changes.length > MAX_CHANGES) throw new Error(`A command commits 1-${MAX_CHANGES} changes.`)
  // Validate exactly what will be stored: the JSON text, parsed back (a toJSON
  // or a getter cannot show the validator one thing and store another).
  const serialized = JSON.stringify(changes.map((change) => ({ entity: change.entity, id: change.id, version: change.version, state: change.state, snapshot: change.snapshot ?? null })))
  const normalized = validateChanges(c, JSON.parse(serialized) as EntityChange[])
  const groupBytes = changeGroupBytes(commandId, normalized)
  if (groupBytes > MAX_CHANGE_GROUP_BYTES) throw new ProblemException(413, 'COMMAND_TOO_LARGE')

  c.sql.exec('UPDATE sync_state SET revision = revision + 1 WHERE id = 1').toArray()
  const [{ revision }] = c.sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').toArray()
  const committedAt = c.now.toISOString()
  normalized.forEach((change, ordinal) => {
    c.sql
      .exec(
        `INSERT INTO entity_changes (revision, ordinal, command_id, entity, entity_id, version, state, snapshot, committed_at, group_bytes)
         VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        revision,
        ordinal,
        commandId,
        change.entity,
        change.id,
        change.version,
        change.state,
        change.snapshot === null ? null : JSON.stringify(change.snapshot),
        committedAt,
        ordinal === 0 ? groupBytes : null,
      )
      .toArray()
  })
  for (const change of normalized) {
    const moved = c.sql
      .exec(
        `INSERT INTO entity_heads (entity, entity_id, version, state, revision) VALUES (?, ?, ?, ?, CAST(? AS INTEGER))
         ON CONFLICT (entity, entity_id) DO UPDATE SET version = excluded.version, state = excluded.state, revision = excluded.revision
         WHERE entity_heads.version < excluded.version AND entity_heads.state <> 'purged'
         RETURNING 1`,
        change.entity,
        change.id,
        change.version,
        change.state,
        revision,
      )
      .toArray()
    if (moved.length !== 1) throw new Error('An entity version did not move forward.')
  }
  return revision
}

/** Each change checked against its entity's registered DTO, with no entity repeated in the group (ChangeWriter.validate). */
function validateChanges(c: Pick<VaultContext, 'registry'>, changes: readonly EntityChange[]): EntityChange[] {
  const seen = new Set<string>()
  return changes.map((change, index) => {
    const definition = c.registry.entity(change.entity)
    const snapshot = change.snapshot as { id?: unknown; version?: unknown } | null
    const valid =
      definition !== undefined &&
      isUuid(change.id) &&
      Number.isInteger(change.version) &&
      change.version >= 1 &&
      change.version <= 2_147_483_647 &&
      ENTITY_STATES.includes(change.state) &&
      (change.state === 'purged'
        ? snapshot === null
        : typeof snapshot === 'object' &&
          snapshot !== null &&
          !Array.isArray(snapshot) &&
          snapshot.id === change.id &&
          (snapshot.version === undefined || snapshot.version === change.version) &&
          definition.validate(snapshot))
    if (!valid) throw new Error(`Change ${index} does not match its entity's persisted DTO.`)
    const key = `${change.entity}\u0000${change.id}`
    if (seen.has(key)) throw new Error(`Change ${index} repeats an entity in the same group.`)
    seen.add(key)
    return { entity: change.entity, id: change.id, version: change.version, state: change.state, snapshot: change.snapshot }
  })
}
