// Receipt image sanitizing for the image parser child (the only child that
// may load a native addon: sharp/libvips, already in the lockfile).
//   0. Only the JPEG, PNG and WebP loaders may run (sharp.block): no other
//      libvips loader ever reads an upload, not even its header.
//   1. Read the header only: the format must be the declared one
//      (image_format_mismatch); width × height at most 20 MP and the decoded
//      size (× channels × bytes per sample) at most 120 MB (image_too_large)
//      - a decompression bomb, or a 16-bit image with alpha at 20 MP, is
//      refused before any pixel is decoded.
//   2. Decode with libvips' own pixel limit, apply the EXIF orientation,
//      flatten any transparency onto white, and keep raw 8-bit sRGB pixels
//      (an animated image keeps its first frame).
//   3. Encode those pixels alone in the declared format (JPEG/WebP quality
//      85, PNG lossless): nothing of the original file - EXIF, XMP, IPTC, ICC,
//      text chunks, frames - can reach the output, which is checked again.
// Memory (M3): one libvips thread, no operation cache, WebP at encoder effort
// 0 and the two steps above keep a noisy 20 MP image within the child budget
// (PARSER_CHILD_MEMORY_MIB, 352 MiB): measured on Linux, the worst honest
// inputs peak near 300 MiB (see the P2b review fixes receipt).
// Anything libvips cannot decode is image_malformed.
import sharp from 'sharp';

import { LIMITS, ParseRejection } from './protocol.ts';
import type { ImageFormat } from './protocol.ts';

export type SanitizedImage = { bytes: Buffer; width: number; height: number };

sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: ['VipsForeignLoadJpegBuffer', 'VipsForeignLoadPngBuffer', 'VipsForeignLoadWebpBuffer'] });

const BYTES_PER_SAMPLE: Readonly<Record<string, number>> = { uchar: 1, char: 1, ushort: 2, short: 2, uint: 4, int: 4, float: 4, complex: 8, double: 8, dpcomplex: 16 };

export async function sanitizeImage(input: Uint8Array, format: ImageFormat): Promise<SanitizedImage> {
  sharp.cache(false);
  sharp.concurrency(1);
  let width: number;
  let height: number;
  let decodedBytes: number;
  try {
    // Header only; the pixel limit is applied below, so a huge claim is refused with its own reason.
    const meta = await sharp(input, { limitInputPixels: false, failOn: 'error' }).metadata();
    if (meta.format !== format) throw new ParseRejection('image_format_mismatch');
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    decodedBytes = width * height * (meta.channels ?? 0) * (BYTES_PER_SAMPLE[meta.depth ?? ''] ?? 0);
  } catch (error) {
    throw error instanceof ParseRejection ? error : new ParseRejection('image_malformed');
  }
  if (!(width >= 1 && height >= 1 && decodedBytes >= 1)) throw new ParseRejection('image_malformed');
  if (width * height > LIMITS.imagePixels || decodedBytes > LIMITS.imageDecodedBytes) throw new ParseRejection('image_too_large');

  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const pixels = await sharp(input, { limitInputPixels: LIMITS.imagePixels, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pipeline = sharp(pixels.data, { raw: { width: pixels.info.width, height: pixels.info.height, channels: pixels.info.channels } });
    const encoded = format === 'jpeg' ? pipeline.jpeg({ quality: 85 }) : format === 'png' ? pipeline.png() : pipeline.webp({ quality: 85, effort: 0 });
    output = await encoded.toBuffer({ resolveWithObject: true });
  } catch {
    throw new ParseRejection('image_malformed');
  }
  if (output.data.length > LIMITS.inputBytes) throw new ParseRejection('image_too_large');
  const check = await sharp(output.data).metadata();
  if (check.format !== format || check.exif || check.xmp || check.iptc || check.icc || check.hasAlpha) throw new ParseRejection('image_malformed');
  return { bytes: output.data, width: output.info.width, height: output.info.height };
}
