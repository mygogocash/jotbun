// RED stub (P4-T13): the final interface with no behaviour. Step 4 replaces this file.
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

export function pickerPhotoLibrary(options: PickerPhotoLibraryOptions = {}): PhotoLibraryPort {
  void options;
  return {
    albumsSupported: true,
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
