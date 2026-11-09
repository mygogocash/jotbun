import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MINOR_AMOUNT_MAX } from '@gogospend/contracts';

import { parseAmountInput } from '../spend/v1/money.ts';
import { applyKey, EMPTY_KEYPAD, evaluateKeypad, keypadDisplay, keypadFromMinor, keypadHasOperator, settleForSave } from './keypadExpression.ts';
import type { KeypadKey, KeypadState } from './keypadExpression.ts';

/** Presses keys in order; a string like '12.5' is typed digit by digit. */
function press(...keys: (KeypadKey | string)[]): KeypadState {
  return pressFrom(EMPTY_KEYPAD, ...keys);
}

const NAMED = new Set(['000', 'backspace', 'clear', 'add', 'subtract', 'multiply', 'divide', 'equals']);

function pressFrom(start: KeypadState, ...keys: (KeypadKey | string)[]): KeypadState {
  let state = start;
  for (const key of keys) {
    if (NAMED.has(key)) state = applyKey(state, key as KeypadKey);
    else for (const char of key) state = applyKey(state, char as KeypadKey);
  }
  return state;
}

const minorOf = (state: KeypadState, options?: { allowZero?: boolean }) => {
  const outcome = evaluateKeypad(state, options);
  return outcome.ok ? outcome.minor : `problem:${outcome.problem}`;
};

test('digits build an amount; the display groups thousands; the minor is exact satang', () => {
  const state = press('1234');
  assert.equal(keypadDisplay(state), '1,234');
  assert.equal(minorOf(state), '123400');
  assert.equal(keypadDisplay(press('1234567.8')), '1,234,567.8');
  assert.equal(minorOf(press('1234567.8')), '123456780');
});

test('an empty keypad shows 0 and saving it says the amount is empty', () => {
  assert.equal(keypadDisplay(EMPTY_KEYPAD), '0');
  assert.deepEqual(evaluateKeypad(EMPTY_KEYPAD), { ok: false, problem: 'empty' });
  assert.equal(keypadHasOperator(EMPTY_KEYPAD), false);
});

test('leading zeros collapse', () => {
  assert.equal(keypadDisplay(press('005')), '5');
  assert.equal(keypadDisplay(press('00')), '0');
  assert.equal(keypadDisplay(press('0', '000')), '0');
  assert.equal(keypadDisplay(press('12', 'add', '007')), '12 + 7');
  assert.equal(minorOf(press('007')), '700');
});

test('000 on an empty amount is a single 0, and after digits it multiplies by a thousand', () => {
  assert.equal(keypadDisplay(press('000')), '0');
  assert.equal(keypadDisplay(press('000', '000')), '0');
  assert.equal(keypadDisplay(press('000', '5')), '5');
  assert.equal(keypadDisplay(press('12', '000')), '12,000');
  assert.equal(minorOf(press('12', '000')), '1200000');
  assert.equal(keypadDisplay(press('12', 'add', '000')), '12 + 0');
  // Three zeros never fit after a decimal point: the whole key is refused.
  const afterPoint = press('12.', '000');
  assert.equal(keypadDisplay(afterPoint), '12.');
  assert.equal(afterPoint.problem, 'too_precise');
});

test('zero is refused for a record unless the caller allows it', () => {
  assert.deepEqual(evaluateKeypad(press('0')), { ok: false, problem: 'zero' });
  assert.deepEqual(evaluateKeypad(press('0.00')), { ok: false, problem: 'zero' });
  assert.deepEqual(evaluateKeypad(press('0'), { allowZero: true }), { ok: true, minor: '0' });
  assert.deepEqual(evaluateKeypad(press('5', 'subtract', '5')), { ok: false, problem: 'zero' });
});

test('a decimal point starts 0. on an empty amount and is typed at most once', () => {
  assert.equal(keypadDisplay(press('.')), '0.');
  assert.equal(keypadDisplay(press('..')), '0.');
  assert.equal(keypadDisplay(press('1.2.3')), '1.23');
  assert.equal(minorOf(press('1.')), '100');
  assert.equal(minorOf(press('0.5')), '50');
});

test('at most two decimals per operand; a third is refused and says why', () => {
  const refused = press('1.234');
  assert.equal(keypadDisplay(refused), '1.23');
  assert.equal(refused.problem, 'too_precise');
  // The next accepted key clears the problem.
  assert.equal(applyKey(refused, 'add').problem, null);
  // Each operand has its own two decimals.
  assert.equal(minorOf(press('1.25', 'add', '1.25')), '250');
});

test('decimals after an operator start a new operand', () => {
  const state = press('12.5', 'add', '.5');
  assert.equal(keypadDisplay(state), '12.5 + 0.5');
  assert.equal(minorOf(state), '1300');
  assert.equal(keypadDisplay(press('12', 'multiply', '.')), '12 × 0.');
  assert.equal(press('12', 'add', '0.123').problem, 'too_precise');
});

