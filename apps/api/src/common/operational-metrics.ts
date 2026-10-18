import type { LoggerService } from '@nestjs/common';
import type { Pool } from 'pg';

import { ConfigurationError } from './configuration-error';
import { writeLog } from './safe-request-logger';

/**
 * Release alert thresholds (P6b; docs/operations/release.md and incident.md).
 * The API and workers emit the queue-age and deletion lines themselves; the
 * backup age comes from the operator's recovery inventory (never the API),
 * and the cost envelope and log retention are provider settings, recorded
 * here so the documents and code share one set of numbers. Billing alerts
 * are not caps.
 */
export const OPERATIONAL_THRESHOLDS = Object.freeze({
  /** Oldest due job waiting longer than this raises `alert queue_age`. */
  queueAgeSeconds: 300,
  /** Newest backup older than this raises an alert (recovery inventory). */
  backupAgeHours: 26,
  /** A deletion open longer than this is at risk of the 24-hour target (deletion worker). */
  deletionOpenHours: 20,
  /** The monthly operating envelope, in US dollars; alerts at these shares of it. */
  costEnvelopeUsd: 100,
  costAlertPercents: Object.freeze([50, 80, 100]),
  /** Redacted operational logs are kept this long, then deleted. */
  logRetentionDays: 7,
});

const MAX_SAFE_TEXT = 300;
// Anything that looks like a credential, a connection string, an identifier
// of a person or account, or a money value is withheld. Only a
// ConfigurationError's message is ever a candidate (fixed text written in
// this repository); this filter is a second line behind that rule.
const UNSAFE_PATTERNS: readonly RegExp[] = [
  /[\u0000-\u001f\u007f]/, // control characters (log injection)
  /:\/\//, // URLs and connection strings
  /@/, // userinfo, e-mail addresses
  /\bbearer\b|\beyJ[A-Za-z0-9_-]/i, // bearer tokens, JWTs
  /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]/i, // key=value credentials
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUIDs (account, job, subject ids)
  /[0-9a-f]{32,}/i, // hex keys and digests
  /\d{5,}/, // satang amounts, ports, ids
  /\d[\d,]*\.\d{1,2}\b/, // decimal amounts
  /\d{1,3}(?:,\d{3})+/, // grouped amounts
  /฿|\bTHB\b|\bbaht\b|\bsatang\b/i, // currency
];

/** Base64/base64url-shaped runs that mix upper case, lower case and digits (random secrets). */
function hasSecretShapedRun(text: string): boolean {
  for (const run of text.match(/[A-Za-z0-9+/=_-]{16,}/g) ?? []) {
    if (/[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run)) return true;
  }
  return false;
}

/** True when `text` may appear in an operational log line. */
export function isSafeOperationalText(text: string): boolean {
  if (text.length === 0 || text.length > MAX_SAFE_TEXT) return false;
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return !hasSecretShapedRun(text);
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// SQLSTATE (5 characters), Node system errors (ECONNREFUSED) and Node codes (ERR_…).
const SAFE_CODE = /^(?:[0-9A-Z]{5}|E[A-Z0-9_]{2,40}|ERR_[A-Z0-9_]{1,60})$/;

/**
 * A short failure description for operational logs: the error class name;
 * for driver and system errors (anything carrying a `code`) the code as
 * well. A message is printed only for a ConfigurationError (fixed setting
 * names and ranges), and only when it also passes isSafeOperationalText;
 * any other error's message - which may echo hosts, inputs, amounts or
 * credentials - is never printed, whatever it looks like.
 * `withMessage: false` (worker loops) never includes a message at all.
 */
export function describeFailure(error: unknown, options: { withMessage?: boolean } = {}): string {
  if (!(error instanceof Error)) return 'unknown error';
  const name = SAFE_NAME.test(error.name) ? error.name : 'Error';
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) return typeof code === 'string' && SAFE_CODE.test(code) ? `${name} ${code}` : name;
  if (options.withMessage === false || !(error instanceof ConfigurationError)) return name;
  const message = typeof error.message === 'string' ? error.message : '';
  return isSafeOperationalText(message) ? `${name}: ${message}` : `${name} (message withheld)`;
}

/** describeFailure without any message: for failures inside worker loops. */
export const failureName = (error: unknown): string => describeFailure(error, { withMessage: false });

export type QueueAge = { kind: string; due: number; oldestDueSeconds: number };

