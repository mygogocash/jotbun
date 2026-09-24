import { createHash } from 'node:crypto';

import {
  SPEND_MAX_UPLOAD_BYTES,
  type SpendMapperId,
  type SpendParseErrorCode,
  type SpendTxType,
} from '@gogospend/contracts';
import jsQR from 'jsqr';
import sharp from 'sharp';

import { parseEmvQr } from './parse-emv-qr';
import { parseSlipText } from './parse-slip-ocr';
import { xlsxToCsvBuffer } from './xlsx-to-csv';
import { createWorker } from 'tesseract.js';

export type SpendParsedRow = {
  occurred_on: string;
  type: SpendTxType;
  amount_minor: number;
  category: string;
  wallet_name: string;
  merchant: string;
  note: string;
  tags: string[];
};

export type SpendParseOk = {
  ok: true;
  mapper: SpendMapperId;
  rows: SpendParsedRow[];
  /** Source rows dropped as unreadable. The file still imports without them. */
  row_reject: number;
  file_sum_minor: number;
  parsed_sum_minor: number;
  import_hash: string;
};

export type SpendParseFail = {
  ok: false;
  error_code: SpendParseErrorCode;
};

export type SpendParseResult = SpendParseOk | SpendParseFail;

/**
 * The API runs with `strictNullChecks: false`, where TypeScript will not narrow
 * this union from `!result.ok` alone — every caller would otherwise need a cast
 * to reach `error_code`. An explicit predicate keeps the narrowing honest.
 */
export function isSpendParseFail(
  result: SpendParseResult,
): result is SpendParseFail {
  return !result.ok;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const COMPARE_HINT =
  /hotel|flight|airbnb|agoda|booking|klook|travel|trip|โรงแรม|ตั๋ว|เที่ยว|เครื่องบิน|vé máy bay|khách sạn/i;

export async function parseSpendUpload(
  buf: Buffer,
  filename = 'import.csv',
): Promise<SpendParseResult> {
  if (buf.length > SPEND_MAX_UPLOAD_BYTES) {
    return { ok: false, error_code: 'TOO_LARGE' };
  }
  if (buf.length === 0) {
    return { ok: false, error_code: 'EMPTY' };
  }
  if (isLegacyXls(buf, filename)) {
    return { ok: false, error_code: 'XLS_UNREADABLE' };
  }
  if (isXlsx(buf, filename)) {
    try {
      const csv = await xlsxToCsvBuffer(buf);
      return parseSpendFile(csv, filename.replace(/\.xlsx$/i, '.csv'));
    } catch {
      return { ok: false, error_code: 'XLS_UNREADABLE' };
    }
  }
  if (isImage(buf, filename)) {
    return parseSlipImage(buf);
  }
  return parseSpendFile(buf, filename);
}

export function parseSpendFile(
  buf: Buffer,
  _filename = 'import.csv',
): SpendParseResult {
  if (buf.length > SPEND_MAX_UPLOAD_BYTES) {
    return { ok: false, error_code: 'TOO_LARGE' };
  }
  if (buf.length === 0) {
    return { ok: false, error_code: 'EMPTY' };
  }

  const text = decodeCsvBuffer(buf);
  const table = parseCsv(text);
  if (table.length < 2) {
    return { ok: false, error_code: 'EMPTY' };
  }

  const headers = table[0].map(normalizeHeader);
  const mapper = sniffMapper(headers);
  if (!mapper) {
    return { ok: false, error_code: 'UNKNOWN_MAPPER' };
  }

  const col = columnIndex(headers);
  const dataRows = table
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()));
  if (dataRows.length === 0) {
    return { ok: false, error_code: 'EMPTY' };
  }

  const amountCellOf = (raw: string[]) =>
    cell(
      raw,
      col,
      mapper === 'meowjot' ? ['จำนวน', 'amount'] : ['amount', 'จำนวน'],
    );
  const typeCellOf = (raw: string[]) =>
    cell(
      raw,
      col,
      mapper === 'meowjot' ? ['ประเภท', 'type'] : ['type', 'ประเภท'],
    );
  const dateCellOf = (raw: string[]) =>
    cell(
      raw,
      col,
      mapper === 'meowjot' ? ['วันที่', 'date'] : ['date', 'วันที่'],
    );
  const isExcluded = (raw: string[]) =>
    /^(true|1|yes)$/i.test(
      cell(raw, col, ['exclude report', 'exclude']).trim(),
    );

  const rows: SpendParsedRow[] = [];
  let rowReject = 0;
  let firstRejectCode: SpendParseErrorCode | null = null;

  for (const raw of dataRows) {
    const amountCell = amountCellOf(raw);
    const typeCell = typeCellOf(raw);
    const dateCell = dateCellOf(raw);
    const categoryCell = cell(raw, col, ['หมวดหมู่', 'category', 'หมวด']);
    const walletCell = cell(raw, col, ['จ่ายจาก', 'wallet', 'account']);
    const channelCell = cell(raw, col, ['ช่องทางจ่าย']);
    const merchantCell = cell(raw, col, [
      'ผู้รับ',
      'payee',
      'merchant',
      'description',
    ]);
    const noteCell = cell(raw, col, ['โน๊ต', 'note', 'notes', 'description']);
    const tagsCell = cell(raw, col, ['แท็ก', 'tags', 'tag']);

    if (isExcluded(raw)) {
      continue;
    }

    const type = classifyType(typeCell, amountCell);
    /*
     * One unreadable row costs the member that row, not the file. A migrate-in
     * is often years of history, and aborting the whole export on the first bad
     * cell sent them back to re-export with no idea which line was at fault.
     * Rejects are counted and reported instead.
     */
    const amountMinor = bahtToSatang(amountCell);
    if (amountMinor === null) {
      rowReject += 1;
      firstRejectCode ??= 'BAD_AMOUNT';
      continue;
    }
    const occurredOn = parseOccurredOn(dateCell);
    if (!occurredOn) {
      rowReject += 1;
      firstRejectCode ??= 'BAD_DATE';
      continue;
    }

    const category = categoryCell.trim() || 'Other';
    const displayName = cell(raw, col, ['display name', 'content']);
    const merchant = merchantCell.trim() || displayName.trim();
    const note = noteCell.trim();
    rows.push({
      occurred_on: occurredOn,
      type,
      amount_minor: amountMinor,
      category,
      wallet_name: (walletCell || channelCell).trim() || 'Cash',
      merchant,
      note,
      tags: withCompareTag(splitTags(tagsCell), category, merchant, note),
    });
  }

  // Nothing survived. Report why rather than importing an empty file.
  if (rows.length === 0) {
    return { ok: false, error_code: firstRejectCode ?? 'EMPTY' };
  }

  /*
   * Two derivations of the same total, deliberately taken by different routes:
   * `fileSum` re-reads the source table, `parsedSum` adds up the rows we built
   * from it. They previously came from the same accumulation, so the guard
   * below could not fail no matter what went wrong.
   *
   * What this catches is a divergence in the row-building block above — a row
   * dropped, duplicated, or filed as the wrong type on its way into `rows`.
   * What it cannot catch is a misreading shared by both passes, since both
   * lean on the same `bahtToSatang` and `classifyType`. It is a guard on the
   * assembly, not on the parsing.
   */
  let fileSum = 0;
  for (const raw of dataRows) {
    if (isExcluded(raw)) continue;
    const amountCell = amountCellOf(raw);
    const amountMinor = bahtToSatang(amountCell);
    if (amountMinor === null) continue;
    if (!parseOccurredOn(dateCellOf(raw))) continue;
    if (classifyType(typeCellOf(raw), amountCell) !== 'transfer') {
      fileSum += amountMinor;
    }
  }

  const parsedSum = rows
    .filter((row) => row.type !== 'transfer')
    .reduce((sum, row) => sum + row.amount_minor, 0);

  if (parsedSum !== fileSum) {
    return { ok: false, error_code: 'GOLDEN_SUM_MISMATCH' };
  }

  return {
    ok: true,
    mapper,
    rows,
    row_reject: rowReject,
    file_sum_minor: fileSum,
    parsed_sum_minor: parsedSum,
    import_hash: createHash('sha256').update(buf).digest('hex'),
  };
}

