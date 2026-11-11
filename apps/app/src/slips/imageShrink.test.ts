// P4-T13: the shrink port. Under owner Q2's default a photo is sent as it is, within 1,200,000
// bytes, or not at all; expo-file-system comes in through the loader.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { pickerShrink } from './imageShrink.ts';
import type { PhotoAsset } from './photoLibrary.ts';
import { fakeImageShrink, fakeShrunkImage } from './testing/fakePhotos.ts';

const LIMIT = 1_200_000;
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...Buffer.from('RIFF'), 0x24, 0x10, 0x00, 0x00, ...Buffer.from('WEBPVP8 ')];
const WAVE = [...Buffer.from('RIFF'), 0x24, 0x10, 0x00, 0x00, ...Buffer.from('WAVEfmt ')];
const HEIC = [0x00, 0x00, 0x00, 0x18, ...Buffer.from('ftypheic')];

const PICKED = 'file:///var/mobile/Containers/Data/Application/A1/Library/Caches/ImagePicker/1F0C.jpg';
const SHARED = 'file:///private/var/mobile/Containers/Shared/AppGroup/G1/inbox/slip.png';
const OVER = 'file:///var/mobile/Containers/Data/Application/A1/Library/Caches/ImagePicker/over.jpg';
const SCREENSHOT = 'file:///var/mobile/Containers/Data/Application/A1/Library/Caches/ImagePicker/screenshot.png';

/** `bytes` bytes that start with `head`, as base64. */
const image = (head: readonly number[], bytes: number): string => Buffer.concat([Buffer.from(head), Buffer.alloc(bytes - head.length, 0x41)]).toString('base64');
const photo = (uri: string): PhotoAsset => ({ id: uri, uri, createdMs: 1_762_650_000_000, albumId: null });

/**
 * expo-file-system 58.0.9's File over files held as base64. size is the file's byte count (0 for
 * a missing one, as the real one says; `sizes` stands in for a phone that gives another), base64()
 * reads it and throws for a missing one (iOS's Data(contentsOf:), Android's stream), and each read
 * and delete is recorded.
 */
function fakeFiles(files: Record<string, string>, sizes: Record<string, number> = {}) {
  const held = new Map(Object.entries(files));
  const calls: string[] = [];
  class FakeFile {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists(): boolean {
      return held.has(this.uri);
    }
    get size(): number {
      const text = held.get(this.uri);
      return sizes[this.uri] ?? (text === undefined ? 0 : Buffer.from(text, 'base64').length);
    }
    async base64(): Promise<string> {
      calls.push(`base64 ${this.uri}`);
      const text = held.get(this.uri);
      if (text === undefined) throw new Error('no such file');
      return text;
    }
    delete(): void {
      calls.push(`delete ${this.uri}`);
      if (!held.delete(this.uri)) throw new Error('no such file');
    }
  }
  return { held, calls, loadModule: async () => ({ File: FakeFile }) as unknown as typeof import('expo-file-system') };
}

test('a picked image or a shared file within 1,200,000 bytes is used as it is, its type read from its first bytes, and a larger one, such as a 1.5 MB PNG screenshot, is not sent', async () => {
  const fits = image(JPEG, LIMIT);
  const shared = image(PNG, 48_000);
  const files = fakeFiles({ [PICKED]: fits, [SHARED]: shared, [OVER]: image(JPEG, LIMIT + 1), [SCREENSHOT]: image(PNG, 1_500_000) });
  const shrink = pickerShrink({ loadModule: files.loadModule });
  const picked = await shrink.shrink(photo(PICKED));
  assert.deepEqual(picked, { uri: null, base64: fits, bytes: LIMIT, mediaType: 'image/jpeg' });
  assert.deepEqual(await shrink.shrink(photo(SHARED)), { uri: null, base64: shared, bytes: 48_000, mediaType: 'image/png' });
  assert.equal(await shrink.shrink(photo(OVER)), null);
  assert.equal(await shrink.shrink(photo(SCREENSHOT)), null);
  assert.deepEqual(files.calls, [`base64 ${PICKED}`, `base64 ${SHARED}`]); // a photo too large is never read
  if (picked === null) return;
  await shrink.remove(picked); // removing the result leaves the file
  assert.equal(files.held.has(PICKED), true);
  assert.deepEqual(files.calls, [`base64 ${PICKED}`, `base64 ${SHARED}`]);
});

