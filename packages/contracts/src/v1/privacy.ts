/**
 * P4 privacy wire contract: private asynchronous export.
 *
 * `POST /v1/exports` (recent proof: a bound session plus a fresh `export`
 * proof whose command id is the request's `Idempotency-Key`;
 * `X-GoGoSpend-Command-Schema: 1`) queues one CSV export of every active
 * expense, income and transfer dated within an inclusive `from`..`through`
 * range - the same date semantics as `GET /v1/history` - and returns a
 * `CommandAck` (outcome `accepted`, entity `export`). It needs no newly
 * required policy acceptance. Retrying the same key and body returns the
 * same acknowledgement.
 *
 * `GET /v1/exports/:id` reports the export (`pending`, `ready`, `failed`,
 * `expired`). For a ready one, `GET /v1/exports/:id/grant` returns a
 * five-minute opaque download path on this API (never a storage URL); the
 * download itself still needs the owner's bound session. The file expires 24
 * hours after it is ready and is then deleted. A `ready` status means the
 * file exists, never that it was downloaded.
 */
import type { Revision } from "./common.ts";
import type { HistoryFilter } from "./history.ts";
import { isUuid, validateOccurredOn } from "./validation.ts";

/** A ready export's file is deleted this long after it is ready. */
export const EXPORT_TTL_HOURS = 24;
/** A download grant expires after this. */
export const EXPORT_GRANT_MINUTES = 5;
/** Grants name a download path under this prefix, followed by the opaque grant. */
export const EXPORT_DOWNLOAD_PATH = "/v1/export-files/";
export const EXPORT_STATUSES = ["pending", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** The selected period: inclusive Gregorian dates, as in history. Every record type is included. */
export type ExportFilter = Pick<HistoryFilter, "from" | "through">;

/** POST /v1/exports body. */
export type ExportRequest = ExportFilter & { proof_id: string };

/** The `export` entity's change-log snapshot: the request, never its contents. */
export type ExportRequestSnapshot = { id: string; from: string; through: string };

type ExportBase = { export_id: string; from: string; through: string; requested_at: string };

/** Why an export failed: `too_large` - choose a shorter period; `error` - try again later. */
export const EXPORT_FAILURE_REASONS = ["too_large", "error"] as const;
export type ExportFailureReason = (typeof EXPORT_FAILURE_REASONS)[number];

/** At most this many exports per account are queued or running at once. */
export const EXPORT_MAX_OPEN = 2;

/** GET /v1/exports/:id */
export type ExportDto =
  | (ExportBase & { status: "pending" | "expired" })
  | (ExportBase & { status: "failed"; reason: ExportFailureReason })
  | (ExportBase & {
      status: "ready";
      /** The account revision the file was read at (one consistent view). */
      as_of_revision: Revision;
      row_count: number;
      bytes: number;
      /** Lowercase hex SHA-256 of the file. */
      sha256: string;
      expires_at: string;
    });

/** GET /v1/exports/:id/grant: an opaque, five-minute download path (`EXPORT_DOWNLOAD_PATH` + grant). */
export type ExportGrant = { url: string; expires_at: string };

/**
 * The CSV header, in order. One row per active record. Amounts are exact:
 * `amount_minor` is integer satang and `amount` the same value in baht with
 * two decimals. Entries fill `wallet_*`/`category_*`; transfers fill
 * `source_wallet_*`/`destination_wallet_*`. No receipt images and no
 * account or sign-in identifiers. Text a spreadsheet could read as a formula
 * is prefixed with `'`.
 */
export const EXPORT_CSV_COLUMNS = [
  "record_id",
  "date",
  "type",
  "amount",
  "amount_minor",
  "currency",
  "wallet_id",
  "wallet_name",
  "category_id",
  "category_name",
  "category_builtin_key",
  "source_wallet_id",
  "source_wallet_name",
  "destination_wallet_id",
  "destination_wallet_name",
  "merchant",
  "note",
  "version",
] as const;
export type ExportCsvColumn = (typeof EXPORT_CSV_COLUMNS)[number];

/**
 * The file is UTF-8 and starts with this byte order mark, so spreadsheet apps
 * read Thai text correctly. Text decoders usually drop it: put it back before
 * checking a download's size and digest.
 */
export const EXPORT_CSV_BOM = "﻿";

/** The download's file name for a period (ASCII only). */
export function exportFileName(filter: ExportFilter): string {
  return `jotbun-export-${filter.from}-to-${filter.through}.csv`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    validateOccurredOn(value, "1970-01-01", "9999-12-31", "date");
    return true;
  } catch {
    return false;
  }
}

const isInstant = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const REVISION = /^(0|[1-9][0-9]{0,18})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GRANT = /^[A-Za-z0-9_-]{16,512}$/;

function hasPeriod(value: Record<string, unknown>): boolean {
  return isDate(value.from) && isDate(value.through) && value.through >= value.from;
}

/** An inclusive period from 1970 with `through` not before `from`. */
export function isExportFilter(value: unknown): value is ExportFilter {
  return isObject(value) && hasPeriod(value);
}

/** True for exactly the `export` entity's persisted snapshot. */
export function isExportRequestSnapshot(value: unknown): value is ExportRequestSnapshot {
  return isObject(value) && hasExactly(value, ["id", "from", "through"]) && isUuid(value.id) && hasPeriod(value);
}

export function isExportDto(value: unknown): value is ExportDto {
  if (!isObject(value) || !isUuid(value.export_id) || !hasPeriod(value) || !isInstant(value.requested_at)) return false;
  const base = ["export_id", "status", "from", "through", "requested_at"];
  if (value.status === "pending" || value.status === "expired") return hasExactly(value, base);
  if (value.status === "failed") return hasExactly(value, [...base, "reason"]) && EXPORT_FAILURE_REASONS.includes(value.reason as ExportFailureReason);
  return (
    value.status === "ready" &&
    hasExactly(value, [...base, "as_of_revision", "row_count", "bytes", "sha256", "expires_at"]) &&
    typeof value.as_of_revision === "string" && REVISION.test(value.as_of_revision) &&
    Number.isSafeInteger(value.row_count) && (value.row_count as number) >= 0 &&
    Number.isSafeInteger(value.bytes) && (value.bytes as number) > 0 &&
    typeof value.sha256 === "string" && SHA256.test(value.sha256) &&
    isInstant(value.expires_at)
  );
}

export function isExportGrant(value: unknown): value is ExportGrant {
  return (
    isObject(value) && hasExactly(value, ["url", "expires_at"]) &&
    typeof value.url === "string" && value.url.startsWith(EXPORT_DOWNLOAD_PATH) && GRANT.test(value.url.slice(EXPORT_DOWNLOAD_PATH.length)) &&
    isInstant(value.expires_at)
  );
}
