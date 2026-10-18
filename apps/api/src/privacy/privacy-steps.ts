// THE extension point for per-domain retention and erasure (P5). Later tasks
// (P2a uploads, P2b previews, P2c attachments, P3 import selections) register
// their steps in `defaultPrivacySteps` below and nowhere else; see
// docs/operations/retention.md and docs/operations/deletion.md.
//
// Contract for every domain:
//   0. Register a step in defaultPrivacySteps() with a `<domain>.<step>` name;
//      batched routines take a row limit and the runner calls them until they
//      remove nothing (see `batched`).
//   1. Account-owned tables reference accounts(id) ON DELETE CASCADE, so the
//      deletion purge removes them; a table that cannot (it must outlive the
//      account) is listed in ERASURE_HANDLED_TABLES with the step or routine
//      that clears it. deletion.integration.spec.ts fails on any other table
//      with an account_id column.
//   2. Every stored object goes through P1's publication registry (its
//      purpose in PUBLICATION_PURPOSES); the deletion handler then deletes
//      the account's objects - published, reserved by a cancelled publisher
//      and orphaned - before the database purge.
//   3. Anything else an erased account needs (data outside this database,
//      rows the cascade cannot reach) is an ErasureStep: idempotent, run
//      under the deletion job's lease after objects are swept and before the
//      purge; a step that throws stops the purge and retries the job.
//   4. Retention is a RetentionStep: it deletes only what is past its
//      deadline by the database clock (usually one SECURITY DEFINER routine
//      granted to gogospend_jobs), may run any number of times, and never
//      takes an account lock it would wait on (SKIP LOCKED). A record that
//      clients sync is purged with the SQL helper gogospend_purge_entities
//      (purged tombstone in a new change group, earlier payloads removed).
import type { Pool } from 'pg';

import type { JobLease } from '../jobs/job-types';
import { SyncRetention } from '../sync/sync-retention';

/** One retention rule; returns how many rows (or records) it removed. */
export type RetentionStep = { name: string; run(pool: Pool): Promise<number> };

export type ErasureContext = { lease: JobLease; accountId: string; pool: Pool };
/** One per-domain erasure action for an account being deleted (see contract 3). */
export type ErasureStep = { name: string; run(context: ErasureContext): Promise<void> };

/**
 * Tables with an account_id that do not cascade from accounts, and what
 * clears them. Everything else must cascade (contract 1).
 */
export const ERASURE_HANDLED_TABLES: Readonly<Record<string, string>> = {
  jobs: 'gogospend_deletion_purge deletes the account\'s other jobs; retention prunes finished jobs after 30 days',
  object_publications: 'the deletion objects stage deletes every object; P1\'s sweep drops deleted rows after 30 days',
  auth_event_receipts: 'gogospend_deletion_purge deletes them by principal digest (account_id is SET NULL)',
};

const NAME = /^[a-z][a-z0-9_]{0,31}\.[a-z][a-z0-9_]{0,63}$/;

export class PrivacySteps {
  private readonly retentionList: RetentionStep[] = [];
  private readonly erasureList: ErasureStep[] = [];

  retention(step: RetentionStep): this {
    this.check(step.name, this.retentionList);
    this.retentionList.push(step);
    return this;
  }

  erasure(step: ErasureStep): this {
    this.check(step.name, this.erasureList);
    this.erasureList.push(step);
    return this;
  }

  retentionSteps(): readonly RetentionStep[] {
    return [...this.retentionList];
  }

  erasureSteps(): readonly ErasureStep[] {
    return [...this.erasureList];
  }

  private check(name: string, list: readonly { name: string }[]): void {
    if (!NAME.test(name)) throw new RangeError('privacy step names are <domain>.<step> identifiers');
    if (list.some((step) => step.name === name)) throw new Error(`privacy step ${name} is already registered`);
  }
}

async function count(pool: Pool, routine: string, args: unknown[] = []): Promise<number> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ n: number }>(`SELECT ${routine}(${placeholders}) AS n`, args);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Deleted transactions 30 days after deletion (past the restore window) and
 * export requests 30 days after the request: each account in its own short
 * transaction (skipped while a user write holds its lock; the next run
 * retries), visited in account order until every due account is done.
 */
