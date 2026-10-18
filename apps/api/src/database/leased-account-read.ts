import type { EntityState, Revision } from '@gogospend/contracts';
import type { Pool } from 'pg';

import type { JobLease } from '../jobs/job-types';

export type LeasedPurpose = 'sync_snapshot' | 'export';
export type LeasedEntity = { entity: string; id: string; version: number; state: EntityState; snapshot: unknown | null };

/**
 * One active record for an export (P4), with the names of what it references.
 * Entries carry wallet and category; transfers carry source and destination.
 */
export type LeasedExportRow = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  occurredOn: string;
  amountMinor: string;
  walletId: string | null;
  walletName: string | null;
  categoryId: string | null;
  categoryBuiltinKey: string | null;
  categoryLabel: string | null;
  sourceWalletId: string | null;
  sourceWalletName: string | null;
  destinationWalletId: string | null;
  destinationWalletName: string | null;
  merchant: string | null;
  note: string | null;
  version: number;
};

/** Typed reads of one account, available only inside `withSnapshot`. */
export interface LeasedReadTx {
  readonly accountId: string;
  highWater(): Promise<Revision>;
  entities(after: { entity: string; id: string } | null, limit: number): Promise<LeasedEntity[]>;
  /**
   * Export leases only: active records dated within the job's stored period,
   * in (occurred_on, id) order after `after`.
   */
  exportRows(after: { occurredOn: string; id: string } | null, limit: number): Promise<LeasedExportRow[]>;
}

type ExportRowSql = {
  record_id: string;
  record_type: LeasedExportRow['type'];
  occurred_on: string;
  amount_minor: string;
  wallet_id: string | null;
  wallet_name: string | null;
  category_id: string | null;
  category_builtin_key: string | null;
  category_label: string | null;
  source_wallet_id: string | null;
  source_wallet_name: string | null;
  destination_wallet_id: string | null;
  destination_wallet_name: string | null;
  merchant: string | null;
  note: string | null;
  record_version: number;
};

const toExportRow = (row: ExportRowSql): LeasedExportRow => ({
  id: row.record_id,
  type: row.record_type,
  occurredOn: row.occurred_on,
  amountMinor: row.amount_minor,
  walletId: row.wallet_id,
  walletName: row.wallet_name,
  categoryId: row.category_id,
  categoryBuiltinKey: row.category_builtin_key,
  categoryLabel: row.category_label,
  sourceWalletId: row.source_wallet_id,
  sourceWalletName: row.source_wallet_name,
  destinationWalletId: row.destination_wallet_id,
  destinationWalletName: row.destination_wallet_name,
  merchant: row.merchant,
  note: row.note,
  version: row.record_version,
});

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
    const failure = error as { code?: string; message?: string };
    if (failure.code === '42501' && failure.message === 'leased read denied') throw new LeasedReadDenied();
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
 * Inside the snapshot, later heartbeats are invisible, so reads count the
 * lease as it was when the transaction began plus the attempt's fixed runtime
 * bound: a long build keeps reading while its heartbeats run, and stops at
 * the bound. For the same reason a lease cancelled after the snapshot began
 * still reads inside it: publishing what was read must re-check the lease
 * under lock in a fresh READ COMMITTED transaction
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
        exportRows: async (after, limit) => {
          if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('limit must be 1-1000');
          const { rows } = await guarded(() =>
            client.query<ExportRowSql>('SELECT * FROM gogospend_leased_export_rows($1, $2, $3, $4, $5)', [lease.jobId, lease.leaseToken, after?.occurredOn ?? null, after?.id ?? null, limit]),
          );
          return rows.map(toExportRow);
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
