// Exact amount parsing for imported text (runs in the parser child). Money
// never passes through a JavaScript number: the digits are read as text and
// assembled into satang with BigInt.
//
// Accepted: ASCII or Thai digits; "." as the only decimal point; "," only as
// correct 3-digit grouping; a leading +/- (or U+2212), or accounting
// parentheses, for the sign; ฿/THB/บาท before or after. Refused, with a
// reason: more than two decimal places unless the extra digits are zeros
// (excess_precision), a comma that is not 3-digit grouping or a decimal comma
// (ambiguous_amount), any other currency (unsupported_currency), exponents,
// spaces inside the number and other text (invalid_amount), zero
// (zero_amount) and more than ฿999,999,999.99 (amount_over_cap).
//
// The separator convention is the file's, judged as a whole (as dates are):
// "12,50" can only be a decimal comma and "1,234.56" only a decimal point,
// while "1,500" or "1.500" could be either. In a file whose amounts prove a
// decimal comma - or prove both conventions (mixed_amount_separators) - no
// amount with a separator is read (ambiguous_amount), since "1,500" there may
// be 1.5 baht. Otherwise the decimal point and grouping comma above apply.
import { AMOUNT_MAX_MINOR } from './protocol.ts';

export type AmountResult = { ok: true; minor: string; negative: boolean } | { ok: false; code: string };
/** The decimal separator a file's amounts prove: `.`, `,`, both (`mixed`) or none. */
export type AmountConvention = 'dot' | 'comma' | 'mixed' | null;

const THAI_DIGITS = /[๐-๙]/g;
const THB_PREFIX = /^(?:฿|thb|บาท)\s*/i;
// The marker alone: numberText trims the spaces before it. A leading `\s*` here was
// tried from every space of a long run, quadratic in its length (fix-parser-regex, R89).
const THB_SUFFIX = /(?:฿|thb|บาท)$/i;
const OTHER_CURRENCY = /[$€£¥₩₫₹]|\b(?:usd|eur|gbp|jpy|cny|sgd|myr|vnd|krw|aud|hkd)\b/i;
const GROUPED = /^[0-9]{1,3}(?:,[0-9]{3})+$/;
const PLAIN = /^[0-9]+$/;
// Far beyond the cap, so BigInt never sees a huge string.
const MAX_INTEGER_DIGITS = 15;
// Forms only one convention can write.
const DECIMAL_POINT = [/^[0-9]{1,3}(?:,[0-9]{3})+\.[0-9]+$/, /^[0-9]{1,3}(?:,[0-9]{3}){2,}$/, /^[0-9]+\.(?:[0-9]{1,2}|[0-9]{4,})$/];
const DECIMAL_COMMA = [/^[0-9]{1,3}(?:\.[0-9]{3})+,[0-9]+$/, /^[0-9]{1,3}(?:\.[0-9]{3}){2,}$/, /^[0-9]+,(?:[0-9]{1,2}|[0-9]{4,})$/];

type NumberText = { ok: true; text: string; negative: boolean } | { ok: false; code: string };

/** The number itself: Thai digits read, currency markers and the sign taken off. */
function numberText(raw: string): NumberText {
  let text = raw.replace(THAI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0e50)).trim();
  if (text === '' || text === '-') return { ok: false, code: 'missing_amount' };
  if (OTHER_CURRENCY.test(text)) return { ok: false, code: 'unsupported_currency' };

  let negative = false;
  const parenthesized = /^\((.*)\)$/.exec(text);
  if (parenthesized) {
    negative = true;
    text = parenthesized[1].trim();
  }
  // A currency marker may sit outside or inside the sign: "฿-120", "-฿120", "-120 บาท".
  text = text.replace(THB_PREFIX, '').replace(THB_SUFFIX, '').trim();
  const sign = /^([+\-−])\s*/.exec(text);
  if (sign) {
    if (parenthesized) return { ok: false, code: 'invalid_amount' };
    negative = sign[1] !== '+';
    text = text.slice(sign[0].length).replace(THB_PREFIX, '').trim();
  }
  if (text === '') return { ok: false, code: 'invalid_amount' };
  return { ok: true, text, negative };
}

/** The convention one amount proves, or null when it fits either (or is not a number). */
function conventionOf(raw: string): 'dot' | 'comma' | null {
  const number = numberText(raw);
  if (!number.ok) return null;
  if (DECIMAL_POINT.some((form) => form.test(number.text))) return 'dot';
  if (DECIMAL_COMMA.some((form) => form.test(number.text))) return 'comma';
  return null;
}

/** The decimal separator a file's amounts prove, judged over all of them. */
export function detectAmountConvention(raws: readonly string[]): AmountConvention {
  let dot = false;
  let comma = false;
  for (const raw of raws) {
    const convention = conventionOf(raw);
    if (convention === 'dot') dot = true;
    if (convention === 'comma') comma = true;
  }
  if (dot && comma) return 'mixed';
  return dot ? 'dot' : comma ? 'comma' : null;
}

export function parseAmountText(raw: string, convention: AmountConvention = null): AmountResult {
  const number = numberText(raw);
  if (!number.ok) return number;
  const { text, negative } = number;
  // A file that writes decimal commas (or both conventions): no separator can be trusted.
  if ((convention === 'comma' || convention === 'mixed') && /[.,]/.test(text)) return { ok: false, code: 'ambiguous_amount' };

  const dot = text.indexOf('.');
  const integerPart = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? '' : text.slice(dot + 1);
  if (dot !== -1 && fraction.includes(',')) return { ok: false, code: 'ambiguous_amount' };
  if (text.indexOf('.', dot + 1) !== -1 && dot !== -1) return { ok: false, code: 'ambiguous_amount' };
  if (integerPart.includes(',') && !GROUPED.test(integerPart)) {
    return /^[0-9,]+$/.test(integerPart) ? { ok: false, code: 'ambiguous_amount' } : { ok: false, code: 'invalid_amount' };
  }
  const digits = integerPart.replace(/,/g, '');
  if (!PLAIN.test(digits)) return { ok: false, code: 'invalid_amount' };
  if (dot !== -1 && !PLAIN.test(fraction)) return { ok: false, code: 'invalid_amount' };
  if (/[1-9]/.test(fraction.slice(2))) return { ok: false, code: 'excess_precision' };

  const significant = digits.replace(/^0+(?=[0-9])/, '');
  if (significant.length > MAX_INTEGER_DIGITS) return { ok: false, code: 'amount_over_cap' };
  const minor = BigInt(significant) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  if (minor === 0n) return { ok: false, code: 'zero_amount' };
  if (minor > AMOUNT_MAX_MINOR) return { ok: false, code: 'amount_over_cap' };
  return { ok: true, minor: minor.toString(), negative };
}
