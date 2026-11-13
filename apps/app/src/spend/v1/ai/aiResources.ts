// The AI companion and GoGoCash bridge routes on the edge API (premium plan
// D15/D16), through the same v1 transport as every other read: token,
// binding, client header, refresh and exact DTO checks.
//
// AI POSTs are never resent after a lost response: each one spends a daily
// use, and a draft that never arrived is simply asked for again by the person.
// Each AI route waits its own AI_PHONE_TIMEOUT_MS, longer than the route's
// deadline on the server, so the phone hears the route's answer (H3).
import { AI_CONFIDENCE, AI_DRAFT_FLAGS, AI_DRAFT_TYPES, AI_FEATURES, AI_MODELS, AI_PHONE_TIMEOUT_MS, BUN_FACT_KINDS, SLIP_KINDS, isCashbackCatalogue, isUuid } from '@gogospend/contracts';
import type {
  AiAskRequest,
  AiAskResult,
  AiDraft,
  AiFeature,
  AiLocale,
  AiNoteResult,
  AiParseRequest,
  AiParseResult,
  AiPreferencesDto,
  AiPreferencesUpdate,
  AiSlipRequest,
  AiSlipResult,
  BunFact,
  CashbackCatalogue,
} from '@gogospend/contracts';

import type { V1Transport } from '../../../api/client.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactly = (value: Json, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const MINOR = /^(?:0|[1-9][0-9]{0,11})$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const isMinorOrNull = (value: unknown) => value === null || (typeof value === 'string' && MINOR.test(value));
const isTextOrNull = (value: unknown, max: number) => value === null || (typeof value === 'string' && value.length <= max);
const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;

export function isAiPreferencesDto(value: unknown): value is AiPreferencesDto {
  return isObject(value) && hasExactly(value, ['companion', 'cashback_tips', 'notice_version', 'current_notice_version', 'remaining', 'available']) &&
    typeof value.companion === 'boolean' && typeof value.cashback_tips === 'boolean' && typeof value.available === 'boolean' &&
    (value.notice_version === null || isCount(value.notice_version)) && isCount(value.current_notice_version) &&
    isObject(value.remaining) && hasExactly(value.remaining, AI_FEATURES) && AI_FEATURES.every((f) => isCount((value.remaining as Json)[f]));
}

export function isAiDraft(value: unknown): value is AiDraft {
  return isObject(value) && hasExactly(value, ['type', 'amount_minor', 'occurred_on', 'category_id', 'wallet_id', 'merchant', 'note', 'confidence', 'flags']) &&
    (value.type === 'expense' || value.type === 'income') && isMinorOrNull(value.amount_minor) &&
    (value.occurred_on === null || (typeof value.occurred_on === 'string' && DATE.test(value.occurred_on))) &&
    (value.category_id === null || isUuid(value.category_id)) && (value.wallet_id === null || isUuid(value.wallet_id)) &&
    isTextOrNull(value.merchant, 120) && isTextOrNull(value.note, 500) &&
    (AI_CONFIDENCE as readonly unknown[]).includes(value.confidence) &&
    Array.isArray(value.flags) && value.flags.every((f) => (AI_DRAFT_FLAGS as readonly unknown[]).includes(f));
}

const isDrafts = (value: unknown) => Array.isArray(value) && value.length <= 5 && value.every(isAiDraft);
/** Every AI result names the model whose words it shows, and whether an Opus call ran (H4). */
const namesItsModel = (value: Json) => (AI_MODELS as readonly unknown[]).includes(value.model) && typeof value.escalated === 'boolean';

export function isAiParseResult(value: unknown): value is AiParseResult {
  return isObject(value) && hasExactly(value, ['drafts', 'source', 'model', 'escalated']) && isDrafts(value.drafts) && (value.source === 'ai' || value.source === 'rules') && namesItsModel(value);
}

/** A slip read also says what it found, whether a model refused, and the tokens its calls used (P3-T8). */
export function isAiSlipResult(value: unknown): value is AiSlipResult {
  return isObject(value) && hasExactly(value, ['drafts', 'bank', 'source', 'model', 'escalated', 'kind', 'declined', 'tokens']) && isDrafts(value.drafts) && isTextOrNull(value.bank, 60) && value.source === 'ai' && namesItsModel(value) &&
    (SLIP_KINDS as readonly unknown[]).includes(value.kind) && typeof value.declined === 'boolean' &&
    isObject(value.tokens) && hasExactly(value.tokens, ['input', 'output']) && isCount(value.tokens.input) && isCount(value.tokens.output);
}

