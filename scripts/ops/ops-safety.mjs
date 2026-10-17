// Shared safety rules for the recovery tooling (P6a). Every failure is an
// OpsError with a fixed code and a fixed message. Details hold only counts,
// booleans, dates and short identifiers that pass a strict pattern, so no
// connection string, key, tool output, subject or row value can reach an
// error, a log line or a receipt, whatever an adapter throws.
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const RETENTION_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

export const MESSAGES = Object.freeze({
  ARGUMENT_REFUSED: 'An unknown or secret-bearing argument was refused. Secrets come only from a file descriptor or managed configuration.',
  ATTACHMENT_COPY_FAILED: 'The accepted-attachment copy failed; no partial copy was kept.',
  ATTACHMENT_REFERENCES_MISSING: 'A retained attachment reference has no object in the recovery copy; the restore cannot serve.',
  ATTACHMENT_VALIDATOR_MISSING: 'The restored schema has attachment tables but no reference check was supplied.',
  BACKUP_DUMP_FAILED: 'The logical dump failed; no partial copy was kept.',
  BACKUP_EXPIRED: 'The selected backup is past its 7-day expiry.',
  BACKUP_INTEGRITY: 'The backup failed authentication or is incomplete.',
  BACKUP_MISSING: 'No usable backup was found.',
  ERASURE_MARKER_INVALID: 'An erasure marker has an unexpected shape.',
  ERASURE_NOT_APPLIED: 'Rows owned by erased accounts remain after reapplying erasure markers.',
  ERASURE_REGISTRY_MISSING: 'No independent erasure registry was supplied.',
  ERASURE_REGISTRY_NOT_INDEPENDENT: 'The erasure registry is not independent of the backup being restored.',
  ERASURE_REGISTRY_UNAVAILABLE: 'The erasure registry could not be read completely.',
  HOSTED_ADAPTER_NOT_AUTHORIZED: 'Hosted recovery adapters are not configured (E1 not authorized); recorded as SKIPPED.',
  INTERNAL: 'The recovery operation failed.',
  INVENTORY_SOURCE_FAILED: 'A recovery inventory source failed; the inventory is incomplete.',
  KEY_SOURCE_PLAINTEXT_FILE: 'Key material must not come from an ordinary file; use a pipe or managed configuration.',
  LOCAL_DATABASE_UNAVAILABLE: 'The local PostgreSQL on 127.0.0.1:55432 is unreachable; start it with `npm run db:v1:up`.',
  REHEARSAL_CHECK_FAILED: 'A rehearsal check did not hold.',
  NON_PRODUCTION_REAL_DATA: 'Non-production recovery copies must contain synthetic data only.',
  RECOVERY_KEY_CUSTODY_MISSING: 'No recovery key custody was supplied.',
  RECOVERY_KEY_INVALID: 'The recovery key is not a 32-byte key.',
  RECOVERY_KEY_MISMATCH: 'The recovery key does not match the backup.',
  RECOVERY_STORE_NOT_ISOLATED: 'The recovery store must be an owner-only directory outside the repository.',
  REGISTRY_KEY_CUSTODY_MISSING: 'The erasure registry lookup key is not available.',
  REGISTRY_KEY_MISMATCH: 'Erasure markers were made with a different lookup key.',
  RESTORE_FAILED: 'The private restore failed; the target was dropped.',
  RESTORE_LEDGER_MISSING: 'Restore-created copies must be recorded in the recovery inventory.',
  RESTORE_TARGET_EXISTS: 'The restore target already exists; restores never overwrite.',
  RESTORE_TARGET_NOT_ISOLATED: 'The restore target is not a private, isolated, disposable target.',
  RESTORE_TARGET_PRODUCTION: 'The restore target is production.',
  RESTORE_TARGET_SERVING: 'The restore target serves traffic.',
  RETENTION_EXCEEDS_LIMIT: 'Recovery copies may be kept for at most 7 days.',
  RETENTION_VIOLATION: 'A recoverable copy breaks the 7-day retention rule.',
});

const SAFE_TEXT = /^[A-Za-z0-9_.-]{1,96}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function safeValue(value, depth) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'string') return SAFE_TEXT.test(value) || ISO_DATE.test(value) ? value : '[redacted]';
  if (Array.isArray(value) && depth < 3) return value.slice(0, 50).map((entry) => safeValue(entry, depth + 1));
  if (value && typeof value === 'object' && depth < 3 && Object.getPrototypeOf(value) === Object.prototype) {
    return safeDetails(value, depth + 1);
  }
  return '[redacted]';
}

/** Keeps plain keys and safe values only. */
export function safeDetails(details = {}, depth = 0) {
  const result = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (/^[a-z][a-z0-9_]{0,40}$/.test(key) && value !== undefined) result[key] = safeValue(value, depth);
  }
  return result;
}

export class OpsError extends Error {
  constructor(code, details) {
    const known = Object.hasOwn(MESSAGES, code) ? code : 'INTERNAL';
    super(`${known}: ${MESSAGES[known]}`);
    this.name = 'OpsError';
    this.code = known;
    this.details = Object.freeze(safeDetails(details));
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

/** Never wraps or chains the original error: its text may hold secrets. */
export function asOpsError(error, fallback) {
  return error instanceof OpsError ? error : new OpsError(fallback);
}

/** A structured log whose fields pass the same filter as error details. */
export function createOpsLog(write = (line) => process.stderr.write(`${line}\n`)) {
  return {
    event(name, fields = {}) {
      write(JSON.stringify({ at: new Date().toISOString(), event: SAFE_TEXT.test(name) ? name : 'event', ...safeDetails(fields) }));
    },
  };
}

export const silentLog = Object.freeze({ event() {} });

export function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

export function isoDate(value) {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' && ISO_DATE.test(value) ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Flags and values a CLI must never accept: secrets come from fds/managed config. */
const SECRET_FLAG = /^--?(key|password|passwd|secret|token|database-url|db-url|dsn|url|connection|conn|access-key|secret-access-key|private-key|pgpassword)(=|$)/i;

/**
 * Parses `--name value` / `--flag` pairs against an allow-list. Unknown or
 * secret-bearing arguments are refused without echoing them.
 */
export function parseArgs(argv, spec) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (SECRET_FLAG.test(arg) || /:\/\/[^/\s]*@/.test(arg)) throw new OpsError('ARGUMENT_REFUSED');
    const name = /^--([a-z][a-z0-9-]*)$/.exec(arg)?.[1];
    if (!name || !Object.hasOwn(spec, name)) throw new OpsError('ARGUMENT_REFUSED');
    if (spec[name] === 'flag') {
      result[name] = true;
      continue;
    }
    const value = argv[index + 1];
    index += 1;
    if (value === undefined || !spec[name].test(value)) throw new OpsError('ARGUMENT_REFUSED');
    result[name] = value;
  }
  return result;
}

/** Runs a CLI body; prints only codes. Exit 2 refused, 3 SKIPPED (hosted), 1 failed. */
export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    const failure = asOpsError(error, 'INTERNAL');
    process.stderr.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = failure.code === 'ARGUMENT_REFUSED' ? 2 : failure.code === 'HOSTED_ADAPTER_NOT_AUTHORIZED' ? 3 : 1;
  }
}
