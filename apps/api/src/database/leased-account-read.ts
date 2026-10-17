import type { EntityState, Revision } from '@gogospend/contracts';
import type { Pool } from 'pg';

import type { JobLease } from '../jobs/job-types';

export type LeasedPurpose = 'sync_snapshot' | 'export';
export type LeasedEntity = { entity: string; id: string; version: number; state: EntityState; snapshot: unknown | null };

/** Typed reads of one account, available only inside `withSnapshot`. */
export interface LeasedReadTx {
  readonly accountId: string;
  highWater(): Promise<Revision>;
  entities(after: { entity: string; id: string } | null, limit: number): Promise<LeasedEntity[]>;
}

export class LeasedReadDenied extends Error {
  constructor() {
    super('This lease cannot read the account.');
    this.name = 'LeasedReadDenied';
  }
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code === '42501') throw new LeasedReadDenied();
    throw error;
  }
}

/**
 * Account reads for a job, as gogospend_leased_read: a role with no table
 * grants that reads only through routines which validate, on every call, the
 * job, its current unexpired lease, the purpose (= the job kind), the job's
 * lifecycle generation and that the account is active. All reads of one
 * `withSnapshot` share one REPEATABLE READ READ ONLY snapshot, so a snapshot
 * is consistent at its high-water revision.
 *
 * A lease that is cancelled or expires after the snapshot began still reads
 * inside it (the snapshot predates the change): publishing what was read must
 * re-check the lease under lock in a fresh READ COMMITTED transaction
 * (ObjectPublicationService.finishWithObjects).
 */
export class LeasedAccountRead {
  constructor(private readonly pool: Pool) {}

  async withSnapshot<T>(lease: JobLease, purpose: LeasedPurpose, fn: (read: LeasedReadTx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const args = [lease.jobId, lease.leaseToken, purpose];
      const accountId = (await guarded(() => client.query<{ account: string }>('SELECT gogospend_leased_read_open($1, $2, $3) AS account', args))).rows[0].account;
      const read: LeasedReadTx = {
        accountId,
        highWater: async () => (await guarded(() => client.query<{ revision: string }>('SELECT gogospend_leased_high_water($1, $2, $3)::text AS revision', args))).rows[0].revision,
        entities: async (after, limit) => {
          if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('limit must be 1-1000');
          const { rows } = await guarded(() =>
            client.query<{ entity: string; entity_id: string; version: number; state: EntityState; snapshot: unknown }>(
              'SELECT entity, entity_id, version, state, snapshot FROM gogospend_leased_entities($1, $2, $3, $4, $5, $6)',
              [...args, after?.entity ?? null, after?.id ?? null, limit],
            ),
          );
          return rows.map((row) => ({ entity: row.entity, id: row.entity_id, version: row.version, state: row.state, snapshot: row.snapshot ?? null }));
        },
      };
      const result = await fn(read);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        broken = true;
      });
      throw error;
    } finally {
      client.release(broken);
    }
  }

}
