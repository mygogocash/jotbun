// RED stub (P4-T13): the final interface with no behaviour. Step 4 replaces this file.
import type { PhotoAsset } from './photoLibrary.ts';

export type ShrunkImage = { uri: string | null; base64: string; bytes: number; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
/** shrink(): null when the photo cannot be sent (too large, or not a JPEG, PNG or WebP); it throws when the photo is gone. */
export type ImageShrinkPort = { shrink(asset: PhotoAsset): Promise<ShrunkImage | null>; remove(image: ShrunkImage): Promise<void> };

type FileSystemModule = typeof import('expo-file-system');

export function pickerShrink(options: { loadModule?: () => Promise<FileSystemModule> } = {}): ImageShrinkPort {
  void options;
  return {
    shrink: async () => null,
    remove: async () => {},
  };
}
