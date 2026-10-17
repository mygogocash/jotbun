import type { Pool } from 'pg';

import type { ClaimedJob, JobFailure, JobKind, JobLease } from './job-types';

export type EnqueueInput = { id: string; kind: JobKind; accountId: string | null; payload: unknown; maxAttempts: number; lifecycleGeneration?: number };

const ERROR_CODE = /^[a-z0-9_]{1,64}$/;
// Local work stops this long (at most a fifth of the lease) before the
// database lease expires, so clock skew or a slow commit cannot let two
// holders overlap. The database also refuses work on an expired lease.
const LEASE_SAFETY_MS = 5_000;

type LeasedRow = { id: string; kind: JobKind; account_id: string | null; lifecycle_generation: number; payload: unknown; lease_token: string; attempts: number; max_attempts: number; lease_expires_at: Date };

/**
 * The one durable job queue (PostgreSQL, worker role only). Claims take a
 * fresh fencing token per attempt with SKIP LOCKED; every later transition
 * must present that token, so a holder whose lease expired and was reclaimed
 * can no longer complete or fail the job. Retryable failures back off
 * exponentially (30 s × 2^attempt, at most 1 h) until max attempts, then fail
 * visibly. Error codes are short identifiers, never provider text.
 */
export class JobRepository {
  constructor(private readonly pool: Pool) {}

  /** Idempotent by job id. */
  async enqueue(input: EnqueueInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [input.id, input.kind, input.accountId, input.lifecycleGeneration ?? 0, JSON.stringify(input.payload), input.maxAttempts],
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
    const claimedAt = Date.now();
    const { rows } = await this.pool.query<LeasedRow>(
      `UPDATE jobs j
          SET status = 'leased', attempts = j.attempts + 1, lease_token = gen_random_uuid(),
              lease_expires_at = now() + make_interval(secs => $3), updated_at = now()
         FROM (SELECT id FROM jobs
                WHERE kind = ANY($1)
                  AND ((status = 'queued' AND run_after <= now())
                       OR (status = 'leased' AND lease_expires_at <= now() AND attempts < max_attempts))
                ORDER BY run_after, id
                LIMIT $2
                FOR UPDATE SKIP LOCKED) picked
        WHERE j.id = picked.id
      RETURNING j.id, j.kind, j.account_id, j.lifecycle_generation, j.payload, j.lease_token, j.attempts, j.max_attempts, j.lease_expires_at`,
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
        signal: AbortSignal.timeout(Math.max(0, leaseSeconds * 1000 - Math.min(LEASE_SAFETY_MS, leaseSeconds * 200) - (Date.now() - claimedAt))),
      },
    }));
  }

  /** True only for the current lease holder, once. */
  async complete(lease: JobLease, status: 'succeeded' | 'superseded' = 'succeeded'): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = $3, lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2`,
      [lease.jobId, lease.leaseToken, status],
    );
    return rowCount === 1;
  }

  /** Requeues a retryable failure with backoff, or fails terminally. True only for the current lease holder. */
  async fail(lease: JobLease, failure: JobFailure): Promise<boolean> {
    if (!ERROR_CODE.test(failure.code)) throw new RangeError('job error codes are short lowercase identifiers');
    const { rowCount } = await this.pool.query(
      `UPDATE jobs
          SET status = CASE WHEN $3 AND attempts < max_attempts THEN 'queued' ELSE 'failed' END,
              run_after = CASE WHEN $3 AND attempts < max_attempts THEN now() + make_interval(secs => least(30 * power(2, attempts), 3600)) ELSE run_after END,
              finished_at = CASE WHEN $3 AND attempts < max_attempts THEN NULL ELSE now() END,
              last_error = $4, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND status = 'leased' AND lease_token = $2`,
      [lease.jobId, lease.leaseToken, failure.retryable, failure.code],
    );
    return rowCount === 1;
  }
}
