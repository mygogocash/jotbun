// P4-T13: the phone's photo library port. Under owner Q1's default the app picks slips by hand
// through expo-image-picker and reads no album; the native modules come in through the loaders.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickerPhotoLibrary } from './photoLibrary.ts';
import type { PhotoAsset } from './photoLibrary.ts';
import { fakePhotoLibrary } from './testing/fakePhotos.ts';

type Permission = { status: string; accessPrivileges?: 'all' | 'limited' | 'none' };
type PickedAsset = { uri: string; assetId?: string | null; fileSize?: number; width: number; height: number };
type PickResult = { canceled: true; assets: null } | { canceled: false; assets: PickedAsset[] };

const COPY_1 = 'file:///var/mobile/Containers/Data/Application/A1/Library/Caches/ImagePicker/1F0C.jpg';
const COPY_2 = 'file:///data/user/0/co.gogocash.spend/cache/ImagePicker/7d2e.jpeg';
const COPY_3 = 'file:///data/user/0/co.gogocash.spend/cache/ImagePicker/9a41.png';
const ALBUM_PHOTO = 'file:///var/mobile/Media/DCIM/100APPLE/IMG_0042.JPG';

/** The parts of expo-image-picker 58.0.10 the port uses; each call is recorded with its arguments. */
function fakePicker(options: { pick?: PickResult; permission?: Permission } = {}) {
  const calls: unknown[][] = [];
  const permission = options.permission ?? { status: 'granted', accessPrivileges: 'all' };
  const answer = () => ({ ...permission, granted: permission.status === 'granted', canAskAgain: true, expires: 'never' });
  const module = {
    UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
    launchImageLibraryAsync: async (...args: unknown[]) => {
      calls.push(['launchImageLibraryAsync', ...args]);
      return options.pick ?? { canceled: true, assets: null };
    },
    getMediaLibraryPermissionsAsync: async (...args: unknown[]) => {
      calls.push(['getMediaLibraryPermissionsAsync', ...args]);
      return answer();
    },
    requestMediaLibraryPermissionsAsync: async (...args: unknown[]) => {
      calls.push(['requestMediaLibraryPermissionsAsync', ...args]);
      return answer();
    },
  };
  return { calls, loadModule: async () => module as unknown as typeof import('expo-image-picker') };
}

/** expo-file-system 58.0.9's File over a set of files: delete() removes one and throws for a missing one, as the real one does. */
function fakeFiles(uris: readonly string[]) {
  const files = new Set(uris);
  const deleted: string[] = [];
  class FakeFile {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete(): void {
      if (!files.delete(this.uri)) throw new Error('no such file');
      deleted.push(this.uri);
    }
  }
  return { files, deleted, loadFileSystem: async () => ({ File: FakeFile }) as unknown as typeof import('expo-file-system') };
}

const linking = (openSettings: () => Promise<void>) => async () => ({ openSettings }) as unknown as typeof import('expo-linking');

test('the picker path picks up to the limit at quality 0.7 in the compatible representation, without base64, and has no albums and no lookup by id', async () => {
  const picker = fakePicker({ pick: { canceled: false, assets: [{ uri: COPY_1, assetId: 'PH-1', fileSize: 412_000, width: 1170, height: 2532 }] } });
  const library = pickerPhotoLibrary({ loadModule: picker.loadModule });
  assert.equal(library.albumsSupported, false);
  const picked = await library.pick(20);
  assert.deepEqual(picker.calls, [
    ['launchImageLibraryAsync', { mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 0.7, preferredAssetRepresentationMode: 'compatible' }],
  ]);
  assert.deepEqual(picked.map((asset) => asset.uri), [COPY_1]);
  assert.deepEqual(await library.albums(), []);
  assert.deepEqual(await library.assetsSince('album-kbank', { ms: 0, id: null }, 50), []);
  assert.equal(await library.asset('PH-1'), null);
  assert.equal(await library.asset(COPY_1), null);
  const cancelled = fakePicker({ pick: { canceled: true, assets: null } });
  assert.deepEqual(await pickerPhotoLibrary({ loadModule: cancelled.loadModule }).pick(20), []);
  assert.equal(cancelled.calls.length, 1);
});

