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
 *     original outcome; a key whose upload ended without acceptance answers
 *     `409 UPLOAD_FAILED` (start again with a new key);
 *   - `Content-Length` is optional; the 12 MiB cap is enforced while
 *     streaming either way.
 * The server sniffs magic bytes: a body that is not what its type and name
 * say is refused (`422 UPLOAD_TYPE_MISMATCH`), HEIC/HEIF and other formats
 * are unsupported (`415 UPLOAD_UNSUPPORTED_TYPE`). Per-account limits answer
 * `429 UPLOAD_LIMIT_REACHED` with `retry_after_seconds` and a message key
 * naming the limit (IMPORT_LIMIT_MESSAGE_KEYS).
 *
 * `GET /v1/imports/:job_id` returns the caller's own accepted import;
 * another account's id and an unknown id are the same `404 NOT_FOUND`.
 */
import { ContractValidationError } from "./errors.ts";
import { isUuid } from "./validation.ts";

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
} as const;

export const IMPORT_LIMITS = ["uploads", "bytes", "parse_jobs"] as const;
export type ImportLimit = (typeof IMPORT_LIMITS)[number];
/** The `message_key` of a `429 UPLOAD_LIMIT_REACHED` names the limit that was reached. */
export const IMPORT_LIMIT_MESSAGE_KEYS: Readonly<Record<ImportLimit, string>> = {
  uploads: "errors.upload_limit_uploads",
  bytes: "errors.upload_limit_bytes",
  parse_jobs: "errors.upload_limit_parse_jobs",
};
/** The `message_key` of a `415 UPLOAD_UNSUPPORTED_TYPE` for HEIC/HEIF photos. */
export const IMPORT_HEIC_MESSAGE_KEY = "errors.upload_heic_unsupported";

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
  // Path separators, drive/stream markers and characters no file system takes.
  if (/[\/\\:*?"<>|]/.test(name)) throw invalid("File name must not look like a path.");
  // Control, invisible formatting (bidi overrides, zero-width), line separators, lone surrogates.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u.test(name)) throw invalid("File name has control or invisible characters.");
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
