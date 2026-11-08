// P3-T1 (P3:slip-qr): the Thai bank slip QR parser and its CRC. B14: only API id 000001 counts.
// Every rejected payload below carries a valid CRC unless its comment says otherwise, so it is
// refused for the rule its comment names.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crc16CcittFalse, parseSlipQr, SLIP_QR_API_ID } from './slipQr.ts';

// The bank 002 slip (API id 000001, bank 002, reference 0002123123121200011), its root 00 and what it gives.
const SLIP_002_QR = '004000060000010103002021900021231231212000115102TH91049C30';
const ROOT_002 = '00400006000001010300202190002123123121200011';
const SLIP_002 = { bankCode: '002', reference: '0002123123121200011' };
// A top-level field the parser skips: tag 62, a two-digit size, then that many X.
const filler = (size: number) => `62${size}${'X'.repeat(size)}`;

test('a Thai bank slip QR gives its sending bank and reference', () => {
  assert.deepEqual(parseSlipQr('004000060000010103002021900021231231212000115102TH91049C30'), { bankCode: '002', reference: '0002123123121200011' });
  assert.deepEqual(parseSlipQr(' 00390006000001010300402180162981055123456785102TH91043BF7 '), { bankCode: '004', reference: '016298105512345678' });
});

test('the CRC covers everything up to 9104 and is read in either case', () => {
  assert.equal(crc16CcittFalse('004000060000010103002021900021231231212000115102TH9104'), 0x9c30);
  assert.ok(parseSlipQr('004000060000010103002021900021231231212000115102TH91049c30'));
  assert.equal(parseSlipQr('004000060000010103002021900021231231212000115102TH91049C31'), null);
});

test('a CRC whose leading zero was dropped is padded back', () => {
  assert.deepEqual(parseSlipQr('00390006000001010301402180163000000000000035102TH910445A'), { bankCode: '014', reference: '016300000000000003' });
});

test('TrueMoney and payment QR codes are not bank slips', () => {
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // a bank slip, for contrast
  assert.equal(parseSlipQr('00480002010102010203P2P0313TXN00012345670408250120249104b425'), null);
  assert.equal(parseSlipQr('0002010102115802TH6304ABCD'), null);
});

test('a slip-shaped QR whose root is not 000001 is not a bank slip (B14)', () => {
  assert.equal(SLIP_QR_API_ID, '000001');
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // the same slip with root 000001
  assert.equal(parseSlipQr('004000060000020103002021900021231231212000115102TH91044531'), null); // root 000002, CRC 4531 valid
});

test('anything malformed is null', () => {
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // the slip these cases are made from
  assert.equal(parseSlipQr(''), null);
  assert.equal(parseSlipQr('   '), null);
  // a length longer than the text: the root claims 99 (CRC not recomputed); then 02 claims 20 but holds 19
  assert.equal(parseSlipQr('009900060000010103002021900021231231212000115102TH91049C30'), null);
  assert.equal(parseSlipQr('004000060000010103002022000021231231212000115102TH91045F8D'), null);
  // a root without 02
  assert.equal(parseSlipQr('0017000600000101030025102TH9104A232'), null);
  // 51 = US, and 51 = th
  assert.equal(parseSlipQr('004000060000010103002021900021231231212000115102US91043135'), null);
  assert.equal(parseSlipQr('004000060000010103002021900021231231212000115102th9104A18C'), null);
  // a reference with a space
  assert.equal(parseSlipQr('0040000600000101030020219000212312 1212000115102TH9104A9B6'), null);
  // 513 characters, otherwise a valid slip
  const long513 = `${ROOT_002}5102TH${filler(99).repeat(4)}${filler(39)}9104EDA5`;
  assert.equal(long513.length, 513);
  assert.equal(parseSlipQr(long513), null);
  // 91 is not last
  assert.equal(parseSlipQr(`${ROOT_002}910486CC5102TH`), null);
});

test('the CRC is CRC-16/CCITT-FALSE over the UTF-8 bytes', () => {
  assert.equal(crc16CcittFalse('123456789'), 0x29b1);
  assert.equal(crc16CcittFalse(''), 0xffff);
  assert.equal(crc16CcittFalse('฿'), 0xad3d); // U+0E3F, the baht sign, is three UTF-8 bytes
});

test('a slip QR may be 512 characters long, skip other fields and leave out 51', () => {
  const long512 = `${ROOT_002}5102TH${filler(99).repeat(4)}${filler(38)}9104AE45`;
  assert.equal(long512.length, 512);
  assert.deepEqual(parseSlipQr(long512), SLIP_002);
  assert.deepEqual(parseSlipQr(`${ROOT_002}910486CC`), SLIP_002);
});

test('a reference may be 64 letters and digits in either case, not 65', () => {
  const ref64 = 'aZ09'.repeat(16);
  assert.deepEqual(parseSlipQr(`0085000600000101030020264${ref64}5102TH9104377D`), { bankCode: '002', reference: ref64 });
  assert.equal(parseSlipQr(`0086000600000101030020265${ref64}b5102TH9104252D`), null);
});

test('one root, and one CRC field of length 04 that comes last', () => {
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // one root, the CRC last
  assert.equal(parseSlipQr(`${ROOT_002}${ROOT_002}5102TH91044826`), null); // two roots
  assert.equal(parseSlipQr('5102TH9104D578'), null); // no root
  assert.equal(parseSlipQr(`${ROOT_002}910486CC5102TH910469CB`), null); // a second 91 before the last
  assert.equal(parseSlipQr(`${ROOT_002}5102TH630426BE`), null); // the CRC under tag 63
  assert.equal(parseSlipQr('004000060000010103002021900021231231212000875102TH91035FE'), null); // 91 of length 03, its CRC 05FE
  assert.equal(parseSlipQr('004000060000010103002021900021230000000416215102TH9104'), null); // nothing after 9104, its CRC 0000
});

test('every field header is four digits and every root field fits the root', () => {
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // every header four digits
  assert.equal(parseSlipQr(`${ROOT_002}5102TH6A02XY91040B37`), null); // tag 6A
  assert.equal(parseSlipQr('004600060000010103002021900021231231212000119104AB5102TH9104E106'), null); // a short 91 inside the root
});

test('the bank code is three digits and each root field appears once', () => {
  assert.deepEqual(parseSlipQr(SLIP_002_QR), SLIP_002); // bank 002, each root field once
  assert.equal(parseSlipQr('0040000600000101030A2021900021231231212000115102TH910481E7'), null); // bank 0A2
  assert.equal(parseSlipQr('00390006000001010202021900021231231212000115102TH91049A9C'), null); // bank 02
  assert.equal(parseSlipQr('0041000600000101040002021900021231231212000115102TH91047736'), null); // bank 0002
  assert.equal(parseSlipQr('00630006000001010300202190002123123121200011021900021231231212000125102TH910487B1'), null); // 02 twice
});

test('only printable ASCII counts', () => {
  // space and ~ are printable ASCII, so a skipped field may hold them
  assert.deepEqual(parseSlipQr(`${ROOT_002}5102TH6204A ~Z9104F409`), SLIP_002);
  // a tab in that field is not printable
  assert.equal(parseSlipQr(`${ROOT_002}5102TH6204A\t~Z9104B133`), null);
  // a Thai letter (U+0E01) in an ignored root field 03; the CRC over the UTF-8 bytes is valid
  assert.equal(parseSlipQr('004500060000010103002021900021231231212000110301' + 'ก' + '5102TH9104AF06'), null);
});
