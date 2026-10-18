// The entry keypad's calculator (redesign R2b). Pure and exact: every operand
// is satang in BigInt, the sum is kept as an exact fraction, and nothing ever
// passes through a JS number or floating point.
//
// Rules:
// - Operands are amounts in baht with at most two decimals each, never above
//   ฿999,999,999.99 (MINOR_AMOUNT_MAX). A key that would break either is
//   refused: the state is unchanged and `problem` says why.
// - Leading zeros collapse ("007" is 7). `000` on an empty amount is a single
//   0, and three zeros never fit after a decimal point.
// - × and ÷ bind tighter than + and −, as on any calculator.
// - ROUNDING: the whole expression is worked out as an exact fraction and
//   rounded once, at the end, half-up to the satang. Only ÷ (and × of two
//   amounts with decimals) can land between satang: 10 ÷ 3 is ฿3.33, 2 ÷ 3 is
//   ฿0.67 and 0.05 ÷ 2 is ฿0.03, while 10 ÷ 3 × 3 is exactly ฿10.00.
// - Division by zero is refused. So is a result below zero, and a result above
//   the cap. A negative step on the way (5 − 10 + 20) is fine.
// - `=` replaces the expression with its result; the next digit starts a new
//   amount and the next operator carries on from the result. Saving applies
//   `=` for the user (`settleForSave`); a dangling operator ("65 +") is
//   dropped rather than guessed at.
import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';
import type { Minor } from '@gogospend/contracts';

export type KeypadDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadOperator = 'add' | 'subtract' | 'multiply' | 'divide';
export type KeypadKey = KeypadDigit | '000' | '.' | 'backspace' | 'clear' | KeypadOperator | 'equals';

/** Why a key or a save was refused. */
export type KeypadProblem =
  /** Nothing typed yet. */
  | 'empty'
  /** The amount works out to ฿0.00 (a record needs more). */
  | 'zero'
  /** A third decimal on one operand. */
  | 'too_precise'
  /** An operand or the result above ฿999,999,999.99. */
  | 'too_large'
  /** The sum works out below zero. */
  | 'negative'
  | 'divide_by_zero';

export type KeypadState = {
  /** As typed: '', '0', '12', '12.', '12.5'. Always one more than `operators`. */
  readonly operands: readonly string[];
  readonly operators: readonly KeypadOperator[];
  /** Showing the result of `=`: the next digit starts a new amount. */
  readonly fresh: boolean;
  /** Why the last key was refused; null after any accepted key. */
  readonly problem: KeypadProblem | null;
};

export type KeypadOutcome = { readonly ok: true; readonly minor: Minor } | { readonly ok: false; readonly problem: KeypadProblem };

export const KEYPAD_OPERATOR_SYMBOL: Readonly<Record<KeypadOperator, string>> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };

export const EMPTY_KEYPAD: KeypadState = { operands: [''], operators: [], fresh: false, problem: null };