test('0.1 + 0.2 is exactly 0.30', () => {
  const sum = press('0.1', 'add', '0.2');
  assert.equal(minorOf(sum), '30');
  const settled = applyKey(sum, 'equals');
  assert.equal(keypadDisplay(settled), '0.30');
  assert.equal(minorOf(settled), '30');
  assert.equal(settled.problem, null);
});

test('sums of exact decimals never drift (no floating point)', () => {
  const values = ['0.1', '0.2', '0.7', '1.15', '4.35', '0.01', '123456789.12', '999999999.98', '33.33', '0.07'];
  for (const a of values) {
    for (const b of values) {
      const expected = BigInt(parseAmountInput(a, 'en')) + BigInt(parseAmountInput(b, 'en'));
      const outcome = evaluateKeypad(press(a, 'add', b));
      if (expected > MINOR_AMOUNT_MAX) assert.deepEqual(outcome, { ok: false, problem: 'too_large' }, `${a} + ${b}`);
      else assert.deepEqual(outcome, { ok: true, minor: expected.toString() }, `${a} + ${b}`);
    }
  }
  // Products a float would get wrong: 1.15 × 3 = 3.4499999999999997, 4.35 × 100 = 434.99999999999994.
  assert.equal(minorOf(press('1.15', 'multiply', '3')), '345');
  assert.equal(minorOf(press('4.35', 'multiply', '100')), '43500');
  assert.equal(minorOf(press('0.07', 'multiply', '100')), '700');
  assert.equal(minorOf(press('1.1', 'multiply', '1.1')), '121');
});

test('999999999.99 is the largest amount; + 0.01 is refused as too large', () => {
  assert.equal(minorOf(press('999999999.99')), MINOR_AMOUNT_MAX.toString());
  const over = press('999999999.99', 'add', '0.01');
  assert.deepEqual(evaluateKeypad(over), { ok: false, problem: 'too_large' });
  const refused = applyKey(over, 'equals');
  assert.equal(refused.problem, 'too_large');
  assert.equal(keypadDisplay(refused), '999,999,999.99 + 0.01');
  assert.deepEqual(evaluateKeypad(press('500000000', 'multiply', '2')), { ok: false, problem: 'too_large' });
});

test('an operand can never be typed above the cap', () => {
  const nine = press('999999999');
  const refused = applyKey(nine, '9');
  assert.equal(keypadDisplay(refused), '999,999,999');
  assert.equal(refused.problem, 'too_large');
  assert.equal(applyKey(press('1000000'), '000').problem, 'too_large');
  assert.equal(keypadDisplay(applyKey(press('1000000'), '000')), '1,000,000');
});

test('backspace removes a character, then crosses back over an operator', () => {
  const state = press('12', 'add', '3');
  assert.equal(keypadDisplay(applyKey(state, 'backspace')), '12 +');
  assert.equal(keypadDisplay(press('12', 'add', '3', 'backspace', 'backspace')), '12');
  assert.equal(keypadDisplay(press('12', 'add', '3', 'backspace', 'backspace', 'backspace')), '1');
  assert.equal(keypadDisplay(press('12', 'add', '3', 'backspace', 'backspace', '5')), '125');
  assert.equal(keypadDisplay(press('0.', 'backspace')), '0');
  assert.equal(keypadDisplay(press('7', 'backspace')), '0');
  assert.deepEqual(press('backspace'), EMPTY_KEYPAD);
  assert.equal(keypadHasOperator(press('12', 'add', 'backspace')), false);
});

test('an operator replaces a dangling one and cannot start an amount', () => {
  assert.equal(keypadDisplay(press('12', 'add', 'multiply')), '12 ×');
  assert.deepEqual(press('subtract'), EMPTY_KEYPAD);
  assert.deepEqual(press('add', 'divide'), EMPTY_KEYPAD);
  assert.equal(keypadDisplay(press('12.', 'add')), '12 +');
  assert.equal(keypadHasOperator(press('12', 'add')), true);
});

test('division by zero is refused, at = and on save', () => {
  const state = press('12', 'divide', '0');
  assert.deepEqual(evaluateKeypad(state), { ok: false, problem: 'divide_by_zero' });
  const refused = applyKey(state, 'equals');
  assert.equal(refused.problem, 'divide_by_zero');
  assert.equal(keypadDisplay(refused), '12 ÷ 0');
  assert.deepEqual(settleForSave(state).outcome, { ok: false, problem: 'divide_by_zero' });
  assert.deepEqual(evaluateKeypad(press('12', 'divide', '0.00')), { ok: false, problem: 'divide_by_zero' });
  assert.equal(minorOf(press('12', 'divide', '0.5')), '2400');
});

test('÷ is exact until the end, then rounds half-up to the satang', () => {
  assert.equal(minorOf(press('10', 'divide', '3')), '333');
  assert.equal(minorOf(press('2', 'divide', '3')), '67');
  assert.equal(minorOf(press('0.05', 'divide', '2')), '3');
  assert.equal(minorOf(press('0.03', 'divide', '2')), '2');
  assert.equal(minorOf(press('0.01', 'divide', '4')), 'problem:zero');
  assert.equal(minorOf(press('0.01', 'divide', '2')), '1');
  assert.equal(minorOf(press('10', 'divide', '3', 'multiply', '3')), '1000');
  assert.equal(minorOf(press('100', 'divide', '7', 'add', '100', 'divide', '7')), '2857');
  // × of two decimals can also land between satang.
  assert.equal(minorOf(press('1.25', 'multiply', '1.25')), '156');
  assert.equal(minorOf(press('0.5', 'multiply', '0.01')), '1');
});

