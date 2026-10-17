import type { Pool } from 'pg';

import type { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import type { ObjectPublicationService } from '../storage/object-publication.service';

export type ImportExpiryDeps = { jobs: JobRepository; publication: ObjectPublicationService };

// A quarantine object is overdue when its deletion deadline passed this long
// ago (the worker sweeps every 15 minutes by default) or its storage delete
// failed and awaits a retry.
const OVERDUE_GRACE_SECONDS = 3600;

/**
 * The worker's `import_expire` handler, in two stages:
 *   - raw (P2a), due 24 hours after an upload was accepted:
 *     gogospend_expire_import cancels the parse job if it never ran, marks an
 *     unparsed import `expired`, and makes its quarantine parts due now;
 *   - preview (P2b, payload stage "preview"), due 7 days after parsing:
 *     gogospend_expire_import_preview deletes the unconfirmed candidates,
 *     marks the preview `expired` and makes an unattached sanitized image due.
 * Each runs through P1's fenced completion (account lock, current lease,
 * active account at the job's generation) and completes in the same
 * transaction; the routine reads the stage from the stored job, not from this
 * process. Then it sweeps the account so the objects are deleted at once; the
 * periodic sweep is the backstop, and deletes them at their registry deadline
 * even if this job never runs at all.
 * When the account is no longer active at the job's generation the fence
 * refuses and the job ends `superseded`; the worker's import maintenance
 * ends such raw imports on its next run.
 */
export class ImportExpiry {
  constructor(private readonly deps: ImportExpiryDeps) {}

  async run(job: ClaimedJob): Promise<void> {
    const { jobs, publication } = this.deps;
    const lease = job.lease;
    const preview = typeof job.payload === 'object' && job.payload !== null && (job.payload as { stage?: unknown }).stage === 'preview';
    const routine = preview ? 'gogospend_expire_import_preview' : 'gogospend_expire_import';
    let fenced = false;
    // No objects are published here; the expiry only bounds the API's own check.
    const done = await publication.finishWithObjects(jobs, lease, [], new Date(Date.now() + 60_000), async (client) => {
      fenced = true;
      const { rows } = await client.query<{ expired: boolean }>(`SELECT ${routine}($1, $2) AS expired`, [lease.jobId, lease.leaseToken]);
      return rows[0]?.expired === true;
    });
    if (!done) {
      if (!(await jobs.isHeld(lease))) return;
      // Inside the fence the import was not due yet: try again later.
      if (fenced) await jobs.fail(lease, { code: 'import_not_due', retryable: true });
      // The fence refused (account deleted, disabled or at another generation): maintenance ends the import.
      else await jobs.complete(lease, 'superseded');
      return;
    }
    if (lease.accountId) await publication.sweep(lease.accountId).catch(() => undefined);
  }
}

export type ImportMaintenanceResult = { stale: number; expired: number; namesCleared: number };

/**
 * The worker's import maintenance, run before each sweep: fails uploads left
 * receiving past their deadline (or of an account that is going), ends
 * imports that are due or whose account is no longer active at their
 * generation, and clears file names kept past the preview window. The
 * sweep that follows deletes the parts this made due. Counts only.
 */
export async function importMaintenance(pool: Pool): Promise<ImportMaintenanceResult> {
  const { rows } = await pool.query<{ stale: number; expired: number; names_cleared: number }>('SELECT stale, expired, names_cleared FROM gogospend_import_maintenance()');
  const row = rows[0];
  return { stale: row?.stale ?? 0, expired: row?.expired ?? 0, namesCleared: row?.names_cleared ?? 0 };
}

/**
 * Quarantine objects whose scheduled deletion is overdue (deadline passed
 * over an hour ago) or whose storage delete failed and awaits retry - one
 * account's, or all. The worker alerts on a non-zero count after each sweep.
 */
export async function quarantineCleanupOverdue(pool: Pool, accountId?: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM object_publications
      WHERE purpose = 'import_quarantine' AND ($1::uuid IS NULL OR account_id = $1)
        AND (status = 'deleting' OR (status IN ('reserved', 'published') AND delete_after < now() - make_interval(secs => $2)))`,
    [accountId ?? null, OVERDUE_GRACE_SECONDS],
  );
  return rows[0]?.n ?? 0;
}
