/**
 * Strict v1 validators shared by the API and the app. Money never passes
 * through `Number`: amounts are canonical integer strings parsed to bigint.
 */
import { ContractValidationError } from "./errors.ts";

/** ฿999,999,999.99 — cap for one transaction, opening balance or budget. */
export const MINOR_AMOUNT_MAX = 99_999_999_999n;

export type MinorOptions = {
  allowZero: boolean;
  allowNegative: boolean;
  /** Inclusive bound on the absolute value; omitted means unbounded (totals). */
  max?: bigint;
};

// No sign on zero, no leading zeros, ASCII digits only.
const CANONICAL_INTEGER = /^(?:0|-?[1-9][0-9]*)$/;
// Far beyond any real total; stops huge strings reaching BigInt().
const MAX_MINOR_LENGTH = 40;

export function parseMinor(value: unknown, options: MinorOptions, field?: string): bigint {
  if (typeof value !== "string" || value.length > MAX_MINOR_LENGTH || !CANONICAL_INTEGER.test(value)) {
    throw new ContractValidationError("INVALID_MINOR", "Expected a canonical integer string of satang.", field);
  }
  const parsed = BigInt(value);
  const outOfRange =
    (parsed < 0n && !options.allowNegative) ||
    (parsed === 0n && !options.allowZero) ||
    (options.max !== undefined && (parsed > options.max || -parsed > options.max));
  if (outOfRange) {
    throw new ContractValidationError("MINOR_OUT_OF_RANGE", "Amount is outside the allowed range.", field);
  }
  return parsed;
}

export type CanonicalCommand = {
  kind: string;
  schemaVersion: number;
  canonicalJson: string;
};

const COMMAND_KIND = /^[a-z][a-z0-9_.]{0,63}$/;
const MAX_PAYLOAD_DEPTH = 32;

/**
 * Canonical form of a command's content for idempotency digests: object keys
 * sorted, array order kept, undefined object properties omitted as JSON does.
 * Command IDs and auth/request metadata are deliberately not inputs.
 */
export function normalizeCommand(kind: string, schemaVersion: number, payload: unknown): CanonicalCommand {
  if (typeof kind !== "string" || !COMMAND_KIND.test(kind)) {
    throw new ContractValidationError("INVALID_COMMAND", "Command kind is malformed.", "kind");
  }
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new ContractValidationError("INVALID_COMMAND", "Command schema version must be a positive integer.", "schema_version");
  }
  const canonicalJson =
    `{"kind":${JSON.stringify(kind)},"payload":${canonicalize(payload, 0)},"schema_version":${schemaVersion}}`;
  return { kind, schemaVersion, canonicalJson };
}

function canonicalize(value: unknown, depth: number): string {
  if (depth > MAX_PAYLOAD_DEPTH) {
    throw new ContractValidationError("INVALID_COMMAND", "Command payload is nested too deeply.", "payload");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    // v1 payload numbers are versions/counts; money is a string. Beyond the
    // safe range, distinct JSON numbers parse to the same double.
    if (!Number.isSafeInteger(value)) {
      throw new ContractValidationError("INVALID_COMMAND", "Command payload numbers must be safe integers.", "payload");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    // Index loop: map() would skip holes in sparse arrays.
    for (let i = 0; i < value.length; i++) {
      if (!(i in value) || value[i] === undefined) {
        throw new ContractValidationError("INVALID_COMMAND", "Command payload array has a missing or undefined item.", "payload");
      }
      items.push(canonicalize(value[i], depth + 1));
    }
    return `[${items.join(",")}]`;
  }
  if (isPlainObject(value)) {
    // Serialize directly so an own "__proto__" key stays ordinary data.
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], depth + 1)}`);
    return `{${entries.join(",")}}`;
  }
  throw new ContractValidationError("INVALID_COMMAND", "Command payload contains a non-JSON value.", "payload");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

function isGregorianDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

/**
 * Validates a Gregorian `YYYY-MM-DD` record date against the wallet's tracking
 * start and today's Bangkok date (both inclusive). ISO dates compare as strings.
 */
export function validateOccurredOn(value: unknown, trackingStart: string, todayBangkok: string, field = "occurred_on"): string {
  if (!isGregorianDate(trackingStart) || !isGregorianDate(todayBangkok)) {
    throw new TypeError("validateOccurredOn bounds must be Gregorian YYYY-MM-DD dates.");
  }
  if (!isGregorianDate(value)) {
    throw new ContractValidationError("INVALID_DATE", "Expected a real Gregorian YYYY-MM-DD date.", field);
  }
  if (value < trackingStart) {
    throw new ContractValidationError("DATE_BEFORE_TRACKING_START", "Date is before the wallet started tracking.", field);
  }
  if (value > todayBangkok) {
    throw new ContractValidationError("DATE_IN_FUTURE", "Date is in the future.", field);
  }
  return value;
}

// Asia/Bangkok has been a fixed UTC+07:00 with no daylight saving since 1920,
// so a constant offset is exact and avoids depending on runtime tz data.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Calendar date in Asia/Bangkok for an instant, as `YYYY-MM-DD`. */
export function bangkokDate(instant: Date): string {
  const time = instant.getTime();
  if (!Number.isFinite(time)) throw new RangeError("bangkokDate needs a valid instant.");
  const date = new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
  if (!isGregorianDate(date)) throw new RangeError("bangkokDate is outside years 0001–9999.");
  return date;
}

/** Rejects request bodies that are not plain objects or carry unknown fields. */
export function assertKnownFields(value: unknown, allowed: readonly string[], field?: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ContractValidationError("VALIDATION_FAILED", "Expected a JSON object.", field);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ContractValidationError("UNKNOWN_FIELD", "Unknown field.", field ? `${field}.${key}` : key);
    }
  }
  return value;
}

// Canonical lower-case RFC 9562 UUID, versions 1–8 (the nil UUID is rejected).
// Lower-case only so one ID has one spelling in receipts and FKs; clients must
// generate lower-case IDs (expo-crypto's randomUUID does).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
