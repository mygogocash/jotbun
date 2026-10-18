import type { Pool, PoolClient } from 'pg';

import { SECURITY_JOB_KINDS } from '../database/schema';
import { stoppedByWorker } from './job-types';
import type { ClaimedJob, JobFailure, JobKind, JobLease } from './job-types';

export type EnqueueInput = { id: string; kind: JobKind; accountId: string | null; payload: unknown; maxAttempts: number; lifecycleGeneration?: number; maxRuntimeSeconds?: number };
export type BacklogRow = { kind: string; status: string; count: number; oldestSeconds: number };

const ERROR_CODE = /^[a-z0-9_]{1,64}$/;
// Local work stops this long (at most a fifth of the lease) before the
// database lease expires, so clock skew or a slow commit cannot let two
// holders overlap. The database also refuses work on an expired lease.
const LEASE_SAFETY_MS = 5_000;

/**
 * How long local work may still run on a lease the database granted for
 * `grantedMs` (measured by the database clock) when the request was sent at
 * `sentAt` (local clock): only elapsed local time is used, so clock skew
 * between the worker and the database cannot stretch it.
 */
export function leaseBudgetMs(grantedMs: number, sentAt: number, leaseSeconds: number): number {
  return Math.max(0, grantedMs - leaseSafetyMs(leaseSeconds) - (Date.now() - sentAt));
}

/** The margin local work keeps before a `leaseSeconds` lease expires. */
export function leaseSafetyMs(leaseSeconds: number): number {
  return Math.min(LEASE_SAFETY_MS, leaseSeconds * 200);
}

type LeasedRow = { id: string; kind: JobKind; account_id: string | null; lifecycle_generation: number; payload: unknown; lease_token: string; attempts: number; max_attempts: number; lease_expires_at: Date; granted_ms: number };

/** Job failures that are the user's to act on (shown to them), not an operator's. */
export const USER_FAILURE_CODES: readonly string[] = ['export_too_large'];

/**
 * The one durable job queue (PostgreSQL, worker role only). Claims take a
 * fresh fencing token per attempt with SKIP LOCKED; every later transition
 * must present that token, so a holder whose lease expired and was reclaimed
 * can no longer complete or fail the job. Retryable failures back off
 * exponentially (30 s × 2^attempt, at most 1 h) until max attempts, then fail
 * visibly. Error codes are short identifiers, never provider text.
 *
 * Heartbeats extend a current lease, but never past attempt_started_at +
 * max_runtime_seconds, so a stuck handler cannot hold a job forever. The
 * database enforces the same protocol for every login (0009's
 * gogospend_guard_job_transition), so this class is not the only guard.
 */
export class JobRepository {
  constructor(private readonly pool: Pool) {}

