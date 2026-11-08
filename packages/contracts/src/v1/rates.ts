/**
 * Today's reference rates (spec section 6.10; P5-T3): the feed's latest
 * quotes against one base, as KV holds them and the phone caches them (P5-T6,
 * P5-T17). A quote is units of its currency per one unit of the base, kept as
 * the feed sent it (X1); a rate between two currencies is `crossRate` of
 * their quotes. The base needs no quote.
 */
import { canonicalQuote, isCurrencyCode } from "./currency.ts";
import type { CurrencyCode } from "./currency.ts";
import { TRACKING_START_MIN, validateOccurredOn } from "./validation.ts";

/** Units of the currency per one unit of the base, and the feed day it is from. */
export type FxQuoteDto = { per_base: string; day: string };

/** Each currency's latest quote on or before `as_of`, keyed by its ISO code. */
export type RatesTodayDto = { base: CurrencyCode; as_of: string; rates: Readonly<Record<CurrencyCode, FxQuoteDto>> };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/** A real Gregorian date from 1970. */
function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    validateOccurredOn(value, TRACKING_START_MIN, "9999-12-31");
    return true;
  } catch {
    return false;
  }
}

function isFxQuote(value: unknown, asOf: string): value is FxQuoteDto {
  return (
    isObject(value) && hasExactly(value, ["per_base", "day"]) &&
    typeof value.per_base === "string" && canonicalQuote(value.per_base) === value.per_base &&
    isDate(value.day) && value.day <= asOf
  );
}

/**
 * True for exactly today's set: an ISO base, a real `as_of` date, and quotes
 * keyed by ISO codes other than the base, each canonical (`canonicalQuote`)
 * and from a day on or before `as_of`.
 */
export function isRatesTodayDto(value: unknown): value is RatesTodayDto {
  if (!isObject(value) || !hasExactly(value, ["base", "as_of", "rates"])) return false;
  const { base, as_of: asOf, rates } = value;
  if (!isCurrencyCode(base) || !isDate(asOf) || !isObject(rates)) return false;
  return Object.keys(rates).every((code) => code !== base && isCurrencyCode(code) && isFxQuote(rates[code], asOf));
}
