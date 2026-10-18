// The parser child's protocol: shared by the child processes (table-child,
// image-child) and the worker that runs them (parser-runner). Everything in
// src/imports/parsers runs inside the child, which Node loads directly
// (type stripping from source, plain CommonJS from dist): erasable TypeScript
// only, relative imports with explicit `.ts` extensions, no imports from
// outside this directory except Node built-ins (and `sharp` in image.ts).
// The limits mirror @gogospend/contracts (IMPORT_PARSE_LIMITS, transaction
// text limits); parser-runner.spec checks they agree.

export const TABLE_FORMATS = ['csv', 'xlsx'] as const;
export const IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type TableFormat = (typeof TABLE_FORMATS)[number];
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export type ParseFormat = TableFormat | ImageFormat;

export const LIMITS = {
  /** One quarantined upload (P2a's cap). */
  inputBytes: 12 * 1024 * 1024,
  zipExpandedBytes: 50 * 1024 * 1024,
  zipEntries: 1_000,
  candidateRows: 5_000,
  columns: 100,
  cellChars: 10_000,
  imagePixels: 20_000_000,
  /** Width × height × channels × bytes per sample, as decoded. */
  imageDecodedBytes: 120_000_000,
  /** Wallet and category labels, merchant and note, in code points (M2/M3 limits). */
  labelChars: 80,
  merchantChars: 120,
  noteChars: 500,
} as const;

/** Positive transaction maximum in satang (M3). */
export const AMOUNT_MAX_MINOR = 99_999_999_999n;

export const FIELDS = ['occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note'] as const;
export type Field = (typeof FIELDS)[number];
export type Direction = 'expense' | 'income' | 'transfer';
export type Layout = 'meowjot' | 'moneylover' | 'spendee' | 'generic' | 'receipt';

/** A field-level issue (`field` null: the row as a whole). */
export type RowIssue = { field: Field | null; code: string };

/** One candidate as the child read it; the worker re-validates and normalizes every field. */
export type ParsedRow = {
  source_row_id: string;
  occurred_on: string | null;
  type: Direction | null;
  amount_minor: string | null;
  wallet_label: string | null;
  category_label: string | null;
  merchant: string | null;
  note: string | null;
  issues: RowIssue[];
};

export type ParsedImage = { format: ImageFormat; width: number; height: number; base64: string };
/** What the child measured about itself (`process.resourceUsage()`). */
export type Usage = { max_rss_kb: number; cpu_ms: number };

export type ParseSuccess = { ok: true; layout: Layout; rows: ParsedRow[]; file_issues: string[]; image: ParsedImage | null; usage: Usage };
export type ParseFailure = { ok: false; code: string; usage: Usage };
export type ParseResult = ParseSuccess | ParseFailure;

/** The body of a successful parse, before the child adds its usage. */
export type ParseBody = Omit<ParseSuccess, 'ok' | 'usage'>;
/** Inside the child an image stays bytes; child-io writes it out as base64 slices. */
export type ChildImage = { format: ImageFormat; width: number; height: number; bytes: Uint8Array };
export type ChildBody = Omit<ParseBody, 'image'> & { image: ChildImage | null };

/** A whole-file refusal with a file issue code (contracts' IMPORT_FILE_ISSUE_CODES). */
export class ParseRejection extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ParseRejection';
    this.code = code;
  }
}

/** One table row as read from a CSV record or worksheet row: `n` is its 1-based record/row number. */
export type SourceRow = { n: number; cells: string[] };
export type SourceTable = { rows: SourceRow[]; encoding: 'utf-8' | 'windows-874' | null };
