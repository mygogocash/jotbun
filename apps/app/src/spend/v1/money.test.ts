import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AmountInputError, formatMinor, minorToInputText, parseAmountInput } from './money.ts';

const problem = (name: string) => (error: unknown) => error instanceof AmountInputError && error.problem === name;

test('large_minor_amount_is_formatted_exactly', () => {
  assert.equal(parseAmountInput('999999999.99', 'en'), '99999999999');
  assert.equal(formatMinor('99999999999', 'en'), '฿999,999,999.99');
});

test('formats satang exactly with grouping, two decimals and a sign, never through floats', () => {
  assert.equal(formatMinor('0', 'en'), '฿0.00');
  assert.equal(formatMinor('5', 'en'), '฿0.05');
  assert.equal(formatMinor('6500', 'th'), '฿65.00');
  assert.equal(formatMinor('123456789', 'en'), '฿1,234,567.89');
  assert.equal(formatMinor('-18200', 'en'), '-฿182.00');
  // Totals beyond Number.MAX_SAFE_INTEGER stay exact.
  assert.equal(formatMinor('900719925474099312', 'en'), '฿9,007,199,254,740,993.12');
});

test('refuses to format anything but a canonical integer string', () => {
  for (const bad of ['65.00', '007', '-0', '', '1e3', ' 1']) {
    assert.throws(() => formatMinor(bad, 'en'), TypeError);
  }
  assert.throws(() => formatMinor(6500 as unknown as string, 'en'), TypeError);
});

test('parses typed amounts exactly', () => {
  assert.equal(parseAmountInput('65', 'en'), '6500');
  assert.equal(parseAmountInput('65.5', 'en'), '6550');
  assert.equal(parseAmountInput('65.05', 'en'), '6505');
  assert.equal(parseAmountInput(' 1,234.56 ', 'en'), '123456');
  assert.equal(parseAmountInput('฿1,000', 'en'), '100000');
  assert.equal(parseAmountInput('0.01', 'en'), '1');
  assert.equal(parseAmountInput('0', 'en'), '0');
  // Thai digits are unambiguous in the Thai locale.
  assert.equal(parseAmountInput('๖๕.๕๐', 'th'), '6550');
  assert.equal(parseAmountInput('1,234', 'th'), '123400');
});

test('rejects ambiguous or invalid input instead of guessing', () => {
  assert.throws(() => parseAmountInput('', 'en'), problem('empty'));
  assert.throws(() => parseAmountInput('   ', 'en'), problem('empty'));
  for (const bad of ['1,5', '1,23,456', '12,34', '1.2.3', '-5', '+5', '5.', '.5', '007', 'abc', '5 baht', '1e3', '5,000.0.0', '1 000', '0x10', '٥']) {
    assert.throws(() => parseAmountInput(bad, 'en'), problem('invalid'), bad);
  }
  assert.throws(() => parseAmountInput('1.234', 'en'), problem('too_precise'));
  assert.throws(() => parseAmountInput('1000000000', 'en'), problem('too_large'));
  assert.throws(() => parseAmountInput('999999999.991', 'en'), problem('too_precise'));
});

test('edit fields show the exact amount without grouping', () => {
  assert.equal(minorToInputText('6500'), '65.00');
  assert.equal(minorToInputText('5'), '0.05');
  assert.equal(minorToInputText('123456789'), '1234567.89');
  assert.throws(() => minorToInputText('-1'), TypeError);
});
