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
import { AMOUNT_MAX_MINOR } from './protocol.ts';

export type AmountResult = { ok: true; minor: string; negative: boolean } | { ok: false; code: string };

const THAI_DIGITS = /[๐-๙]/g;
const THB_PREFIX = /^(?:฿|thb|บาท)\s*/i;
const THB_SUFFIX = /\s*(?:฿|thb|บาท)$/i;
const OTHER_CURRENCY = /[$€£¥₩₫₹]|\b(?:usd|eur|gbp|jpy|cny|sgd|myr|vnd|krw|aud|hkd)\b/i;
const GROUPED = /^[0-9]{1,3}(?:,[0-9]{3})+$/;
const PLAIN = /^[0-9]+$/;
// Far beyond the cap, so BigInt never sees a huge string.
const MAX_INTEGER_DIGITS = 15;

export function parseAmountText(raw: string): AmountResult {
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
