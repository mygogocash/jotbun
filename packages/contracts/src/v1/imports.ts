/**
 * P2a import intake wire contract: one upload streams into private,
 * quota-bounded, 24-hour quarantine and queues one parse job. Nothing is
 * parsed or saved by an upload; P2b turns it into a reviewable preview and P3
 * confirms selected rows explicitly.
 *
 * `POST /v1/imports` takes the file as the raw request body (no multipart):
 *   - `Content-Type`: one of IMPORT_CONTENT_TYPES (a `charset` parameter is
 *     allowed for CSV);
 *   - `X-GoGoSpend-File-Name`: the original file name, UTF-8 and
 *     percent-encoded (`encodeURIComponent`). A display label only: storage
 *     keys are server-generated and never derived from it. Path-like names
 *     are refused (`422 INVALID_FILE_NAME`), and its extension must match the
 *     content type;
 *   - `Idempotency-Key`: a UUID. A retry with the same key returns the
 *     original outcome: the accepted import (once its file expired, under
 *     any file name of the same type), or the same refusal. A key refused
 *     only by a limit may be retried once room returns; a key whose upload
 *     failed (stream, storage, timeout) answers `409 UPLOAD_FAILED` (start
 *     again with a new key);
 *   - `Content-Length` is optional; the 12 MiB cap, and the bytes still
 *     allowed today, are enforced while streaming either way.
 * The whole body must arrive within IMPORT_UPLOAD_RECEIVE_SECONDS, with no
 * pause longer than IMPORT_UPLOAD_IDLE_SECONDS (`408 UPLOAD_INCOMPLETE`).
 * The server sniffs magic bytes: a body that is not what its type and name
 * say is refused (`422 UPLOAD_TYPE_MISMATCH`), HEIC/HEIF and other formats
 * are unsupported (`415 UPLOAD_UNSUPPORTED_TYPE`). Per-account limits answer
 * `429 UPLOAD_LIMIT_REACHED` with `retry_after_seconds` and a message key
 * naming the limit (IMPORT_LIMIT_MESSAGE_KEYS). After any error reply the
 * server closes the connection.
 *
 * `GET /v1/imports/:job_id` returns the caller's own accepted import;
 * another account's id and an unknown id are the same `404 NOT_FOUND`.
 */
import type { Minor, Revision } from "./common.ts";
import { ContractValidationError } from "./errors.ts";
import { MERCHANT_MAX_CHARS, NOTE_MAX_CHARS, TRANSACTION_TYPES } from "./transactions.ts";
import type { TransactionType } from "./transactions.ts";
import { MINOR_AMOUNT_MAX, NAME_MAX_CHARS, isUuid } from "./validation.ts";

/** The hard cap for one upload, enforced while the body streams. */
export const IMPORT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
/** File names are display labels of at most this many characters. */
export const IMPORT_FILE_NAME_MAX_CHARS = 128;
/** Quarantined (raw) uploads are deleted this long after acceptance. */
export const IMPORT_QUARANTINE_TTL_HOURS = 24;
/** Header carrying the percent-encoded original file name. */
export const IMPORT_FILE_NAME_HEADER = "x-gogospend-file-name";

/**
 * Per-account limits, as sliding windows on the server clock: upload
 * attempts (accepted or refused) per 15 minutes, accepted bytes per 24 hours
 * and parse jobs (one per accepted upload) per 24 hours.
 */
export const IMPORT_QUOTAS = {
  uploadsPerWindow: 5,
  uploadWindowMinutes: 15,
  acceptedBytesPerDay: 50 * 1024 * 1024,
  parseJobsPerDay: 10,
  /** Uploads of one account streaming at the same time. */
  uploadsInProgress: 2,
} as const;

/** The whole body must arrive within this long (12 MiB then needs about 26 KB/s on average). */
export const IMPORT_UPLOAD_RECEIVE_SECONDS = 480;
/** An upload that sends nothing for this long is ended. */
export const IMPORT_UPLOAD_IDLE_SECONDS = 30;

