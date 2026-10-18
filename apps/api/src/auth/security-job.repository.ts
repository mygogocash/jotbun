import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import { assertLoginRoles } from '../jobs/worker-login';
import type { ClaimedJob, JobLease } from '../jobs/job-types';
import type { IdentityMaintenanceGateway } from './auth0-management.client';
import { LinkForbiddenError, LinkRefusedError, ProfileUnavailableError } from './auth0-profile.client';
import type { Auth0LinkGateway } from './auth0-profile.client';

export type RevocationState = 'current' | 'superseded' | 'stale_lease';

/** An identity with a live session, and the last credential change applied to its account. */
export type ReconcileCandidate = { issuer: string; subject: string; credentialsChangedAt: Date | null };
export type ReconcileOutcome = 'checked' | 'applied' | 'duplicate' | 'superseded' | 'no_account' | 'conflict' | 'invalid_time' | 'stale_lease';

// A provider time is used only if it is a real instant from this century and
// not ahead of now by more than clock skew; anything else counts as unknown.
const EARLIEST_CHANGE = Date.parse('2000-01-01T00:00:00Z');
const FUTURE_SKEW_MS = 60_000;

export function usableChangeTime(value: string | null, nowMs: number = Date.now()): Date | null {
  if (value === null) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at < EARLIEST_CHANGE || at > nowMs + FUTURE_SKEW_MS) return null;
  return new Date(at);
}

export const RECONCILE_KIND = 'auth0_security_reconcile';
export const LINK_KIND = 'auth0_link_identities';

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

  /** F6c: the primary and linked Auth0 subjects of a current merge lease; empty when either is no longer an alias. */
  async linkSubjects(lease: JobLease): Promise<{ primary: string; secondary: string } | null> {
    const { rows } = await this.pool.query<{ primary_subject: string; secondary_subject: string }>(
      'SELECT primary_subject, secondary_subject FROM gogospend_link_job_subjects($1, $2)',
      [lease.jobId, lease.leaseToken],
    );
    return rows[0] ? { primary: rows[0].primary_subject, secondary: rows[0].secondary_subject } : null;
  }

  /** Queues one reconciliation pass unless one is open or was queued within `everySeconds`. */
  async scheduleReconcile(jobId: string, everySeconds: number): Promise<boolean> {
    const { rows } = await this.pool.query<{ queued: boolean }>('SELECT gogospend_schedule_security_reconcile($1, $2) AS queued', [jobId, everySeconds]);
    return rows[0].queued;
  }

  /** The least recently checked identities with a live session (current lease only). */
  async reconcileCandidates(lease: JobLease, limit: number): Promise<ReconcileCandidate[]> {
    const { rows } = await this.pool.query<{ issuer: string; subject: string; credentials_changed_at: Date | null }>(
      'SELECT issuer, subject, credentials_changed_at FROM gogospend_reconcile_candidates($1, $2, $3)',
      [lease.jobId, lease.leaseToken, limit],
    );
    return rows.map((row) => ({ issuer: row.issuer, subject: row.subject, credentialsChangedAt: row.credentials_changed_at }));
  }

  /** Marks the identity checked and applies a credential change Auth0 reports (null: none). */
  async reconcileIdentity(lease: JobLease, candidate: ReconcileCandidate, changedAt: Date | null, newJobId: string): Promise<ReconcileOutcome> {
    const { rows } = await this.pool.query<{ outcome: ReconcileOutcome }>(
      'SELECT gogospend_reconcile_identity($1, $2, $3, $4, $5, $6) AS outcome',
      [lease.jobId, lease.leaseToken, candidate.issuer, candidate.subject, changedAt, newJobId],
    );
    return rows[0].outcome;
  }
}

export type SecurityJobDeps = {
  jobs: JobRepository;
  security: SecurityJobRepository;
  gateway: IdentityMaintenanceGateway;
  /** The native Auth0 client ids (AUTH0_ALLOWED_CLIENT_IDS) whose refresh grants are revoked. */
  nativeClientIds?: readonly string[];
  /** Reconciliation of lost password-change events: how often a pass is queued, and identities per pass. */
  reconcile?: { everySeconds: number; batch: number };
  /** F6c: the profile/link client; without it merge jobs stay queued (visible) until it is configured. */
  linker?: Auth0LinkGateway;
  newId?: () => string;
  /**
   * The worker's stop (SIGTERM). Once aborted no further job is claimed; the
   * job in hand finishes (its provider calls are bounded), so a stop never
   * fails or spends a security job's attempt.
   */
  stop?: AbortSignal;
};
export type RevocationResult = 'revoked' | 'superseded' | 'stale' | 'retrying' | 'failed';
export type ReconcileResult = 'reconciled' | 'stale' | 'retrying' | 'failed';
export type SecurityRunSummary = Record<RevocationResult, number> & { reconciled: number; linked: number };

