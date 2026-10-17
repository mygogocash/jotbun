import type { Pool } from 'pg';

import type { IdentityErasureGateway, MaintenanceOutcome } from '../auth/auth0-management.client';
import type { JobRepository } from '../jobs/job.repository';
import type { JobLease } from '../jobs/job-types';
import type { ObjectPublicationService } from '../storage/object-publication.service';
import type { ErasureRegistry, ProviderSubjectKey } from './erasure-registry';
import type { PrivacySteps } from './privacy-steps';

export type DeletionStage = 'marker' | 'provider' | 'objects' | 'steps' | 'purge';

export type DeletionProgress = {
  requestId: string;
  accountId: string;
  markerRecordedAt: Date | null;
  providerVerifiedAt: Date | null;
  objectsSweptAt: Date | null;
  purgedAt: Date | null;
};

export type DeletionBacklog = { open: number; overdue: number; oldestSeconds: number; failed: number };
export type PurgeResult = 'purged' | 'not_ready' | 'stale_lease';

/**
 * The deletion worker's routines (login: gogospend_jobs + gogospend_security).
 * Every call but `backlog` needs the account_deletion job's current,
 * unexpired lease, and reads or changes only that job's account.
 */
export class DeletionRepository {
  constructor(private readonly pool: Pool) {}

  async progress(lease: JobLease): Promise<DeletionProgress | null> {
    const { rows } = await this.pool.query<{
      request_id: string; account_id: string; marker_recorded_at: Date | null; provider_verified_at: Date | null; objects_swept_at: Date | null; purged_at: Date | null;
    }>('SELECT * FROM gogospend_deletion_progress($1, $2)', [lease.jobId, lease.leaseToken]);
    const row = rows[0];
    if (!row) return null;
    return {
      requestId: row.request_id,
      accountId: row.account_id,
      markerRecordedAt: row.marker_recorded_at,
      providerVerifiedAt: row.provider_verified_at,
      objectsSweptAt: row.objects_swept_at,
      purgedAt: row.purged_at,
    };
  }

  /** The account's provider aliases (until the purge). */
  async identities(lease: JobLease): Promise<ProviderSubjectKey[]> {
    const { rows } = await this.pool.query<{ issuer: string; subject: string }>('SELECT issuer, subject FROM gogospend_deletion_identities($1, $2)', [lease.jobId, lease.leaseToken]);
    return rows.map((row) => ({ issuer: row.issuer, subject: row.subject }));
  }

  /** Every client that held a session for the account. */
  async clientIds(lease: JobLease): Promise<string[]> {
    const { rows } = await this.pool.query<{ client_id: string }>('SELECT gogospend_deletion_client_ids($1, $2) AS client_id', [lease.jobId, lease.leaseToken]);
    return rows.map((row) => row.client_id);
  }

  /** Records a finished stage; false when the lease is no longer current. */
  async mark(lease: JobLease, stage: 'marker' | 'provider' | 'objects'): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('SELECT gogospend_deletion_mark($1, $2, $3) AS ok', [lease.jobId, lease.leaseToken, stage]);
    return rows[0]?.ok === true;
  }

  /**
   * Makes the account's published objects due now and reports what is still
   * live; null when the lease is no longer current.
   */
  async objects(lease: JobLease): Promise<{ pending: number; quietAfter: Date | null } | null> {
    const { rows } = await this.pool.query<{ pending: number | null; quiet_after: Date | null }>('SELECT * FROM gogospend_deletion_objects($1, $2)', [lease.jobId, lease.leaseToken]);
    const row = rows[0];
    if (!row || row.pending === null) return null;
    return { pending: row.pending, quietAfter: row.quiet_after };
  }

  /** The last stage: purge the account's rows and complete the job, in one transaction. */
  async purge(lease: JobLease): Promise<PurgeResult> {
    const { rows } = await this.pool.query<{ result: PurgeResult }>('SELECT gogospend_deletion_purge($1, $2) AS result', [lease.jobId, lease.leaseToken]);
    return rows[0].result;
  }

  async backlog(): Promise<DeletionBacklog> {
    const { rows } = await this.pool.query<{ open: number; overdue: number; oldest_seconds: string; failed: number }>('SELECT * FROM gogospend_deletion_backlog()');
    const row = rows[0];
    return { open: row.open, overdue: row.overdue, oldestSeconds: Number(row.oldest_seconds), failed: row.failed };
  }
}

export type DeletionDeps = {
  jobs: JobRepository;
  repository: DeletionRepository;
  registry: ErasureRegistry;
  gateway: IdentityErasureGateway;
  publication: ObjectPublicationService;
  /** The worker's login (gogospend_jobs + gogospend_security), for registered erasure steps. */
  pool: Pool;
  /** The native Auth0 client ids (AUTH0_ALLOWED_CLIENT_IDS) whose refresh grants are revoked. */
  nativeClientIds: readonly string[];
  steps?: PrivacySteps;
};

