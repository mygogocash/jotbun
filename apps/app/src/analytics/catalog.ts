// The §7 allow-list. An event leaves the phone only when its name is here and
// each property matches a closed rule. Nothing in the list can carry free text
// or an amount. Phase 2 emits through this same list (R23).
import { BUILTIN_CATEGORIES } from '@gogospend/contracts';

export type PropRule =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'bool' }
  | { kind: 'count'; max: number }
  | { kind: 'code' }
  | { kind: 'currency' }
  | { kind: 'version' }
  | { kind: 'screen' };

// C3's nine pack keys (decided, Q18). P2-T7's THAI_EVERYDAY_PACK in
// src/spend/v1/redesign/planning/thaiPack.ts holds the same keys; catalog.test.ts pins them equal.
export const PACK_KEYS = ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in'] as const;

const CATEGORY_KEYS: readonly string[] = [...BUILTIN_CATEGORIES.map((category) => category.key), ...PACK_KEYS, 'custom'];

export type AppEventName =
  | 'signed_up' | 'signed_in' | 'signed_out' | 'passkey_created' | 'account_deleted'
  | 'onboarding_step_viewed' | 'budget_set' | 'wallet_added' | 'setup_completed'
  | 'record_started' | 'record_saved' | 'record_edited' | 'record_deleted' | 'record_restored' | 'undo_used'
  | 'ai_consent_changed' | 'tell_bun_sent' | 'ai_draft_reviewed' | 'ask_bun_asked' | 'ask_bun_rated'
  | 'albums_connected' | 'slip_scan_finished' | 'slip_review_confirmed' | 'albums_disconnected'
  | 'insights_viewed' | 'recap_opened' | 'recap_shared' | 'private_mode_toggled' | 'reminder_set' | 'widget_added'
  | 'home_currency_set' | 'trip_started' | 'rate_overridden' | 'cash_exchanged' | 'cashback_card_tapped'
  | 'sync_failed' | 'conflict_shown' | 'permission_denied' | 'ai_unavailable' | 'resync_required';

export type CommonProps = {
  app_version: string;
  platform: 'ios' | 'android';
  language: 'th' | 'en' | 'vi';
  home_currency: string;
  ai_enabled: boolean;
  weeks_since_signup: number;
};

export type CleanProps = Record<string, string | number | boolean>;

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const CURRENCY = /^[A-Z]{3}$/;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const SCREEN = /^\/$|^(\/([a-z][a-z-]*|\[[a-z]+\]))+$/;
const GROUP_SEGMENT = /^\(.*\)$/;

function enumeration(values: readonly string[]): PropRule {
  return { kind: 'enum', values };
}

function count(max: number): PropRule {
  return { kind: 'count', max };
}

const bool: PropRule = { kind: 'bool' };
const code: PropRule = { kind: 'code' };
const currency: PropRule = { kind: 'currency' };
const version: PropRule = { kind: 'version' };
const screen: PropRule = { kind: 'screen' };

const account = {
  method: enumeration(['apple', 'google', 'email', 'passkey']),
};

// R81: wallet_type is cash, bank, credit_card, transit. ewallet is not a kind.
const firstOpen = {
  step: enumeration(['coffee', 'private', 'first_coffee', 'reminder', 'analytics_consent', 'language', 'wallet', 'budget', 'lock']),
  wallet_type: enumeration(['cash', 'bank', 'credit_card', 'transit']),
  material: enumeration(['silk', 'paper', 'titanium', 'sky', 'peach']),
  bun_face: enumeration(['smile', 'wink', 'calm', 'happy', 'wow']),
  budget: enumeration(['set', 'skipped']),
};

const recording = {
  kind: enumeration(['expense', 'income', 'transfer']),
  source: enumeration(['typed', 'photo', 'slip_import', 'tell_bun', 'statement', 'share_extension', 'siri']),
  category_key: enumeration(CATEGORY_KEYS),
  has_photo: bool,
  offline: bool,
  seconds_to_save: count(3600),
};

const bun = {
  outcome: enumeration(['kept', 'edited', 'dropped']),
  fields_edited: count(20),
  model: enumeration(['claude-haiku-5-5', 'claude-opus-5-5', 'rules']),
  escalated: bool,
};

const slip = {
  albums: count(50),
  found: count(100000),
  duplicates: count(100000),
  unreadable: count(100000),
  confirmed: count(100000),
  escalated: count(100000),
};