  /** Idempotent by job id. */
  async enqueue(input: EnqueueInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [input.id, input.kind, input.accountId, input.lifecycleGeneration ?? 0, JSON.stringify(input.payload), input.maxAttempts, input.maxRuntimeSeconds ?? 900],
    );
  }

  async claim(kinds: readonly JobKind[], options: { limit?: number; leaseSeconds?: number } = {}): Promise<ClaimedJob[]> {
    const limit = options.limit ?? 10;
    const leaseSeconds = options.leaseSeconds ?? 120;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be 1-100');
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 3600) throw new RangeError('leaseSeconds must be 1-3600');
    // A lease that expired on its last attempt becomes a visible failure.
    await this.pool.query(
      `UPDATE jobs SET status = 'failed', last_error = 'lease_expired', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
        WHERE id IN (SELECT id FROM jobs
                      WHERE kind = ANY($1) AND status = 'leased' AND lease_expires_at <= now() AND attempts >= max_attempts
                      FOR UPDATE SKIP LOCKED)`,
      [kinds],
    );
    const sentAt = Date.now();
    const { rows } = await this.pool.query<LeasedRow>(
      `UPDATE jobs j
          SET status = 'leased', attempts = j.attempts + 1, lease_token = gen_random_uuid(), attempt_started_at = now(),
              lease_expires_at = least(now() + make_interval(secs => $3), now() + make_interval(secs => j.max_runtime_seconds)), updated_at = now()
         FROM (SELECT id FROM jobs
                WHERE kind = ANY($1)
                  AND ((status = 'queued' AND run_after <= now())
                       OR (status = 'leased' AND lease_expires_at <= now() AND attempts < max_attempts))
                ORDER BY run_after, id
                LIMIT $2
                FOR UPDATE SKIP LOCKED) picked
        WHERE j.id = picked.id
      RETURNING j.id, j.kind, j.account_id, j.lifecycle_generation, j.payload, j.lease_token, j.attempts, j.max_attempts, j.lease_expires_at,
                (extract(epoch FROM j.lease_expires_at - now()) * 1000)::float8 AS granted_ms`,
      [kinds, limit, leaseSeconds],
    );
    return rows.map((row) => ({
      kind: row.kind,
      payload: row.payload,
      lease: {
        jobId: row.id,
        accountId: row.account_id,
        lifecycleGeneration: row.lifecycle_generation,
        leaseToken: row.lease_token,
        attempt: row.attempts,
        maxAttempts: row.max_attempts,
        deadline: row.lease_expires_at.toISOString(),
        signal: AbortSignal.timeout(leaseBudgetMs(row.granted_ms, sentAt, leaseSeconds)),
      },
    }));
  }

  /**
   * True only for the current, unexpired lease holder, once. Pass `client` to complete
   * inside a caller's transaction (publication completes with its objects).
   */
  async complete(lease: JobLease, status: 'succeeded' | 'superseded' = 'succeeded', client?: PoolClient): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      `UPDATE jobs SET status = $3, lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > clock_timestamp()`,
      [lease.jobId, lease.leaseToken, status],
    );
    return rowCount === 1;
  }

  /**
   * Requeues a retryable failure with backoff, or fails terminally. True only
   * for the current, unexpired lease holder. A retryable failure recorded
   * after the worker started stopping (the lease's signal aborted with
   * WorkerStopped) was caused by the stop, not by the job: it is a release
   * (`worker_stopped`), so a handler that turns the abort into its own
   * failure code (deletion, export, snapshot, parse) spends no attempt either.
   */
  async fail(lease: JobLease, failure: JobFailure): Promise<boolean> {
    if (!ERROR_CODE.test(failure.code)) throw new RangeError('job error codes are short lowercase identifiers');
    if (failure.retryable && stoppedByWorker(lease.signal)) return this.release(lease, 'worker_stopped');
    const { rowCount } = await this.pool.query(
      `UPDATE jobs
          SET status = CASE WHEN $3 AND attempts < max_attempts THEN 'queued' ELSE 'failed' END,
              run_after = CASE WHEN $3 AND attempts < max_attempts THEN now() + make_interval(secs => least(30 * power(2, attempts), 3600)) ELSE run_after END,
              finished_at = CASE WHEN $3 AND attempts < max_attempts THEN NULL ELSE now() END,
              last_error = $4, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > clock_timestamp()`,
      [lease.jobId, lease.leaseToken, failure.retryable, failure.code],
    );
    return rowCount === 1;
  }

  /**
   * Puts a current lease's job back in the queue, due now, and gives its
   * attempt back (attempts returns to its value before this claim), so the
   * next claim is the same attempt again with a fresh token. For work that
   * stopped through no fault of the job: the worker is shutting down, or a
   * gate it needs is paused. `code` is recorded as last_error. True only for
   * the current, unexpired lease holder (0009's guard allows this one
   * decrement, for an unexpired lease, and nothing else).
   */
  async release(lease: JobLease, code = 'released'): Promise<boolean> {
    if (!ERROR_CODE.test(code)) throw new RangeError('job error codes are short lowercase identifiers');
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = 'queued', attempts = attempts - 1, run_after = now(), last_error = $3, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > clock_timestamp()`,
      [lease.jobId, lease.leaseToken, code],
    );
    return rowCount === 1;
  }

  /**
   * Puts a current lease's job back in the queue until `runAfter` (never
   * earlier than now), e.g. to wait for other publishers' deadlines. The
   * attempt this lease used still counts. True only for the current,
   * unexpired lease holder.
   */
  async defer(lease: JobLease, runAfter: Date): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = 'queued', run_after = greatest($3::timestamptz, now()), last_error = 'deferred', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > clock_timestamp()`,
      [lease.jobId, lease.leaseToken, runAfter],
    );
    return rowCount === 1;
  }

  /**
   * Extends a current lease to `leaseSeconds` from now (never shortening it),
   * capped at the attempt's runtime bound. Returns the new deadline (ISO), or null when the lease is no longer
   * held (expired, reclaimed, cancelled or finished).
   */
  async heartbeat(lease: JobLease, leaseSeconds = 30): Promise<string | null> {
    return (await this.extend(lease, leaseSeconds))?.deadline ?? null;
  }

  /** heartbeat, plus the local budget the new deadline allows (for the worker's abort timer). */
  async extend(lease: JobLease, leaseSeconds = 30): Promise<{ deadline: string; budgetMs: number } | null> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 3600) throw new RangeError('leaseSeconds must be 1-3600');
    const sentAt = Date.now();
    const { rows } = await this.pool.query<{ lease_expires_at: Date; granted_ms: number }>(
      `UPDATE jobs
          SET lease_expires_at = greatest(lease_expires_at, least(now() + make_interval(secs => $3), attempt_started_at + make_interval(secs => max_runtime_seconds))),
              updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > now()
      RETURNING lease_expires_at, (extract(epoch FROM lease_expires_at - now()) * 1000)::float8 AS granted_ms`,
      [lease.jobId, lease.leaseToken, leaseSeconds],
    );
    const row = rows[0];
    return row ? { deadline: row.lease_expires_at.toISOString(), budgetMs: leaseBudgetMs(row.granted_ms, sentAt, leaseSeconds) } : null;
  }

  /** Whether this lease still holds its job, unexpired. */
  async isHeld(lease: JobLease): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM jobs WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_expires_at > now()`,
      [lease.jobId, lease.leaseToken],
    );
    return rowCount === 1;
  }

  /**
   * Operator/worker path: cancels an account's open jobs (queued or leased),
   * fencing any holder. Security cleanup jobs are never cancelled. The app
   * path is gogospend_cancel_account_jobs (under the account lock).
   */
  async cancelAccount(accountId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
        WHERE account_id = $1 AND status IN ('queued', 'leased') AND kind <> ALL ($2)`,
      [accountId, SECURITY_JOB_KINDS],
    );
    return rowCount ?? 0;
  }

  /** Operator path: puts a terminally failed job back in the queue with a fresh attempt budget. */
  async requeue(jobId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = 'queued', attempts = 0, run_after = now(), finished_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'failed'`,
      [jobId],
    );
    return rowCount === 1;
  }

  /**
   * Counts and the oldest age of open jobs, and of jobs that failed in the
   * last 24 hours, per kind and status (no payloads). Failures the user
   * caused and was told about (USER_FAILURE_CODES) are not operator alerts.
   */
  async backlog(): Promise<BacklogRow[]> {
    const { rows } = await this.pool.query<{ kind: string; status: string; count: string; oldest_seconds: string }>(
      `SELECT kind, status, count(*) AS count, floor(extract(epoch FROM now() - min(created_at)))::bigint AS oldest_seconds
         FROM jobs
        WHERE status IN ('queued', 'leased')
           OR (status = 'failed' AND finished_at > now() - interval '24 hours' AND coalesce(last_error, '') <> ALL ($1))
        GROUP BY kind, status ORDER BY kind, status`,
      [USER_FAILURE_CODES],
    );
    return rows.map((row) => ({ kind: row.kind, status: row.status, count: Number(row.count), oldestSeconds: Number(row.oldest_seconds) }));
  }
}
