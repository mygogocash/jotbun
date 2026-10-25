import { isUuid } from '@gogospend/contracts'
import type { EntityState } from '@gogospend/contracts'

import type { EntityHead } from '@api/commands/entity-state'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultContext } from '../context'

export type { EntityHead }

/** The vault's latest committed version and state of an entity, or null (the API's entityHead). */
export function entityHead(c: VaultContext, entity: string, id: string): EntityHead | null {
  if (!isUuid(id)) return null
  const [row] = c.sql.exec<{ version: number; state: EntityState }>('SELECT version, state FROM entity_heads WHERE entity = ? AND entity_id = ?', entity, id).toArray()
  return row ?? null
}

/**
 * For a command on an existing entity: 404 NOT_FOUND when it does not exist
 * for this account, 409 ENTITY_DELETED when soft-deleted, 410 ENTITY_PURGED once
 * its data is gone.
 */
export function requireLiveEntity(c: VaultContext, entity: string, id: string): EntityHead {
  const head = entityHead(c, entity, id)
  if (!head) throw new ProblemException(404, 'NOT_FOUND')
  if (head.state === 'deleted') throw new ProblemException(409, 'ENTITY_DELETED')
  if (head.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED')
  return head
}

/**
 * The row a versioned command edits: 404 NOT_FOUND when this account has no
 * such entity, 409 VERSION_CONFLICT with the current record when If-Match is
 * stale (the API's expectVersion, synchronous here).
 */
export function expectVersion<T extends { version: number }>(row: T | undefined, expected: number | undefined, current: (row: T) => unknown): T {
  if (!row) throw new ProblemException(404, 'NOT_FOUND')
  if (row.version !== expected) throw new ProblemException(409, 'VERSION_CONFLICT', { current: current(row) })
  return row
}
