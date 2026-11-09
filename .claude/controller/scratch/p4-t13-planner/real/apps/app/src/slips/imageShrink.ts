// Making a slip photo small enough to send (P4-T13). Under owner Q2's default
// expo-image-manipulator is not installed, so pickerShrink() sends a photo's own bytes when they
// fit SLIP_LIMITS.imageBytes (1,200,000; a picked JPEG is already compressed at quality 0.7) and
// otherwise nothing: a larger photo, such as a PNG screenshot iOS will not compress, stays
// unread on the phone. Q2's manipulatorShrink() waits on the owner's yes and is not written here.
// expo-file-system 58.0.9 loads through an optional loader (src/lib/haptics.ts's pattern), so
// Node loads this module.
import { SLIP_LIMITS } from '@gogospend/contracts';

import type { PhotoAsset } from './photoLibrary.ts';

export type ShrunkImage = { uri: string | null; base64: string; bytes: number; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
/** shrink(): null when the photo cannot be sent (too large, or not a JPEG, PNG or WebP); it throws when the photo is gone. */
export type ImageShrinkPort = { shrink(asset: PhotoAsset): Promise<ShrunkImage | null>; remove(image: ShrunkImage): Promise<void> };

type FileSystemModule = typeof import('expo-file-system');

// The contract's image text (parseSlipImage in packages/contracts/src/v1/slips.ts): a batch with
// anything else in it is refused whole.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodedBytes(base64: string): number {
  return (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

// The type an image's first bytes name.
function imageTypeOf(base64: string): ShrunkImage['mediaType'] | null {
  const head = atob(base64.slice(0, 16));
  if (head.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Q2's default: a QR-checked photo's or a shared file's bytes as they are, within 1,200,000
 * bytes, else null. A photo whose size says it is too large is never read. A copy that is gone
 * throws (its read fails), so the scan engine keeps it apart from an unreadable photo (P4-T14).
 * The image's uri is null: nothing was copied, so remove() deletes nothing, never a pending copy.
 */
export function pickerShrink(options: { loadModule?: () => Promise<FileSystemModule> } = {}): ImageShrinkPort {
  const load = options.loadModule ?? (() => import('expo-file-system'));
  return {
    async shrink(asset) {
      const { File } = await load();
      const file = new File(asset.uri);
      if (file.size > SLIP_LIMITS.imageBytes) return null;
      const base64 = await file.base64();
      if (base64.length % 4 !== 0 || !BASE64.test(base64)) return null;
      const bytes = decodedBytes(base64); // the bytes read, also where the phone could not give a size (0)
      if (bytes > SLIP_LIMITS.imageBytes) return null;
      const mediaType = imageTypeOf(base64);
      return mediaType === null ? null : { uri: null, base64, bytes, mediaType };
    },
    async remove() {
      // Nothing to delete: the image is the photo's own bytes.
    },
  };
}
