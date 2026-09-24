/**
 * GoGoSpend diary contracts. The cashback wallet is a different ledger —
 * spend writes never touch withdraw collections.
 *
 * Upload bytes live on the import-job document until the worker parses them.
 * Mongo's 16 MiB BSON cap means the file must stay well under that (no R2:
 * "private" objects still return public URLs).
 */

export const SPEND_CSV_MIME = [
  "text/csv",
  "application/vnd.ms-excel",
  "text/plain",
] as const;
export type SpendCsvMime = (typeof SPEND_CSV_MIME)[number];

export const SPEND_XLSX_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

export const SPEND_SLIP_MIME = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

/** 12 MiB — under Mongo 16 MiB BSON so the queued job can hold the payload. */
export const SPEND_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const SPEND_MAPPERS = [
  "spendee",
  "meowjot",
  "moneylover",
  "slip_qr",
  "slip_ocr",
  "saltedge",
] as const;
export type SpendMapperId = (typeof SPEND_MAPPERS)[number];

export const SPEND_TX_TYPES = ["expense", "income", "transfer"] as const;
export type SpendTxType = (typeof SPEND_TX_TYPES)[number];

export const SPEND_TX_SOURCES = [
  "manual",
  "spendee",
  "meowjot",
  "moneylover",
  "slip_qr",
  "slip_ocr",
  "saltedge",
  "autolog",
] as const;
export type SpendTxSource = (typeof SPEND_TX_SOURCES)[number];

export const SPEND_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type SpendJobStatus = (typeof SPEND_JOB_STATUSES)[number];

export const SPEND_PARSE_ERROR_CODES = [
  "UNKNOWN_MAPPER",
  "GOLDEN_SUM_MISMATCH",
  "EMPTY",
  "TOO_LARGE",
  "BAD_DATE",
  "BAD_AMOUNT",
  "SLIP_NO_QR",
  "SLIP_OCR_EMPTY",
  "XLS_UNREADABLE",
] as const;
export type SpendParseErrorCode = (typeof SPEND_PARSE_ERROR_CODES)[number];

export const SPEND_JOB_ERROR_CODES = [
  ...SPEND_PARSE_ERROR_CODES,
  "NOT_ALLOWLISTED",
  "IN_FLIGHT",
  "ACCOUNT_DELETED",
  "CRON_DISABLED",
  "PERSIST_FAILED",
  "BANK_LINK_UNAVAILABLE",
] as const;
export type SpendJobErrorCode = (typeof SPEND_JOB_ERROR_CODES)[number];

/**
 * The colours a member can give a category they made themselves.
 *
 * The first six are the ones the built-in categories already wear, so a custom
 * category can look like it belongs with them; the last six were added for
 * custom use (owner call 2026-08-31).
 *
 * Every one is a light pastel ON PURPOSE. A chosen chip fills with its own
 * colour and puts near-black ink on top, so a genuinely dark swatch would make
 * its own label unreadable — the owner's "dark purple" was pulled one step
 * lighter here for exactly that reason. `spend-category-hues` pins the whole
 * set against that ink, so a future addition cannot quietly break it.
 */
export const SPEND_CATEGORY_HUES = [
  "#F0A868",
  "#F2857E",
  "#F291C4",
  "#F2CE5C",
  "#6FB3F2",
  "#B49BE8",
  "#9CD4F5",
  "#4E93D9",
  "#D3C2F2",
  "#9B7EDB",
  "#D6EE8A",
  "#A8CC4A",
] as const;
export type SpendCategoryHue = (typeof SPEND_CATEGORY_HUES)[number];

/**
 * How long a category's emoji may be, in UTF-16 units.
 *
 * Not 2: a single emoji can run much longer than one code point once skin
 * tones, variation selectors and zero-width joiners are involved — the family
 * emoji alone is eleven units. The cap is here to stop someone typing a second
 * name into the field, not to count characters.
 */
export const SPEND_CATEGORY_EMOJI_MAX_UNITS = 16;