test('only a JPEG, a PNG or a WebP is sent: a HEIC photo, another RIFF file, text, or text that is not whole base64 is not', async () => {
  const uri = (name: string) => `file:///cache/ImagePicker/${name}`;
  const files = fakeFiles({
    [uri('a.jpg')]: image(JPEG, 900),
    [uri('b.png')]: image(PNG, 900),
    [uri('c.webp')]: image(WEBP, 900),
    [uri('d.heic')]: image(HEIC, 900),
    [uri('e.wav')]: image(WAVE, 900),
    [uri('f.txt')]: Buffer.from('not an image at all').toString('base64'),
    [uri('g.jpg')]: '/9j/4A', // a JPEG's first bytes, cut short of whole base64
    [uri('h.jpg')]: '/9j/4AAQ-SkZ', // a JPEG's first bytes, then a letter base64 does not have
  });
  const shrink = pickerShrink({ loadModule: files.loadModule });
  const typeOf = async (name: string) => (await shrink.shrink(photo(uri(name))))?.mediaType ?? null;
  assert.equal(await typeOf('a.jpg'), 'image/jpeg');
  assert.equal(await typeOf('b.png'), 'image/png');
  assert.equal(await typeOf('c.webp'), 'image/webp');
  for (const name of ['d.heic', 'e.wav', 'f.txt', 'g.jpg', 'h.jpg']) assert.equal(await shrink.shrink(photo(uri(name))), null, name);
});

test('a copy that is gone throws, so the scan can tell it from a photo it cannot send', async () => {
  const files = fakeFiles({ [PICKED]: image(JPEG, 900) });
  const shrink = pickerShrink({ loadModule: files.loadModule });
  assert.equal((await shrink.shrink(photo(PICKED)))?.mediaType, 'image/jpeg');
  await assert.rejects(shrink.shrink(photo(OVER)), /no such file/);
});

test('the limit holds on the bytes read, also where the phone gives no size', async () => {
  const files = fakeFiles({ [PICKED]: image(JPEG, LIMIT), [OVER]: image(JPEG, LIMIT + 1) }, { [PICKED]: 0, [OVER]: 0 });
  const shrink = pickerShrink({ loadModule: files.loadModule });
  assert.equal((await shrink.shrink(photo(PICKED)))?.bytes, LIMIT);
  assert.equal(await shrink.shrink(photo(OVER)), null);
});

test("an image's byte count is its decoded length, whatever its padding", async () => {
  const uri = (bytes: number) => `file:///cache/ImagePicker/${bytes}.jpg`;
  const files = fakeFiles({ [uri(900)]: image(JPEG, 900), [uri(901)]: image(JPEG, 901), [uri(902)]: image(JPEG, 902) }); // no padding, '==' and '='
  const shrink = pickerShrink({ loadModule: files.loadModule });
  for (const bytes of [900, 901, 902]) assert.equal((await shrink.shrink(photo(uri(bytes))))?.bytes, bytes, `${bytes} bytes`);
});

test('the fake shrink answers null for a photo too large, throws for a copy that is gone, and records each image removed', async () => {
  const shrink = fakeImageShrink({ tooLarge: ['p-big'], gone: ['file:///cache/ImagePicker/gone.jpg'] });
  const asset: PhotoAsset = { id: 'p-1', uri: 'file:///cache/ImagePicker/p 1.jpg', createdMs: 1, albumId: null };
  const shrunk = await shrink.shrink(asset);
  assert.deepEqual(shrunk, fakeShrunkImage(asset));
  if (shrunk === null) return;
  const bytes = Buffer.from(shrunk.base64, 'base64');
  assert.deepEqual({ head: bytes.toString('latin1'), bytes: shrunk.bytes, uri: shrunk.uri, type: shrunk.mediaType }, {
    head: `\xff\xd8\xff${encodeURIComponent(asset.uri)}`,
    bytes: bytes.length,
    uri: null,
    type: 'image/jpeg',
  });
  assert.notEqual(fakeShrunkImage({ ...asset, uri: 'file:///cache/ImagePicker/p 2.jpg' }).base64, shrunk.base64); // each copy its own image
  assert.equal(await shrink.shrink({ ...asset, id: 'p-big' }), null);
  await assert.rejects(shrink.shrink({ ...asset, uri: 'file:///cache/ImagePicker/gone.jpg' }), /gone/);
  await shrink.remove(shrunk);
  assert.deepEqual(shrink.removed, [shrunk]);
});
