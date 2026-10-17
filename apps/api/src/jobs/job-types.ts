// Server-only job contract (master plan). F6a defines it; P1 extends the
// repository without changing these fields.
/** A job kind: a lowercase identifier (`auth0_revoke_grants`, `sync_snapshot`, ...). */
export type JobKind = string;

export type JobLease = {
  jobId: string;
  /** Null for jobs that outlive their account (provider cleanup after deletion). */
  accountId: string | null;
  lifecycleGeneration: number;
  /** Fencing token: every transition must present it. */
  leaseToken: string;
  attempt: number;
  /** A failure on this attempt is terminal when attempt >= maxAttempts. */
  maxAttempts: number;
  /** ISO time the lease expires; work must stop by then. */
  deadline: string;
  /** Aborts at the deadline. */
  signal: AbortSignal;
};

export type ClaimedJob = { lease: JobLease; kind: JobKind; payload: unknown };

/** Retryable failures are requeued with backoff until max attempts; others fail terminally. */
export type JobFailure = { code: string; retryable: boolean };
