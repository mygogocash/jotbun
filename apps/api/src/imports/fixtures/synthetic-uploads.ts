// Synthetic upload bodies for the P2a intake tests: magic-byte headers and
// made-up rows only - no real statements, receipts, photos or people. The
// legacy samples in ../../spend/fixtures stay as read-only references. Most
// image bodies are header-only (enough for sniffing, not decodable); P2b adds
// decodable images. Test use only.

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, 'latin1');
const le32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

/** A complete 1x1 RGBA PNG. */
const PNG = bytes(
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
);

const ftyp = (brand: string, ...compatible: string[]) => {
  const body = Buffer.concat([ascii('ftyp'), ascii(brand), Buffer.alloc(4), ...compatible.map(ascii)]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length + 4);
  return Buffer.concat([size, body, Buffer.alloc(16)]);
};

// A ZIP local file header naming [Content_Types].xml, as an XLSX begins.
const XLSX_NAME = ascii('[Content_Types].xml');
const XLSX = Buffer.concat([
  bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00),
  Buffer.alloc(12),
  bytes(XLSX_NAME.length, 0x00, 0x00, 0x00),
  XLSX_NAME,
  bytes(0xad, 0x52, 0xcb, 0x6e, 0xc2, 0x30, 0x10, 0xbc, 0x57, 0xea, 0x3f),
]);

const CSV_TEXT = [
  'date,type,category,amount,note',
  '2026-03-01,expense,food,65.00,synthetic coffee',
  '2026-03-02,income,salary,1000.00,synthetic pay',
  '2026-03-03,expense,transport,42.50,synthetic bus',
  '',
].join('\n');

export const SYNTHETIC = {
  csv: Buffer.from(CSV_TEXT, 'utf8'),
  /** UTF-8 with a byte-order mark and Thai text. */
  csvBom: Buffer.concat([bytes(0xef, 0xbb, 0xbf), Buffer.from('วันที่,จำนวน,โน๊ต\n1/3/2569,-65,กาแฟสังเคราะห์\n', 'utf8')]),
  /** Thai in a single-byte code page (TIS-620): not UTF-8, still text. */
  csvTis620: Buffer.concat([ascii('date,amount,note\n2026-03-01,65.00,'), bytes(0xa1, 0xd2, 0xe1, 0xbf), ascii('\n')]),
  /** UTF-16LE with its byte-order mark: text, but in an encoding the parser does not take. */
  csvUtf16: Buffer.concat([bytes(0xff, 0xfe), Buffer.from('date,amount\n2026-03-01,65.00\n', 'utf16le')]),
  /** A text header followed by a NUL byte (binary content behind a CSV name). */
  csvWithNul: Buffer.concat([ascii('date,amount\n2026-03-01,65.00\n'), bytes(0x00, 0x01, 0x02), ascii('\n')]),
  xlsx: XLSX,
  /** An empty ZIP archive (end-of-central-directory only). */
  emptyZip: Buffer.concat([bytes(0x50, 0x4b, 0x05, 0x06), Buffer.alloc(18)]),
  png: PNG,
  jpeg: Buffer.concat([bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10), ascii('JFIF'), bytes(0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9)]),
  webp: Buffer.concat([ascii('RIFF'), le32(26), ascii('WEBPVP8L'), le32(14), bytes(0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00)]),
  heic: ftyp('heic', 'mif1', 'heic'),
  heif: ftyp('mif1', 'mif1', 'heic'),
  avif: ftyp('avif', 'mif1', 'avif'),
  pdf: Buffer.concat([ascii('%PDF-1.7\n%'), bytes(0xe2, 0xe3, 0xcf, 0xd3), ascii('\n1 0 obj\n<<>>\nendobj\n')]),
  gif: Buffer.concat([ascii('GIF89a'), bytes(0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04)]),
  /** A legacy .xls (OLE2 compound file) header. */
  xls: Buffer.concat([bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), Buffer.alloc(24)]),
  /** A Windows executable header. */
  exe: Buffer.concat([ascii('MZ'), bytes(0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff), Buffer.alloc(16)]),
  /** RIFF, but audio rather than WebP. */
  wave: Buffer.concat([ascii('RIFF'), le32(36), ascii('WAVEfmt '), le32(16), Buffer.alloc(16)]),
};

/**
 * Names a client might send that look like paths or try to disguise their
 * extension. Each must be refused before any byte of the body is read.
 */
export const PATH_LIKE_NAMES = [
  '../../etc/passwd.csv',
  '..\\..\\Windows\\statement.csv',
  '/etc/statement.csv',
  'C:\\Users\\someone\\statement.csv',
  'C:statement.csv',
  'reports/march.csv',
  'statement.csv:hidden',
  'march.csv\u0000.png',
  'statement\u202Evsc.png',
  'zero\u200Bwidth.csv',
  'line\nbreak.csv',
  '.statement.csv',
  '..',
  ' statement.csv',
  'statement.csv ',
  '',
  'statement',
  `${'a'.repeat(125)}.csv`,
];

export type MeteredStream = { stream: AsyncIterable<Uint8Array>; pulled(): number; returned(): boolean };

/**
 * A synthetic body of `total` bytes in `chunk`-byte pieces that starts with
 * `head` and is filled with `fill` (a CSV-safe letter by default). Counts the
 * bytes the consumer has pulled, and whether it closed the stream. With
 * `failAt`, the source errors (a client that went away) before yielding the
 * piece that would cross that offset.
 */
export function meteredStream(head: Uint8Array, total: number, options: { chunk?: number; fill?: number; failAt?: number } = {}): MeteredStream {
  const chunk = options.chunk ?? 64 * 1024;
  let pulled = 0;
  let returned = false;
  async function* generate(): AsyncGenerator<Uint8Array> {
    try {
      for (let offset = 0; offset < total; offset += chunk) {
        const size = Math.min(chunk, total - offset);
        if (options.failAt !== undefined && offset + size > options.failAt) throw new Error('synthetic client went away');
        const piece = Buffer.alloc(size, options.fill ?? 0x61);
        if (offset < head.length) Buffer.from(head).copy(piece, 0, offset, Math.min(head.length, offset + size));
        pulled += size;
        yield piece;
      }
    } finally {
      returned = true;
    }
  }
  return { stream: generate(), pulled: () => pulled, returned: () => returned };
}