test('a picked image without an asset id is known by its uri', async () => {
  const picker = fakePicker({
    pick: {
      canceled: false,
      assets: [
        { uri: COPY_1, assetId: 'PH-1', fileSize: 412_000, width: 1170, height: 2532 },
        { uri: COPY_2, assetId: null, fileSize: 96_500, width: 1080, height: 2400 },
        { uri: COPY_3, width: 1080, height: 2400 },
      ],
    },
  });
  const before = Date.now();
  const picked = await pickerPhotoLibrary({ loadModule: picker.loadModule }).pick(5);
  const after = Date.now();
  const createdMs = picked[0]?.createdMs ?? -1;
  assert.ok(createdMs >= before && createdMs <= after, `a pick is dated when it is made: ${createdMs}`);
  assert.deepEqual(picked, [
    { id: 'PH-1', uri: COPY_1, createdMs, albumId: null, bytes: 412_000 },
    { id: COPY_2, uri: COPY_2, createdMs, albumId: null, bytes: 96_500 },
    { id: COPY_3, uri: COPY_3, createdMs, albumId: null },
  ]);
});

test('releasing a picked photo deletes its cache copy', async () => {
  const files = fakeFiles([COPY_1, ALBUM_PHOTO]);
  const library = pickerPhotoLibrary({ loadModule: fakePicker().loadModule, loadFileSystem: files.loadFileSystem });
  const copy: PhotoAsset = { id: 'PH-1', uri: COPY_1, createdMs: 1_762_650_000_000, albumId: null };
  await library.release(copy);
  assert.deepEqual(files.deleted, [COPY_1]);
  await library.release({ id: 'PH-42', uri: ALBUM_PHOTO, createdMs: 1_762_650_000_000, albumId: 'album-kbank' }); // the person's own photo
  await library.release(copy); // a copy already gone is no failure
  assert.deepEqual(files.deleted, [COPY_1]);
  assert.deepEqual([...files.files], [ALBUM_PHOTO]);
});

test("photo access reads all, limited, none and undetermined from the picker's permission", async () => {
  const cases: [Permission, string][] = [
    [{ status: 'granted', accessPrivileges: 'all' }, 'all'],
    [{ status: 'granted', accessPrivileges: 'limited' }, 'limited'],
    [{ status: 'granted' }, 'all'], // the web gives no accessPrivileges
    [{ status: 'denied', accessPrivileges: 'none' }, 'none'],
    [{ status: 'undetermined', accessPrivileges: 'none' }, 'undetermined'],
  ];
  for (const [permission, expected] of cases) {
    const picker = fakePicker({ permission });
    const library = pickerPhotoLibrary({ loadModule: picker.loadModule });
    assert.equal(await library.access(), expected, `access() with ${JSON.stringify(permission)}`);
    assert.equal(await library.request(), expected, `request() with ${JSON.stringify(permission)}`);
    assert.deepEqual(picker.calls, [['getMediaLibraryPermissionsAsync'], ['requestMediaLibraryPermissionsAsync']]);
  }
});

test("the phone's settings open through expo-linking, and a phone that cannot open them does nothing", async () => {
  let opened = 0;
  const library = pickerPhotoLibrary({ loadModule: fakePicker().loadModule, loadLinking: linking(async () => { opened += 1; }) });
  await library.openSettings();
  assert.equal(opened, 1);
  const web = pickerPhotoLibrary({ loadModule: fakePicker().loadModule, loadLinking: linking(async () => { throw new Error('openSettings is not available on web'); }) });
  await web.openSettings();
});