export function spendRowFingerprint(
  mapper: string,
  row: SpendParsedRow,
): string {
  const material = [
    mapper,
    row.occurred_on,
    String(row.amount_minor),
    row.type,
    row.merchant.normalize('NFKC'),
    row.note.normalize('NFKC'),
    row.wallet_name.normalize('NFKC'),
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}

function decodeCsvBuffer(buf: Buffer): string {
  const utf8 = buf.toString('utf8').replace(/^\uFEFF/, '');
  if (!utf8.includes('\uFFFD')) {
    return utf8;
  }
  try {
    return new TextDecoder('windows-874').decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return utf8;
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

function sniffMapper(headers: string[]): SpendMapperId | null {
  const set = new Set(headers);
  if (set.has('วันที่') && set.has('จำนวน') && set.has('ประเภท')) {
    return 'meowjot';
  }
  if (
    set.has('display name') ||
    set.has('exclude report') ||
    (set.has('account') && set.has('currency') && set.has('category'))
  ) {
    return 'moneylover';
  }
  const hasDate = set.has('date') || set.has('วันที่');
  const hasAmount = set.has('amount') || set.has('จำนวน');
  const hasCategory =
    set.has('category') || set.has('หมวดหมู่') || set.has('หมวด');
  if (hasDate && hasAmount && hasCategory) {
    return 'spendee';
  }
  return null;
}

function columnIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!map.has(header)) map.set(header, index);
  });
  return map;
}

function cell(
  row: string[],
  col: Map<string, number>,
  names: string[],
): string {
  for (const name of names) {
    const index = col.get(name.toLowerCase());
    if (index !== undefined && row[index] !== undefined) {
      return row[index];
    }
  }
  return '';
}

