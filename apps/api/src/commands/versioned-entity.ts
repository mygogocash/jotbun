import { isUuid } from '@gogospend/contracts';

import { ProblemException } from '../common/api-problem.filter';

/** A route `:id` that cannot name an owned entity is NOT_FOUND, like another account's id. */
export function routeId(id: string): string {
  if (!isUuid(id)) throw new ProblemException(404, 'NOT_FOUND');
  return id;
}

/**
 * The row a versioned command edits, read FOR UPDATE under the account lock:
 * 404 NOT_FOUND when this owner has no such entity, 409 VERSION_CONFLICT
 * (with the current record, safe to show) when `If-Match` is stale.
 */
export async function expectVersion<T extends { version: number }>(row: T | undefined, expected: number | undefined, current: (row: T) => Promise<unknown>): Promise<T> {
  if (!row) throw new ProblemException(404, 'NOT_FOUND');
  if (row.version !== expected) throw new ProblemException(409, 'VERSION_CONFLICT', { current: await current(row) });
  return row;
}

/** A 422 about the entity's state rather than one input field. */
export function stateProblem(messageKey: string, field: string): ProblemException {
  return new ProblemException(422, 'VALIDATION_FAILED', { messageKey, fields: { [field]: messageKey } });
}
