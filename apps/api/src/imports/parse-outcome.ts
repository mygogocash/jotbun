// The pure part of an import parse (P2b, moved out of parse-handler.ts for the
// stateless parse server in 1B-T1): what a parser run's outcome means as a
// preview, and the checks a sanitized image must pass. Nothing here starts a
// process or touches a file or a socket (no node:child_process, node:fs or
// node:net import), so the job worker (parse-handler.ts) and the parse server
// (parse-server.ts) judge a parse the same way, with the same codes.
import { IMPORT_FILE_ISSUE_CODES, bangkokDate, normalizeMerchant, normalizeName, normalizeNote } from '@gogospend/contracts';

import type { ParserRunOutcome } from './parser-runner';
import { IMAGE_FORMATS, LIMITS } from './parsers/protocol';
import type { Direction, Field, ImageFormat, Layout, ParseFormat, ParseSuccess, RowIssue } from './parsers/protocol';

export type CandidateRecord = {
  source_row_id: string;
  ordinal: number;
  occurred_on: string | null;
  type: Direction | null;
  amount_minor: string | null;
  wallet_label: string | null;
  category_label: string | null;
  merchant: string | null;
  note: string | null;
  issues: RowIssue[];
  review_required: boolean;
};
/** `header_fingerprint`: the parser's fingerprint of a table's header (P4-T10), for P4-T11's label maps; null for an image or a rejected file. */
export type PreviewRecord = {
  preview: { status: 'ready' | 'rejected'; layout: Layout | null; issues: string[]; image: { width: number; height: number } | null; header_fingerprint: string | null };
  candidates: CandidateRecord[];
};

/** A sanitized image the parser returned, after its own checks: the bytes are exactly the declared format. */
export type SanitizedImage = { bytes: Buffer; format: ImageFormat };

/**
 * What a parser run means for an import: a preview to record, a retry (no
 * child ran, or this runtime cannot sandbox one: the file is not at fault and
 * nothing is recorded), or an abort (the lease was lost or the request closed).
 */
export type PreviewOutcome =
  | { kind: 'record'; record: PreviewRecord; image: SanitizedImage | null }
  | { kind: 'retry'; code: 'parser_unavailable' | 'parser_sandbox_unsupported' }
  | { kind: 'aborted' };

const FILE_ISSUES: readonly string[] = IMPORT_FILE_ISSUE_CODES;

const rejected = (code: string): PreviewRecord => ({ preview: { status: 'rejected', layout: null, issues: [code], image: null, header_fingerprint: null }, candidates: [] });

/**
 * Normalizes a validated parse with the transaction text rules (NFC, trimmed,
 * no control or bidirectional-override characters, M2/M3 lengths). A value
 * that does not fit is NULL with `text_too_long` or `invalid_text`; a date
 * after `today` (Bangkok) is NULL with `date_out_of_range`.
 */
export function toPreviewRecord(result: ParseSuccess, today: string = bangkokDate(new Date())): PreviewRecord {
  const candidates = result.rows.map((row, index): CandidateRecord => {
    const issues: RowIssue[] = [...row.issues];
    const text = (field: Field, value: string | null, normalize: (value: string) => string | null, max: number): string | null => {
      if (value === null) return null;
      try {
        return normalize(value);
      } catch {
        issues.push({ field, code: [...value.normalize('NFC').trim()].length > max ? 'text_too_long' : 'invalid_text' });
        return null;
      }
    };
    let occurredOn = row.occurred_on;
    if (occurredOn !== null && occurredOn > today) {
      occurredOn = null;
      issues.push({ field: 'occurred_on', code: 'date_out_of_range' });
    }
    const wallet = text('wallet_label', row.wallet_label, (value) => normalizeName(value, 'wallet_label'), LIMITS.labelChars);
    const category = text('category_label', row.category_label, (value) => normalizeName(value, 'category_label'), LIMITS.labelChars);
    const merchant = text('merchant', row.merchant, (value) => normalizeMerchant(value), LIMITS.merchantChars);
    const note = text('note', row.note, (value) => normalizeNote(value), LIMITS.noteChars);
    return {
      source_row_id: row.source_row_id,
      ordinal: index + 1,
      occurred_on: occurredOn,
      type: row.type,
      amount_minor: row.amount_minor,
      wallet_label: wallet,
      category_label: category,
      merchant,
      note,
      issues,
      review_required: issues.length > 0 || occurredOn === null || row.type === null || row.amount_minor === null || wallet === null,
    };
  });
  const issues = result.file_issues.filter((code, index, all) => FILE_ISSUES.includes(code) && all.indexOf(code) === index);
  return {
    preview: {
      status: 'ready',
      layout: result.layout,
      issues,
      image: result.image ? { width: result.image.width, height: result.image.height } : null,
      header_fingerprint: result.header_fingerprint,
    },
    candidates,
  };
}

