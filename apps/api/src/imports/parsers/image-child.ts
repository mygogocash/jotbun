// Parser child for JPEG, PNG and WebP receipts. Started by parser-runner with
// `--permission`; unlike the table child it may load native addons (sharp)
// and read the sharp package directories. No network, child-process, worker
// or file-write permission.
import { runChild } from './child-io.ts';
import { sanitizeImage } from './image.ts';
import { IMAGE_FORMATS, ParseRejection } from './protocol.ts';
import type { ImageFormat } from './protocol.ts';
import { receiptBody } from './receipt.ts';

runChild(async (format, bytes) => {
  if (!(IMAGE_FORMATS as readonly string[]).includes(format)) throw new ParseRejection('parse_failed');
  const image = await sanitizeImage(bytes, format as ImageFormat);
  return receiptBody(image, format as ImageFormat);
});
