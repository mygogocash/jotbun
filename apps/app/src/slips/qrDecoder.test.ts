// P3-T1 (P3:slip-qr, A13): the decoder port. P3-T12's native adapter is not part of this task.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fakeQrDecoder, getAppQrDecoder, installQrDecoder, noQrDecoder, slipQrIn } from './qrDecoder.ts';
import type { QrDecoder } from './qrDecoder.ts';

const SLIP_004 = '00390006000001010300402180162981055123456785102TH91043BF7';
const SLIP_002 = '004000060000010103002021900021231231212000115102TH91049C30';
const PHOTO = 'file:///photos/slip.jpg';
const TWO_SLIPS = 'file:///photos/two-slips.jpg';

test('noQrDecoder is unavailable and finds nothing', async () => {
  assert.equal(noQrDecoder.available, false);
  assert.deepEqual(await noQrDecoder.decode(PHOTO), []);
  assert.equal(await slipQrIn(noQrDecoder, PHOTO), null);
});

test('fakeQrDecoder is available and answers only the uris it was given', async () => {
  const decoder = fakeQrDecoder({ [PHOTO]: [SLIP_004] });
  assert.equal(decoder.available, true);
  assert.deepEqual(await decoder.decode(PHOTO), [SLIP_004]);
  assert.deepEqual(await decoder.decode('file:///photos/other.jpg'), []);
  assert.deepEqual(await decoder.decode('constructor'), []);
  assert.equal(fakeQrDecoder({}).available, true);
});

test('slipQrIn returns the first payload that is a bank slip', async () => {
  const decoder = fakeQrDecoder({ [PHOTO]: ['https://example.test', SLIP_004], [TWO_SLIPS]: ['0002010102115802TH6304ABCD', SLIP_004, SLIP_002] });
  assert.deepEqual(await slipQrIn(decoder, PHOTO), { bankCode: '004', reference: '016298105512345678' });
  assert.deepEqual(await slipQrIn(decoder, TWO_SLIPS), { bankCode: '004', reference: '016298105512345678' });
  assert.equal(await slipQrIn(fakeQrDecoder({ [PHOTO]: ['https://example.test'] }), PHOTO), null);
});

test('a decoder that throws finds no slip', async () => {
  const answers: QrDecoder = { available: true, decode: async () => [SLIP_004] };
  const rejects: QrDecoder = { available: true, decode: async () => { throw new Error('decode failed'); } };
  const throwsAtOnce: QrDecoder = { available: true, decode: () => { throw new Error('decode failed'); } };
  assert.deepEqual(await slipQrIn(answers, PHOTO), { bankCode: '004', reference: '016298105512345678' }); // the same decoder, answering
  assert.equal(await slipQrIn(rejects, PHOTO), null);
  assert.equal(await slipQrIn(throwsAtOnce, PHOTO), null);
});

test("installQrDecoder replaces the app's decoder and null restores noQrDecoder", () => {
  assert.equal(getAppQrDecoder(), noQrDecoder);
  const decoder: QrDecoder = { available: true, decode: async () => [] };
  installQrDecoder(decoder);
  try {
    assert.equal(getAppQrDecoder(), decoder);
  } finally {
    installQrDecoder(null);
  }
  assert.equal(getAppQrDecoder(), noQrDecoder);
});
