// Exact, bounded RFC 4180 CSV for exports. Every cell goes through one of
// three typed encoders, so untrusted text can never reach the file unescaped:
//   csvText    - user text (notes, merchants, names): formula-neutralized,
//                then quoted when it holds a comma, quote or line break;
//   csvNumber  - server-generated canonical numbers (exact minor units and
//                their baht form): written as is, never prefixed;
//   csvLiteral - server-generated ids, dates and enum values: a safe charset
//                only, written as is.
import { EXPORT_CSV_BOM } from '@gogospend/contracts';

export const CSV_BOM = EXPORT_CSV_BOM;
/** An export above this fails visibly instead of exhausting the worker's memory. */
export const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const DEFAULT_BLOCK_BYTES = 64 * 1024;

export class CsvTooLarge extends Error {
  constructor() {
    super('The CSV is larger than its byte limit.');
    this.name = 'CsvTooLarge';
  }
}

// Characters that make a spreadsheet read a cell as a formula (or DDE), in
// ASCII and full-width forms, plus tab and line breaks that some apps strip.
const FORMULA_START = /^[=+\-@＝＋－＠\t\r\n]/u;
// Leading characters a spreadsheet may skip before deciding it saw a formula:
// any Unicode whitespace (including no-break and ideographic spaces) and every
// default-ignorable code point (byte order mark, zero-width characters, soft
// hyphen, fillers).
const IGNORABLE_PREFIX = /^[\s\p{Default_Ignorable_Code_Point}]+/u;

/** True when a spreadsheet could read this text as a formula, including compatibility look-alikes (NFKC). */
export function startsLikeFormula(text: string): boolean {
  const visible = text.replace(IGNORABLE_PREFIX, '');
  return FORMULA_START.test(text) || FORMULA_START.test(visible) || FORMULA_START.test(visible.slice(0, 8).normalize('NFKC'));
}

/** Prefixes `'` (shown as text, never evaluated) to text that could start a formula; other text is unchanged. */
export function neutralizeFormula(text: string): string {
  return startsLikeFormula(text) ? `'${text}` : text;
}

/** RFC 4180: a field with a comma, quote or line break is quoted, with inner quotes doubled. */
export function quoteCsvField(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Untrusted text: neutralized first, then quoted. Null is an empty cell. */
export function csvText(value: string | null): string {
  return value === null ? '' : quoteCsvField(neutralizeFormula(value));
}

const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

/** A server-generated canonical number, unchanged (no prefix, no quotes); anything else is a bug. */
export function csvNumber(value: string): string {
  if (typeof value !== 'string' || !NUMBER.test(value)) throw new TypeError('A numeric CSV cell must be a canonical number.');
  return value;
}

const LITERAL = /^(?:[A-Za-z0-9][A-Za-z0-9_.:-]*)?$/;

/** A server-generated id, date or enum value; refuses anything that could need escaping. */
export function csvLiteral(value: string | null): string {
  if (value === null) return '';
  if (typeof value !== 'string' || !LITERAL.test(value)) throw new TypeError('A literal CSV cell holds ids, dates or enum values only.');
  return value;
}

const MINOR = /^(-?)(0|[1-9][0-9]*)$/;

/** Exact satang to baht with two decimals, by string arithmetic only ("6500" → "65.00"). */
export function minorToDecimal(minor: string): string {
  const match = typeof minor === 'string' ? MINOR.exec(minor) : null;
  if (!match) throw new TypeError('Expected canonical integer minor units.');
  const digits = match[2].padStart(3, '0');
  return `${match[1]}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export type CsvBody = { parts: Buffer[]; bytes: number; rows: number };

/**
 * Builds a CSV in bounded memory: a byte order mark and header, then CRLF
 * records of already-encoded cells, gathered into blocks of about
 * `blockBytes`. Throws CsvTooLarge before the total passes `maxBytes`.
 */
export class CsvWriter {
  private readonly width: number;
  private readonly maxBytes: number;
  private readonly blockBytes: number;
  private readonly parts: Buffer[] = [];
  private pending: string[] = [];
  private pendingBytes = 0;
  private total = 0;
  private count = 0;

  constructor(columns: readonly string[], options: { maxBytes?: number; blockBytes?: number } = {}) {
    if (columns.length === 0) throw new RangeError('a CSV needs columns');
    this.width = columns.length;
    this.maxBytes = options.maxBytes ?? MAX_EXPORT_BYTES;
    this.blockBytes = options.blockBytes ?? DEFAULT_BLOCK_BYTES;
    this.append(`${CSV_BOM}${columns.map(csvLiteral).join(',')}\r\n`);
  }

  /** Appends one record of cells encoded by csvText, csvNumber or csvLiteral. */
  row(cells: readonly string[]): void {
    if (cells.length !== this.width) throw new RangeError(`a record needs ${this.width} cells`);
    this.append(`${cells.join(',')}\r\n`);
    this.count += 1;
  }

  get rows(): number {
    return this.count;
  }

  finish(): CsvBody {
    this.flush();
    return { parts: [...this.parts], bytes: this.total, rows: this.count };
  }

  private append(text: string): void {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (this.total + bytes > this.maxBytes) throw new CsvTooLarge();
    this.pending.push(text);
    this.pendingBytes += bytes;
    this.total += bytes;
    if (this.pendingBytes >= this.blockBytes) this.flush();
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    this.parts.push(Buffer.from(this.pending.join(''), 'utf8'));
    this.pending = [];
    this.pendingBytes = 0;
  }
}
