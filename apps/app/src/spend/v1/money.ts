// Exact THB money for the app. Amounts are canonical integer strings of
// satang (the shared `Minor` type) and pass through BigInt only - never a JS
// number, never floating point.
import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';
import type { Minor } from '@gogospend/contracts';

export type MoneyLocale = 'th' | 'en';
export type AmountInputProblem = 'empty' | 'invalid' | 'too_precise' | 'too_large';

export class AmountInputError extends Error {
  readonly problem: AmountInputProblem;
  constructor(problem: AmountInputProblem) {
    super(`Amount input is ${problem}.`);
    this.name = 'AmountInputError';
    this.problem = problem;
  }
}

const CANONICAL = /^(?:0|-?[1-9][0-9]*)$/;

function canonical(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 40 || !CANONICAL.test(value)) {
    throw new TypeError('Expected a canonical integer string of satang.');
  }
  return BigInt(value);
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * `฿1,234.56` (negative `-฿1,234.56`): Western digits, comma grouping and two
 * decimals in both Thai and English, the convention Thai banking apps use.
 * The locale parameter is kept so a later locale-specific style changes one
 * function, not every caller.
 */
export function formatMinor(value: Minor, _locale: MoneyLocale): string {
  const amount = canonical(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const baht = group((absolute / 100n).toString());
  const satang = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}฿${baht}.${satang}`;
}

/** The exact amount for an edit field: `65.00`, no grouping or symbol. Non-negative only. */
export function minorToInputText(value: Minor): string {
  const amount = canonical(value);
  if (amount < 0n) throw new TypeError('Input amounts are never negative.');
  return `${(amount / 100n).toString()}.${(amount % 100n).toString().padStart(2, '0')}`;
}

const THAI_DIGITS = /[๐-๙]/g;
// Whole baht: plain digits without leading zeros, or correctly grouped thousands.
const AMOUNT = /^(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d+))?$/;

/**
 * Parses what a person typed into exact satang. Accepts an optional leading
 * `฿`, comma-grouped thousands (only in correct groups of three), a `.` with
 * at most two decimals, and Thai digits in the Thai locale. Anything
 * ambiguous - `1,5`, `.5`, `007`, signs, exponents, spaces inside the number
 * - is refused rather than guessed. Zero parses; callers decide whether it is
 * allowed (an opening balance may be zero, a record may not).
 */
export function parseAmountInput(text: string, locale: MoneyLocale): Minor {
  let value = text.trim();
  if (value.length === 0) throw new AmountInputError('empty');
  if (value.startsWith('฿')) value = value.slice(1).trimStart();
  if (locale === 'th') value = value.replace(THAI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0e50));
  const match = AMOUNT.exec(value);
  if (!match) {
    if (/^(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{3,}$/.test(value)) throw new AmountInputError('too_precise');
    throw new AmountInputError('invalid');
  }
  const [, whole, fraction = ''] = match;
  if (fraction.length > 2) throw new AmountInputError('too_precise');
  const satang = BigInt(whole.replace(/,/g, '')) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (satang > MINOR_AMOUNT_MAX) throw new AmountInputError('too_large');
  return satang.toString();
}
