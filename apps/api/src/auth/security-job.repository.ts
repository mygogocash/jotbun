import type { Pool } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import { assertLoginRoles } from '../jobs/worker-login';
import type { ClaimedJob, JobLease } from '../jobs/job-types';
import type { IdentityMaintenanceGateway } from './auth0-management.client';

export type RevocationState = 'current' | 'superseded' | 'stale_lease';

/**
 * The security half of the worker (role gogospend_security): checks a
 * revocation job against the hold that names it, reads the Auth0 subjects to
 * revoke (never stored in the queue) and lifts the hold once Auth0 has
 * confirmed. Every routine requires the job's current, unexpired lease.
 */
export class SecurityJobRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Startup check: the worker connects as a login that is a member of
   * gogospend_jobs and gogospend_security only - never the API's roles, a
   * superuser, a BYPASSRLS role or (a member of) a table owner.
   */
  async assertLeastPrivilegeWorker(): Promise<void> {
    await assertLoginRoles(this.pool, ['gogospend_jobs', 'gogospend_security'], 'The security worker DATABASE_URL');
  }

  async state(lease: JobLease): Promise<RevocationState> {
    const { rows } = await this.pool.query<{ state: RevocationState }>('SELECT gogospend_revocation_job_is_current($1, $2) AS state', [lease.jobId, lease.leaseToken]);
    return rows[0].state;
  }

  async subjects(lease: JobLease): Promise<string[]> {
    const { rows } = await this.pool.query<{ subject: string }>('SELECT gogospend_revocation_subjects($1, $2) AS subject', [lease.jobId, lease.leaseToken]);
    return rows.map((row) => row.subject);
  }

  async finishRevocation(lease: JobLease): Promise<'done' | 'stale_lease'> {
    const { rows } = await this.pool.query<{ result: 'done' | 'stale_lease' }>('SELECT gogospend_finish_revocation($1, $2) AS result', [lease.jobId, lease.leaseToken]);
    return rows[0].result;
  }
}

export type SecurityJobDeps = {
  jobs: JobRepository;
  security: SecurityJobRepository;
  gateway: IdentityMaintenanceGateway;
  /** The native Auth0 client ids (AUTH0_ALLOWED_CLIENT_IDS) whose refresh grants are revoked. */
  nativeClientIds?: readonly string[];
};
export type RevocationResult = 'revoked' | 'superseded' | 'stale' | 'retrying' | 'failed';
export type SecurityRunSummary = Record<RevocationResult, number>;

function payloadClientIds(payload: unknown): string[] | null {
  const value = payload as { generation?: unknown; client_ids?: unknown } | null;
  if (!value || !Number.isInteger(value.generation) || !Array.isArray(value.client_ids)) return null;
  return value.client_ids.every((id): id is string => typeof id === 'string') ? value.client_ids : null;
}

async function failed(deps: SecurityJobDeps, lease: JobLease, code: string, retryable: boolean): Promise<RevocationResult> {
  if (!(await deps.jobs.fail(lease, { code, retryable }))) return 'stale';
  return retryable && lease.attempt < lease.maxAttempts ? 'retrying' : 'failed';
}

/**
 * Runs one claimed `auth0_revoke_grants` job:
 *   1. a lease that no longer holds the job (or has expired) does nothing;
 *   2. a job no hold names any more is completed as superseded without
 *      calling Auth0;
 *   3. otherwise revoke each held alias's refresh grants for every native
 *      client (configured ones plus any that held sessions), stopping at the
 *      lease deadline, then lift the holds that name this job.
 * Provider failures keep the hold: retryable ones back off, permanent ones
 * (and exhausted retries) leave a visible failed job for the runbook.
 */
export async function processRevocationJob(claimed: ClaimedJob, deps: SecurityJobDeps): Promise<RevocationResult> {
  const { lease } = claimed;
  const fromSessions = payloadClientIds(claimed.payload);
  if (!fromSessions) return failed(deps, lease, 'invalid_payload', false);
  const clientIds = [...new Set([...fromSessions, ...(deps.nativeClientIds ?? [])])].sort();
  if (clientIds.length === 0) return failed(deps, lease, 'no_client_ids', false);
  const state = await deps.security.state(lease);
  if (state === 'stale_lease') return 'stale';
  if (state === 'superseded') return (await deps.jobs.complete(lease, 'superseded')) ? 'superseded' : 'stale';
  for (const subject of await deps.security.subjects(lease)) {
    if (lease.signal.aborted) return failed(deps, lease, 'lease_expired', true);
    let outcome;
    try {
      outcome = await deps.gateway.revokeGrants(subject, clientIds, lease.signal);
    } catch {
      return failed(deps, lease, 'worker_error', true);
    }
    if (outcome.status !== 'done') return failed(deps, lease, outcome.code, outcome.status === 'retryable');
  }
  return (await deps.security.finishRevocation(lease)) === 'done' ? 'revoked' : 'stale';
}

/**
 * Runs up to `limit` revocation jobs, claiming each one only when it is about
 * to be processed, so every job gets its full lease.
 */
export async function runSecurityJobsOnce(deps: SecurityJobDeps, options: { limit?: number; leaseSeconds?: number } = {}): Promise<SecurityRunSummary> {
  const summary: SecurityRunSummary = { revoked: 0, superseded: 0, stale: 0, retrying: 0, failed: 0 };
  for (let run = 0; run < (options.limit ?? 10); run += 1) {
    const [job] = await deps.jobs.claim(['auth0_revoke_grants'], { limit: 1, leaseSeconds: options.leaseSeconds ?? 120 });
    if (!job) break;
    summary[await processRevocationJob(job, deps)] += 1;
  }
  return summary;
}
