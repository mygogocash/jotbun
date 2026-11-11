/**
 * Phase 4 slip import contract: slip batches read inside `POST /v1/slips`,
 * slip drafts reviewed online, slip accounts mapped to wallets, the bank
 * album catalog, and the inbox count that sync carries.
 * - Only the phone normalises and hashes a slip's transaction reference
 *   (`normalizeSlipRef`, `slipRefHash`, A25). The Worker and the vault see
 *   salted hashes only, checked for shape with `isSlipRefHash`.
 * - Drafts never sync: the `slip_inbox` entity carries the open count only (S1, A28).
 */
import type { Minor } from "./common.ts";
import { AI_DAILY_LIMITS, AI_DRAFT_FLAGS, AI_SLIP_MAX_BYTES, AI_SLIP_MEDIA_TYPES, parseAiDate, parseAiLocale } from "./ai.ts";
import type { AiDraftFlag, AiLocale, AiSlipMediaType } from "./ai.ts";
import { ContractValidationError } from "./errors.ts";
import { assertKnownFields, isUuid, validateOccurredOn } from "./validation.ts";

export const THAI_BANK_KEYS = ["bbl", "kbank", "ktb", "ttb", "scb", "bay", "gsb", "ghb", "baac", "kkp", "cimb", "uob", "lhb", "tisco", "icbc", "tcrb", "ibank", "other"] as const;
export type ThaiBankKey = (typeof THAI_BANK_KEYS)[number];

export const SLIP_PURPOSES = ["live", "backfill"] as const;
export type SlipPurpose = (typeof SLIP_PURPOSES)[number];

export const SLIP_OUTCOMES = ["read", "duplicate", "unreadable", "over_quota", "paused"] as const;
export type SlipOutcome = (typeof SLIP_OUTCOMES)[number];

/** How a slip arrived (A1): `album` from the backfill or daily reading, `share` from the share paths; `photo` is reserved for a later plan. */
export const SLIP_ORIGINS = ["album", "share", "photo"] as const;
export type SlipOrigin = (typeof SLIP_ORIGINS)[number];

export type SlipReadModel = "claude-haiku-5-5" | "claude-opus-5-5";
const SLIP_READ_MODELS: readonly SlipReadModel[] = ["claude-haiku-5-5", "claude-opus-5-5"];

/** Batch, quota, lease, deadline and phone limits of slip import (S5, S6, C10, C11). */
export const SLIP_LIMITS = {
  batchSlips: 5,
  batchBytes: 8_388_608,
  imageBytes: AI_SLIP_MAX_BYTES,
  isolateBatches: 3,
  leaseMs: 90_000,
  readsAtOnce: 2,
  startDeadlineMs: 25_000,
  serverDeadlineMs: 80_000,
  clientTimeoutMs: 90_000,
  liveDaily: AI_DAILY_LIMITS.slip,
  backfillUses: 500,
  backfillDays: 30,
  connectDaysBack: 90,
  draftDays: 30,
  confirmBatch: 50,
  maxEdgePx: 1600,
  jpegQuality: 0.7,
} as const;

/** The id of the one `slip_inbox` entity in every vault (S1). */
export const SLIP_INBOX_ID = "5b1f0c2a-6d3e-4f70-8a19-2c4d6e8f0a1b";
const SLIP_INBOX_MAX_OPEN = 100_000;

