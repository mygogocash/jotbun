// Synthetic files for the P2b parser tests: made-up rows, generated
// workbooks (including hostile ones) and generated images - no real
// statements, receipts, photos or people. The legacy samples in
// ../../spend/fixtures stay read-only references. Test use only.
import { once } from 'node:events';
import { crc32, createDeflateRaw, deflateRawSync, deflateSync } from 'node:zlib';

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// ZIP (just enough of the format to build valid and hostile archives)
// ---------------------------------------------------------------------------

export type ZipEntrySpec = {
  name: string;
  data: Buffer | string;
  method?: 'store' | 'deflate';
  /** Written as the uncompressed size instead of the real one (a lying header). */
  declaredSize?: number;
  /** Written as the CRC-32 instead of the real one. */
  crc?: number;
  /** General-purpose flags (bit 0: encrypted). */
  flags?: number;
  /** The central directory points at this earlier entry's local header instead (overlapping entries). */
  localOf?: number;
  /** An already deflated body written as is (`data` is then ignored for the body; give `crc` and `declaredSize`). */
  deflated?: Buffer;
};

export type ZipOptions = { zip64?: boolean };

const u16 = (value: number) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
const u32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
};

export function buildZip(entries: readonly ZipEntrySpec[], options: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  entries.forEach((entry, index) => {
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
    const method = entry.deflated ? 'deflate' : (entry.method ?? 'deflate');
    const body = entry.deflated ?? (method === 'deflate' ? deflateRawSync(raw) : raw);
    const name = Buffer.from(entry.name, 'utf8');
    const crc = entry.crc ?? crc32(raw);
    const size = entry.declaredSize ?? raw.length;
    const flags = entry.flags ?? 0;
    const methodCode = method === 'deflate' ? 8 : 0;
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(methodCode), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size), u16(name.length), u16(0), name]);
    offsets.push(offset);
    locals.push(header, body);
    const localOffset = entry.localOf === undefined ? offset : offsets[entry.localOf];
    offset += header.length + body.length;
    centrals.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(flags), u16(methodCode), u16(0), u16(0x21), u32(crc), u32(body.length), u32(size),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name,
      ]),
    );
    void index;
  });
  const central = Buffer.concat(centrals);
  const count = options.zip64 ? 0xffff : entries.length;
  const centralOffset = options.zip64 ? 0xffffffff : offset;
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(count), u16(count), u32(central.length), u32(centralOffset), u16(0)]);
  return Buffer.concat([...locals, central, end]);
}