function payloadClientIds(payload: unknown): string[] | null {
  const value = payload as { generation?: unknown; client_ids?: unknown } | null;
  if (!value || !Number.isInteger(value.generation) || !Array.isArray(value.client_ids)) return null;
  return value.client_ids.every((id): id is string => typeof id === 'string') ? value.client_ids : null;
}

async function failed(deps: SecurityJobDeps, lease: JobLease, code: string, retryable: boolean): Promise<'stale' | 'retrying' | 'failed'> {
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
 * One reconciliation pass: asks Auth0 for the last password change of the
 * longest-waiting identities that still have a live session, and applies any
 * change newer than the account's last one exactly as a verified event would.
 * It covers events that were lost; its bound is documented in the runbook.
 * One identity cannot stop the pass: an unusable time counts as unknown and a
 * permanent refusal for that identity is skipped (both are marked checked). A
 * provider outage keeps sessions as they are and retries the pass - it never
 * guesses.
 */
export async function processReconcileJob(claimed: ClaimedJob, deps: SecurityJobDeps): Promise<ReconcileResult> {
  const { lease } = claimed;
  const newId = deps.newId ?? randomUUID;
  for (const candidate of await deps.security.reconcileCandidates(lease, deps.reconcile?.batch ?? 200)) {
    if (lease.signal.aborted) return failed(deps, lease, 'lease_expired', true);
    let state;
    try {
      state = await deps.gateway.credentialState(candidate.subject, lease.signal);
    } catch {
      return failed(deps, lease, 'worker_error', true);
    }
    if (state.status === 'retryable') return failed(deps, lease, state.code, true);
    const changedAt = state.status === 'done' ? usableChangeTime(state.lastPasswordReset) : null;
    if ((await deps.security.reconcileIdentity(lease, candidate, changedAt, newId())) === 'stale_lease') return 'stale';
  }
  return (await deps.jobs.complete(lease, 'succeeded')) ? 'reconciled' : 'stale';
}

/**
 * F6c: merges a linked identity into the primary Auth0 user. The database
 * already made it an alias, so either login reaches the account meanwhile.
 * A job whose identities are no longer both aliases is superseded. Auth0
 * outages (incl. 401/429/5xx) retry; a missing scope (403) or a refusal fails
 * visibly for the runbook - the database link stays in force either way.
 */
export async function processLinkJob(claimed: ClaimedJob, linker: Auth0LinkGateway, deps: SecurityJobDeps): Promise<'linked' | 'superseded' | 'stale' | 'retrying' | 'failed'> {
  const { lease } = claimed;
  const subjects = await deps.security.linkSubjects(lease);
  if (!subjects) return (await deps.jobs.complete(lease, 'superseded')) ? 'superseded' : 'stale';
  if (lease.signal.aborted) return failed(deps, lease, 'lease_expired', true);
  try {
    await linker.link(subjects.primary, subjects.secondary);
  } catch (error) {
    if (error instanceof ProfileUnavailableError) return failed(deps, lease, 'provider_unavailable', true);
    if (error instanceof LinkForbiddenError) return failed(deps, lease, 'provider_forbidden', false);
    if (error instanceof LinkRefusedError) return failed(deps, lease, 'provider_rejected', false);
    return failed(deps, lease, 'worker_error', true);
  }
  return (await deps.jobs.complete(lease, 'succeeded')) ? 'linked' : 'stale';
}

/**
 * Runs up to `limit` revocation jobs, claiming each one only when it is about
 * to be processed, so every job gets its full lease; then queues and runs a
 * reconciliation pass when one is due.
 */
export async function runSecurityJobsOnce(deps: SecurityJobDeps, options: { limit?: number; leaseSeconds?: number } = {}): Promise<SecurityRunSummary> {
  const summary: SecurityRunSummary = { revoked: 0, superseded: 0, stale: 0, retrying: 0, failed: 0, reconciled: 0, linked: 0 };
  const stopped = () => deps.stop?.aborted === true;
  for (let run = 0; run < (options.limit ?? 10) && !stopped(); run += 1) {
    const [job] = await deps.jobs.claim(['auth0_revoke_grants'], { limit: 1, leaseSeconds: options.leaseSeconds ?? 120 });
    if (!job) break;
    summary[await processRevocationJob(job, deps)] += 1;
  }
  if (deps.linker) {
    for (let run = 0; run < (options.limit ?? 10) && !stopped(); run += 1) {
      const [job] = await deps.jobs.claim([LINK_KIND], { limit: 1, leaseSeconds: options.leaseSeconds ?? 120 });
      if (!job) break;
      summary[await processLinkJob(job, deps.linker, deps)] += 1;
    }
  }
  if (deps.reconcile && !stopped()) {
    await deps.security.scheduleReconcile((deps.newId ?? randomUUID)(), deps.reconcile.everySeconds);
    const [job] = await deps.jobs.claim([RECONCILE_KIND], { limit: 1, leaseSeconds: options.leaseSeconds ?? 120 });
    if (job) {
      const result = await processReconcileJob(job, deps);
      if (result === 'reconciled') summary.reconciled += 1;
      else summary[result] += 1;
    }
  }
  return summary;
}
