// Proves the app runtime (Node type stripping, as Metro/Hermes consumers
// share the same source) executes the shared v1 contracts identically.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  assertKnownFields,
  bangkokDate,
  normalizeCommand,
  parseClientHeader,
  parseMinor,
  validateOccurredOn,
} from '@gogospend/contracts';

const amount = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX };
const isCode = (code: string) => (error: unknown) => error instanceof ContractValidationError && error.code === code;

test('money parses as exact satang and never accepts JS numbers', () => {
  assert.equal(parseMinor('6500', amount), 6500n);
  assert.throws(() => parseMinor(6500, amount), isCode('INVALID_MINOR'));
  assert.throws(() => parseMinor('65.00', amount), isCode('INVALID_MINOR'));
  assert.throws(() => parseMinor('100000000000', amount), isCode('MINOR_OUT_OF_RANGE'));
});

test('totals beyond the safe-integer range stay exact', () => {
  const total = parseMinor('9007199254740992', { allowZero: true, allowNegative: true }) + 1n;
  assert.equal(total.toString(), '9007199254740993');
});

test('Bangkok day boundary and occurred-on window', () => {
  assert.equal(bangkokDate(new Date('2026-10-16T17:00:00.000Z')), '2026-10-17');
  assert.equal(validateOccurredOn('2026-10-17', '2026-01-01', '2026-10-17'), '2026-10-17');
  assert.throws(() => validateOccurredOn('2026-02-29', '2026-01-01', '2026-10-17'), isCode('INVALID_DATE'));
  assert.throws(() => validateOccurredOn('2026-10-18', '2026-01-01', '2026-10-17'), isCode('DATE_IN_FUTURE'));
});

test('command normalization is order-independent and matches the server form', () => {
  const a = normalizeCommand('transaction.create', 1, { b: '2', a: '1' });
  const b = normalizeCommand('transaction.create', 1, { a: '1', b: '2' });
  assert.equal(a.canonicalJson, b.canonicalJson);
  assert.equal(a.canonicalJson, '{"kind":"transaction.create","payload":{"a":"1","b":"2"},"schema_version":1}');
});

test('unknown request fields and malformed client headers are rejected', () => {
  assert.throws(() => assertKnownFields({ owner_id: 'x' }, ['amount_minor']), isCode('UNKNOWN_FIELD'));
  assert.deepEqual(parseClientHeader('android/1.0.0'), { platform: 'android', version: '1.0.0' });
  assert.equal(parseClientHeader('ios/1.0'), null);
});