/**
 * What a parser run means for an import. The job worker and the parse server
 * both call this, so a file is judged the same way in each. `memoryBudgetKb`
 * is the child's budget; `today` is the Bangkok date a row's date may not pass.
 */
export function previewFromOutcome(format: ParseFormat, outcome: ParserRunOutcome, memoryBudgetKb: number, today: string): PreviewOutcome {
  switch (outcome.kind) {
    case 'aborted':
      return { kind: 'aborted' };
    // Not the file's fault: no child could be started, or this runtime cannot sandbox one.
    case 'spawn_failed':
      return { kind: 'retry', code: 'parser_unavailable' };
    case 'sandbox_unsupported':
      return { kind: 'retry', code: 'parser_sandbox_unsupported' };
    default: {
      const { record, image } = recordFor(format, outcome, memoryBudgetKb, today);
      return { kind: 'record', record, image };
    }
  }
}

function recordFor(
  format: ParseFormat,
  outcome: Exclude<ParserRunOutcome, { kind: 'aborted' | 'spawn_failed' | 'sandbox_unsupported' }>,
  memoryBudgetKb: number,
  today: string,
): { record: PreviewRecord; image: SanitizedImage | null } {
  switch (outcome.kind) {
    case 'timeout':
      return { record: rejected('parse_timeout'), image: null };
    case 'output_too_large':
    case 'memory_limit':
      return { record: rejected('parse_resource_limit'), image: null };
    case 'crashed':
    case 'output_invalid':
      return { record: rejected('parse_failed'), image: null };
  }
  const result = outcome.result;
  if (result.usage.max_rss_kb > memoryBudgetKb) return { record: rejected('parse_resource_limit'), image: null };
  if (!result.ok) return { record: rejected(FILE_ISSUES.includes(result.code) ? result.code : 'parse_failed'), image: null };
  // A table file never yields an image; an image file yields exactly its own sanitized format.
  const image = result.image;
  const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format);
  if (expectsImage !== (image !== null) || (image !== null && image.format !== format)) return { record: rejected('parse_failed'), image: null };
  if (!image) return { record: toPreviewRecord(result, today), image: null };
  const bytes = Buffer.from(image.base64, 'base64');
  // The bytes must really be the declared format (magic bytes), within the upload cap, of the
  // claimed size by their own header and without metadata.
  if (bytes.length === 0 || bytes.length > LIMITS.inputBytes || magicFormat(bytes) !== image.format) return { record: rejected('parse_failed'), image: null };
  const header = sanitizedImageHeader(bytes, image.format);
  if (!header || header.width !== image.width || header.height !== image.height) return { record: rejected('parse_failed'), image: null };
  return { record: toPreviewRecord(result, today), image: { bytes, format: image.format } };
}

/**
 * A sanitized image's own width and height, read from its container (no
 * decoder runs in the worker), or null when it is not exactly one plain image
 * of `format`: any metadata (EXIF, XMP, IPTC, ICC, text, comments, time),
 * transparency, animation, an unknown part or a truncated file.
 */
