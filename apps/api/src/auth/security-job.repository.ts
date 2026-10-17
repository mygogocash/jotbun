import type { Pool } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob, JobLease } from '../jobs/job-types';
import type { IdentityMaintenanceGateway } from './auth0-management.client';

export type RevocationState = 'current' | 'superseded' | 'stale_lease';

/**
 * The security half of the worker (role gogospend_security): checks a
 * revocation job against the hold it was queued for, and lifts that hold once
 * Auth0 has confirmed. Both routines require the job's current lease token.
 */
export class SecurityJobRepository {
  constructor(private readonly pool: Pool) {}

  async state(lease: JobLease): Promise<RevocationState> {
    const { rows } = await this.pool.query<{ state: RevocationState }>('SELECT gogospend_revocation_job_is_current($1, $2) AS state', [lease.jobId, lease.leaseToken]);
    return rows[0].state;
  }

  async finishRevocation(lease: JobLease): Promise<'done' | 'stale_lease'> {
    const { rows } = await this.pool.query<{ result: 'done' | 'stale_lease' }>('SELECT gogospend_finish_revocation($1, $2) AS result', [lease.jobId, lease.leaseToken]);
    return rows[0].result;
  }
}

export type SecurityJobDeps = { jobs: JobRepository; security: SecurityJobRepository; gateway: IdentityMaintenanceGateway };
export type RevocationResult = 'revoked' | 'superseded' | 'stale' | 'retrying' | 'failed';
export type SecurityRunSummary = Record<RevocationResult, number>;

type RevocationPayload = { generation: number; principals: { issuer: string; subject: string }[]; client_ids: string[] };

function parsePayload(payload: unknown): RevocationPayload | null {
  const value = payload as Partial<RevocationPayload> | null;
  if (!value || !Number.isInteger(value.generation)) return null;
  if (!Array.isArray(value.principals) || value.principals.length === 0) return null;
  if (!value.principals.every((p) => typeof p?.issuer === 'string' && typeof p.subject === 'string')) return null;
  if (!Array.isArray(value.client_ids) || !value.client_ids.every((id) => typeof id === 'string')) return null;
  return value as RevocationPayload;
}

async function failed(deps: SecurityJobDeps, lease: JobLease, code: string, retryable: boolean): Promise<RevocationResult> {
  if (!(await deps.jobs.fail(lease, { code, retryable }))) return 'stale';
  return retryable && lease.attempt < lease.maxAttempts ? 'retrying' : 'failed';
}

/**
 * Runs one claimed `auth0_revoke_grants` job:
 *   1. a lease that no longer holds the job does nothing at all;
 *   2. a job whose hold was taken over by a newer logout (or deletion) is
 *      marked superseded without calling Auth0, so it cannot revoke grants
 *      issued after a later cleanup;
 *   3. otherwise revoke each alias's refresh grants, aborting at the lease
 *      deadline, then lift this generation's hold.
 * Provider failures keep the hold: retryable ones back off, permanent ones
 * (and exhausted retries) leave a visible failed job for the runbook.
 */
export async function processRevocationJob(claimed: ClaimedJob, deps: SecurityJobDeps): Promise<RevocationResult> {
  const { lease } = claimed;
  const payload = parsePayload(claimed.payload);
  if (!payload) return failed(deps, lease, 'invalid_payload', false);
  const state = await deps.security.state(lease);
  if (state === 'stale_lease') return 'stale';
  if (state === 'superseded') return (await deps.jobs.complete(lease, 'superseded')) ? 'superseded' : 'stale';
  for (const principal of payload.principals) {
    if (lease.signal.aborted) return 'stale';
    let outcome;
    try {
      outcome = await deps.gateway.revokeGrants(principal.subject, payload.client_ids, lease.signal);
    } catch {
      return failed(deps, lease, 'worker_error', true);
    }
    if (outcome.status !== 'done') return failed(deps, lease, outcome.code, outcome.status === 'retryable');
  }
  return (await deps.security.finishRevocation(lease)) === 'done' ? 'revoked' : 'stale';
}

/** Claims and runs one batch of revocation jobs. */
export async function runSecurityJobsOnce(deps: SecurityJobDeps, options: { limit?: number; leaseSeconds?: number } = {}): Promise<SecurityRunSummary> {
  const summary: SecurityRunSummary = { revoked: 0, superseded: 0, stale: 0, retrying: 0, failed: 0 };
  const claimed = await deps.jobs.claim(['auth0_revoke_grants'], { limit: options.limit ?? 10, leaseSeconds: options.leaseSeconds ?? 120 });
  for (const job of claimed) summary[await processRevocationJob(job, deps)] += 1;
  return summary;
}