export type SlipInboxSnapshot = { id: string; version: number; open: number };
export type SlipBatchItem = { ref_hash: string; image_base64: string; media_type: AiSlipMediaType; album: string | null; origin: SlipOrigin };
export type SlipBatchRequest = { purpose: SlipPurpose; last: boolean; today: string; locale: AiLocale; slips: SlipBatchItem[] };
/** One side of a slip as printed. */
export type SlipParty = { bank: ThaiBankKey | null; account_last4: string | null; name: string | null };
export type SlipDraftDto = {
  id: string;
  amount_minor: Minor | null;
  occurred_on: string | null;
  occurred_time: string | null;
  /** The vault's reading when written: `out` when the person is `from` (S2). */
  direction: "out" | "in";
  from: SlipParty;
  to: SlipParty;
  category_id: string | null;
  category_guessed: boolean;
  flags: AiDraftFlag[];
  album: string | null;
  origin: SlipOrigin;
  model: SlipReadModel;
  escalated: boolean;
  created_at: string;
  expires_at: string;
  duplicate_of: string | null;
};
export type SlipResult = { ref_hash: string; outcome: SlipOutcome; draft: SlipDraftDto | null };
export type SlipBatchResult = { results: SlipResult[]; uses_left: { live: number; backfill: number }; retry_after_seconds: number | null };
export type SlipDraftsPage = { drafts: SlipDraftDto[]; total: number; next_cursor: string | null };
export type SlipConfirmRequest = { drafts: { draft_id: string; transaction: Record<string, unknown> }[] };
export type SlipAccountDto = { id: string; version: number; bank: ThaiBankKey; account_last4: string; wallet_id: string | null; open_drafts: number };
export type SlipRefRequest = { ref_hash: string; transaction_id: string };
/** `salt` is base64url without padding: 32 bytes. */
export type SlipSaltDto = { salt: string };
export type BankAlbumDto = { bank: ThaiBankKey; platform: "ios" | "android"; album_name: string };

/** Domain label of the salted slip reference hash (§6.8 step 4). */
export const SLIP_REF_HASH_LABEL = "jotbun-slip-ref-v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

const AMOUNT = /^[1-9][0-9]{0,10}$/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const LAST4 = /^[0-9]{4}$/;
const REF_HASH = /^[0-9a-f]{64}$/;
const SALT = /^[A-Za-z0-9_-]{43}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BANK_CODE = /^[0-9]{1,3}$/;
const PRINTABLE_ASCII = /^[\x21-\x7e]{1,64}$/;
const THAI_DIGIT = /[๐-๙]/g;

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const isInstant = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && [...value].length <= max;
const isOneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    validateOccurredOn(value, "1970-01-01", "9999-12-31");
    return true;
  } catch {
    return false;
  }
}

export function isThaiBankKey(value: unknown): value is ThaiBankKey {
  return isOneOf(THAI_BANK_KEYS, value);
}

export function isSlipRefHash(value: unknown): value is string {
  return typeof value === "string" && REF_HASH.test(value);
}

/** The `slip_inbox` entity's persisted snapshot: exactly its id, version and open count. */
export function isSlipInboxSnapshot(value: unknown): value is SlipInboxSnapshot {
  return (
    isObject(value) && hasExactly(value, ["id", "version", "open"]) &&
    value.id === SLIP_INBOX_ID && isVersion(value.version) &&
    isCount(value.open) && (value.open as number) <= SLIP_INBOX_MAX_OPEN
  );
}

function isSlipParty(value: unknown): value is SlipParty {
  return (
    isObject(value) && hasExactly(value, ["bank", "account_last4", "name"]) &&
    (value.bank === null || isThaiBankKey(value.bank)) &&
    (value.account_last4 === null || (typeof value.account_last4 === "string" && LAST4.test(value.account_last4))) &&
    (value.name === null || isText(value.name, 120))
  );
}

const DRAFT_KEYS = [
  "id", "amount_minor", "occurred_on", "occurred_time", "direction", "from", "to", "category_id", "category_guessed",
  "flags", "album", "origin", "model", "escalated", "created_at", "expires_at", "duplicate_of",
] as const;

function isSlipDraftDto(value: unknown): value is SlipDraftDto {
  return (
    isObject(value) && hasExactly(value, DRAFT_KEYS) &&
    isUuid(value.id) &&
    (value.amount_minor === null || (typeof value.amount_minor === "string" && AMOUNT.test(value.amount_minor))) &&
    (value.occurred_on === null || isDate(value.occurred_on)) &&
    (value.occurred_time === null || (typeof value.occurred_time === "string" && TIME.test(value.occurred_time))) &&
    (value.direction === "out" || value.direction === "in") &&
    isSlipParty(value.from) && isSlipParty(value.to) &&
    (value.category_id === null || isUuid(value.category_id)) &&
    typeof value.category_guessed === "boolean" &&
    Array.isArray(value.flags) && value.flags.every((flag) => isOneOf(AI_DRAFT_FLAGS, flag)) &&
    (value.album === null || isText(value.album, 60)) &&
    isOneOf(SLIP_ORIGINS, value.origin) &&
    isOneOf(SLIP_READ_MODELS, value.model) &&
    typeof value.escalated === "boolean" &&
    isInstant(value.created_at) && isInstant(value.expires_at) &&
    (value.duplicate_of === null || isUuid(value.duplicate_of))
  );
}

