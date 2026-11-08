/**
 * Currencies and exact rate arithmetic (spec section 6.10, D24; P5-T1). Minor
 * units come from the ISO 4217 table below, never from `Intl` (ICU gives LAK,
 * IDR, HUF and IQD other digits). Money never passes through `Number`: amounts
 * are bigint, and a rate is canonical decimal text applied in bigint and
 * rounded once.
 */
import type { Minor } from "./common.ts";
import { ContractValidationError } from "./errors.ts";

/** Decimal places of a currency's minor unit. */
export type MinorUnits = 0 | 2 | 3 | 4;

/**
 * ISO 4217 list one (SIX, 2026-09-17): every code with a numeric minor unit,
 * 165 of its 178. The other 13 (metals, bond market units, XDR, XSU, XUA, XTS
 * and XXX) have none and are not currencies here. Fund codes (BOV, CHE, CHW,
 * CLF, COU, MXV, USN, UYI, UYW) are in, as the list has them.
 */
export const ISO_4217_MINOR_UNITS: Readonly<Record<string, MinorUnits>> = {
  AED: 2, AFN: 2, ALL: 2, AMD: 2, AOA: 2, ARS: 2, AUD: 2, AWG: 2, AZN: 2, BAM: 2,
  BBD: 2, BDT: 2, BHD: 3, BIF: 0, BMD: 2, BND: 2, BOB: 2, BOV: 2, BRL: 2, BSD: 2,
  BTN: 2, BWP: 2, BYN: 2, BZD: 2, CAD: 2, CDF: 2, CHE: 2, CHF: 2, CHW: 2, CLF: 4,
  CLP: 0, CNY: 2, COP: 2, COU: 2, CRC: 2, CUP: 2, CVE: 2, CZK: 2, DJF: 0, DKK: 2,
  DOP: 2, DZD: 2, EGP: 2, ERN: 2, ETB: 2, EUR: 2, FJD: 2, FKP: 2, GBP: 2, GEL: 2,
  GHS: 2, GIP: 2, GMD: 2, GNF: 0, GTQ: 2, GYD: 2, HKD: 2, HNL: 2, HTG: 2, HUF: 2,
  IDR: 2, ILS: 2, INR: 2, IQD: 3, IRR: 2, ISK: 0, JMD: 2, JOD: 3, JPY: 0, KES: 2,
  KGS: 2, KHR: 2, KMF: 0, KPW: 2, KRW: 0, KWD: 3, KYD: 2, KZT: 2, LAK: 2, LBP: 2,
  LKR: 2, LRD: 2, LSL: 2, LYD: 3, MAD: 2, MDL: 2, MGA: 2, MKD: 2, MMK: 2, MNT: 2,
  MOP: 2, MRU: 2, MUR: 2, MVR: 2, MWK: 2, MXN: 2, MXV: 2, MYR: 2, MZN: 2, NAD: 2,
  NGN: 2, NIO: 2, NOK: 2, NPR: 2, NZD: 2, OMR: 3, PAB: 2, PEN: 2, PGK: 2, PHP: 2,
  PKR: 2, PLN: 2, PYG: 0, QAR: 2, RON: 2, RSD: 2, RUB: 2, RWF: 0, SAR: 2, SBD: 2,
  SCR: 2, SDG: 2, SEK: 2, SGD: 2, SHP: 2, SLE: 2, SLL: 2, SOS: 2, SRD: 2, SSP: 2,
  STN: 2, SVC: 2, SYP: 2, SZL: 2, THB: 2, TJS: 2, TMT: 2, TND: 3, TOP: 2, TRY: 2,
  TTD: 2, TWD: 2, TZS: 2, UAH: 2, UGX: 0, USD: 2, USN: 2, UYI: 0, UYU: 2, UYW: 4,
  UZS: 2, VED: 2, VES: 2, VND: 0, VUV: 0, WST: 2, XAF: 0, XCD: 2, XCG: 2, XOF: 0,
  XPF: 0, YER: 2, ZAR: 2, ZMW: 2, ZWG: 2,
};

/** An ISO 4217 alphabetic code from the table above (upper case). */
export type CurrencyCode = string;

/** True for a code in the table, by its own keys only. */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ISO_4217_MINOR_UNITS, value);
}

/** The code's minor-unit exponent; a TypeError for a code outside the table. */
export function minorUnitsOf(code: CurrencyCode): MinorUnits {
  if (!isCurrencyCode(code)) throw new TypeError("Unknown ISO 4217 currency code.");
  return ISO_4217_MINOR_UNITS[code];
}

/** The home currency until the person changes it (X5). */
export const DEFAULT_HOME_CURRENCY = "THB";

/** The currency picker's thirteen, in the boards' order (THB is home). */
export const PICKER_CURRENCIES = ["JPY", "KRW", "CNY", "HKD", "TWD", "SGD", "MYR", "VND", "LAK", "USD", "EUR", "GBP", "AUD"] as const;