export async function purgeExpiredRecords(pool: Pool, batchSize = 100): Promise<number> {
  let purged = 0;
  let after: string | null = null;
  for (;;) {
    const { rows }: { rows: { id: string }[] } = await pool.query<{ id: string }>('SELECT gogospend_retention_purge_candidates($1, $2) AS id', [after, batchSize]);
    for (const { id } of rows) {
      // An account may need more than one pass (1,000 records per group).
      for (let pass = 0; pass < 100; pass += 1) {
        const n = await count(pool, 'gogospend_retention_purge_account', [id]);
        purged += n;
        if (n === 0) break;
      }
    }
    if (rows.length < batchSize) break;
    after = rows[rows.length - 1].id;
  }
  return purged;
}

/** Calls a batched `routine(limit)` until a call removes nothing (at most `maxPasses` calls per run). */
async function batched(pool: Pool, routine: string, batchSize = 5_000, maxPasses = 200): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const n = await count(pool, routine, [batchSize]);
    total += n;
    if (n === 0) break;
  }
  return total;
}

/** Receipt digests older than the 30-day outbox lifetime, in batches. */
export async function dropReceiptDigests(pool: Pool, batchSize = 5_000): Promise<number> {
  let dropped = 0;
  for (;;) {
    const n = await count(pool, 'gogospend_drop_receipt_digests', [batchSize]);
    dropped += n;
    if (n < batchSize) return dropped;
  }
}

/** The steps every worker runs today, in order. Register new domains here. */
export function defaultPrivacySteps(): PrivacySteps {
  return (
    new PrivacySteps()
      // M3 + P4: deleted records after the 30-day restore window; export requests after 30 days.
      .retention({ name: 'records.purge', run: (pool) => purgeExpiredRecords(pool) })
      // S1: superseded change-log rows after 30 days; snapshot manifests a week past expiry
      // (snapshot and export objects are deleted at their 24-hour expiry by P1's sweep).
      .retention({ name: 'sync.change_log', run: (pool) => new SyncRetention(pool).prune() })
      // M1: request digests after the 30-day outbox lifetime (the compact acknowledgement stays).
      .retention({ name: 'commands.receipt_digests', run: (pool) => dropReceiptDigests(pool) })
      // F6b: provider-event receipts and reconcile checks after 30 days; expired challenges; lapsed deletion holds.
      .retention({ name: 'auth.security_records', run: (pool) => batched(pool, 'gogospend_prune_security_records') })
      // P1: finished jobs after 30 days (failed ones stay for the runbook).
      .retention({ name: 'jobs.finished', run: (pool) => batched(pool, 'gogospend_prune_finished_jobs') })
      // P5: completed deletion requests 30 days after their purge.
      .retention({ name: 'privacy.deletion_requests', run: (pool) => batched(pool, 'gogospend_prune_deletion_requests') })
      // P2a: upload rows 30 days after they finished or expired (quarantine objects go at 24 hours through P1's
      // sweep and P2a's own maintenance; names are cleared after 8 days).
      .retention({ name: 'imports.uploads', run: (pool) => batched(pool, 'gogospend_prune_import_uploads') })
      // P2c: a receipt is released (its object due for P1's sweep) the moment no record holds it - removed,
      // replaced, or its record purged by records.purge above - by a trigger; this releases any retained
      // receipt nothing holds (a safety net) and drops released receipts' rows 30 days on, once their object is gone.
      .retention({ name: 'attachments.obsolete', run: (pool) => batched(pool, 'gogospend_prune_attachments') })
      // P2c: erasure must not purge while a receipt object of the account is still stored. The objects stage
      // already deleted every published object (retained receipts included); this re-checks the receipts,
      // makes any left due and stops the purge until the sweep has deleted them.
      .erasure({ name: 'attachments.objects', run: (context) => assertReceiptsErased(context) })
    // P2b: .retention({ name: 'imports.preview', ... }) - unconfirmed candidates at 7 days, unattached sanitized images at 24 hours.
    // P2a-P3: .erasure({ name: '<domain>.<step>', run }) - only for data the cascade and object stage cannot reach.
  );
}

/** The attachments.objects erasure step: throws (the job retries) while a receipt object of the account is live. */
export async function assertReceiptsErased({ lease, pool }: ErasureContext): Promise<void> {
  const { rows } = await pool.query<{ live: number | null }>('SELECT gogospend_attachment_erasure($1, $2) AS live', [lease.jobId, lease.leaseToken]);
  const live = rows[0]?.live;
  if (live === null || live === undefined) throw new Error('the deletion lease is no longer current');
  if (live > 0) throw new Error('receipt objects are still stored');
}