function isSlipResult(value: unknown): value is SlipResult {
  return (
    isObject(value) && hasExactly(value, ["ref_hash", "outcome", "draft"]) &&
    isSlipRefHash(value.ref_hash) && isOneOf(SLIP_OUTCOMES, value.outcome) &&
    (value.draft === null || isSlipDraftDto(value.draft))
  );
}

/** `POST /v1/slips` answer. */
export function isSlipBatchResult(value: unknown): value is SlipBatchResult {
  if (!isObject(value) || !hasExactly(value, ["results", "uses_left", "retry_after_seconds"])) return false;
  const usesLeft = value.uses_left;
  return (
    Array.isArray(value.results) && value.results.every((result) => isSlipResult(result)) &&
    isObject(usesLeft) && hasExactly(usesLeft, ["live", "backfill"]) && isCount(usesLeft.live) && isCount(usesLeft.backfill) &&
    (value.retry_after_seconds === null || isCount(value.retry_after_seconds))
  );
}

/** `GET /v1/drafts` answer; `next_cursor` is an opaque base64url keyset cursor, null on the last page. */
export function isSlipDraftsPage(value: unknown): value is SlipDraftsPage {
  return (
    isObject(value) && hasExactly(value, ["drafts", "total", "next_cursor"]) &&
    Array.isArray(value.drafts) && value.drafts.every((draft) => isSlipDraftDto(draft)) &&
    isCount(value.total) &&
    (value.next_cursor === null || (typeof value.next_cursor === "string" && CURSOR.test(value.next_cursor)))
  );
}

export function isSlipAccountDto(value: unknown): value is SlipAccountDto {
  return (
    isObject(value) && hasExactly(value, ["id", "version", "bank", "account_last4", "wallet_id", "open_drafts"]) &&
    isUuid(value.id) && isVersion(value.version) && isThaiBankKey(value.bank) &&
    typeof value.account_last4 === "string" && LAST4.test(value.account_last4) &&
    (value.wallet_id === null || isUuid(value.wallet_id)) &&
    isCount(value.open_drafts)
  );
}

/** `GET /v1/slip-accounts` answer. */
export function isSlipAccountsDto(value: unknown): value is { accounts: SlipAccountDto[] } {
  return isObject(value) && hasExactly(value, ["accounts"]) && Array.isArray(value.accounts) && value.accounts.every((account) => isSlipAccountDto(account));
}

/** `GET /v1/slips/salt` answer. */
export function isSlipSaltDto(value: unknown): value is SlipSaltDto {
  return isObject(value) && hasExactly(value, ["salt"]) && typeof value.salt === "string" && SALT.test(value.salt);
}

function isBankAlbumDto(value: unknown): value is BankAlbumDto {
  return (
    isObject(value) && hasExactly(value, ["bank", "platform", "album_name"]) &&
    isThaiBankKey(value.bank) && (value.platform === "ios" || value.platform === "android") &&
    isText(value.album_name, 60)
  );
}

/** `GET /v1/catalog/bank-albums` answer. */
export function isBankAlbumsDto(value: unknown): value is { albums: BankAlbumDto[] } {
  return isObject(value) && hasExactly(value, ["albums"]) && Array.isArray(value.albums) && value.albums.every((album) => isBankAlbumDto(album));
}

function parseSlipImage(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !BASE64.test(value)) {
    throw new ContractValidationError("VALIDATION_FAILED", "image_base64 must be base64 without line breaks.", field);
  }
  const bytes = (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (bytes > SLIP_LIMITS.imageBytes) throw new ContractValidationError("UPLOAD_TOO_LARGE", "The slip image is too large.", field);
  return value;
}