function classifyType(typeCell: string, amountCell: string): SpendTxType {
  const t = typeCell.trim().toLowerCase();
  if (t.includes('transfer') || t.includes('โอน')) return 'transfer';
  if (t.includes('income') || t.includes('รายรับ')) return 'income';
  if (t.includes('expense') || t.includes('รายจ่าย')) return 'expense';
  const n = Number(amountCell.replace(/,/g, '').trim());
  if (Number.isFinite(n) && n > 0) return 'income';
  return 'expense';
}

function bahtToSatang(raw: string): number | null {
  const cleaned = raw
    .replace(/,/g, '')
    .replace(/฿/g, '')
    .replace(/thb/gi, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

function parseOccurredOn(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 20000 && asNumber <= 60000) {
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(asNumber) * 86400000;
    return bangkokIsoDate(new Date(utcMs));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    // A Thai export writes its Buddhist year in either order, so the same
    // conversion the d/m/y branch applies has to happen here too.
    let year = Number(iso[1]);
    if (year >= 2400) year -= 543;
    return toIsoDate(year, Number(iso[2]), Number(iso[3]));
  }
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year >= 2400) year -= 543;
    if (year < 100) year += 2000;
    return toIsoDate(year, Number(dmy[2]), Number(dmy[1]));
  }
  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function bangkokIsoDate(date: Date): string {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,#]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function withCompareTag(
  tags: string[],
  category: string,
  merchant: string,
  note: string,
): string[] {
  if (tags.includes('compare')) return tags;
  if (COMPARE_HINT.test(`${category} ${merchant} ${note}`)) {
    return [...tags, 'compare'];
  }
  return tags;
}

function isXlsx(buf: Buffer, filename: string): boolean {
  if (/\.xlsx$/i.test(filename)) return true;
  return buf[0] === 0x50 && buf[1] === 0x4b;
}

function isLegacyXls(buf: Buffer, filename: string): boolean {
  if (isXlsx(buf, filename)) return false;
  if (buf[0] === 0xd0 && buf[1] === 0xcf) return true;
  return /\.xls$/i.test(filename);
}

function isImage(buf: Buffer, filename: string): boolean {
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(filename)) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  return false;
}

async function parseSlipImage(buf: Buffer): Promise<SpendParseResult> {
  const decoded = await decodeQrPayload(buf);
  if (decoded.payload) {
    const parsed = parseEmvQr(decoded.payload);
    if (parsed.amount_minor == null || parsed.amount_minor <= 0) {
      return { ok: false, error_code: 'BAD_AMOUNT' };
    }
    return slipOk('slip_qr', buf, {
      amount_minor: parsed.amount_minor,
      merchant: parsed.merchant,
      note: 'PromptPay slip',
      occurred_on: bangkokIsoDate(new Date()),
    });
  }
  if (decoded.width < 400 || process.env.SPEND_OCR_ENABLED === '0') {
    return { ok: false, error_code: 'SLIP_NO_QR' };
  }
  const text = await ocrSlipText(buf);
  const ocr = parseSlipText(text ?? '');
  if (ocr.amount_minor == null || ocr.amount_minor <= 0) {
    return { ok: false, error_code: 'SLIP_OCR_EMPTY' };
  }
  return slipOk('slip_ocr', buf, {
    amount_minor: ocr.amount_minor,
    merchant: ocr.merchant,
    note: 'OCR slip',
    occurred_on: ocr.occurred_on ?? bangkokIsoDate(new Date()),
  });
}

function slipOk(
  mapper: 'slip_qr' | 'slip_ocr',
  buf: Buffer,
  row: {
    amount_minor: number;
    merchant: string;
    note: string;
    occurred_on: string;
  },
): SpendParseOk {
  const parsedRow: SpendParsedRow = {
    occurred_on: row.occurred_on,
    type: 'expense',
    amount_minor: row.amount_minor,
    category: 'Other',
    wallet_name: mapper === 'slip_qr' ? 'PromptPay' : 'Slip',
    merchant: row.merchant,
    note: row.note,
    tags: withCompareTag(['slip'], 'Other', row.merchant, row.note),
  };
  return {
    ok: true,
    mapper,
    rows: [parsedRow],
    // A slip is one row read from one image: it either parsed or it failed
    // above, so there is never a partial reject to report here.
    row_reject: 0,
    file_sum_minor: row.amount_minor,
    parsed_sum_minor: row.amount_minor,
    import_hash: createHash('sha256').update(buf).digest('hex'),
  };
}

async function decodeQrPayload(
  buf: Buffer,
): Promise<{ payload: string | null; width: number }> {
  try {
    const image = sharp(buf).rotate().ensureAlpha();
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const prepared = width > 1600 ? image.resize(1600) : image;
    const { data, info } = await prepared.raw().toBuffer({
      resolveWithObject: true,
    });
    const code = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height,
    );
    return { payload: code?.data ?? null, width };
  } catch {
    return { payload: null, width: 0 };
  }
}

export async function prepareSlipForOcr(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: 1600, withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function ocrSlipText(buf: Buffer): Promise<string | null> {
  try {
    const prepared = await prepareSlipForOcr(buf);
    const worker = await createWorker(['tha', 'eng']);
    try {
      const result = await Promise.race([
        worker.recognize(prepared),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('ocr-timeout')), 20_000);
        }),
      ]);
      return result.data.text ?? null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}