test('the fake library lists photos oldest first, strictly after the watermark, ties broken by id, and finds one again only by its id', async () => {
  const library = fakePhotoLibrary({
    albums: [
      {
        id: 'album-kbank',
        title: 'K PLUS',
        assets: [
          { id: 'p-c', uri: 'file:///album/kbank/c.jpg', createdMs: 2000 },
          { id: 'p-a', uri: 'file:///album/kbank/a.jpg', createdMs: 2000 },
          { id: 'p-z', uri: 'file:///album/kbank/z.jpg', createdMs: 1000 },
          { id: 'p-b', uri: 'file:///album/kbank/b.jpg', createdMs: 2000 },
          { id: 'p-d', uri: 'file:///album/kbank/d.jpg', createdMs: 3000 },
        ],
      },
      { id: 'album-scb', title: 'SCB EASY', assets: [{ id: 's-1', uri: 'file:///album/scb/1.jpg', createdMs: 1500 }] },
    ],
    picked: [{ id: 'picked-1', uri: COPY_1, createdMs: 5000, albumId: null }],
  });
  const ids = async (after: { ms: number; id: string | null }, limit = 50) => (await library.assetsSince('album-kbank', after, limit)).map((asset) => asset.id);
  assert.deepEqual(await ids({ ms: 0, id: null }), ['p-z', 'p-a', 'p-b', 'p-c', 'p-d']);
  assert.deepEqual(await ids({ ms: 2000, id: null }), ['p-a', 'p-b', 'p-c', 'p-d']); // a null id comes before every id
  assert.deepEqual(await ids({ ms: 2000, id: 'p-a' }), ['p-b', 'p-c', 'p-d']);
  assert.deepEqual(await ids({ ms: 2000, id: 'p-c' }), ['p-d']);
  assert.deepEqual(await ids({ ms: 0, id: null }, 2), ['p-z', 'p-a']);
  assert.deepEqual(await library.assetsSince('album-kbank', { ms: 2000, id: 'p-c' }, 50), [
    { id: 'p-d', uri: 'file:///album/kbank/d.jpg', createdMs: 3000, albumId: 'album-kbank' },
  ]);
  assert.deepEqual(await library.assetsSince('album-scb', { ms: 1500, id: 's-1' }, 50), []);
  assert.deepEqual(await library.albums(), [
    { id: 'album-kbank', title: 'K PLUS', count: 5 },
    { id: 'album-scb', title: 'SCB EASY', count: 1 },
  ]);
  assert.deepEqual(await library.asset('s-1'), { id: 's-1', uri: 'file:///album/scb/1.jpg', createdMs: 1500, albumId: 'album-scb' });
  assert.equal(await library.asset('file:///album/scb/1.jpg'), null);
  assert.equal(await library.asset('picked-1'), null);
  assert.equal(await library.asset('p-gone'), null);
  // Every answer is a copy: a caller that changes one changes nothing in the fake.
  const answers = [...(await library.assetsSince('album-kbank', { ms: 0, id: null }, 1)), await library.asset('p-z'), ...(await library.pick(1))];
  for (const answer of answers) if (answer) answer.uri = 'file:///changed.jpg';
  assert.equal((await library.asset('p-z'))?.uri, 'file:///album/kbank/z.jpg');
  assert.equal((await library.assetsSince('album-kbank', { ms: 0, id: null }, 1))[0]?.uri, 'file:///album/kbank/z.jpg');
  assert.equal((await library.pick(1))[0]?.uri, COPY_1);
});

test('the fake library answers its access, picks up to the limit and records each call', async () => {
  const picked: PhotoAsset[] = [1, 2, 3].map((n) => ({ id: `picked-${n}`, uri: `file:///cache/ImagePicker/${n}.jpg`, createdMs: 5000, albumId: null }));
  const library = fakePhotoLibrary({ access: 'limited', picked, albumsSupported: false });
  assert.equal(library.albumsSupported, false);
  assert.equal(await library.access(), 'limited');
  assert.equal(await library.request(), 'limited');
  assert.deepEqual((await library.pick(2)).map((asset) => asset.id), ['picked-1', 'picked-2']);
  await library.release(picked[0]);
  await library.openSettings();
  assert.deepEqual(library.released, [picked[0]]);
  assert.deepEqual(library.calls, [
    { method: 'access', args: [] },
    { method: 'request', args: [] },
    { method: 'pick', args: [2] },
    { method: 'release', args: [picked[0]] },
    { method: 'openSettings', args: [] },
  ]);
  const plain = fakePhotoLibrary();
  assert.equal(plain.albumsSupported, true);
  assert.equal(await plain.access(), 'all');
  assert.deepEqual(await plain.pick(20), []);
  assert.deepEqual(await plain.albums(), []);
});