function parseAlbum(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ContractValidationError("VALIDATION_FAILED", "album must be text or null.", field);
  const album = value.normalize("NFC").trim();
  if (album.length === 0 || [...album].length > 60) throw new ContractValidationError("VALIDATION_FAILED", "album must be 1-60 characters.", field);
  return album;
}

const SLIP_KEYS = ["ref_hash", "image_base64", "media_type", "album", "origin"] as const;

/** `POST /v1/slips` body: 1 to 5 slips with distinct hashes; `album` slips only in a backfill batch, `share` and `photo` only in a live one (A1). */
export function parseSlipBatchRequest(body: unknown): SlipBatchRequest {
  const input = assertKnownFields(body, ["purpose", "last", "today", "locale", "slips"]);
  const purpose = input.purpose;
  if (purpose !== "live" && purpose !== "backfill") throw new ContractValidationError("VALIDATION_FAILED", "purpose must be live or backfill.", "purpose");
  const last = input.last;
  if (typeof last !== "boolean") throw new ContractValidationError("VALIDATION_FAILED", "last must be true or false.", "last");
  const today = parseAiDate(input.today);
  const locale = parseAiLocale(input.locale);
  const list = input.slips;
  if (!Array.isArray(list) || list.length < 1 || list.length > SLIP_LIMITS.batchSlips) {
    throw new ContractValidationError("VALIDATION_FAILED", `slips must hold 1-${SLIP_LIMITS.batchSlips} slips.`, "slips");
  }
  const seen = new Set<string>();
  const slips = list.map((raw: unknown, index: number): SlipBatchItem => {
    const at = `slips[${index}]`;
    const slip = assertKnownFields(raw, SLIP_KEYS, at);
    const refHash = slip.ref_hash;
    if (!isSlipRefHash(refHash)) throw new ContractValidationError("VALIDATION_FAILED", "ref_hash must be 64 lowercase hex digits.", `${at}.ref_hash`);
    if (seen.has(refHash)) throw new ContractValidationError("VALIDATION_FAILED", "Each slip needs its own ref_hash.", `${at}.ref_hash`);
    seen.add(refHash);
    const mediaType = slip.media_type;
    if (!isOneOf(AI_SLIP_MEDIA_TYPES, mediaType)) {
      throw new ContractValidationError("UPLOAD_UNSUPPORTED_TYPE", "The slip must be a JPEG, PNG or WebP image.", `${at}.media_type`);
    }
    const image = parseSlipImage(slip.image_base64, `${at}.image_base64`);
    const album = parseAlbum(slip.album, `${at}.album`);
    const origin = slip.origin;
    const fits = purpose === "backfill" ? origin === "album" : origin === "share" || origin === "photo";
    if (!fits) throw new ContractValidationError("VALIDATION_FAILED", "origin must be album in a backfill batch, and share or photo in a live one.", `${at}.origin`);
    return { ref_hash: refHash, image_base64: image, media_type: mediaType as AiSlipMediaType, album, origin: origin as SlipOrigin };
  });
  return { purpose, last, today, locale, slips };
}

