/**
 * v1 records. One row per logical expense, income or owned-wallet transfer;
 * a transfer is never two half-written rows. Amounts are positive integer
 * strings of the record currency's minor units (satang for THB). Deleted
 * records stay restorable for 30 days.
 */
import type { Minor } from "./common.ts";
import { RATE_SOURCES, isCurrencyCode, parseRate } from "./currency.ts";
import type { CurrencyCode, RateSource } from "./currency.ts";
import { ContractValidationError } from "./errors.ts";
import { BIDI_CONTROL, LONE_SURROGATE, TRACKING_START_MIN, isInvisible, isUuid, validateOccurredOn } from "./validation.ts";

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

/**
 * A record's money from phase 5 (P5-T2, C2): its currency; the rate, in home
 * units per unit of it (`parseRate`), and where the rate came from; the feed
 * day of a reference rate (B17, default pending owner Q4), else null; the
 * home amount frozen at save; and its trip, or null. A snapshot carries every
 * key or none: one written before phase 5 has none and reads as baht at 1,
 * as the P5-T4 migration filled its row.
 */
export type RecordMoney = {
  currency: CurrencyCode;
  rate: string;
  rate_source: RateSource;
  rate_date: string | null;
  home_amount_minor: Minor;
  trip_id: string | null;
};
/** RecordMoney's keys, sorted. */
export const RECORD_MONEY_KEYS = ["currency", "home_amount_minor", "rate", "rate_date", "rate_source", "trip_id"] as const;

/**
 * `wallet_amount_minor` is what the wallet was charged, in its own currency,
 * when that is not the record's (B15, default pending owner Q2), else null.
 */
export type EntryDto = RecordFields & Partial<RecordMoney & { wallet_amount_minor: Minor | null }> & { type: EntryType; wallet_id: string; category_id: string };
/** `to_amount_minor` is what an exchange put into the destination wallet, in its currency, else null. */
export type TransferDto = RecordFields & Partial<RecordMoney & { to_amount_minor: Minor | null }> & { type: "transfer"; source_wallet_id: string; destination_wallet_id: string };
/** The persisted record (also the change-log snapshot). */
export type TransactionDto = EntryDto | TransferDto;

/** `source` is how the record was made; absent or null means none. Only a create sets it. */
type RecordInput = { id: string; amount_minor: Minor; occurred_on: string; note?: string | null; merchant?: string | null; source?: TransactionSource | null };
/**
 * A record's money on a create, every key optional (P5-T2): its currency and
 * rate source; an own or exchange rate, or the home amount it charged, with
 * `home_currency` naming the home that figure is against; and its trip.
 */
type RecordMoneyInput = {
  currency?: CurrencyCode;
  rate_source?: RateSource;
  rate?: string;
  home_amount_minor?: Minor;
  home_currency?: CurrencyCode;
  trip_id?: string | null;
};
/** POST /v1/transactions: a discriminated union on `type`. */
export type CreateTransactionRequest =
  | (RecordInput & RecordMoneyInput & { type: EntryType; wallet_id: string; category_id: string })
  | (RecordInput & RecordMoneyInput & { type: "transfer"; source_wallet_id: string; destination_wallet_id: string; to_amount_minor?: Minor });

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
  currency?: CurrencyCode;
  rate_source?: RateSource;
  rate?: string;
  home_amount_minor?: Minor;
  home_currency?: CurrencyCode;
  to_amount_minor?: Minor;
  trip_id?: string | null;
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

const isTransactionSource = (value: unknown): value is TransactionSource => (TRANSACTION_SOURCES as readonly unknown[]).includes(value);

/** A create's `source`: absent or null is none (null); anything else must be one of TRANSACTION_SOURCES. */
export function parseTransactionSource(value: unknown, field = "source"): TransactionSource | null {
  if (value === undefined || value === null) return null;
  if (!isTransactionSource(value)) {
    throw new ContractValidationError("VALIDATION_FAILED", `Expected one of ${TRANSACTION_SOURCES.join(", ")}.`, field);
  }
  return value;
}

