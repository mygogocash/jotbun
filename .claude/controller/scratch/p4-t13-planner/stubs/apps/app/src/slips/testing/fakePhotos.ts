// RED stub (P4-T13): the final interface with no behaviour. Step 4 replaces this file.
import type { ImageShrinkPort, ShrunkImage } from '../imageShrink.ts';
import type { PhotoAccess, PhotoAsset, PhotoLibraryPort } from '../photoLibrary.ts';

/** An album and its photos; each photo's albumId is the album's id. */
export type FakeAlbum = { id: string; title: string; assets?: readonly Omit<PhotoAsset, 'albumId'>[] };
export type FakeLibraryCall = { method: Exclude<keyof PhotoLibraryPort, 'albumsSupported'>; args: unknown[] };
export type FakePhotoLibrary = PhotoLibraryPort & { released: PhotoAsset[]; calls: FakeLibraryCall[] };
export type FakeImageShrink = ImageShrinkPort & { removed: ShrunkImage[] };

export function fakePhotoLibrary(
  options: { access?: PhotoAccess; albums?: readonly FakeAlbum[]; picked?: readonly PhotoAsset[]; albumsSupported?: boolean } = {},
): FakePhotoLibrary {
  void options;
  return {
    albumsSupported: false,
    released: [],
    calls: [],
    access: async () => 'undetermined',
    request: async () => 'undetermined',
    albums: async () => [],
    assetsSince: async () => [],
    asset: async () => null,
    pick: async () => [],
    release: async () => {},
    openSettings: async () => {},
  };
}

export function fakeShrunkImage(asset: PhotoAsset): ShrunkImage {
  void asset;
  return { uri: null, base64: '', bytes: 0, mediaType: 'image/jpeg' };
}

export function fakeImageShrink(options: { tooLarge?: readonly string[]; gone?: readonly string[] } = {}): FakeImageShrink {
  void options;
  return {
    removed: [],
    shrink: async () => null,
    remove: async () => {},
  };
}