/** `POST /v1/drafts/confirm` body: 1 to 50 drafts with distinct draft and record ids; the vault checks each record as `transactions.create` does. */
export function parseSlipConfirmRequest(body: unknown): SlipConfirmRequest {
  const input = assertKnownFields(body, ["drafts"]);
  const list = input.drafts;
  if (!Array.isArray(list) || list.length < 1 || list.length > SLIP_LIMITS.confirmBatch) {
    throw new ContractValidationError("VALIDATION_FAILED", `drafts must hold 1-${SLIP_LIMITS.confirmBatch} drafts.`, "drafts");
  }
  const draftIds = new Set<string>();
  const recordIds = new Set<string>();
  const drafts = list.map((raw: unknown, index: number) => {
    const at = `drafts[${index}]`;
    const item = assertKnownFields(raw, ["draft_id", "transaction"], at);
    const draftId = item.draft_id;
    if (!isUuid(draftId)) throw new ContractValidationError("VALIDATION_FAILED", "draft_id must be a UUID.", `${at}.draft_id`);
    if (draftIds.has(draftId)) throw new ContractValidationError("VALIDATION_FAILED", "Each draft is confirmed once.", `${at}.draft_id`);
    draftIds.add(draftId);
    const transaction = item.transaction;
    if (!isObject(transaction)) throw new ContractValidationError("VALIDATION_FAILED", "transaction must be an object.", `${at}.transaction`);
    const recordId = transaction.id;
    if (!isUuid(recordId)) throw new ContractValidationError("VALIDATION_FAILED", "transaction.id must be a UUID.", `${at}.transaction.id`);
    if (recordIds.has(recordId)) throw new ContractValidationError("VALIDATION_FAILED", "Each record needs its own id.", `${at}.transaction.id`);
    recordIds.add(recordId);
    return { draft_id: draftId, transaction };
  });
  return { drafts };
}

/** `PUT /v1/slip-accounts/:id` body: a wallet id, or null to unmap. */
export function parseSlipAccountUpdate(body: unknown): { wallet_id: string | null } {
  const input = assertKnownFields(body, ["wallet_id"]);
  const walletId = input.wallet_id;
  if (walletId === null) return { wallet_id: null };
  if (!isUuid(walletId)) throw new ContractValidationError("VALIDATION_FAILED", "wallet_id must be a wallet id or null.", "wallet_id");
  return { wallet_id: walletId };
}

/** `POST /v1/slips/refs` body: a single read's slip reference hash and the record it became. */
export function parseSlipRefRequest(body: unknown): SlipRefRequest {
  const input = assertKnownFields(body, ["ref_hash", "transaction_id"]);
  const refHash = input.ref_hash;
  if (!isSlipRefHash(refHash)) throw new ContractValidationError("VALIDATION_FAILED", "ref_hash must be 64 lowercase hex digits.", "ref_hash");
  const transactionId = input.transaction_id;
  if (!isUuid(transactionId)) throw new ContractValidationError("VALIDATION_FAILED", "transaction_id must be a UUID.", "transaction_id");
  return { ref_hash: refHash, transaction_id: transactionId };
}

/**
 * `<bank>:<REFERENCE>` from a slip QR's bank code and transaction reference,
 * or null when they cannot be one. The bank code is 1 to 3 ASCII digits,
 * zero-padded to 3. The reference is NFC with every whitespace removed, 1 to
 * 64 printable ASCII characters (checked before upper-casing), upper-cased.
 */
export function normalizeSlipRef(bankCode: string, reference: string): string | null {
  if (typeof bankCode !== "string" || typeof reference !== "string" || !BANK_CODE.test(bankCode)) return null;
  const compact = reference.normalize("NFC").replace(/\s/g, "");
  if (!PRINTABLE_ASCII.test(compact)) return null;
  return `${bankCode.padStart(3, "0")}:${compact.toUpperCase()}`;
}

/** Lowercase hex SHA-256 of `salt || UTF-8(SLIP_REF_HASH_LABEL) || 0x00 || UTF-8(normalized)` (§6.8 step 4). */
export async function slipRefHash(salt: Uint8Array, normalized: string, sha256: (data: Uint8Array) => Promise<Uint8Array>): Promise<string> {
  if (salt.length !== 32) throw new RangeError("The slip salt must be 32 bytes.");
  const encoder = new TextEncoder();
  const label = encoder.encode(SLIP_REF_HASH_LABEL);
  const reference = encoder.encode(normalized);
  const input = new Uint8Array(salt.length + label.length + 1 + reference.length);
  input.set(salt, 0);
  input.set(label, salt.length);
  // The byte at salt.length + label.length stays 0: the separator.
  input.set(reference, salt.length + label.length + 1);
  const digest = await sha256(input);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The last four digits (Thai digits read as ASCII) of a masked account or phone number as printed; null with fewer than four. */
export function accountLast4(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const digits = text.replace(THAI_DIGIT, (digit) => String(digit.charCodeAt(0) - 0x0e50)).replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
