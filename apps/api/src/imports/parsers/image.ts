// Receipt image sanitizing for the image parser child (the only child that
// may load a native addon: sharp/libvips, already in the lockfile).
//   1. Read the header only: the format must be the declared one
//      (image_format_mismatch) and width × height at most 20 MP
//      (image_too_large) - a decompression bomb is refused before any pixel
//      is decoded.
//   2. Decode with libvips' own pixel limit, apply the EXIF orientation, and
//      re-encode in the same format. Output carries no metadata: EXIF (GPS,
//      device, time), XMP, IPTC and ICC are all dropped - checked again on
//      the result. An animated image keeps only its first frame.
// Anything libvips cannot decode is image_malformed.
import sharp from 'sharp';

import { LIMITS, ParseRejection } from './protocol.ts';
import type { ImageFormat } from './protocol.ts';

export type SanitizedImage = { bytes: Buffer; width: number; height: number };

export async function sanitizeImage(input: Uint8Array, format: ImageFormat): Promise<SanitizedImage> {
  sharp.cache(false);
  sharp.concurrency(1);
  let width: number;
  let height: number;
  try {
    // Header only; the pixel limit is applied below, so a huge claim is refused with its own reason.
    const meta = await sharp(input, { limitInputPixels: false, failOn: 'error' }).metadata();
    if (meta.format !== format) throw new ParseRejection('image_format_mismatch');
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (error) {
    throw error instanceof ParseRejection ? error : new ParseRejection('image_malformed');
  }
  if (!(width >= 1 && height >= 1)) throw new ParseRejection('image_malformed');
  if (width * height > LIMITS.imagePixels) throw new ParseRejection('image_too_large');

  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const pipeline = sharp(input, { limitInputPixels: LIMITS.imagePixels, failOn: 'error' }).rotate();
    const encoded = format === 'jpeg' ? pipeline.jpeg({ quality: 85 }) : format === 'png' ? pipeline.png() : pipeline.webp({ quality: 85 });
    output = await encoded.toBuffer({ resolveWithObject: true });
  } catch {
    throw new ParseRejection('image_malformed');
  }
  if (output.data.length > LIMITS.inputBytes) throw new ParseRejection('image_too_large');
  const check = await sharp(output.data).metadata();
  if (check.format !== format || check.exif || check.xmp || check.iptc || check.icc) throw new ParseRejection('image_malformed');
  return { bytes: output.data, width: output.info.width, height: output.info.height };
}
