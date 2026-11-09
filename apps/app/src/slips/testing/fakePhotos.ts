// Fakes of the photo library and shrink ports (P4-T13), for the scan engine's tests (P4-T14) and
// the slip screens' (P4-T18 on). Every answer is a copy, so a test cannot change the fake's photos.
import type { ImageShrinkPort, ShrunkImage } from '../imageShrink.ts';
import type { PhotoAccess, PhotoAsset, PhotoLibraryPort } from '../photoLibrary.ts';

/** An album and its photos; each photo's albumId is the album's id. */
export type FakeAlbum = { id: string; title: string; assets?: readonly Omit<PhotoAsset, 'albumId'>[] };
export type FakeLibraryCall = { method: Exclude<keyof PhotoLibraryPort, 'albumsSupported'>; args: unknown[] };
export type FakePhotoLibrary = PhotoLibraryPort & { released: PhotoAsset[]; calls: FakeLibraryCall[] };
export type FakeImageShrink = ImageShrinkPort & { removed: ShrunkImage[] };

// Oldest first, ties broken by id (code unit order, as SQLite's BINARY collation).
const byAge = (a: PhotoAsset, b: PhotoAsset): number => a.createdMs - b.createdMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * A photo library over the given albums and picks. access() and request() both answer `access`
 * (default 'all'), albumsSupported defaults to true, pick(limit) gives the first `limit` of
 * `picked`, and asset(id) finds a listed album photo only by its id (never by its uri, never a
 * pick). It records every call in `calls` and every released photo in `released`.
 */
export function fakePhotoLibrary(
  options: { access?: PhotoAccess; albums?: readonly FakeAlbum[]; picked?: readonly PhotoAsset[]; albumsSupported?: boolean } = {},
): FakePhotoLibrary {
  const access = options.access ?? 'all';
  const albums = (options.albums ?? []).map((album) => ({
    id: album.id,
    title: album.title,
    assets: (album.assets ?? []).map((asset): PhotoAsset => ({ ...asset, albumId: album.id })).sort(byAge),
  }));
  const released: PhotoAsset[] = [];
  const calls: FakeLibraryCall[] = [];
  const record = (method: FakeLibraryCall['method'], ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  return {
    albumsSupported: options.albumsSupported ?? true,
    released,
    calls,
    async access() {
      record('access');
      return access;
    },
    async request() {
      record('request');
      return access;
    },
    async albums() {
      record('albums');
      return albums.map(({ id, title, assets }) => ({ id, title, count: assets.length }));
    },
    async assetsSince(albumId, after, limit) {
      record('assetsSince', albumId, { ...after }, limit);
      const album = albums.find((candidate) => candidate.id === albumId);
      return (album?.assets ?? [])
        .filter((asset) => asset.createdMs > after.ms || (asset.createdMs === after.ms && (after.id === null || asset.id > after.id)))
        .slice(0, limit)
        .map((asset) => ({ ...asset }));
    },
    async asset(id) {
      record('asset', id);
      for (const album of albums) {
        const found = album.assets.find((asset) => asset.id === id);
        if (found) return { ...found };
      }
      return null;
    },
    async pick(limit) {
      record('pick', limit);
      return (options.picked ?? []).slice(0, limit).map((asset) => ({ ...asset }));
    },
    async release(asset) {
      record('release', asset);
      released.push(asset);
    },
    async openSettings() {
      record('openSettings');
    },
  };
}

/** The fake shrink's image of a photo: a JPEG's first bytes, then the photo's uri, so a test can tell which copy was sent. */
export function fakeShrunkImage(asset: PhotoAsset): ShrunkImage {
  const bytes = `\xff\xd8\xff${encodeURIComponent(asset.uri)}`;
  return { uri: null, base64: btoa(bytes), bytes: bytes.length, mediaType: 'image/jpeg' };
}

/**
 * A shrink port: fakeShrunkImage for each photo, null for a photo whose id is in `tooLarge`, and a
 * throw for a copy whose uri is in `gone` (a removed copy, P4-T14). It records each image removed.
 */
export function fakeImageShrink(options: { tooLarge?: readonly string[]; gone?: readonly string[] } = {}): FakeImageShrink {
  const removed: ShrunkImage[] = [];
  return {
    removed,
    async shrink(asset) {
      if (options.gone?.includes(asset.uri)) throw new Error('The photo is gone.');
      return options.tooLarge?.includes(asset.id) ? null : fakeShrunkImage(asset);
    },
    async remove(image) {
      removed.push(image);
    },
  };
}