const FACT_KEYS = ['kind', 'amount_minor', 'count', 'days', 'percent', 'category_key', 'category_label'];

export function isBunFact(value: unknown): value is BunFact {
  if (!isObject(value) || !Object.keys(value).every((key) => FACT_KEYS.includes(key))) return false;
  return (BUN_FACT_KINDS as readonly unknown[]).includes(value.kind) &&
    (value.amount_minor === undefined || (typeof value.amount_minor === 'string' && MINOR.test(value.amount_minor))) &&
    [value.count, value.days, value.percent].every((n) => n === undefined || isCount(n)) &&
    (value.category_key === undefined || isTextOrNull(value.category_key, 40)) &&
    (value.category_label === undefined || isTextOrNull(value.category_label, 80));
}

export function isAiNoteResult(value: unknown): value is AiNoteResult {
  return isObject(value) && hasExactly(value, ['date', 'facts', 'text', 'source', 'model', 'escalated']) && typeof value.date === 'string' && DATE.test(value.date) &&
    Array.isArray(value.facts) && value.facts.every(isBunFact) && typeof value.text === 'string' && value.text.length <= 600 &&
    (value.source === 'ai' || value.source === 'facts') && namesItsModel(value);
}

/** What a figure counts over (P3-T9): its days, an expense or income type, and a category id (null for every category). */
const isFigureScope = (value: unknown) => value === null || (isObject(value) && hasExactly(value, ['from', 'through', 'type', 'category_id']) &&
  typeof value.from === 'string' && DATE.test(value.from) && typeof value.through === 'string' && DATE.test(value.through) &&
  (AI_DRAFT_TYPES as readonly unknown[]).includes(value.type) && (value.category_id === null || isUuid(value.category_id)));

/** A figure an answer used: its label and amount, how many records it adds up (null for a budget line), and what it counts over (P3-T9). */
const isAiFigure = (value: unknown) => isObject(value) && hasExactly(value, ['label', 'amount_minor', 'count', 'scope']) && typeof value.label === 'string' &&
  typeof value.amount_minor === 'string' && /^-?(?:0|[1-9][0-9]{0,11})$/.test(value.amount_minor) && (value.count === null || isCount(value.count)) && isFigureScope(value.scope);

export function isAiAskResult(value: unknown): value is AiAskResult {
  return isObject(value) && hasExactly(value, ['answer', 'figures', 'source', 'model', 'escalated']) && typeof value.answer === 'string' && value.answer.length <= 2000 &&
    Array.isArray(value.figures) && value.figures.every(isAiFigure) &&
    (value.source === 'ai' || value.source === 'facts') && namesItsModel(value);
}

/** A route's phone wait, for each attempt and for the whole request (a refreshed resend included). */
const phoneWait = (feature: AiFeature) => ({ timeoutMs: AI_PHONE_TIMEOUT_MS[feature], deadlineMs: AI_PHONE_TIMEOUT_MS[feature] });

export type AiResources = {
  preferences(): Promise<AiPreferencesDto>;
  setPreferences(update: AiPreferencesUpdate): Promise<AiPreferencesDto>;
  parse(request: AiParseRequest): Promise<AiParseResult>;
  slip(request: AiSlipRequest): Promise<AiSlipResult>;
  note(date: string, locale: AiLocale): Promise<AiNoteResult>;
  ask(request: AiAskRequest): Promise<AiAskResult>;
  cashbackCatalogue(): Promise<CashbackCatalogue>;
};

export function createAiResources(transport: V1Transport): AiResources {
  return {
    preferences: () => transport.request('GET', '/v1/me/ai-preferences', { validate: isAiPreferencesDto }),
    setPreferences: (update) => transport.request('PUT', '/v1/me/ai-preferences', { body: update, validate: isAiPreferencesDto }),
    parse: (request) => transport.request('POST', '/v1/ai/parse', { body: request, resendLost: false, ...phoneWait('parse'), validate: isAiParseResult }),
    slip: (request) => transport.request('POST', '/v1/ai/slip', { body: request, resendLost: false, ...phoneWait('slip'), validate: isAiSlipResult }),
    note: (date, locale) => transport.request('GET', `/v1/ai/note?date=${encodeURIComponent(date)}&locale=${encodeURIComponent(locale)}`, { ...phoneWait('note'), validate: isAiNoteResult }),
    ask: (request) => transport.request('POST', '/v1/ai/ask', { body: request, resendLost: false, ...phoneWait('ask'), validate: isAiAskResult }),
    cashbackCatalogue: () => transport.request('GET', '/v1/bridge/gogocash/catalogue', { validate: isCashbackCatalogue }),
  };
}
