/**
 * Settings (spec section 6.10; P5-T3, X5): one synced entity per vault that
 * holds the home currency, `DEFAULT_HOME_CURRENCY` (THB) until its first
 * change. A change is C8 (P5-T13), one vault command; its preview counts
 * what the change would convert.
 */
import { isCurrencyCode } from "./currency.ts";
import type { CurrencyCode } from "./currency.ts";
import { isUuid } from "./validation.ts";

/** The persisted settings (also the change-log snapshot). */
export type SettingsSnapshot = { id: string; home_currency: CurrencyCode; version: number };

/** The home currency change's body. */
export type HomeCurrencyRequest = { currency: CurrencyCode };

/** What a change to `currency` would convert: records, those with an own or exchange rate, and stored budget months. */
export type HomeCurrencyPreview = { currency: CurrencyCode; records: number; own_rates: number; budgets: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;

/** True for exactly the persisted settings: its id, an ISO home currency and its version. */
export function isSettingsSnapshot(value: unknown): value is SettingsSnapshot {
  return (
    isObject(value) && hasExactly(value, ["id", "home_currency", "version"]) &&
    isUuid(value.id) && isCurrencyCode(value.home_currency) && isVersion(value.version)
  );
}

/** True for exactly a preview: an ISO currency and three counts of 0 or more. */
export function isHomeCurrencyPreview(value: unknown): value is HomeCurrencyPreview {
  return (
    isObject(value) && hasExactly(value, ["currency", "records", "own_rates", "budgets"]) &&
    isCurrencyCode(value.currency) && isCount(value.records) && isCount(value.own_rates) && isCount(value.budgets)
  );
}