/**
 * Per kind, the jobs that are due and not running - queued with `run_after`
 * passed, or leased with an expired lease (a crashed worker) - and how long
 * the oldest has waited (since `run_after`, or since its lease expired).
 * Jobs scheduled for later (retry backoff, a 24-hour expiry) are not waiting.
 * Runs as the worker's own login, so RLS limits it to the kinds that login
 * may see (security kinds only for gogospend_security).
 */
export async function queueAge(pool: Pick<Pool, 'query'>, kinds: readonly string[]): Promise<QueueAge[]> {
  if (kinds.length === 0) return [];
  const { rows } = await pool.query<{ kind: string; due: string; oldest_due_seconds: string }>(
    `SELECT kind, count(*) AS due,
            greatest(0, floor(extract(epoch FROM now() - min(CASE WHEN status = 'queued' THEN run_after ELSE lease_expires_at END))))::bigint AS oldest_due_seconds
       FROM jobs
      WHERE kind = ANY($1)
        AND ((status = 'queued' AND run_after <= now()) OR (status = 'leased' AND lease_expires_at <= now()))
      GROUP BY kind
      ORDER BY kind`,
    [kinds],
  );
  return rows.map((row) => ({ kind: row.kind, due: Number(row.due), oldestDueSeconds: Number(row.oldest_due_seconds) }));
}

/**
 * How often every worker reports its queue (the heartbeat line and `alert
 * queue_age`), on a timer of its own: a report behind a 15-minute sweep
 * could raise the 5-minute queue-age alert up to 15 minutes late.
 */
export const QUEUE_REPORT_INTERVAL_MS = 60_000;

/**
 * Runs `report` now and then every `intervalMs` (an unref'd timer), skipping
 * a tick while the previous report still runs. `report` handles its own
 * errors. The returned stop function clears the timer and resolves once a
 * report in progress has finished, so the caller can then end its pool.
 */
export function startQueueReports(report: () => Promise<void>, intervalMs: number = QUEUE_REPORT_INTERVAL_MS): () => Promise<void> {
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = report()
      .catch(() => undefined)
      .finally(() => {
        running = undefined;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}

const KIND = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * One summary line per report, and one alert line per kind whose oldest due
 * job has waited longer than the threshold. Kinds, counts and seconds only.
 */
export function queueAgeLines(worker: string, rows: readonly QueueAge[], thresholdSeconds: number = OPERATIONAL_THRESHOLDS.queueAgeSeconds): { info: string[]; alerts: string[] } {
  const safe = rows.filter((row) => KIND.test(row.kind));
  const due = safe.reduce((sum, row) => sum + row.due, 0);
  const oldest = safe.reduce((max, row) => Math.max(max, row.oldestDueSeconds), 0);
  return {
    info: [`${worker}: queue due=${due} oldest_due_seconds=${oldest}`],
    alerts: safe
      .filter((row) => row.oldestDueSeconds > thresholdSeconds)
      .map((row) => `${worker}: alert queue_age kind=${row.kind} due=${row.due} oldest_due_seconds=${row.oldestDueSeconds} threshold_seconds=${thresholdSeconds}`),
  };
}

const CONTEXT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Nest's own logger for the v1 API: errors and warnings become one JSON line
 * each (`source: "nest"`): an error object as describeFailure prints it, a
 * string message as "(message withheld)", never a stack trace; everything
 * else is dropped. Without it, Nest's
 * ExceptionHandler prints a failing provider's raw error and stack at
 * startup, outside the redaction rules.
 */
export class OperationalLogger implements LoggerService {
  constructor(private readonly write: (entry: Record<string, unknown>) => void = writeLog) {}

  log(_message?: unknown, ..._rest: unknown[]): void {}

  debug(_message?: unknown, ..._rest: unknown[]): void {}

  verbose(_message?: unknown, ..._rest: unknown[]): void {}

  error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }

  private emit(level: 'error' | 'warn', message: unknown, rest: unknown[]): void {
    const last = rest[rest.length - 1];
    const context = typeof last === 'string' && CONTEXT.test(last) ? last : undefined;
    // Nest's string messages can quote provider and request values: never printed.
    const text = message instanceof Error ? describeFailure(message) : '(message withheld)';
    this.write({ level, source: 'nest', ...(context ? { context } : {}), message: text });
  }
}