test('half-up holds exactly on the half satang, where rounded floats go the wrong way', () => {
  // Each lands on exactly x.5 satang; 0.575 * 100 in floating point is 57.49999999999999.
  assert.equal(minorOf(press('2.51', 'divide', '2')), '126');
  assert.equal(minorOf(press('1.15', 'multiply', '0.5')), '58');
  assert.equal(minorOf(press('0.29', 'multiply', '0.5')), '15');
  assert.equal(minorOf(press('10.05', 'divide', '2')), '503');
});

test('× and ÷ bind tighter than + and −', () => {
  assert.equal(minorOf(press('2', 'add', '3', 'multiply', '4')), '1400');
  assert.equal(minorOf(press('10', 'subtract', '2', 'multiply', '3')), '400');
  assert.equal(minorOf(press('20', 'divide', '4', 'add', '1')), '600');
});

test('a negative result is refused; a negative step on the way is fine', () => {
  const state = press('5', 'subtract', '10');
  assert.deepEqual(evaluateKeypad(state), { ok: false, problem: 'negative' });
  assert.equal(applyKey(state, 'equals').problem, 'negative');
  assert.equal(minorOf(press('5', 'subtract', '10', 'add', '20')), '1500');
  assert.deepEqual(evaluateKeypad(press('0.01', 'subtract', '0.02'), { allowZero: true }), { ok: false, problem: 'negative' });
});

test('= shows the result; a digit then starts afresh and an operator carries on', () => {
  const result = press('0.1', 'add', '0.2', 'equals');
  assert.equal(keypadDisplay(result), '0.30');
  assert.equal(keypadHasOperator(result), false);
  assert.equal(keypadDisplay(applyKey(result, '7')), '7');
  assert.equal(keypadDisplay(applyKey(result, '.')), '0.');
  assert.equal(keypadDisplay(pressFrom(result, 'add', '1')), '0.30 + 1');
  assert.equal(minorOf(pressFrom(result, 'add', '1')), '130');
  assert.equal(keypadDisplay(applyKey(result, 'backspace')), '0.3');
  assert.equal(keypadDisplay(press('12', 'add', '3', 'equals')), '15');
  // = with nothing to work out changes nothing.
  assert.equal(keypadDisplay(press('12.5', 'equals')), '12.5');
  assert.equal(keypadDisplay(press('12', 'add', 'equals')), '12');
});

test('clear empties the keypad', () => {
  assert.deepEqual(press('12', 'add', '3', 'clear'), EMPTY_KEYPAD);
});

test('saving applies = for the user', () => {
  const saved = settleForSave(press('65', 'add', '10'));
  assert.deepEqual(saved.outcome, { ok: true, minor: '7500' });
  assert.equal(keypadDisplay(saved.state), '75');
  // A dangling operator is dropped rather than guessed at.
  const dangling = settleForSave(press('65', 'add'));
  assert.deepEqual(dangling.outcome, { ok: true, minor: '6500' });
  assert.equal(keypadDisplay(dangling.state), '65');
  assert.deepEqual(settleForSave(EMPTY_KEYPAD).outcome, { ok: false, problem: 'empty' });
  assert.deepEqual(settleForSave(press('0')).outcome, { ok: false, problem: 'zero' });
  assert.deepEqual(settleForSave(press('0'), { allowZero: true }).outcome, { ok: true, minor: '0' });
  // A refused sum stays on screen so the user can fix it.
  const negative = press('5', 'subtract', '10');
  const refused = settleForSave(negative);
  assert.deepEqual(refused.outcome, { ok: false, problem: 'negative' });
  assert.equal(keypadDisplay(refused.state), '5 − 10');
  assert.equal(refused.state.problem, 'negative');
});

test('an existing amount opens on the keypad exactly', () => {
  assert.equal(keypadDisplay(keypadFromMinor('6500')), '65');
  assert.equal(keypadDisplay(keypadFromMinor('6550')), '65.50');
  assert.equal(keypadDisplay(keypadFromMinor('5')), '0.05');
  assert.equal(keypadDisplay(keypadFromMinor('0')), '0');
  assert.equal(minorOf(keypadFromMinor(MINOR_AMOUNT_MAX.toString())), MINOR_AMOUNT_MAX.toString());
  // Typing continues the amount rather than replacing it.
  assert.equal(keypadDisplay(applyKey(keypadFromMinor('6500'), '0')), '650');
  assert.equal(applyKey(keypadFromMinor('6550'), '1').problem, 'too_precise');
  assert.throws(() => keypadFromMinor('-5'));
  assert.throws(() => keypadFromMinor('6.5'));
  assert.throws(() => keypadFromMinor((MINOR_AMOUNT_MAX + 1n).toString()));
});