/** `total` zero bytes as one raw deflate stream (about 1/1000 of the size), built without holding them all. */
export async function deflatedZeros(total: number): Promise<Buffer> {
  const deflate = createDeflateRaw({ level: 9 });
  const chunks: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = once(deflate, 'end');
  const block = Buffer.alloc(64 * 1024 * 1024);
  for (let written = 0; written < total; written += block.length) {
    if (!deflate.write(block.subarray(0, Math.min(block.length, total - written)))) await once(deflate, 'drain');
  }
  deflate.end();
  await ended;
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

export type CellSpec =
  | string
  | number
  | null
  | { date: string }
  | { formula: string; value?: string }
  | { inline: string }
  | { bool: boolean };

export type SheetSpec = { name?: string; rows: CellSpec[][]; rowNumbers?: number[]; kind?: 'worksheet' | 'macrosheet' };

export type XlsxOptions = {
  sheets: SheetSpec[];
  date1904?: boolean;
  /** Extra ZIP entries (vbaProject.bin, externalLinks, ...). */
  extraEntries?: ZipEntrySpec[];
  /** Extra <Relationship> elements in xl/_rels/workbook.xml.rels. */
  extraWorkbookRels?: string;
  /** Extra elements inside <workbook> (after <sheets>). */
  workbookExtra?: string;
  /** Prepended to xl/workbook.xml (a DOCTYPE, for instance). */
  workbookPrologue?: string;
  /** Extra <Override> elements in [Content_Types].xml. */
  contentTypesExtra?: string;
  /** Raw XML for a shared string item, instead of escaping `rows`' strings (rich text, phonetic runs). */
  sharedStringItems?: string[];
};

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function buildXlsx(options: XlsxOptions): Buffer {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const shared = (text: string) => {
    let index = stringIndex.get(text);
    if (index === undefined) {
      index = strings.length;
      strings.push(text);
      stringIndex.set(text, index);
    }
    return index;
  };
  const sheetXml = (sheet: SheetSpec) => {
    const rows = sheet.rows.map((cells, rowIndex) => {
      const r = sheet.rowNumbers?.[rowIndex] ?? rowIndex + 1;
      const xml = cells
        .map((cell, col) => {
          const ref = `${columnName(col)}${r}`;
          if (cell === null) return '';
          if (typeof cell === 'string') return `<c r="${ref}" t="s"><v>${shared(cell)}</v></c>`;
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
          if ('date' in cell) return `<c r="${ref}" s="1"><v>${cell.date}</v></c>`;
          if ('formula' in cell) return `<c r="${ref}"><f>${escapeXml(cell.formula)}</f><v>${cell.value ?? '0'}</v></c>`;
          if ('inline' in cell) return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`;
          return `<c r="${ref}" t="b"><v>${cell.bool ? 1 : 0}</v></c>`;
        })
        .join('');
      return `<row r="${r}">${xml}</row>`;
    });
    const root = sheet.kind === 'macrosheet' ? 'xm:macrosheet' : 'worksheet';
    const extraNs = sheet.kind === 'macrosheet' ? ' xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root} ${NS}${extraNs}><sheetData>${rows.join('')}</sheetData></${root}>`;
  };
  const sheets = options.sheets.map((sheet, index) => ({ ...sheet, xml: sheetXml(sheet), id: index + 1 }));
  const sharedItems = options.sharedStringItems ?? strings.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
  const sheetEntry = (sheet: (typeof sheets)[number]) =>
    sheet.kind === 'macrosheet' ? `xl/macrosheets/sheet${sheet.id}.xml` : `xl/worksheets/sheet${sheet.id}.xml`;
  const sheetRelType = (sheet: (typeof sheets)[number]) =>
    sheet.kind === 'macrosheet' ? 'http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet' : `${REL}/worksheet`;
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map((sheet) => `<Override PartName="/${sheetEntry(sheet)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    options.contentTypesExtra ?? '',
    '</Types>',
  ].join('');
  const workbook = [
    options.workbookPrologue ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<workbook ${NS}>`,
    options.date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>',
    '<sheets>',
    ...sheets.map((sheet) => `<sheet name="${escapeXml(sheet.name ?? `Sheet${sheet.id}`)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`),
    '</sheets>',
    options.workbookExtra ?? '',
    '</workbook>',
  ].join('');
  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    ...sheets.map((sheet) => `<Relationship Id="rId${sheet.id}" Type="${sheetRelType(sheet)}" Target="${sheetEntry(sheet).slice(3)}"/>`),
    `<Relationship Id="rIdS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`,
    `<Relationship Id="rIdT" Type="${REL}/styles" Target="styles.xml"/>`,
    options.extraWorkbookRels ?? '',
    '</Relationships>',
  ].join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedItems.length}" uniqueCount="${sharedItems.length}">${sharedItems.join('')}</sst>`;
  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    ...sheets.map((sheet) => ({ name: sheetEntry(sheet), data: sheet.xml })),
    { name: 'xl/sharedStrings.xml', data: sharedStrings },
    { name: 'xl/styles.xml', data: styles },
    ...(options.extraEntries ?? []),
  ]);
}

/** A valid statement workbook: Thai headers, shared and inline strings, a date-styled serial and a Buddhist-era text date. */
export const XLSX_STATEMENT_ROWS: CellSpec[][] = [
  ['วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวน', 'โน๊ต', 'จ่ายจาก'],
  [{ date: '45658' }, 'รายจ่าย', 'อาหาร', -120.5, 'ข้าวสังเคราะห์', 'เงินสด'],
  ['29/02/2567', 'รายรับ', 'เงินเดือน', 15000, { inline: 'synthetic pay' }, 'ธนาคารสังเคราะห์'],
  ['2026-03-03', 'รายจ่าย', 'เดินทาง', '-42.50', null, 'เงินสด'],
];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const csv = (lines: readonly string[]) => Buffer.from(`${lines.join('\n')}\n`, 'utf8');

/** A header plus `count` synthetic expense rows. */
export function csvRows(count: number, header = 'date,type,category,amount,note,wallet'): Buffer {
  const lines = [header];
  for (let i = 0; i < count; i += 1) lines.push(`2026-01-${String((i % 28) + 1).padStart(2, '0')},expense,food,${(i % 900) + 1}.25,row ${i + 1},Cash`);
  return csv(lines);
}

/** Columns the importer does not know, including id-like ones it must never use as ids. */
export const UNKNOWN_FIELDS_CSV = csv([
  'date,amount,type,wallet,owner_id,account_id,wallet_id,category_id,transaction_id,amount_minor,secret_column',
  '2026-02-03,-65.00,expense,Cash,11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444,55555555-5555-4555-8555-555555555555,999999,synthetic-unknown-value',
]);

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Markers written into image metadata; a sanitized image must contain none of them. */
export const IMAGE_MARKERS = ['p2b-exif-marker', 'p2b-artist-marker', 'p2b-xmp-marker'] as const;

/** A decodable image with EXIF and XMP metadata naming the markers. */
export async function imageWithMetadata(format: 'jpeg' | 'png' | 'webp', width = 64, height = 48): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .withExif({ IFD0: { Copyright: IMAGE_MARKERS[0], Artist: IMAGE_MARKERS[1] } })
    .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/">${IMAGE_MARKERS[2]}</x:xmpmeta>`);
  return format === 'jpeg' ? base.jpeg().toBuffer() : format === 'png' ? base.png().toBuffer() : base.webp().toBuffer();
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A PNG whose header claims `width` × `height` and carries one tiny row of
 * data: a decompression-bomb shape that must be refused from its header,
 * before any pixel is decoded.
 */
export function pngClaiming(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.alloc(16))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A JPEG start-of-image marker followed by garbage. */
export const BROKEN_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a jpeg body '.repeat(20), 'latin1')]);