export type DeletionHandlerOptions = {
  /** Runs after each stage is done; a throw there is a crash at that point (tests). */
  afterStage?: (stage: DeletionStage) => Promise<void>;
  /** How long after the last publisher deadline the objects stage runs again (default 5 s). */
  quietMarginMs?: number;
};

/**
 * Account erasure (the `account_deletion` job), in idempotent stages, each
 * recorded once done, so a retry after a crash at any point resumes and never
 * re-creates anything:
 *   1. marker   - on every run, before anything destructive, the independent
 *                 registry must hold a marker covering every provider alias;
 *                 if it cannot be written (or read back) the job retries and
 *                 nothing is destroyed;
 *   2. provider - for each alias: revoke refresh grants (every native
 *                 client), delete the Auth0 user and confirm it is gone. An
 *                 outage keeps the job pending (backoff; a terminal failure
 *                 is visible and alerted), never "complete";
 *   3. objects  - the account's published objects are deleted now; objects a
 *                 cancelled publisher may still write wait until that
 *                 publisher's final deadline (the job is deferred), then the
 *                 sweep removes them and any orphan under the account;
 *   4. steps    - registered per-domain erasure steps (privacy-steps.ts);
 *   5. purge    - one transaction deletes the account's private rows and
 *                 completes the job; its aliases stay blocked for an hour past
 *                 provider verification, so no access token issued before
 *                 can bootstrap.
 * Needs no user login. Logs nothing; failures are short codes.
 */
export class DeletionHandler {
  constructor(private readonly deps: DeletionDeps, private readonly options: DeletionHandlerOptions = {}) {}

  async run(lease: JobLease): Promise<void> {
    const { deps } = this;
    const progress = await deps.repository.progress(lease);
    // Not current any more (reclaimed, cancelled or expired): leave it alone.
    if (!progress) return;
    const fail = async (code: string, retryable = true) => {
      await deps.jobs.fail(lease, { code, retryable });
    };

    if (!progress.purgedAt) {
      const identities = await deps.repository.identities(lease);
      try {
        const receipt = await deps.registry.record(progress.accountId, identities);
        if (receipt.account_id !== progress.accountId) return fail('registry_unavailable');
      } catch {
        return fail('registry_unavailable');
      }
      if (!progress.markerRecordedAt) {
        if (!(await deps.repository.mark(lease, 'marker'))) return;
        await this.after('marker');
      }

      if (!progress.providerVerifiedAt) {
        const clientIds = [...new Set([...(await deps.repository.clientIds(lease)), ...deps.nativeClientIds])].sort();
        if (clientIds.length === 0) return fail('no_client_ids', false);
        for (const { subject } of identities) {
          const calls: (() => Promise<MaintenanceOutcome>)[] = [
            () => deps.gateway.revokeGrants(subject, clientIds, lease.signal),
            () => deps.gateway.deleteUser(subject, lease.signal),
            () => deps.gateway.confirmDeleted(subject, lease.signal),
          ];
          for (const call of calls) {
            if (lease.signal.aborted) return fail('lease_expired');
            let outcome: MaintenanceOutcome;
            try {
              outcome = await call();
            } catch {
              return fail('worker_error');
            }
            if (outcome.status !== 'done') return fail(outcome.code, outcome.status === 'retryable');
          }
        }
        if (!(await deps.repository.mark(lease, 'provider'))) return;
        await this.after('provider');
      }

      if (!progress.objectsSweptAt) {
        if (!(await deps.repository.objects(lease))) return;
        await deps.publication.sweep(progress.accountId);
        const left = await deps.repository.objects(lease);
        if (!left) return;
        if (left.pending > 0) {
          // A cancelled publisher may still write under a reserved key until its deadline.
          if (left.quietAfter) {
            await deps.jobs.defer(lease, new Date(left.quietAfter.getTime() + (this.options.quietMarginMs ?? 5_000)));
            return;
          }
          // Due but not deleted (a storage delete failed): retry with backoff.
          return fail('objects_pending');
        }
        if (!(await deps.repository.mark(lease, 'objects'))) return;
        await this.after('objects');
      }

      for (const step of deps.steps?.erasureSteps() ?? []) {
        if (lease.signal.aborted) return fail('lease_expired');
        try {
          await step.run({ lease, accountId: progress.accountId, pool: deps.pool });
        } catch {
          return fail('erasure_step_failed');
        }
      }
      await this.after('steps');
    }

    const result = await deps.repository.purge(lease);
    if (result === 'not_ready') return fail('deletion_not_ready');
    if (result === 'purged') await this.after('purge');
  }

  private async after(stage: DeletionStage): Promise<void> {
    await this.options.afterStage?.(stage);
  }
}