export const IMPORT_LIMITS = ["uploads", "bytes", "parse_jobs", "in_progress"] as const;
export type ImportLimit = (typeof IMPORT_LIMITS)[number];
/** The `message_key` of a `429 UPLOAD_LIMIT_REACHED` names the limit that was reached. */
export const IMPORT_LIMIT_MESSAGE_KEYS: Readonly<Record<ImportLimit, string>> = {
  uploads: "errors.upload_limit_uploads",
  bytes: "errors.upload_limit_bytes",
  parse_jobs: "errors.upload_limit_parse_jobs",
  in_progress: "errors.upload_limit_in_progress",
};
/** The `message_key` of a `415 UPLOAD_UNSUPPORTED_TYPE` for HEIC/HEIF photos. */
export const IMPORT_HEIC_MESSAGE_KEY = "errors.upload_heic_unsupported";
/** The `message_key` of a `408 UPLOAD_INCOMPLETE` when the body stalled or took too long. */
export const IMPORT_TIMEOUT_MESSAGE_KEY = "errors.upload_timeout";

export const IMPORT_FORMATS = ["csv", "xlsx", "jpeg", "png", "webp"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const IMPORT_CONTENT_TYPES: Readonly<Record<ImportFormat, string>> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const IMPORT_EXTENSIONS: Readonly<Record<ImportFormat, readonly string[]>> = {
  csv: ["csv"],
  xlsx: ["xlsx"],
  jpeg: ["jpg", "jpeg"],
  png: ["png"],
  webp: ["webp"],
};

/**
 * Client-visible import states. `queued`: accepted and waiting for the
 * parser; `parsing`; `parsed`: the parse job finished (P2b's preview is the
 * next read); `failed`/`cancelled`: the parse job did not finish; `expired`:
 * the quarantined file was deleted before it was parsed. Clients must
 * tolerate states they do not know yet.
 */
export const IMPORT_STATUSES = ["queued", "parsing", "parsed", "failed", "cancelled", "expired"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export type ImportJobDto = {
  job_id: string;
  status: ImportStatus;
  format: ImportFormat;
  /** Null once the quarantined file expired. */
  file_name: string | null;
  bytes: number;
  received_at: string;
  /** When the quarantined (raw) file is deleted. */
  expires_at: string;
};

/** `POST /v1/imports` (202): the accepted upload, queued for parsing. */
export type UploadAccepted = ImportJobDto;

export type ImportFileName = { name: string; extension: string };

/**
 * Validates an original file name as a display label: NFC, 1-128
 * characters, no path separators, drive or stream markers, control or
 * invisible formatting characters (bidi overrides), no leading dot or
 * surrounding spaces, and a final extension. Throws
 * `ContractValidationError('INVALID_FILE_NAME', ..., 'file_name')`.
 */
export function parseImportFileName(value: unknown): ImportFileName {
  const invalid = (message: string) => new ContractValidationError("INVALID_FILE_NAME", message, "file_name");
  if (typeof value !== "string") throw invalid("File name is required.");
  const name = value.normalize("NFC");
  const length = [...name].length;
  if (length < 1 || length > IMPORT_FILE_NAME_MAX_CHARS) throw invalid("File name must be 1-128 characters.");
  // Path separators, drive/stream markers and characters no file system takes,
  // and their look-alikes (fullwidth, division and fraction slashes, ratio).
  if (/[\/\\:*?"<>|\u2044\u2215\u2216\u2236\u29F8\u29F9\uA789\uFE68\uFF0F\uFF1A\uFF3C]/.test(name)) throw invalid("File name must not look like a path.");
  // Control, invisible formatting (bidi overrides, zero-width), line separators, lone surrogates.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u.test(name)) throw invalid("File name has control or invisible characters.");
  // Other default-ignorable code points (Hangul fillers, combining grapheme
  // joiner, ...) render as nothing; only emoji presentation selectors may stay.
  if (/[\p{Default_Ignorable_Code_Point}]/u.test(name.replace(/[\uFE0E\uFE0F]/g, ""))) throw invalid("File name has invisible characters.");
  if (name.startsWith(".") || /^\s|\s$/u.test(name)) throw invalid("File name must not start with a dot or space, or end with a space.");
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!/^[a-z0-9]{1,10}$/.test(extension)) throw invalid("File name needs an extension.");
  return { name, extension };
}

/** The format a declared Content-Type names, or null when it is not supported. A `charset` parameter is allowed for CSV only. */
export function importFormatForContentType(value: unknown): ImportFormat | null {
  if (typeof value !== "string") return null;
  const [type, ...parameters] = value.split(";").map((part) => part.trim().toLowerCase());
  const format = IMPORT_FORMATS.find((candidate) => IMPORT_CONTENT_TYPES[candidate] === type) ?? null;
  if (!format) return null;
  if (parameters.length === 0) return format;
  return format === "csv" && parameters.length === 1 && /^charset=[a-z0-9._-]{1,40}$/.test(parameters[0]) ? format : null;
}

/** The format a file extension names (any case), or null when it is not supported. */
export function importFormatForExtension(extension: string): ImportFormat | null {
  const lower = extension.toLowerCase();
  return IMPORT_FORMATS.find((format) => IMPORT_EXTENSIONS[format].includes(lower)) ?? null;
}

const DTO_KEYS = ["bytes", "expires_at", "file_name", "format", "job_id", "received_at", "status"].join(",");
const isInstant = (value: unknown): boolean => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function isImportJobDto(value: unknown): value is ImportJobDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const dto = value as Record<string, unknown>;
  return (
    Object.keys(dto).sort().join(",") === DTO_KEYS &&
    isUuid(dto.job_id) &&
    IMPORT_STATUSES.includes(dto.status as ImportStatus) &&
    IMPORT_FORMATS.includes(dto.format as ImportFormat) &&
    (dto.file_name === null || (typeof dto.file_name === "string" && dto.file_name.length > 0 && [...dto.file_name].length <= IMPORT_FILE_NAME_MAX_CHARS)) &&
    Number.isSafeInteger(dto.bytes) &&
    (dto.bytes as number) >= 1 &&
    (dto.bytes as number) <= IMPORT_UPLOAD_MAX_BYTES &&
    isInstant(dto.received_at) &&
    isInstant(dto.expires_at)
  );
}

// ---------------------------------------------------------------------------
// P2b: a quarantined file parsed into a reviewable preview.
//
// The worker parses each accepted upload once, in a killable child process,
// into review candidates. Nothing is saved as a transaction: P3 confirms
// selected rows explicitly. `GET /v1/imports/:job_id/preview` returns the
// caller's own preview (`404 NOT_FOUND` for another account's id or an
// unknown one, exactly like the status route).
// ---------------------------------------------------------------------------

/**
 * Reviewable execution limits for parsing one file. A file over any of them
 * is rejected as a whole (never partly imported); they are not a promise that
 * every file within them imports.
 */
export const IMPORT_PARSE_LIMITS = {
  /** XLSX: total uncompressed bytes of every ZIP entry. */
  zipExpandedBytes: 50 * 1024 * 1024,
  /** XLSX: ZIP entries. */
  zipEntries: 1_000,
  /** Candidate rows (data rows after the header, or one per image). */
  candidateRows: 5_000,
  /** Columns holding a value, per worksheet row or CSV record. */
  columns: 100,
  /** Characters in one cell or shared string. */
  cellChars: 10_000,
  /** Image width × height. */
  imagePixels: 20_000_000,
} as const;
/** The parser child is killed after this long. */
export const IMPORT_PARSE_DEADLINE_SECONDS = 30;
/** The whole parse job (read, parse, record) runs within this. */
export const IMPORT_PARSE_JOB_DEADLINE_SECONDS = 120;
/** Reviewed memory budget for one parse (the worker container's size). */
export const IMPORT_PARSER_MEMORY_BUDGET_MIB = 512;
/** Unconfirmed candidates are deleted this long after parsing. */
export const IMPORT_PREVIEW_TTL_DAYS = 7;
/** A sanitized receipt image nobody attached is deleted this long after parsing. */
export const IMPORT_IMAGE_TTL_HOURS = 24;

/**
 * `queued`/`parsing`: no preview yet; `ready`: candidates to review;
 * `rejected`: the file as a whole could not be read (see `issues`);
 * `failed`/`cancelled`: the parse job did not finish; `expired`: the preview
 * (or the unparsed file) was deleted. Clients must tolerate unknown states.
 */
export const IMPORT_PREVIEW_STATUSES = ["queued", "parsing", "ready", "rejected", "failed", "cancelled", "expired"] as const;
export type ImportPreviewStatus = (typeof IMPORT_PREVIEW_STATUSES)[number];

/** The source layout the parser recognized. */
export const IMPORT_LAYOUTS = ["meowjot", "moneylover", "spendee", "generic", "receipt"] as const;
export type ImportLayout = (typeof IMPORT_LAYOUTS)[number];

/** Candidate fields an issue can name. */
export const IMPORT_FIELDS = ["occurred_on", "type", "amount_minor", "wallet_label", "category_label", "merchant", "note"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** File-level issue codes: why a file was rejected or failed, or a notice about the whole file. */
export const IMPORT_FILE_ISSUE_CODES = [
  "empty_file",
  "unrecognized_columns",
  "ambiguous_columns",
  "malformed_csv",
  "unsupported_encoding",
  "too_many_rows",
  "too_many_columns",
  "cell_too_long",
  "preview_too_large",
  "zip_malformed",
  "zip_too_large",
  "zip_too_many_entries",
  "zip_unsupported",
  "workbook_malformed",
  "macros",
  "formulas",
  "external_references",
  "multiple_worksheets",
  "unsupported_sheet",
  "image_malformed",
  "image_too_large",
  "image_format_mismatch",
  "parse_timeout",
  "parse_resource_limit",
  "parse_failed",
  "quarantine_unavailable",
  "unmapped_columns",
  "legacy_encoding",
  "receipt_fields_unread",
] as const;
export type ImportFileIssueCode = (typeof IMPORT_FILE_ISSUE_CODES)[number];

/** Row-level issue codes: why a field is unknown (null) or needs a decision. */
export const IMPORT_ROW_ISSUE_CODES = [
  "missing_date",
  "invalid_date",
  "ambiguous_date",
  "date_out_of_range",
  "missing_amount",
  "invalid_amount",
  "ambiguous_amount",
  "excess_precision",
  "amount_over_cap",
  "zero_amount",
  "unsupported_currency",
  "missing_type",
  "unknown_type",
  "type_conflict",
  "missing_wallet",
  "transfer_destination_missing",
  "text_too_long",
  "invalid_text",
  "excluded_in_source",
] as const;
export type ImportRowIssueCode = (typeof IMPORT_ROW_ISSUE_CODES)[number];

/**
 * One reviewable row. `source_row_id` is stable for the file: `row:<n>` is
 * the n-th CSV record or worksheet row (the header is a row too), `image:1`
 * the one image. Every value is exactly what the file says, normalized, or
 * null when it is missing, unreadable or ambiguous - never guessed.
 * Labels are the file's own text; P3 maps them to wallets and categories.
 */
export type ImportCandidate = {
  source_row_id: string;
  /** 1-based position in the file. */
  ordinal: number;
  occurred_on: string | null;
  type: TransactionType | null;
  amount_minor: Minor | null;
  wallet_label: string | null;
  category_label: string | null;
  merchant: string | null;
  note: string | null;
  /** True when a date, type, amount or wallet is missing, or the row has an issue. */
  review_required: boolean;
};

/** `source_row_id` and `field` are null for file-level issues. */
export type ImportIssue = { code: string; source_row_id: string | null; field: ImportField | null };

/**
 * Advisory only: nothing is dropped or merged. `existing_transaction`
 * matches are the owner's active records with the same date, type and
 * amount; `same_file` matches are other rows of this file with the same
 * date, type, amount, wallet, merchant and note.
 */
export type ImportDuplicateAdvice = { source_row_id: string; kind: "existing_transaction" | "same_file"; matches: string[] };

export type ImportPreviewSummary = {
  layout: ImportLayout | null;
  candidate_count: number;
  review_required_count: number;
  /** Exact sums of the candidates with a known type and amount. */
  totals: { expense_minor: Minor; income_minor: Minor; transfer_minor: Minor };
  /**
   * The sanitized (re-encoded, metadata-free) receipt image, when the file
   * was one. `attachment_id` is the opaque id a P2c retain names (never an
   * object key); the image can be retained until `attachable_until`, null
   * once it no longer can.
   */
  image: { width: number; height: number; attachment_id: string; attachable_until: string | null } | null;
};

export type ImportPreview = {
  job_id: string;
  status: ImportPreviewStatus;
  candidates: ImportCandidate[];
  issues: ImportIssue[];
  duplicate_advice: ImportDuplicateAdvice[];
  /** The preview's revision (P3's row corrections advance it); null before a preview exists. */
  review_revision: Revision | null;
  /** When unconfirmed candidates are deleted; null before a preview exists. */
  expires_at: string | null;
  summary: ImportPreviewSummary | null;
};

/** The `message_key` for an issue code (P3 supplies the Thai/English text). */
export function importIssueMessageKey(code: string): string {
  return `imports.issue_${code}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const SOURCE_ROW_ID = /^(?:row:[1-9][0-9]{0,7}|image:1)$/;
const ISSUE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CANDIDATE_AMOUNT = /^[1-9][0-9]{0,10}$/;
const GREGORIAN_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TOTAL = /^(?:0|[1-9][0-9]{0,18})$/;
const REVISION = /^[1-9][0-9]{0,18}$/;
const textOrNull = (value: unknown, max: number) => value === null || (typeof value === "string" && value.length > 0 && [...value].length <= max);

function isCandidate(value: unknown): value is ImportCandidate {
  if (!isRecord(value)) return false;
  const keys = ["source_row_id", "ordinal", "occurred_on", "type", "amount_minor", "wallet_label", "category_label", "merchant", "note", "review_required"];
  return (
    hasKeys(value, keys) &&
    typeof value.source_row_id === "string" &&
    SOURCE_ROW_ID.test(value.source_row_id) &&
    Number.isSafeInteger(value.ordinal) &&
    (value.ordinal as number) >= 1 &&
    (value.ordinal as number) <= IMPORT_PARSE_LIMITS.candidateRows &&
    (value.occurred_on === null || (typeof value.occurred_on === "string" && GREGORIAN_DATE.test(value.occurred_on))) &&
    (value.type === null || TRANSACTION_TYPES.includes(value.type as TransactionType)) &&
    (value.amount_minor === null ||
      (typeof value.amount_minor === "string" && CANDIDATE_AMOUNT.test(value.amount_minor) && BigInt(value.amount_minor) <= MINOR_AMOUNT_MAX)) &&
    textOrNull(value.wallet_label, NAME_MAX_CHARS) &&
    textOrNull(value.category_label, NAME_MAX_CHARS) &&
    textOrNull(value.merchant, MERCHANT_MAX_CHARS) &&
    textOrNull(value.note, NOTE_MAX_CHARS) &&
    typeof value.review_required === "boolean"
  );
}

function isIssue(value: unknown): value is ImportIssue {
  return (
    isRecord(value) &&
    hasKeys(value, ["code", "source_row_id", "field"]) &&
    typeof value.code === "string" &&
    ISSUE_CODE.test(value.code) &&
    (value.source_row_id === null || (typeof value.source_row_id === "string" && SOURCE_ROW_ID.test(value.source_row_id))) &&
    (value.field === null || IMPORT_FIELDS.includes(value.field as ImportField))
  );
}

function isAdvice(value: unknown): value is ImportDuplicateAdvice {
  return (
    isRecord(value) &&
    hasKeys(value, ["source_row_id", "kind", "matches"]) &&
    typeof value.source_row_id === "string" &&
    SOURCE_ROW_ID.test(value.source_row_id) &&
    (value.kind === "existing_transaction" || value.kind === "same_file") &&
    Array.isArray(value.matches) &&
    value.matches.length > 0 &&
    value.matches.every((match) => (value.kind === "existing_transaction" ? isUuid(match) : typeof match === "string" && SOURCE_ROW_ID.test(match)))
  );
}

function isSummary(value: unknown): value is ImportPreviewSummary {
  if (!isRecord(value) || !hasKeys(value, ["layout", "candidate_count", "review_required_count", "totals", "image"])) return false;
  const totals = value.totals;
  const image = value.image;
  return (
    (value.layout === null || IMPORT_LAYOUTS.includes(value.layout as ImportLayout)) &&
    Number.isSafeInteger(value.candidate_count) &&
    (value.candidate_count as number) >= 0 &&
    (value.candidate_count as number) <= IMPORT_PARSE_LIMITS.candidateRows &&
    Number.isSafeInteger(value.review_required_count) &&
    (value.review_required_count as number) >= 0 &&
    (value.review_required_count as number) <= (value.candidate_count as number) &&
    isRecord(totals) &&
    hasKeys(totals, ["expense_minor", "income_minor", "transfer_minor"]) &&
    [totals.expense_minor, totals.income_minor, totals.transfer_minor].every((total) => typeof total === "string" && TOTAL.test(total)) &&
    (image === null ||
      (isRecord(image) &&
        hasKeys(image, ["width", "height", "attachment_id", "attachable_until"]) &&
        isUuid(image.attachment_id) &&
        (image.attachable_until === null || isInstant(image.attachable_until)) &&
        Number.isSafeInteger(image.width) &&
        Number.isSafeInteger(image.height) &&
        (image.width as number) >= 1 &&
        (image.height as number) >= 1 &&
        (image.width as number) * (image.height as number) <= IMPORT_PARSE_LIMITS.imagePixels))
  );
}

/** True for exactly the `ImportPreview` wire shape. */
export function isImportPreview(value: unknown): value is ImportPreview {
  if (!isRecord(value)) return false;
  const keys = ["job_id", "status", "candidates", "issues", "duplicate_advice", "review_revision", "expires_at", "summary"];
  if (!hasKeys(value, keys) || !isUuid(value.job_id) || !IMPORT_PREVIEW_STATUSES.includes(value.status as ImportPreviewStatus)) return false;
  if (!Array.isArray(value.candidates) || value.candidates.length > IMPORT_PARSE_LIMITS.candidateRows || !value.candidates.every(isCandidate)) return false;
  if (!Array.isArray(value.issues) || !value.issues.every(isIssue)) return false;
  if (!Array.isArray(value.duplicate_advice) || !value.duplicate_advice.every(isAdvice)) return false;
  const revision = value.review_revision;
  return (
    (revision === null || (typeof revision === "string" && REVISION.test(revision))) &&
    (value.expires_at === null || isInstant(value.expires_at)) &&
    (value.expires_at === null) === (revision === null) &&
    (value.summary === null || isSummary(value.summary))
  );
}
