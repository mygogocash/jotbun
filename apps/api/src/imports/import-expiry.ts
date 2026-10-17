import type { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import type { ObjectPublicationService } from '../storage/object-publication.service';

export type ImportExpiryDeps = { jobs: JobRepository; publication: ObjectPublicationService };

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
 */
export class ImportExpiry {
  constructor(private readonly deps: ImportExpiryDeps) {}

  async run(job: ClaimedJob): Promise<void> {
    const { jobs, publication } = this.deps;
    const lease = job.lease;
    const preview = typeof job.payload === 'object' && job.payload !== null && (job.payload as { stage?: unknown }).stage === 'preview';
    const routine = preview ? 'gogospend_expire_import_preview' : 'gogospend_expire_import';
    // No objects are published here; the expiry only bounds the API's own check.
    const done = await publication.finishWithObjects(jobs, lease, [], new Date(Date.now() + 60_000), async (client) => {
      const { rows } = await client.query<{ expired: boolean }>(`SELECT ${routine}($1, $2) AS expired`, [lease.jobId, lease.leaseToken]);
      return rows[0]?.expired === true;
    });
    if (!done) {
      // Not due yet, or the account changed: still held means retry later.
      if (await jobs.isHeld(lease)) await jobs.fail(lease, { code: 'import_not_expired', retryable: true });
      return;
    }
    if (lease.accountId) await publication.sweep(lease.accountId).catch(() => undefined);
  }
}
