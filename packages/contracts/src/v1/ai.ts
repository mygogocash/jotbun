/**
 * The AI companion ("Bun") wire contract: consent, daily limits, drafts from a
 * sentence or a bank slip, the daily note and Ask Bun. Owner decision D15
 * (24 October 2026): AI explains the user's own numbers and never advises on
 * financial products.
 * - Off until the user agrees to the current notice (`AI_NOTICE_VERSION`).
 * - Every amount Bun says comes from the database; text that names any other
 *   number is replaced by the plain facts.
 * - Drafts are never saved by the server: the app shows them in Quick add
 *   and the user saves through the normal commands.
 */
import type { Minor } from "./common.ts";
import { ContractValidationError } from "./errors.ts";
import { assertKnownFields } from "./validation.ts";

/** Bump when the AI notice text changes; consent to an older notice no longer counts. */
export const AI_NOTICE_VERSION = 1;

/**
 * The oldest app build that reads phase 3's contract changes (C5), starting
 * with a record's `source` (P3-T2). A release carrying them raises the
 * server's minimum client versions to at least this, and the app's own
 * version (app.json `expo.version`) is never below it.
 */
export const AI_MIN_CLIENT_VERSION = "0.2.0";

export const AI_FEATURES = ["parse", "slip", "note", "ask"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Uses per account per Bangkok day. */
export const AI_DAILY_LIMITS: Readonly<Record<AiFeature, number>> = { parse: 30, slip: 10, note: 3, ask: 20 };

export const AI_LOCALES = ["th", "en", "vi"] as const;
export type AiLocale = (typeof AI_LOCALES)[number];

export const AI_TEXT_MAX_CHARS = 200;
export const AI_QUESTION_MAX_CHARS = 300;
/** Decoded slip image size; the app sends a downscaled JPEG well under this. */
export const AI_SLIP_MAX_BYTES = 1_200_000;
export const AI_SLIP_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AiSlipMediaType = (typeof AI_SLIP_MEDIA_TYPES)[number];

export type AiPreferences = {
  /** AI help (sentence and slip drafts, the daily note, Ask Bun). */
  companion: boolean;
  /** GoGoCash cashback tips; matched on the phone, never sent anywhere. */
  cashback_tips: boolean;
  /** The AI notice version the user agreed to, or null. */
  notice_version: number | null;
};

/** GET /v1/me/ai-preferences */
export type AiPreferencesDto = AiPreferences & {
  current_notice_version: number;
  /** Uses left today per feature (Bangkok day). */
  remaining: Record<AiFeature, number>;
  /** False while the service is paused or not configured; the app then uses its offline rules. */
  available: boolean;
};

/** PUT /v1/me/ai-preferences. Turning `companion` on needs `notice_version` = AI_NOTICE_VERSION. */
export type AiPreferencesUpdate = Partial<AiPreferences>;

export function parseAiPreferencesUpdate(body: unknown): AiPreferencesUpdate {
  const input = assertKnownFields(body, ["companion", "cashback_tips", "notice_version"]);
  const update: AiPreferencesUpdate = {};
  for (const key of ["companion", "cashback_tips"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new ContractValidationError("VALIDATION_FAILED", `${key} must be true or false.`, key);
    update[key] = input[key] as boolean;
  }
  if (input.notice_version !== undefined) {
    if (input.notice_version !== AI_NOTICE_VERSION) throw new ContractValidationError("VALIDATION_FAILED", "notice_version must be the current AI notice.", "notice_version");
    update.notice_version = AI_NOTICE_VERSION;
  }
  if (Object.keys(update).length === 0) throw new ContractValidationError("VALIDATION_FAILED", "Nothing to change.", "body");
  return update;
}

export const AI_DRAFT_TYPES = ["expense", "income"] as const;
export type AiDraftType = (typeof AI_DRAFT_TYPES)[number];

export const AI_CONFIDENCE = ["high", "medium", "low"] as const;
export type AiConfidence = (typeof AI_CONFIDENCE)[number];

/** Why a draft needs a look; shown as hedged words, never silently fixed. */
export const AI_DRAFT_FLAGS = ["amount_unclear", "multiple_amounts", "date_guessed", "category_guessed", "wallet_guessed", "not_money"] as const;
export type AiDraftFlag = (typeof AI_DRAFT_FLAGS)[number];

/**
 * A proposed record. Every id is one of the account's own; anything the
 * model could not ground is null and flagged. The user confirms in Quick add.
 */
export type AiDraft = {
  type: AiDraftType;
  amount_minor: Minor | null;
  occurred_on: string | null;
  category_id: string | null;
  wallet_id: string | null;
  merchant: string | null;
  note: string | null;
  confidence: AiConfidence;
  flags: AiDraftFlag[];
};

export const AI_DRAFTS_MAX = 5;

export type AiParseRequest = { text: string; today: string; locale: AiLocale };
/** `rules`: the offline rule parser answered (AI off, paused, out of uses or unsure). */
export type AiParseResult = { drafts: AiDraft[]; source: "ai" | "rules" };

export type AiSlipRequest = { image_base64: string; media_type: AiSlipMediaType; today: string; locale: AiLocale };
export type AiSlipResult = { drafts: AiDraft[]; bank: string | null; source: "ai" };

/** One true fact about the user's own numbers. Money is exact satang. */
export const BUN_FACT_KINDS = [
  "spent_today",
  "no_records_today",
  "logged_days_week",
  "month_spent",
  "month_income",
  "budget_left",
  "budget_per_day",
  "over_budget",
  "top_category",
] as const;
export type BunFactKind = (typeof BUN_FACT_KINDS)[number];

export type BunFact = {
  kind: BunFactKind;
  amount_minor?: Minor;
  count?: number;
  days?: number;
  percent?: number;
  /** Built-in key (translated on the phone) or the user's own label. */
  category_key?: string | null;
  category_label?: string | null;
};

/** GET /v1/ai/note?date=&locale= */
export type AiNoteResult = { date: string; facts: BunFact[]; text: string; source: "ai" | "facts" };

export type AiAskRequest = { question: string; today: string; locale: AiLocale };
/** A figure the answer used, read from the user's records by a server tool. */
export type AiFigure = { label: string; amount_minor: Minor };
export type AiAskResult = { answer: string; figures: AiFigure[]; source: "ai" | "facts" };

const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function parseAiLocale(value: unknown, field = "locale"): AiLocale {
  if (!(AI_LOCALES as readonly unknown[]).includes(value)) throw new ContractValidationError("VALIDATION_FAILED", "locale must be th, en or vi.", field);
  return value as AiLocale;
}

export function parseAiDate(value: unknown, field = "today"): string {
  if (typeof value !== "string" || !DATE.test(value)) throw new ContractValidationError("INVALID_DATE", "Expected a date as YYYY-MM-DD.", field);
  return value;
}

function boundedText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") throw new ContractValidationError("VALIDATION_FAILED", `${field} must be text.`, field);
  const text = value.normalize("NFC").trim();
  if (text.length === 0 || [...text].length > max) throw new ContractValidationError("VALIDATION_FAILED", `${field} must be 1-${max} characters.`, field);
  return text;
}

export function parseAiParseRequest(body: unknown): AiParseRequest {
  const input = assertKnownFields(body, ["text", "today", "locale"]);
  return { text: boundedText(input.text, AI_TEXT_MAX_CHARS, "text"), today: parseAiDate(input.today), locale: parseAiLocale(input.locale) };
}

export function parseAiAskRequest(body: unknown): AiAskRequest {
  const input = assertKnownFields(body, ["question", "today", "locale"]);
  return { question: boundedText(input.question, AI_QUESTION_MAX_CHARS, "question"), today: parseAiDate(input.today), locale: parseAiLocale(input.locale) };
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function parseAiSlipRequest(body: unknown): AiSlipRequest {
  const input = assertKnownFields(body, ["image_base64", "media_type", "today", "locale"]);
  if (!(AI_SLIP_MEDIA_TYPES as readonly unknown[]).includes(input.media_type)) {
    throw new ContractValidationError("UPLOAD_UNSUPPORTED_TYPE", "The slip must be a JPEG, PNG or WebP image.", "media_type");
  }
  const data = input.image_base64;
  if (typeof data !== "string" || data.length === 0 || data.length % 4 !== 0 || !BASE64.test(data)) {
    throw new ContractValidationError("VALIDATION_FAILED", "image_base64 must be base64 without line breaks.", "image_base64");
  }
  const bytes = (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > AI_SLIP_MAX_BYTES) throw new ContractValidationError("UPLOAD_TOO_LARGE", "The slip image is too large.", "image_base64");
  return { image_base64: data, media_type: input.media_type as AiSlipMediaType, today: parseAiDate(input.today), locale: parseAiLocale(input.locale) };
}