const ENTRY_KEYS = ["amount_minor", "category_id", "deleted_at", "id", "merchant", "note", "occurred_on", "type", "version", "wallet_id"].join(",");
const TRANSFER_KEYS = ["amount_minor", "deleted_at", "destination_wallet_id", "id", "merchant", "note", "occurred_on", "source_wallet_id", "type", "version"].join(",");
const AMOUNT = /^[1-9][0-9]{0,10}$/;
/** 0 to the cap: a home or wallet amount of 0 is kept (default pending owner Q10). */
const AMOUNT_OR_ZERO = /^(0|[1-9][0-9]{0,10})$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/** Every money key a snapshot may carry: RecordMoney's, then the entry's and the transfer's own. */
const MONEY_KEYS: readonly string[] = [...RECORD_MONEY_KEYS, "wallet_amount_minor", "to_amount_minor"];
const ENTRY_MONEY_KEYS = [...RECORD_MONEY_KEYS, "wallet_amount_minor"].sort().join(",");
const TRANSFER_MONEY_KEYS = [...RECORD_MONEY_KEYS, "to_amount_minor"].sort().join(",");

function isRate(value: unknown): boolean {
  try {
    parseRate(value);
    return true;
  } catch {
    return false;
  }
}

/** A real Gregorian date from 1970, as a trip's and a quote's (P5-T3). */
function isRateDate(value: unknown): boolean {
  try {
    validateOccurredOn(value, TRACKING_START_MIN, "9999-12-31");
    return true;
  } catch {
    return false;
  }
}

/**
 * A record's money keys (P5-T2): none, as before phase 5; or every
 * RECORD_MONEY_KEYS key plus `wallet_amount_minor` on an entry or
 * `to_amount_minor` on a transfer, each in range.
 */
function hasRecordMoney(record: Record<string, unknown>, transfer: boolean): boolean {
  const keys = Object.keys(record).filter((key) => MONEY_KEYS.includes(key)).sort().join(",");
  if (keys === "") return true;
  const charged = transfer ? record.to_amount_minor : record.wallet_amount_minor;
  return (
    keys === (transfer ? TRANSFER_MONEY_KEYS : ENTRY_MONEY_KEYS) &&
    isCurrencyCode(record.currency) &&
    isRate(record.rate) &&
    (RATE_SOURCES as readonly unknown[]).includes(record.rate_source) &&
    (record.rate_date === null || isRateDate(record.rate_date)) &&
    typeof record.home_amount_minor === "string" && AMOUNT_OR_ZERO.test(record.home_amount_minor) &&
    // An exchange puts at least one minor unit in; a wallet may be charged 0.
    (charged === null || (typeof charged === "string" && (transfer ? AMOUNT : AMOUNT_OR_ZERO).test(charged))) &&
    (record.trip_id === null || isUuid(record.trip_id))
  );
}

/**
 * True for exactly the persisted record shape of its type: with or without
 * `attachment_id` (P2c), which when present is a lower-case UUID; with or
 * without `source` (P3-T2), which when present is one of TRANSACTION_SOURCES;
 * and with every money key or none (P5-T2).
 */
export function isTransactionSnapshot(value: unknown): value is TransactionDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if ("attachment_id" in record && !isUuid(record.attachment_id)) return false;
  if ("source" in record && !isTransactionSource(record.source)) return false;
  const keys = Object.keys(record).filter((key) => key !== "attachment_id" && key !== "source" && !MONEY_KEYS.includes(key)).sort().join(",");
  const shape =
    record.type === "transfer"
      ? keys === TRANSFER_KEYS && typeof record.source_wallet_id === "string" && typeof record.destination_wallet_id === "string" && record.source_wallet_id !== record.destination_wallet_id
      : (record.type === "expense" || record.type === "income") && keys === ENTRY_KEYS && typeof record.wallet_id === "string" && typeof record.category_id === "string";
  return (
    shape &&
    hasRecordMoney(record, record.type === "transfer") &&
    typeof record.id === "string" &&
    typeof record.amount_minor === "string" && AMOUNT.test(record.amount_minor) &&
    typeof record.occurred_on === "string" && DATE.test(record.occurred_on) &&
    (record.note === null || typeof record.note === "string") &&
    (record.merchant === null || typeof record.merchant === "string") &&
    (record.deleted_at === null || typeof record.deleted_at === "string") &&
    Number.isSafeInteger(record.version) && (record.version as number) >= 1
  );
}
