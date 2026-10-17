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
 * The worker's `import_expire` handler, due 24 hours after an upload was
 * accepted. Through P1's fenced completion (account lock, current lease,
 * active account at the job's generation) it runs gogospend_expire_import -
 * the parse job is cancelled if it never ran, an unparsed import becomes
 * `expired`, and its quarantine parts are due now - and completes in the
 * same transaction. Then it sweeps the account so the parts are deleted at
 * once. When the account is no longer active at the job's generation the
 * fence refuses, and the job ends `superseded`: the worker's import
 * maintenance ends such imports on its next run. Published parts also carry
 * their 24-hour registry deadline, so the periodic sweep deletes them even if
 * this job never runs at all.
 */
export class ImportExpiry {
  constructor(private readonly deps: ImportExpiryDeps) {}

  async run(job: ClaimedJob): Promise<void> {
    const { jobs, publication } = this.deps;
    const lease = job.lease;
    let fenced = false;
    // No objects are published here; the expiry only bounds the API's own check.
    const done = await publication.finishWithObjects(jobs, lease, [], new Date(Date.now() + 60_000), async (client) => {
      fenced = true;
      const { rows } = await client.query<{ expired: boolean }>('SELECT gogospend_expire_import($1, $2) AS expired', [lease.jobId, lease.leaseToken]);
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
