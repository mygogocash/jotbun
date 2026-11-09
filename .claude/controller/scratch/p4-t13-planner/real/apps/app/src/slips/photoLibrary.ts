// The phone's photo library port (P4-T13). Under owner Q1's default expo-media-library is not
// installed, so the app reads no album: pickerPhotoLibrary() picks slips by hand through the
// installed expo-image-picker 58.0.10, and each picked photo is the picker's own copy in the
// app's cache, which release() deletes once the scan engine (P4-T14) is done with it. Q1's
// mediaLibraryPhotoLibrary() waits on the owner's yes and is not written here.
// expo-image-picker, expo-file-system and expo-linking load through optional loaders
// (src/lib/haptics.ts's pattern), so Node loads this module; react-native is never imported.
import { SLIP_LIMITS } from '@gogospend/contracts';

export type PhotoAccess = 'all' | 'limited' | 'none' | 'undetermined';
export type AlbumInfo = { id: string; title: string; count: number };
/**
 * A photo the scan can read: an album photo, or a picked photo's copy (albumId null; its id is the
 * picker's assetId, else its uri). bytes is the size the phone reports, a hint only: Android's
 * picker gives the original photo's size, not its copy's, so the shrink port measures the file.
 */
export type PhotoAsset = { id: string; uri: string; createdMs: number; albumId: string | null; bytes?: number };
export type PhotoLibraryPort = {
  readonly albumsSupported: boolean;
  access(): Promise<PhotoAccess>;
  request(): Promise<PhotoAccess>;
  albums(): Promise<AlbumInfo[]>;
  /** An album's photos, oldest first, strictly after (ms, id); a null id comes before every id, so it takes the photos at ms too. */
  assetsSince(albumId: string, after: { ms: number; id: string | null }, limit: number): Promise<PhotoAsset[]>;
  /** An album photo again by its id (P4-T14's resume); null once it is gone. */
  asset(id: string): Promise<PhotoAsset | null>;
  pick(limit: number): Promise<PhotoAsset[]>;
  /** Deletes a picked photo's copy, best effort; nothing for an album photo. */
  release(asset: PhotoAsset): Promise<void>;
  /** Opens the app's page in the phone's settings, best effort. */
  openSettings(): Promise<void>;
};

type ImagePickerModule = typeof import('expo-image-picker');
type FileSystemModule = typeof import('expo-file-system');
type LinkingModule = typeof import('expo-linking');

export type PickerPhotoLibraryOptions = {
  loadModule?: () => Promise<ImagePickerModule>;
  loadFileSystem?: () => Promise<FileSystemModule>;
  loadLinking?: () => Promise<LinkingModule>;
};

// The picker's media library answer: granted is all or limited; undetermined until asked; else none.
function photoAccessOf(answer: { status: string; accessPrivileges?: 'all' | 'limited' | 'none' }): PhotoAccess {
  if (answer.status === 'granted') return answer.accessPrivileges === 'limited' ? 'limited' : 'all';
  return answer.status === 'undetermined' ? 'undetermined' : 'none';
}

/** Q1's default: no albums and no lookup by id (P4-T14 finds a picked copy by its uri); pick() multi-selects at quality 0.7. */
export function pickerPhotoLibrary(options: PickerPhotoLibraryOptions = {}): PhotoLibraryPort {
  const loadPicker = options.loadModule ?? (() => import('expo-image-picker'));
  const loadFileSystem = options.loadFileSystem ?? (() => import('expo-file-system'));
  const loadLinking = options.loadLinking ?? (() => import('expo-linking'));
  return {
    albumsSupported: false,
    access: async () => photoAccessOf(await (await loadPicker()).getMediaLibraryPermissionsAsync()),
    request: async () => photoAccessOf(await (await loadPicker()).requestMediaLibraryPermissionsAsync()),
    albums: async () => [],
    assetsSince: async () => [],
    asset: async () => null,
    async pick(limit) {
      const picker = await loadPicker();
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: limit,
        quality: SLIP_LIMITS.jpegQuality,
        preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return [];
      const createdMs = Date.now(); // the picker gives no taken time: a pick is dated when it is made
      return result.assets.map((asset) => ({
        id: asset.assetId ?? asset.uri,
        uri: asset.uri,
        createdMs,
        albumId: null,
        ...(typeof asset.fileSize === 'number' ? { bytes: asset.fileSize } : {}),
      }));
    },
    async release(asset) {
      if (asset.albumId !== null) return; // an album photo is the person's own
      try {
        const { File } = await loadFileSystem();
        new File(asset.uri).delete();
      } catch {
        // Best effort: a copy already gone, or one the phone will not delete, stays in the cache the phone clears.
      }
    },
    async openSettings() {
      try {
        await (await loadLinking()).openSettings();
      } catch {
        // Best effort: where settings cannot open (the web), nothing happens.
      }
    },
  };
}