const insight = {
  tab: enumeration(['spending', 'in_out', 'calendar']),
  period: enumeration(['week', 'month', 'year']),
  reminder_hour: count(23),
  widget_size: enumeration(['small', 'medium', 'large', 'lock_screen']),
};

const travel = {
  currency_code: currency,
  trip_length_days: count(366),
  eligible_records: count(100000),
};

const reliability = {
  reason_code: code,
  screen,
  retry_count: count(1000),
  network_type: enumeration(['wifi', 'cellular', 'none', 'unknown']),
};

export const APP_EVENTS: Readonly<Record<AppEventName, Readonly<Record<string, PropRule>>>> = {
  signed_up: account,
  signed_in: account,
  signed_out: account,
  passkey_created: account,
  account_deleted: account,
  onboarding_step_viewed: firstOpen,
  budget_set: firstOpen,
  wallet_added: firstOpen,
  setup_completed: firstOpen,
  record_started: recording,
  record_saved: recording,
  record_edited: recording,
  record_deleted: recording,
  record_restored: recording,
  undo_used: recording,
  ai_consent_changed: bun,
  tell_bun_sent: bun,
  ai_draft_reviewed: bun,
  ask_bun_asked: bun,
  ask_bun_rated: bun,
  albums_connected: slip,
  slip_scan_finished: slip,
  slip_review_confirmed: slip,
  albums_disconnected: slip,
  insights_viewed: insight,
  recap_opened: insight,
  recap_shared: insight,
  private_mode_toggled: insight,
  reminder_set: insight,
  widget_added: insight,
  home_currency_set: travel,
  trip_started: travel,
  rate_overridden: travel,
  cash_exchanged: travel,
  cashback_card_tapped: travel,
  sync_failed: reliability,
  conflict_shown: reliability,
  permission_denied: reliability,
  ai_unavailable: reliability,
  resync_required: reliability,
};

export const COMMON_RULES: Readonly<Record<keyof CommonProps, PropRule>> = {
  app_version: version,
  platform: enumeration(['ios', 'android']),
  language: enumeration(['th', 'en', 'vi']),
  home_currency: currency,
  ai_enabled: bool,
  weeks_since_signup: count(1040),
};

function accepts(rule: PropRule, value: unknown): value is string | number | boolean {
  switch (rule.kind) {
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value);
    case 'bool':
      return typeof value === 'boolean';
    case 'count':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= rule.max;
    case 'code':
      return typeof value === 'string' && CODE.test(value);
    case 'currency':
      return typeof value === 'string' && CURRENCY.test(value);
    case 'version':
      return typeof value === 'string' && VERSION.test(value);
    case 'screen':
      return typeof value === 'string' && isScreenPattern(value);
  }
}

function isEventName(name: string): name is AppEventName {
  return Object.prototype.hasOwnProperty.call(APP_EVENTS, name);
}

/** Drops an unknown event, and drops any property that is not in the event's rules or fails its rule. */
export function cleanEvent(name: string, properties?: Record<string, unknown>): { name: AppEventName; properties: CleanProps } | null {
  if (!isEventName(name)) return null;
  const rules = APP_EVENTS[name];
  const clean: CleanProps = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    const rule = rules[key];
    if (rule === undefined) continue;
    if (!accepts(rule, value)) continue;
    clean[key] = value;
  }
  return { name, properties: clean };
}

/** Keeps only the common properties that match their rules. Missing ones stay missing. */
export function cleanCommon(common: Partial<CommonProps>): CleanProps {
  const clean: CleanProps = {};
  for (const key of Object.keys(COMMON_RULES) as (keyof CommonProps)[]) {
    const value = common[key];
    if (value === undefined) continue;
    if (!accepts(COMMON_RULES[key], value)) continue;
    clean[key] = value;
  }
  return clean;
}

/** A route pattern: `/`, or segments of letters-and-hyphens or `[param]`, at most 64 characters. */
export function isScreenPattern(name: string): boolean {
  return name.length <= 64 && SCREEN.test(name);
}

/** Drops expo-router `(group)` segments and returns the pattern, or null when a segment is a real value. */
export function screenPattern(segments: readonly string[]): string | null {
  const visible = segments.filter((segment) => !GROUP_SEGMENT.test(segment));
  const name = visible.length === 0 ? '/' : `/${visible.join('/')}`;
  return isScreenPattern(name) ? name : null;
}
