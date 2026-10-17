import { isUuid } from '@gogospend/contracts';
import type { EntityState } from '@gogospend/contracts';

import { ProblemException } from '../common/api-problem.filter';
import type { OwnerTx } from '../database/owner-transaction';

export type EntityHead = { version: number; state: EntityState };

/** The owner's latest committed version/state of an entity; RLS hides other accounts' entities. */
export async function entityHead(tx: OwnerTx, entity: string, id: string): Promise<EntityHead | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.query<EntityHead>('SELECT version, state FROM entity_heads WHERE entity = $1 AND entity_id = $2', [entity, id]);
  return row ?? null;
}

/**
 * For commands on an existing entity: 404 NOT_FOUND when it does not exist
 * for this owner (another account's id looks the same), 409 ENTITY_DELETED
 * when soft-deleted, 410 ENTITY_PURGED once its data is gone.
 */
export async function requireLiveEntity(tx: OwnerTx, entity: string, id: string): Promise<EntityHead> {
  const head = await entityHead(tx, entity, id);
  if (!head) throw new ProblemException(404, 'NOT_FOUND');
  if (head.state === 'deleted') throw new ProblemException(409, 'ENTITY_DELETED');
  if (head.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED');
  return head;
}
