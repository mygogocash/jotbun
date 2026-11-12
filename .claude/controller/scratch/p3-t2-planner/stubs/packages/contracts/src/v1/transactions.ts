/**
 * v1 records. One row per logical expense, income or owned-wallet transfer;
 * a transfer is never two half-written rows. Amounts are positive integer
 * strings of satang. Deleted records stay restorable for 30 days.
 */
import type { Minor } from "./common.ts";
import { ContractValidationError } from "./errors.ts";
import { BIDI_CONTROL, LONE_SURROGATE, isInvisible, isUuid } from "./validation.ts";

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type EntryType = Exclude<TransactionType, "transfer">;

/**
 * How a record was made (B2, spec 6.6): typed, read by Bun from a photo, a slip
 * import, a Tell Bun draft, a statement, the share extension or Siri. Set once,
 * when the record is created; records made before phase 3 have none.
 */
export const TRANSACTION_SOURCES = ["typed", "photo", "slip_import", "tell_bun", "statement", "share_extension", "siri"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const NOTE_MAX_CHARS = 500;
export const MERCHANT_MAX_CHARS = 120;
/** A deleted record can be restored for this long. */
export const RESTORE_WINDOW_DAYS = 30;

type RecordFields = {
  id: string;
  amount_minor: Minor;
  occurred_on: string;
  note: string | null;
  merchant: string | null;
  /** When it was deleted (ISO instant), or null while active. */
  deleted_at: string | null;
  version: number;
  /**
   * P2c: the receipt this record holds (`GET /v1/attachments/:id/grant`).
   * Present only while it has one; snapshots written before P2c never carry
   * it, and both shapes stay valid.
   */
  attachment_id?: string;
  /**
   * P3-T2: how the record was made. Present only when its create named one;
   * records made before phase 3 never carry it, and both shapes stay valid.
   */
  source?: TransactionSource;
};

export type EntryDto = RecordFields & { type: EntryType; wallet_id: string; category_id: string };
export type TransferDto = RecordFields & { type: "transfer"; source_wallet_id: string; destination_wallet_id: string };
/** The persisted record (also the change-log snapshot). */
export type TransactionDto = EntryDto | TransferDto;

/** `source` is how the record was made; absent or null means none. Only a create sets it. */
type RecordInput = { id: string; amount_minor: Minor; occurred_on: string; note?: string | null; merchant?: string | null; source?: TransactionSource | null };
/** POST /v1/transactions: a discriminated union on `type`. */
export type CreateTransactionRequest =
  | (RecordInput & { type: EntryType; wallet_id: string; category_id: string })
  | (RecordInput & { type: "transfer"; source_wallet_id: string; destination_wallet_id: string });

/** PATCH /v1/transactions/:id with `If-Match`; the type never changes. */
export type UpdateTransactionRequest = {
  amount_minor?: Minor;
  occurred_on?: string;
  note?: string | null;
  merchant?: string | null;
  wallet_id?: string;
  category_id?: string;
  source_wallet_id?: string;
  destination_wallet_id?: string;
};

// Notes may span lines; nothing else from the control range is kept.
const NOTE_CONTROL = /[\p{Cc}\u2028\u2029]/u;

function optionalText(value: unknown, field: string, max: number, multiline: boolean): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ContractValidationError("VALIDATION_FAILED", "Expected text.", field);
  if (LONE_SURROGATE.test(value)) throw new ContractValidationError("VALIDATION_FAILED", "Text is not well-formed Unicode.", field);
  let text = value.normalize("NFC");
  if (multiline) text = text.replace(/\r\n?/g, "\n");
  text = text.trim();
  if (text.length === 0 || isInvisible(text)) return null;
  const control = multiline ? NOTE_CONTROL.test(text.replace(/\n/g, "")) : NOTE_CONTROL.test(text);
  if ([...text].length > max || control || BIDI_CONTROL.test(text)) {
    throw new ContractValidationError("VALIDATION_FAILED", `Expected at most ${max} characters without control characters.`, field);
  }
  return text;
}

/** Optional note: NFC, trimmed, line breaks kept as \n, at most 500 code points; empty means none (null). */
export function normalizeNote(value: unknown, field = "note"): string | null {
  return optionalText(value, field, NOTE_MAX_CHARS, true);
}

/** Optional merchant: one line, NFC, trimmed, at most 120 code points; empty means none (null). */
export function normalizeMerchant(value: unknown, field = "merchant"): string | null {
  return optionalText(value, field, MERCHANT_MAX_CHARS, false);
}

/** A create's `source`: absent or null is none (null); anything else must be one of TRANSACTION_SOURCES. */
export function parseTransactionSource(value: unknown, field = "source"): TransactionSource | null {
  // RED stub (P3-T2 Step 1): Step 3 replaces this body.
  return null;
}

const ENTRY_KEYS = ["amount_minor", "category_id", "deleted_at", "id", "merchant", "note", "occurred_on", "type", "version", "wallet_id"].join(",");
const TRANSFER_KEYS = ["amount_minor", "deleted_at", "destination_wallet_id", "id", "merchant", "note", "occurred_on", "source_wallet_id", "type", "version"].join(",");
const AMOUNT = /^[1-9][0-9]{0,10}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * True for exactly the persisted record shape of its type: with or without
 * `attachment_id` (P2c), which when present is a lower-case UUID.
 */
export function isTransactionSnapshot(value: unknown): value is TransactionDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if ("attachment_id" in record && !isUuid(record.attachment_id)) return false;
  const keys = Object.keys(record).filter((key) => key !== "attachment_id").sort().join(",");
  const shape =
    record.type === "transfer"
      ? keys === TRANSFER_KEYS && typeof record.source_wallet_id === "string" && typeof record.destination_wallet_id === "string" && record.source_wallet_id !== record.destination_wallet_id
      : (record.type === "expense" || record.type === "income") && keys === ENTRY_KEYS && typeof record.wallet_id === "string" && typeof record.category_id === "string";
  return (
    shape &&
    typeof record.id === "string" &&
    typeof record.amount_minor === "string" && AMOUNT.test(record.amount_minor) &&
    typeof record.occurred_on === "string" && DATE.test(record.occurred_on) &&
    (record.note === null || typeof record.note === "string") &&
    (record.merchant === null || typeof record.merchant === "string") &&
    (record.deleted_at === null || typeof record.deleted_at === "string") &&
    Number.isSafeInteger(record.version) && (record.version as number) >= 1
  );
}
