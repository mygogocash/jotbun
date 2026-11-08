/**
 * Trips (spec section 6.10; P5-T3; default pending owner Q6). A trip is a
 * named run of days in one currency, fixed once created, with an optional
 * budget in that currency. A record names its trip in `trip_id` (P5-T2). A
 * deleted trip keeps its row, with `deleted_at`, for 30 days (X4).
 *
 * A trip summary adds exact stored amounts of the trip's expenses (X17):
 * `spent_trip_minor` the amounts of those in the trip currency,
 * `other_home_minor` the home amounts of those in any other currency, and
 * `spent_home_minor` every expense's home amount. The phone estimates the
 * other currencies itself.
 */
import type { Minor, Revision } from "./common.ts";
import { RATE_SOURCES, isCurrencyCode, parseRate } from "./currency.ts";
import type { CurrencyCode, RateSource } from "./currency.ts";
import { MINOR_AMOUNT_MAX, TRACKING_START_MIN, addDays, isUuid, normalizeName, parseMinor, validateOccurredOn } from "./validation.ts";
import type { MinorOptions } from "./validation.ts";

/** The longest trip, counting its first and last days. */
export const TRIP_MAX_DAYS = 366;

/** The persisted trip (also the change-log snapshot). */
export type TripDto = {
  id: string;
  /** Exactly what `normalizeName` returns. */
  name: string;
  /** Fixed once created (Q6). */
  currency: CurrencyCode;
  /** First and last days (Gregorian `YYYY-MM-DD`), both inclusive, at most `TRIP_MAX_DAYS` days. */
  starts_on: string;
  ends_on: string;
  /** In the trip's currency: 1 to the record cap, or none. */
  budget_minor: Minor | null;
  deleted_at: string | null;
  version: number;
};

/** A new trip; `id` is a client-generated UUID. */
export type CreateTripRequest = { id: string; name: string; currency: CurrencyCode; starts_on: string; ends_on: string; budget_minor?: Minor | null };

/** A trip edit with `If-Match`: never the currency (Q6). Ending a trip is an edit of `ends_on`. */
export type UpdateTripRequest = { name?: string; starts_on?: string; ends_on?: string; budget_minor?: Minor | null };

/** Sums over the trip's expenses only, each a sum of stored amounts. */
export type TripMoney = { spent_home_minor: Minor; spent_trip_minor: Minor; other_home_minor: Minor };

/** One distinct rate a tagged record used, in a currency other than home. */
export type TripRateUsed = { date: string; currency: CurrencyCode; rate: string; rate_source: RateSource; rate_date: string | null };

export type TripSummaryDto = {
  trip: TripDto;
  home_currency: CurrencyCode;
  /** Every tagged live record, of any type. */
  count: number;
  totals: TripMoney;
  days: (TripMoney & { date: string })[];
  categories: (TripMoney & { category_id: string })[];
  rates: TripRateUsed[];
  as_of_revision: Revision;
};

const TRIP_KEYS = ["id", "name", "currency", "starts_on", "ends_on", "budget_minor", "deleted_at", "version"] as const;
const MONEY_KEYS = ["spent_home_minor", "spent_trip_minor", "other_home_minor"] as const;
const RATE_KEYS = ["date", "currency", "rate", "rate_source", "rate_date"] as const;
const SUMMARY_KEYS = ["trip", "home_currency", "count", "totals", "days", "categories", "rates", "as_of_revision"] as const;
const REVISION = /^(0|[1-9][0-9]{0,18})$/;
const BUDGET: MinorOptions = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX };
const SUM: MinorOptions = { allowZero: true, allowNegative: false };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const isInstant = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isOneOf = (list: readonly unknown[], value: unknown): boolean => list.includes(value);

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

function isMinor(value: unknown, options: MinorOptions): value is Minor {
  try {
    parseMinor(value, options);
    return true;
  } catch {
    return false;
  }
}

function isTripName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return normalizeName(value, "name") === value;
  } catch {
    return false;
  }
}

function isRate(value: unknown): value is string {
  try {
    parseRate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * True for exactly the persisted trip: its keys only, a normalized name, an
 * ISO currency, real dates in order spanning at most `TRIP_MAX_DAYS` days
 * (both ends counted), and a budget of 1 to the cap or null.
 */
export function isTripSnapshot(value: unknown): value is TripDto {
  if (!isObject(value) || !hasExactly(value, TRIP_KEYS)) return false;
  const startsOn = value.starts_on;
  const endsOn = value.ends_on;
  return (
    isUuid(value.id) && isTripName(value.name) && isCurrencyCode(value.currency) &&
    isDate(startsOn) && isDate(endsOn) && startsOn <= endsOn &&
    // The earliest first day is TRIP_MAX_DAYS - 1 days before the last. Counting
    // back from a date in 1970 or later never leaves the years addDays allows.
    addDays(endsOn, 1 - TRIP_MAX_DAYS) <= startsOn &&
    (value.budget_minor === null || isMinor(value.budget_minor, BUDGET)) &&
    (value.deleted_at === null || isInstant(value.deleted_at)) &&
    isVersion(value.version)
  );
}

/** Exactly the three sums, each a canonical amount of 0 or more, plus the `extra` keys. */
function isTripMoney(value: unknown, extra: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && hasExactly(value, [...MONEY_KEYS, ...extra]) && MONEY_KEYS.every((key) => isMinor(value[key], SUM));
}

function isTripRateUsed(value: unknown): value is TripRateUsed {
  return (
    isObject(value) && hasExactly(value, RATE_KEYS) &&
    isDate(value.date) && isCurrencyCode(value.currency) && isRate(value.rate) &&
    isOneOf(RATE_SOURCES, value.rate_source) &&
    (value.rate_date === null || isDate(value.rate_date))
  );
}

/** True for exactly a trip summary: each part's keys only, every sum a canonical amount of 0 or more. */
export function isTripSummaryDto(value: unknown): value is TripSummaryDto {
  return (
    isObject(value) && hasExactly(value, SUMMARY_KEYS) &&
    isTripSnapshot(value.trip) && isCurrencyCode(value.home_currency) && isCount(value.count) &&
    isTripMoney(value.totals, []) &&
    Array.isArray(value.days) && value.days.every((day) => isTripMoney(day, ["date"]) && isDate(day.date)) &&
    Array.isArray(value.categories) && value.categories.every((row) => isTripMoney(row, ["category_id"]) && isUuid(row.category_id)) &&
    Array.isArray(value.rates) && value.rates.every((rate) => isTripRateUsed(rate)) &&
    typeof value.as_of_revision === "string" && REVISION.test(value.as_of_revision)
  );
}
