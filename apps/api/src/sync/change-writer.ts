import { Injectable } from '@nestjs/common';
import { ENTITY_STATES, MAX_CHANGE_GROUP_BYTES, isUuid } from '@gogospend/contracts';
import type { EntityChange, Revision } from '@gogospend/contracts';

import { CommandRegistry } from '../commands/command-registry';
import { ProblemException } from '../common/api-problem.filter';
import type { OwnerTx } from '../database/owner-transaction';

const MAX_CHANGES = 10_000;
// The largest revision a bigint can spell, so the budget holds for any group.
const WIDEST_REVISION = '9'.repeat(19);

/**
 * Writes one command's committed change group. The caller (CommandExecutor)
 * holds the account lock, so the revision allocated here is the next one in
 * commit order. Every change is checked against its entity's persisted DTO,
 * the serialized group must fit the 1 MiB budget (sync never splits a group),
 * and each entity's head must move strictly forward and never leave `purged`.
 * Any violation throws, rolling back the whole command.
 */
@Injectable()
export class ChangeWriter {
  constructor(private readonly registry: CommandRegistry) {}

  async append(tx: OwnerTx, commandId: string, changes: readonly EntityChange[]): Promise<Revision> {
    const normalized = this.validate(changes);
    const serialized = JSON.stringify(normalized);
    const groupBytes = Buffer.byteLength(`{"revision":"${WIDEST_REVISION}","command_id":"${commandId}","changes":${serialized}}`);
    if (groupBytes > MAX_CHANGE_GROUP_BYTES) throw new ProblemException(413, 'COMMAND_TOO_LARGE');

    const [{ revision }] = await tx.query<{ revision: string }>(
      'UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING revision::text',
      [tx.accountId],
    );
    await tx.query(
      `INSERT INTO entity_changes (account_id, revision, ordinal, command_id, entity, entity_id, version, state, snapshot)
       SELECT $1, $2, (e.ordinal - 1)::int, $3, e.value ->> 'entity', (e.value ->> 'id')::uuid, (e.value ->> 'version')::int,
              e.value ->> 'state', NULLIF(e.value -> 'snapshot', 'null'::jsonb)
         FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS e(value, ordinal)`,
      [tx.accountId, revision, commandId, serialized],
    );
    const moved = await tx.query(
      `INSERT INTO entity_heads AS h (account_id, entity, entity_id, version, state, revision)
       SELECT $1, e ->> 'entity', (e ->> 'id')::uuid, (e ->> 'version')::int, e ->> 'state', $2
         FROM jsonb_array_elements($3::jsonb) AS e
       ON CONFLICT (account_id, entity, entity_id) DO UPDATE
          SET version = EXCLUDED.version, state = EXCLUDED.state, revision = EXCLUDED.revision
        WHERE h.version < EXCLUDED.version AND h.state <> 'purged'
       RETURNING 1`,
      [tx.accountId, revision, serialized],
    );
    if (moved.length !== normalized.length) throw new Error('An entity version did not move forward.');
    return revision;
  }

  private validate(changes: readonly EntityChange[]): EntityChange[] {
    if (changes.length === 0 || changes.length > MAX_CHANGES) throw new Error(`A command commits 1-${MAX_CHANGES} changes.`);
    const seen = new Set<string>();
    return changes.map((change, index) => {
      const definition = this.registry.entity(change.entity);
      const valid =
        definition !== undefined &&
        isUuid(change.id) &&
        Number.isInteger(change.version) && change.version >= 1 && change.version <= 2_147_483_647 &&
        ENTITY_STATES.includes(change.state) &&
        (change.state === 'purged' ? change.snapshot === null : change.snapshot !== null && definition.validate(change.snapshot));
      if (!valid) throw new Error(`Change ${index} does not match its entity's persisted DTO.`);
      const key = `${change.entity}\u0000${change.id}`;
      if (seen.has(key)) throw new Error(`Change ${index} repeats an entity in the same group.`);
      seen.add(key);
      return { entity: change.entity, id: change.id, version: change.version, state: change.state, snapshot: change.snapshot };
    });
  }
}
