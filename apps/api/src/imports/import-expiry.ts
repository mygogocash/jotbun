import type { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import type { ObjectPublicationService } from '../storage/object-publication.service';

export type ImportExpiryDeps = { jobs: JobRepository; publication: ObjectPublicationService };

/**
 * The worker's `import_expire` handler, due 24 hours after an upload was
 * accepted. Through P1's fenced completion (account lock, current lease,
 * active account at the job's generation) it runs gogospend_expire_import -
 * the parse job is cancelled if it never ran, an unparsed import becomes
 * `expired`, and its quarantine parts are due now - and completes in the
 * same transaction. Then it sweeps the account so the parts are deleted at
 * once; the periodic sweep is the backstop, and it also deletes the parts
 * at their 24-hour registry deadline if this job never runs at all.
 */
export class ImportExpiry {
  constructor(private readonly deps: ImportExpiryDeps) {}

  async run(job: ClaimedJob): Promise<void> {
    const { jobs, publication } = this.deps;
    const lease = job.lease;
    // No objects are published here; the expiry only bounds the API's own check.
    const done = await publication.finishWithObjects(jobs, lease, [], new Date(Date.now() + 60_000), async (client) => {
      const { rows } = await client.query<{ expired: boolean }>('SELECT gogospend_expire_import($1, $2) AS expired', [lease.jobId, lease.leaseToken]);
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