export function sanitizedImageHeader(bytes: Buffer, format: ImageFormat): { width: number; height: number } | null {
  try {
    return format === 'png' ? pngHeader(bytes) : format === 'jpeg' ? jpegHeader(bytes) : webpHeader(bytes);
  } catch {
    return null;
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Pixel and rendering chunks only; IHDR (first) and IEND (last) are checked apart.
const PNG_CHUNKS = new Set(['PLTE', 'IDAT', 'pHYs', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD']);

function pngHeader(png: Buffer): { width: number; height: number } | null {
  if (png.length < 8 + 25 + 12 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (png.readUInt32BE(8) !== 13 || png.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  // Grey, RGB or palette: no alpha channel.
  if (![0, 2, 3].includes(png[25])) return null;
  for (let at = 8 + 25; ; ) {
    if (at + 12 > png.length) return null;
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const next = at + 12 + length;
    if (next > png.length) return null;
    if (type === 'IEND') return next === png.length && length === 0 ? { width, height } : null;
    if (!PNG_CHUNKS.has(type)) return null;
    at = next;
  }
}

function jpegHeader(jpeg: Buffer): { width: number; height: number } | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) return null;
  let size: { width: number; height: number } | null = null;
  for (let at = 2; ; ) {
    if (at + 4 > jpeg.length || jpeg[at] !== 0xff) return null;
    const marker = jpeg[at + 1];
    const length = jpeg.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > jpeg.length) return null;
    // Start of scan: the headers are done.
    if (marker === 0xda) return size;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (size !== null || length < 8) return null;
      size = { width: jpeg.readUInt16BE(at + 7), height: jpeg.readUInt16BE(at + 5) };
    } else if (marker === 0xe0) {
      // APP0 may only be the JFIF header.
      if (jpeg.toString('latin1', at + 4, at + 9) !== 'JFIF\0') return null;
    } else if (![0xdb, 0xc4, 0xdd].includes(marker)) {
      // APP1-APP15 (EXIF, XMP, ICC, IPTC, Adobe), comments and anything else.
      return null;
    }
    at += 2 + length;
  }
}

function webpHeader(webp: Buffer): { width: number; height: number } | null {
  if (webp.length < 20 || webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP' || webp.readUInt32LE(4) !== webp.length - 8) return null;
  const chunks: { type: string; data: Buffer }[] = [];
  for (let at = 12; at < webp.length; ) {
    if (at + 8 > webp.length) return null;
    const length = webp.readUInt32LE(at + 4);
    const end = at + 8 + length;
    if (end > webp.length) return null;
    chunks.push({ type: webp.toString('latin1', at, at + 4), data: webp.subarray(at + 8, end) });
    at = end + (length % 2);
  }
  const [first, ...rest] = chunks;
  let frames = chunks;
  if (first?.type === 'VP8X') {
    // No ICC (0x20), alpha (0x10), EXIF (0x08), XMP (0x04) or animation (0x02).
    if (first.data.length < 10 || (first.data[0] & 0x3e) !== 0) return null;
    frames = rest;
  }
  if (frames.length !== 1) return null;
  const [frame] = frames;
  if (frame.type === 'VP8 ') {
    if (frame.data.length < 10 || frame.data[3] !== 0x9d || frame.data[4] !== 0x01 || frame.data[5] !== 0x2a) return null;
    return { width: frame.data.readUInt16LE(6) & 0x3fff, height: frame.data.readUInt16LE(8) & 0x3fff };
  }
  if (frame.type === 'VP8L') {
    if (frame.data.length < 5 || frame.data[0] !== 0x2f) return null;
    const bits = frame.data.readUInt32LE(1);
    // No alpha (bit 28).
    if ((bits >>> 28) & 1) return null;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The format of an image by its magic bytes, or null when it is none of the three. */
export function magicFormat(image: Buffer): ImageFormat | null {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'jpeg';
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (image.length >= 12 && image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