const DIGITS = new Set<string>(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const OPERATORS = new Set<string>(['add', 'subtract', 'multiply', 'divide']);
const isDigit = (key: string): key is KeypadDigit => DIGITS.has(key);
const isOperator = (key: string): key is KeypadOperator => OPERATORS.has(key);
const CANONICAL_MINOR = /^(?:0|[1-9][0-9]*)$/;

/** Exact satang of an operand as typed ('' and '12.' included). */
function operandSatang(text: string): bigint {
  const [whole = '', fraction = ''] = text.split('.');
  return BigInt(whole === '' ? '0' : whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
}

/** The shortest exact text for satang: whole baht bare, anything else with two decimals. */
function resultText(satang: bigint): string {
  const whole = (satang / 100n).toString();
  const fraction = satang % 100n;
  return fraction === 0n ? whole : `${whole}.${fraction.toString().padStart(2, '0')}`;
}

function refuse(state: KeypadState, problem: KeypadProblem): KeypadState {
  return { ...state, problem };
}

function withCurrent(state: KeypadState, operand: string): KeypadState {
  return { operands: [...state.operands.slice(0, -1), operand], operators: state.operators, fresh: false, problem: null };
}

/** Typing into the current operand: the limits apply here, per operand. */
function typeInto(state: KeypadState, key: KeypadDigit | '000' | '.'): KeypadState {
  const base = state.fresh ? EMPTY_KEYPAD : state;
  const current = base.operands[base.operands.length - 1];
  if (key === '.') {
    if (current.includes('.')) return { ...base, problem: null };
    return withCurrent(base, current === '' ? '0.' : `${current}.`);
  }
  const point = current.indexOf('.');
  if (point >= 0) {
    if (current.length - point - 1 + key.length > 2) return refuse(state, 'too_precise');
    return withCurrent(base, current + key);
  }
  // Whole part: collapse leading zeros, then hold the cap.
  const next = current === '' || current === '0' ? (key === '000' ? '0' : key) : current + key;
  if (operandSatang(next) > MINOR_AMOUNT_MAX) return refuse(state, 'too_large');
  return withCurrent(base, next);
}

function pressOperator(state: KeypadState, operator: KeypadOperator): KeypadState {
  const current = state.operands[state.operands.length - 1];
  if (current === '') {
    // Amounts are never negative, so nothing starts with an operator; a
    // dangling operator is replaced.
    if (state.operators.length === 0) return { ...state, problem: null };
    return { ...state, operators: [...state.operators.slice(0, -1), operator], fresh: false, problem: null };
  }
  const tidy = current.endsWith('.') ? current.slice(0, -1) : current;
  return { operands: [...state.operands.slice(0, -1), tidy, ''], operators: [...state.operators, operator], fresh: false, problem: null };
}

function backspace(state: KeypadState): KeypadState {
  const current = state.operands[state.operands.length - 1];
  if (current !== '') return withCurrent(state, current.slice(0, -1));
  if (state.operators.length === 0) return { ...state, fresh: false, problem: null };
  // Back across the operator: the operand before it is being typed again.
  return { operands: state.operands.slice(0, -1), operators: state.operators.slice(0, -1), fresh: false, problem: null };
}

type Fraction = { readonly n: bigint; readonly d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

function reduce(n: bigint, d: bigint): Fraction {
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

/**
 * The exact value of the expression in satang, as a fraction with a positive
 * denominator. Operands are satang; × of two satang amounts divides by 100 and
 * ÷ multiplies by 100, so the units stay satang throughout.
 */
function exactValue(operands: readonly string[], operators: readonly KeypadOperator[]): Fraction | 'divide_by_zero' {
  let total: Fraction = { n: 0n, d: 1n };
  let term: Fraction = { n: operandSatang(operands[0]), d: 1n };
  let sign = 1n;
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index];
    const operand = operandSatang(operands[index + 1]);
    if (operator === 'multiply') term = reduce(term.n * operand, term.d * 100n);
    else if (operator === 'divide') {
      if (operand === 0n) return 'divide_by_zero';
      term = reduce(term.n * 100n, term.d * operand);
    } else {
      total = reduce(total.n * term.d + sign * term.n * total.d, total.d * term.d);
      sign = operator === 'add' ? 1n : -1n;
      term = { n: operand, d: 1n };
    }
  }
  return reduce(total.n * term.d + sign * term.n * total.d, total.d * term.d);
}

/** Drops a dangling operator ("65 +" is 65). */
function complete(state: KeypadState): { operands: readonly string[]; operators: readonly KeypadOperator[] } {
  const last = state.operands[state.operands.length - 1];
  if (last === '' && state.operators.length > 0) return { operands: state.operands.slice(0, -1), operators: state.operators.slice(0, -1) };
  return state;
}

/**
 * The amount the keypad shows, as canonical satang, or why it cannot be one.
 * Zero is refused unless `allowZero` (an opening balance may be zero; a record
 * may not).
 */
export function evaluateKeypad(state: KeypadState, options: { allowZero?: boolean } = {}): KeypadOutcome {
  const { operands, operators } = complete(state);
  if (operands.length === 1 && operands[0] === '') return { ok: false, problem: 'empty' };
  const value = exactValue(operands, operators);
  if (value === 'divide_by_zero') return { ok: false, problem: 'divide_by_zero' };
  if (value.n < 0n) return { ok: false, problem: 'negative' };
  // Half-up to the satang: floor((2n + d) / 2d) for a value n/d ≥ 0.
  const satang = (2n * value.n + value.d) / (2n * value.d);
  if (satang > MINOR_AMOUNT_MAX) return { ok: false, problem: 'too_large' };
  if (satang === 0n && !options.allowZero) return { ok: false, problem: 'zero' };
  return { ok: true, minor: satang.toString() };
}

function equals(state: KeypadState): KeypadState {
  const completed = complete(state);
  if (completed.operators.length === 0) {
    return { operands: completed.operands, operators: [], fresh: state.fresh, problem: null };
  }
  const outcome = evaluateKeypad(state, { allowZero: true });
  if (!outcome.ok) return refuse(state, outcome.problem);
  return { operands: [resultText(BigInt(outcome.minor))], operators: [], fresh: true, problem: null };
}

/** The next state after one key. A refused key leaves the expression as it was and sets `problem`. */
export function applyKey(state: KeypadState, key: KeypadKey): KeypadState {
  if (key === 'clear') return EMPTY_KEYPAD;
  if (key === 'backspace') return backspace(state);
  if (key === 'equals') return equals(state);
  if (isOperator(key)) return pressOperator(state, key);
  if (key === '000' || key === '.' || isDigit(key)) return typeInto(state, key);
  return state;
}

/** Opens an existing amount for editing: '6550' shows 65.50. Typing continues it. */
export function keypadFromMinor(minor: Minor): KeypadState {
  if (typeof minor !== 'string' || !CANONICAL_MINOR.test(minor) || BigInt(minor) > MINOR_AMOUNT_MAX) {
    throw new TypeError('Expected canonical non-negative satang within the amount cap.');
  }
  return { operands: [resultText(BigInt(minor))], operators: [], fresh: false, problem: null };
}

function groupWhole(operand: string): string {
  const [whole, ...fraction] = operand.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction.length > 0 ? `${grouped}.${fraction[0]}` : grouped;
}

/** What the amount line shows: "1,234.5 + 3", "12 ×", or "0" when empty. */
export function keypadDisplay(state: KeypadState): string {
  const parts: string[] = [];
  state.operands.forEach((operand, index) => {
    if (index > 0) parts.push(KEYPAD_OPERATOR_SYMBOL[state.operators[index - 1]]);
    if (operand !== '') parts.push(groupWhole(operand));
    else if (index === 0) parts.push('0');
  });
  return parts.join(' ');
}

/** True while the amount is a sum still to be worked out. */
export function keypadHasOperator(state: KeypadState): boolean {
  return state.operators.length > 0;
}

/**
 * Save presses `=` for the user. On success the keypad shows the result and
 * the outcome carries the amount; on a refusal the expression stays as typed,
 * with `problem` set, so the user can fix it.
 */
export function settleForSave(state: KeypadState, options: { allowZero?: boolean } = {}): { state: KeypadState; outcome: KeypadOutcome } {
  const outcome = evaluateKeypad(state, options);
  if (!outcome.ok) return { state: refuse(state, outcome.problem), outcome };
  return { state: { operands: [resultText(BigInt(outcome.minor))], operators: [], fresh: true, problem: null }, outcome };
}
