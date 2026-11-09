// P4-T13: slip batches for POST /v1/slips: at most 5 slips and 8 MiB of JSON each, in order.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { SLIP_LIMITS, parseSlipBatchRequest } from '@gogospend/contracts';
import type { SlipBatchRequest } from '@gogospend/contracts';

import { buildSlipBatches, slipBatchBytes, slipBatchRequest } from './slipBatches.ts';
import type { ReadySlip } from './slipBatches.ts';

type Header = Omit<SlipBatchRequest, 'slips'>;

const MIB = 1024 * 1024;
const LIMIT = 8 * MIB;
const HEADER: Header = { purpose: 'backfill', last: false, today: '2026-11-09', locale: 'th' };

const slip = (n: number, base64: string, album: string | null = null): ReadySlip => ({
  assetId: `photo-${n}`,
  refHash: n.toString(16).padStart(64, '0'),
  image: { uri: null, base64, bytes: (base64.length / 4) * 3, mediaType: 'image/jpeg' },
  album,
  origin: 'album',
});
/** The wire body, built here apart from the module, and its UTF-8 length. */
const body = (slips: readonly ReadySlip[], header: Header) => ({
  ...header,
  slips: slips.map((item) => ({ ref_hash: item.refHash, image_base64: item.image.base64, media_type: item.image.mediaType, album: item.album, origin: item.origin })),
});
const bodyBytes = (slips: readonly ReadySlip[], header: Header): number => Buffer.byteLength(JSON.stringify(body(slips, header)), 'utf8');
const ids = (batches: readonly ReadySlip[][]): string[][] => batches.map((batch) => batch.map((item) => item.assetId));

test('batches hold at most 5 slips and 8 MiB of JSON, in order', () => {
  assert.equal(SLIP_LIMITS.batchBytes, LIMIT);
  const small = [1, 2, 3, 4, 5, 6].map((n) => slip(n, 'QUJD'));
  assert.deepEqual(ids(buildSlipBatches(small, HEADER)), [['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5'], ['photo-6']]);
  const threeMib = 'A'.repeat(3 * MIB);
  assert.deepEqual(ids(buildSlipBatches([1, 2, 3].map((n) => slip(n, threeMib)), HEADER)), [['photo-1', 'photo-2'], ['photo-3']]);
  const four = buildSlipBatches([1, 2, 3, 4].map((n) => slip(n, threeMib)), HEADER);
  assert.deepEqual(ids(four), [['photo-1', 'photo-2'], ['photo-3', 'photo-4']]);
  for (const batch of four) assert.ok(bodyBytes(batch, HEADER) <= LIMIT);
  assert.deepEqual(buildSlipBatches([], HEADER), []);
});

test("the byte count is the JSON body's UTF-8 length", () => {
  const header: Header = { ...HEADER, last: true };
  const slips = [slip(1, 'QUJD', 'กสิกรไทย'), slip(2, '/9j/4AAQ')];
  const expected = body(slips, header);
  const text = JSON.stringify(expected);
  assert.deepEqual(slipBatchRequest(slips, header), expected);
  assert.equal(slipBatchBytes(slips, header), Buffer.byteLength(text, 'utf8'));
  assert.equal(Buffer.byteLength(text, 'utf8'), text.length + 16); // each of the album's 8 Thai characters is 3 bytes
  assert.equal(slipBatchBytes([], header), Buffer.byteLength(JSON.stringify({ ...header, slips: [] }), 'utf8'));
  assert.deepEqual(parseSlipBatchRequest(JSON.parse(text)), expected); // the server's parser takes the body as it is
});

test('a batch is cut at exactly 8 MiB, counting the commas between slips, and is measured with last false', () => {
  const empty = bodyBytes([], HEADER);
  const overhead = bodyBytes([slip(1, '')], HEADER) - empty; // one slip's JSON, its image aside
  const twoMib = 'A'.repeat(2 * MIB);
  // Three slips whose body is exactly 8 MiB, two commas included, and then one byte more.
  const three = (extra: number) => [slip(1, twoMib), slip(2, twoMib), slip(3, 'A'.repeat(LIMIT - empty - 3 * overhead - 2 - 2 * twoMib.length + extra))];
  assert.equal(bodyBytes(three(0), HEADER), LIMIT);
  assert.equal(slipBatchBytes(three(0), HEADER), LIMIT);
  assert.deepEqual(ids(buildSlipBatches(three(0), HEADER)), [['photo-1', 'photo-2', 'photo-3']]);
  assert.deepEqual(ids(buildSlipBatches(three(1), HEADER)), [['photo-1', 'photo-2'], ['photo-3']]);
  // Sent with last: true, those would be exactly 8 MiB, but a batch is measured with last: false.
  const last: Header = { ...HEADER, last: true };
  assert.equal(bodyBytes(three(1), last), LIMIT);
  assert.deepEqual(ids(buildSlipBatches(three(1), last)), [['photo-1', 'photo-2'], ['photo-3']]);
});

test('a slip that fills a batch alone is sent alone, and one larger than a batch throws', () => {
  const empty = bodyBytes([], HEADER);
  const overhead = bodyBytes([slip(1, '')], HEADER) - empty;
  const alone = (extra: number) => slip(1, 'A'.repeat(LIMIT - empty - overhead + extra));
  assert.equal(bodyBytes([alone(0)], HEADER), LIMIT);
  assert.deepEqual(ids(buildSlipBatches([alone(0), slip(2, 'QUJD')], HEADER)), [['photo-1'], ['photo-2']]);
  assert.throws(() => buildSlipBatches([slip(2, 'QUJD'), alone(1)], HEADER), RangeError);
});

test("each slip's album is sent as the server keeps it: NFC, trimmed, at most 60 characters, and null when nothing is left", () => {
  const thai = 'ก'.repeat(58);
  const cutOnSpace = `  ${'ข'.repeat(59)} ค`; // trimmed, its 60th character is a space
  const albums = ['  K PLUS  ', 'Cafe\u0301', `${thai}\u{1D400}\u{1D401}\u{1D402}`, cutOnSpace, '   '];
  const slips = albums.map((album, index) => slip(index + 1, 'QUJD', album));
  const sent = slipBatchRequest(slips, HEADER).slips.map((item) => item.album);
  assert.deepEqual(sent, ['K PLUS', 'Caf\u00e9', `${thai}\u{1D400}\u{1D401}`, 'ข'.repeat(59), null]);
  assert.deepEqual(parseSlipBatchRequest(slipBatchRequest(slips, HEADER)).slips.map((item) => item.album), sent); // the server keeps what was sent
});
