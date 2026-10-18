// Readiness receipt rules (P6b), shared by the API's `/ready` check
// (health.service.ts) and the operator's release preflight (the ops
// readiness-receipts script, which loads this file through Node's type
// stripping; docs/operations/release.md). Keep it free of imports and of
// TypeScript-only runtime syntax (enums, parameter properties, decorators).

/**
 * Release receipts the API needs before it reports ready. Each is the
 * redacted outcome of a hosted gate, recorded by operations:
 *
 * - `restore_rehearsal`: P6a's hosted restore rehearsal
 *   (`restore-rehearsal.mjs --target isolated-synthetic`: restore, erasure
 *   reapplied, attachments resolved) - a local rehearsal never counts;
 * - `storage_contract`: P1's hosted gate, `STORAGE_CONTRACT_TARGET=r2-test
 *   npm run test:storage-contract -w gogospend-api`.
 *
 * The JSON is an object keyed by receipt kind:
 *
 *   { "restore_rehearsal": { "status": "passed", "recorded_at": ISO,
 *       "valid_until": ISO, "target": "isolated-synthetic",
 *       "evidence_sha256": "<SHA-256 of the stored redacted receipt>" }, … }
 *
 * See docs/implementation/beta-receipts.md for how each is produced.
 */
export const MANDATORY_RECEIPTS = ['restore_rehearsal', 'storage_contract'] as const;
export type ReceiptKind = (typeof MANDATORY_RECEIPTS)[number];
/** The hosted targets whose receipts count; a local or other target never makes the API ready. */
export const RECEIPT_TARGETS: Readonly<Record<ReceiptKind, readonly string[]>> = {
  restore_rehearsal: ['isolated-synthetic'],
  storage_contract: ['r2-test'],
};
/** A receipt is valid for at most this long after it was recorded (rehearse at least monthly). */
export const RECEIPT_MAX_VALIDITY_DAYS = 31;
/** The API logs `receipt_expiring` this long before a passed receipt expires. */
export const RECEIPT_EXPIRY_WARNING_DAYS = 7;
export type ReceiptState = 'passed' | 'missing' | 'failed' | 'expired' | 'invalid';
/** Raw entries by kind; each is evaluated at check time (expiry depends on the clock). */
export type ReadinessReceipts = Partial<Record<ReceiptKind, unknown>>;

export function isReceiptKind(value: string): value is ReceiptKind {
  return (MANDATORY_RECEIPTS as readonly string[]).includes(value);
}

const RECEIPT_KEYS = ['evidence_sha256', 'recorded_at', 'status', 'target', 'valid_until'];
const CLOCK_SKEW_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The time of an ISO 8601 UTC timestamp written exactly as `toISOString()`
 * prints it (milliseconds may be left out when they are zero), or NaN. The
 * round trip rejects what Date.parse quietly normalizes: hour 24, day 31 of
 * a 30-day month, February 30.
 */
function exactUtc(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return NaN;
  const canonical = new Date(time).toISOString();
  return value === canonical || value === canonical.replace(/\.000Z$/, 'Z') ? time : NaN;
}

/**
 * The state of one mandatory receipt at `now`. A receipt is an attestation
 * that is checked for format and time only - exact fields, a hosted target, a
 * well-formed (and not all-zero) evidence digest, real timestamps, at most 31
 * days of validity - not proof: whoever writes READINESS_RECEIPTS vouches
 * for the evidence it names.
 */
export function receiptState(kind: ReceiptKind, entry: unknown, now: Date): ReceiptState {
  if (entry === undefined) return 'missing';
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'invalid';
  const value = entry as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== RECEIPT_KEYS.join(',')) return 'invalid';
  const { status, recorded_at: recordedAt, valid_until: validUntil, target, evidence_sha256: evidence } = value;
  if (status !== 'passed' && status !== 'failed') return 'invalid';
  if (typeof target !== 'string' || !RECEIPT_TARGETS[kind].includes(target)) return 'invalid';
  if (typeof evidence !== 'string' || !/^[0-9a-f]{64}$/.test(evidence) || /^0+$/.test(evidence)) return 'invalid';
  const recorded = exactUtc(recordedAt);
  const until = exactUtc(validUntil);
  if (!Number.isFinite(recorded) || !Number.isFinite(until) || until <= recorded) return 'invalid';
  if (recorded > now.getTime() + CLOCK_SKEW_MS) return 'invalid';
  if (until - recorded > RECEIPT_MAX_VALIDITY_DAYS * DAY_MS) return 'invalid';
  if (status === 'failed') return 'failed';
  return now.getTime() < until ? 'passed' : 'expired';
}

export type ReceiptExpiry = { kind: ReceiptKind; hoursLeft: number };

/** Hours until a passed receipt's `valid_until` (rounded down), or null when it is not passed. */
function validHours(kind: ReceiptKind, entry: unknown, now: Date): number | null {
  if (receiptState(kind, entry, now) !== 'passed') return null;
  return Math.floor((exactUtc((entry as { valid_until: string }).valid_until) - now.getTime()) / HOUR_MS);
}

/** Passed receipts that expire within `warningDays` (the API logs `receipt_expiring` for each). */
export function receiptExpiryWarnings(receipts: ReadinessReceipts, now: Date, warningDays: number = RECEIPT_EXPIRY_WARNING_DAYS): ReceiptExpiry[] {
  const warnings: ReceiptExpiry[] = [];
  for (const kind of MANDATORY_RECEIPTS) {
    const hoursLeft = validHours(kind, receipts[kind], now);
    if (hoursLeft !== null && hoursLeft < warningDays * 24) warnings.push({ kind, hoursLeft });
  }
  return warnings;
}

export type ReceiptPreflight = { ok: boolean; receipts: Record<ReceiptKind, { state: ReceiptState; valid_hours: number | null }> };

/**
 * The release preflight: ok only when every mandatory receipt is passed and
 * stays valid for at least `minValidDays` (the release window; by default the
 * same 7 days as the expiry warning).
 */
export function receiptPreflight(receipts: ReadinessReceipts, now: Date, minValidDays: number = RECEIPT_EXPIRY_WARNING_DAYS): ReceiptPreflight {
  const result = {} as ReceiptPreflight['receipts'];
  for (const kind of MANDATORY_RECEIPTS) {
    result[kind] = { state: receiptState(kind, receipts[kind], now), valid_hours: validHours(kind, receipts[kind], now) };
  }
  const ok = MANDATORY_RECEIPTS.every((kind) => result[kind].state === 'passed' && (result[kind].valid_hours ?? 0) >= minValidDays * 24);
  return { ok, receipts: result };
}
