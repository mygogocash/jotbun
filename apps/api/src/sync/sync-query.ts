import { Injectable } from '@nestjs/common';
import { ContractValidationError, SYNC_DEFAULT_GROUPS, SYNC_MAX_GROUPS, SYNC_PAGE_BYTES, assertKnownFields } from '@gogospend/contracts';
import type { CommittedChangeGroup, EntityChange, EntityState, SyncChangesPage } from '@gogospend/contracts';

import { CommandRegistry } from '../commands/command-registry';
import { ProblemException } from '../common/api-problem.filter';
import type { OwnerTx } from '../database/owner-transaction';
import { decodeSyncCursor, encodeSyncCursor } from './sync-cursor';

export type SyncRequest = { cursor?: string; limit: number };

// Room for the page's own fields around its groups.
const PAGE_OVERHEAD_BYTES = 1024;

function single(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ContractValidationError('VALIDATION_FAILED', `${field} must appear once.`, field);
  return value;
}

/** Validates GET /v1/sync/changes query parameters. */
export function parseSyncRequest(query: Record<string, unknown>): SyncRequest {
  const input = assertKnownFields(query, ['cursor', 'limit']);
  const cursor = single(input.cursor, 'cursor');
  const rawLimit = single(input.limit, 'limit');
  const limit = rawLimit === undefined ? SYNC_DEFAULT_GROUPS : /^[0-9]{1,4}$/.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > SYNC_MAX_GROUPS) {
    throw new ContractValidationError('VALIDATION_FAILED', `limit must be 1-${SYNC_MAX_GROUPS}.`, 'limit');
  }
  return { cursor, limit };
}

type ChangeRow = { revision: string; command_id: string; entity: string; entity_id: string; version: number; state: EntityState; snapshot: unknown };

/**
 * Ordered deltas: whole committed change groups after a cursor, oldest
 * first, at most `limit` groups and SYNC_PAGE_BYTES serialized. Revisions are
 * allocated and committed under the account lock, so a group can never become
 * visible after a later one: reading in one snapshot and resuming after the
 * last included revision skips nothing. Groups at or below the account's
 * retention line (pruned_through) may be incomplete, so a position below it
 * gets 410 RESYNC_REQUIRED. Every change is re-validated against its
 * entity's persisted DTO before it is served.
 */
@Injectable()
export class SyncQuery {
  constructor(private readonly registry: CommandRegistry) {}

  async after(tx: OwnerTx, cursor?: string, limit = SYNC_DEFAULT_GROUPS): Promise<SyncChangesPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > SYNC_MAX_GROUPS) throw new RangeError(`limit must be 1-${SYNC_MAX_GROUPS}`);
    const position = cursor === undefined ? '0' : decodeSyncCursor(tx.accountId, cursor);
    const [state] = await tx.query<{ revision: string; pruned_through: string }>(
      'SELECT revision::text, pruned_through::text FROM account_sync_state WHERE account_id = $1',
      [tx.accountId],
    );
    if (!state) throw new ProblemException(404, 'NOT_FOUND');
    if (BigInt(position) > BigInt(state.revision)) {
      throw new ContractValidationError('VALIDATION_FAILED', 'The cursor is ahead of this account.', 'cursor');
    }
    if (BigInt(position) < BigInt(state.pruned_through)) throw new ProblemException(410, 'RESYNC_REQUIRED');

    // Every group has an ordinal-0 change, and groups above pruned_through are
    // complete, so this walks the primary key one row per group.
    const revisions = await tx.query<{ revision: string }>(
      `SELECT c.revision::text AS revision FROM entity_changes c
        WHERE c.account_id = $1 AND c.revision > $2 AND c.ordinal = 0 ORDER BY c.revision LIMIT $3`,
      [tx.accountId, position, limit + 1],
    );
    const wanted = revisions.slice(0, limit).map((row) => row.revision);
    const groups: CommittedChangeGroup[] = [];
    if (wanted.length > 0) {
      const rows = await tx.query<ChangeRow>(
        `SELECT c.revision::text AS revision, c.command_id, c.entity, c.entity_id, c.version, c.state, c.snapshot FROM entity_changes c
          WHERE c.account_id = $1 AND c.revision = ANY($2::bigint[]) ORDER BY c.revision, c.ordinal`,
        [tx.accountId, wanted],
      );
      let bytes = PAGE_OVERHEAD_BYTES;
      for (let start = 0; start < rows.length; ) {
        let end = start;
        while (end < rows.length && rows[end].revision === rows[start].revision) end += 1;
        const group: CommittedChangeGroup = { revision: rows[start].revision, command_id: rows[start].command_id, changes: rows.slice(start, end).map((row) => this.change(row)) };
        const size = Buffer.byteLength(JSON.stringify(group)) + 1;
        if (groups.length > 0 && bytes + size > SYNC_PAGE_BYTES) break;
        bytes += size;
        groups.push(group);
        start = end;
      }
    }
    const last = groups.length > 0 ? groups[groups.length - 1].revision : position;
    return {
      groups,
      next_cursor: encodeSyncCursor(tx.accountId, last),
      has_more: groups.length < revisions.length,
    };
  }

  private change(row: ChangeRow): EntityChange {
    const change: EntityChange = { entity: row.entity, id: row.entity_id, version: row.version, state: row.state, snapshot: row.snapshot ?? null };
    const definition = this.registry.entity(row.entity);
    const snapshot = change.snapshot as { id?: unknown; version?: unknown } | null;
    const valid = definition !== undefined && (change.state === 'purged'
      ? snapshot === null
      : snapshot !== null && snapshot.id === change.id && (snapshot.version === undefined || snapshot.version === change.version) && definition.validate(snapshot));
    if (!valid) throw new Error(`A stored ${row.entity} change no longer matches its persisted DTO.`);
    return change;
  }
}