/**
 * The symbol written before an amount. The boards draw nine; HK$, NT$, ₭, £
 * and A$ are drafts (default pending owner Q13). A code without one is
 * written as the code and a space (`CHF 12.50`).
 */
export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  THB: "฿", JPY: "¥", KRW: "₩", CNY: "¥", HKD: "HK$", TWD: "NT$", SGD: "S$",
  MYR: "RM", VND: "₫", LAK: "₭", USD: "$", EUR: "€", GBP: "£", AUD: "A$",
};

/** Where a record's rate came from: the daily feed, the person, or a cash exchange. */
export const RATE_SOURCES = ["reference", "own", "exchange"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

/** Significant digits a rate keeps (X1, default pending owner Q11). */
const RATE_DIGITS = 12;
/** Significant digits a feed quote may carry: what a double keeps exactly. */
const QUOTE_DIGITS = 15;
const CANONICAL_INTEGER = /^(?:0|-?[1-9][0-9]*)$/;
// No sign, no leading zero before a digit, no trailing zero after the point.
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const PLAIN_DECIMAL = /^([0-9]+)(?:\.([0-9]+))?$/;
// What String(number) writes below 1e-6 and from 1e21: one digit, then e.
const EXPONENT_FORM = /^([0-9])(?:\.([0-9]+))?e([+-][0-9]+)$/;
const TYPED_AMOUNT = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function isPositiveDecimal(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DECIMAL.test(value) && /[1-9]/.test(value);
}

/** Digits from the first non-zero digit to the last non-zero one (`0.0013` has 2, `1000` has 1). */
function significantDigits(decimal: string): number {
  return decimal.replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length;
}

/**
 * A rate as the contract carries it: a positive canonical decimal (no sign,
 * no exponent, no leading or trailing zero) of at most 12 significant digits.
 * Anything else is a 422 on `field`.
 */
export function parseRate(value: unknown, field?: string): string {
  if (!isPositiveDecimal(value) || significantDigits(value) > RATE_DIGITS) {
    throw new ContractValidationError("VALIDATION_FAILED", `Expected a positive decimal rate of at most ${RATE_DIGITS} significant digits.`, field);
  }
  return value;
}

/** A JavaScript number's shortest round-trip text, written out without an exponent. */
function numberText(value: number): string {
  const text = String(value);
  const match = EXPONENT_FORM.exec(text);
  if (match === null) return text;
  const digits = match[1] + (match[2] ?? "");
  const point = 1 + Number(match[3]);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A feed's quote as canonical text: a positive finite JSON number, or plain
 * decimal text, of at most 15 significant digits. Leading and trailing zeros
 * are dropped (`34.6800` is `34.68`); anything else is null.
 */
export function canonicalQuote(value: unknown): string | null {
  const text = typeof value === "number" ? numberText(value) : value;
  if (typeof text !== "string") return null;
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) return null;
  const whole = match[1].replace(/^0+(?=[0-9])/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  const quote = fraction === "" ? whole : `${whole}.${fraction}`;
  return isPositiveDecimal(quote) && significantDigits(quote) <= QUOTE_DIGITS ? quote : null;
}

/** Minor units from a bigint or a canonical integer string (a RangeError otherwise). */
function minorValue(value: Minor | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && CANONICAL_INTEGER.test(value)) return BigInt(value);
  throw new RangeError("Expected minor units as a bigint or a canonical integer string.");
}

function amountOf(value: Minor | bigint): bigint {
  const amount = minorValue(value);
  if (amount < 0n) throw new RangeError("Expected a non-negative amount.");
  return amount;
}

/** A rate `N / 10^s` as `{ units: N, scale: s }`; a RangeError unless it is a positive canonical decimal. */
function rateParts(rate: string): { units: bigint; scale: number } {
  if (!isPositiveDecimal(rate)) throw new RangeError("Expected a positive canonical decimal rate.");
  const point = rate.indexOf(".");
  if (point < 0) return { units: BigInt(rate), scale: 0 };
  return { units: BigInt(rate.slice(0, point) + rate.slice(point + 1)), scale: rate.length - point - 1 };
}

/** `amount * rate` in `to`'s minor units, as the exact fraction `[n, d]`. */
function converted(amount: Minor | bigint, rate: string, from: CurrencyCode, to: CurrencyCode): [bigint, bigint] {
  const k = minorUnitsOf(to) - minorUnitsOf(from);
  const { units, scale } = rateParts(rate);
  const n = amountOf(amount) * units * pow10(Math.max(k, 0));
  const d = pow10(scale) * pow10(Math.max(-k, 0));
  return [n, d];
}

/**
 * `amount` of `from` (minor units, 0 or more) at `rate` (`to` per one `from`,
 * in major units), in `to`'s minor units, rounded half-up once.
 */
export function convertMinor(amount: Minor | bigint, rate: string, from: CurrencyCode, to: CurrencyCode): bigint {
  const [n, d] = converted(amount, rate, from, to);
  return (2n * n + d) / (2n * d);
}

/** As `convertMinor`, rounded down (B16: a budget's category limits). */
export function convertMinorDown(amount: Minor | bigint, rate: string, from: CurrencyCode, to: CurrencyCode): bigint {
  const [n, d] = converted(amount, rate, from, to);
  return n / d;
}

/** `digits / 10^shift` as canonical decimal text. */
function decimalText(digits: bigint, shift: number): string {
  let text = digits.toString();
  if (shift <= 0) return text + "0".repeat(-shift);
  if (text.length <= shift) text = "0".repeat(shift - text.length + 1) + text;
  const whole = text.slice(0, text.length - shift);
  const fraction = text.slice(text.length - shift).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** `num / den` (both positive) rounded half-up once to 12 significant digits, trailing zeros dropped. */
function roundedRate(num: bigint, den: bigint): string {
  // num / den lies in [10^(L-1), 10^(L+1)) for L = len(num) - len(den), so
  // this shift leaves 12 or 13 digits before the point; one step fixes 13.
  let shift = RATE_DIGITS - (num.toString().length - den.toString().length);
  const whole = shift >= 0 ? (num * pow10(shift)) / den : num / (den * pow10(-shift));
  if (whole >= pow10(RATE_DIGITS)) shift -= 1;
  const n = shift >= 0 ? num * pow10(shift) : num;
  const d = shift >= 0 ? den : den * pow10(-shift);
  return decimalText((2n * n + d) / (2n * d), shift);
}

/** Units of `to` per one `from`, from two quotes against the same base (the base's own quote is `1`). */
export function crossRate(perBaseTo: string, perBaseFrom: string): string {
  const to = rateParts(perBaseTo);
  const from = rateParts(perBaseFrom);
  return roundedRate(to.units * pow10(from.scale), from.units * pow10(to.scale));
}

/** The rate that turns `fromMinor` of `from` into `toMinor` of `to` (both at least 1), to 12 significant digits. */
export function rateFromAmounts(fromMinor: Minor | bigint, from: CurrencyCode, toMinor: Minor | bigint, to: CurrencyCode): string {
  const fromUnits = minorUnitsOf(from);
  const toUnits = minorUnitsOf(to);
  const paid = amountOf(fromMinor);
  const got = amountOf(toMinor);
  if (paid === 0n || got === 0n) throw new RangeError("A rate needs two positive amounts.");
  return roundedRate(got * pow10(fromUnits), paid * pow10(toUnits));
}

function minorParts(minor: Minor, code: CurrencyCode): { negative: boolean; whole: string; fraction: string } {
  const exponent = minorUnitsOf(code);
  const value = minorValue(minor);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(exponent + 1, "0");
  return { negative, whole: digits.slice(0, digits.length - exponent), fraction: digits.slice(digits.length - exponent) };
}

/** Minor units as plain decimal text in the currency's decimals: `-0.05`, `4620`, `1.234`. */
export function minorToDecimal(minor: Minor, code: CurrencyCode): string {
  const { negative, whole, fraction } = minorParts(minor, code);
  return `${negative ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}

/**
 * Typed decimal text (`1075.50`, `1075.5`, `4620`) as minor units; null when
 * malformed (a sign, a group comma, a leading zero, a bare point) or carrying
 * more decimals than the currency has, zeros included (`12.0` yen).
 */
export function decimalToMinor(text: string, code: CurrencyCode): bigint | null {
  const exponent = minorUnitsOf(code);
  const match = typeof text === "string" ? TYPED_AMOUNT.exec(text) : null;
  if (match === null) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return null;
  return BigInt(match[1]) * pow10(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
}

/**
 * Money for display: the symbol (or the code and a space), comma groups and
 * the currency's decimals, with U+2212 before a negative: `฿1,068.14`,
 * `¥4,620`, `−฿50.00`, `CHF 12.50`. `Intl` is never read.
 */
export function moneyText(minor: Minor, code: CurrencyCode): string {
  const { negative, whole, fraction } = minorParts(minor, code);
  const number = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === "" ? "" : `.${fraction}`}`;
  const symbol: string | undefined = CURRENCY_SYMBOLS[code];
  return `${negative ? "\u2212" : ""}${symbol === undefined ? `${code} ${number}` : `${symbol}${number}`}`;
}

/**
 * A rate for display only: 4 significant digits below 1, else at most 4
 * decimals, half-up, trailing zeros dropped (`0.2328`, `4.3253`, `765.6`).
 */
export function rateText(rate: string): string {
  const { units, scale } = rateParts(rate);
  const keep = units < pow10(scale) ? scale - units.toString().length + 4 : 4;
  if (scale <= keep) return rate;
  const unit = pow10(scale - keep);
  return decimalText((2n * units + unit) / (2n * unit), keep);
}
