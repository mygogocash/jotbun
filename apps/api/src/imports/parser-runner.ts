// Runs one parse in a separate, killable Node process (the worker never
// parses uploaded content itself). The child gets:
//   - an explicit environment of `TZ=UTC` only: no database, R2, Auth0,
//     digest or recovery credentials, and no NODE_OPTIONS;
//   - stdin/stdout/stderr pipes and nothing else (Node opens every other
//     descriptor close-on-exec, so none is inherited); stderr is drained and
//     never logged (it could quote the file);
//   - Node's permission model (`--permission`): no network, child processes,
//     workers, WASI, inspector or file writes, and reads only of its own
//     directory - plus, for the image child alone, the sharp package
//     directories and native addons (`--allow-addons`), which run outside the
//     permission model;
//   - no eval (`--disallow-code-generation-from-strings`), no `__proto__`;
//   - a 256 MiB JS heap; the worker container's reviewed budget is 512 MiB,
//     checked against the child's own peak RSS report;
//   - a 30-second deadline, an output cap, and SIGKILL on either or when the
//     job's lease is lost. The runner waits for the process to exit, so a
//     killed child is always reaped.
// This scrubbed, permission-limited process is not a complete exploit
// sandbox: a native-code exploit in libvips would bypass the permission
// model. Parser exposure still requires the dependency/security gate.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, sep } from 'node:path';

import { IMPORT_PARSE_DEADLINE_SECONDS } from '@gogospend/contracts';

import { AMOUNT_MAX_MINOR, FIELDS, IMAGE_FORMATS, LIMITS, TABLE_FORMATS } from './parsers/protocol';
import type { ParseFormat, ParseResult } from './parsers/protocol';

export type ParserRunInput = { format: ParseFormat; bytes: Uint8Array; today: string; signal?: AbortSignal; onSpawn?: (pid: number) => void };
export type ParserRunOutcome =
  | { kind: 'result'; result: ParseResult }
  | { kind: 'timeout' }
  | { kind: 'aborted' }
  | { kind: 'crashed' }
  | { kind: 'output_too_large' }
  | { kind: 'output_invalid' };
export type ChildExit = { reason: 'exited' | 'timeout' | 'aborted' | 'output_too_large'; code: number | null; signal: NodeJS.Signals | null; stdout: Buffer };
export type ChildLaunch = { command: string; args: string[]; env: Record<string, string>; cwd: string };
export type ParserRunnerOptions = {
  timeoutMs?: number;
  heapMb?: number;
  maxOutputBytes?: number;
  /** Test probes only: replace a child entry (it runs with exactly the same flags and environment). */
  entries?: { table?: string; image?: string };
};

export interface ParserRunnerPort {
  run(input: ParserRunInput): Promise<ParserRunOutcome>;
}

// From source (tests, typecheck) the children are .ts files that Node strips
// itself; from dist they are the compiled .js files.
const EXTENSION = extname(__filename);
const PARSERS = join(__dirname, 'parsers');
export const PARSER_ENTRIES = {
  table: join(PARSERS, `table-child${EXTENSION}`),
  image: join(PARSERS, `image-child${EXTENSION}`),
} as const;
/** Exactly this environment, nothing inherited. */
const CHILD_ENV: Readonly<Record<string, string>> = { TZ: 'UTC' };
const DEFAULT_HEAP_MB = 256;
// The largest honest result: 5,000 rows, or a 12 MiB image in base64.
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

const isImage = (format: ParseFormat) => (IMAGE_FORMATS as readonly string[]).includes(format);
const withSep = (path: string) => (path.endsWith(sep) ? path : `${path}${sep}`);

/** The node_modules directories the image child needs to load sharp and its native binaries. */
function imageReadRoots(): string[] {
  const require = createRequire(__filename);
  const candidates = require.resolve.paths('sharp') ?? [];
  return candidates.filter((dir) => existsSync(join(dir, 'sharp')) || existsSync(join(dir, '@img')) || existsSync(join(dir, 'detect-libc'))).map(withSep);
}

export class ParserRunner implements ParserRunnerPort {
  readonly timeoutMs: number;
  private readonly heapMb: number;
  private readonly maxOutputBytes: number;
  private readonly entries: { table: string; image: string };

  constructor(options: ParserRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? IMPORT_PARSE_DEADLINE_SECONDS * 1000;
    this.heapMb = options.heapMb ?? DEFAULT_HEAP_MB;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.entries = { table: options.entries?.table ?? PARSER_ENTRIES.table, image: options.entries?.image ?? PARSER_ENTRIES.image };
  }

  /** How a child for `format` is started (without its trailing format/today arguments). */
  launch(format: ParseFormat): ChildLaunch {
    const image = isImage(format);
    const entry = image ? this.entries.image : this.entries.table;
    const roots = [withSep(dirname(entry)), ...(image ? imageReadRoots() : [])];
    const args = [
      '--permission',
      ...roots.map((root) => `--allow-fs-read=${root}`),
      ...(image ? ['--allow-addons'] : []),
      `--max-old-space-size=${this.heapMb}`,
      '--disallow-code-generation-from-strings',
      '--disable-proto=throw',
      '--no-warnings',
      entry,
    ];
    return { command: process.execPath, args, env: { ...CHILD_ENV }, cwd: dirname(entry) };
  }

  /** Starts the child, feeds it the file and collects its output (bounded, killed on deadline/abort). */
  exec(input: ParserRunInput): Promise<ChildExit> {
    if (!([...TABLE_FORMATS, ...IMAGE_FORMATS] as string[]).includes(input.format) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.today)) {
      return Promise.reject(new RangeError('a parse needs a known format and a YYYY-MM-DD date'));
    }
    const launch = this.launch(input.format);
    return new Promise<ChildExit>((resolve) => {
      const child = spawn(launch.command, [...launch.args, input.format, input.today], {
        env: launch.env,
        cwd: launch.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let reason: ChildExit['reason'] = 'exited';
      let settled = false;
      let size = 0;
      const chunks: Buffer[] = [];
      const kill = (why: Exclude<ChildExit['reason'], 'exited'>) => {
        if (reason === 'exited') reason = why;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(() => kill('timeout'), this.timeoutMs);
      const onAbort = () => kill('aborted');
      if (input.signal?.aborted) onAbort();
      else input.signal?.addEventListener('abort', onAbort, { once: true });
      const settle = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', onAbort);
        resolve({ reason, code, signal, stdout: Buffer.concat(chunks) });
      };
      if (child.pid !== undefined) input.onSpawn?.(child.pid);
      child.stdout.on('data', (chunk: Buffer) => {
        if (reason !== 'exited') return;
        size += chunk.length;
        if (size > this.maxOutputBytes) {
          kill('output_too_large');
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });
      // Drained, never kept or logged: it could quote the file.
      child.stderr.on('data', () => undefined);
      // The child may exit (or be killed) before reading all of its input.
      child.stdin.on('error', () => undefined);
      child.on('error', () => settle(null, null));
      child.on('close', (code, signal) => settle(code, signal));
      child.stdin.end(Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength));
    });
  }

  async run(input: ParserRunInput): Promise<ParserRunOutcome> {
    const exit = await this.exec(input);
    if (exit.reason !== 'exited') return { kind: exit.reason };
    if (exit.code !== 0 || exit.signal !== null) return { kind: 'crashed' };
    let value: unknown;
    try {
      value = JSON.parse(exit.stdout.toString('utf8'));
    } catch {
      return { kind: 'output_invalid' };
    }
    const result = validateParseResult(value);
    return result ? { kind: 'result', result } : { kind: 'output_invalid' };
  }
}

// ---------------------------------------------------------------------------
// The child's output is untrusted: it is checked field by field before
// anything is recorded.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ROW_ID = /^(?:row:[1-9][0-9]{0,7}|image:1)$/;
const AMOUNT = /^[1-9][0-9]{0,10}$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const LAYOUTS = ['meowjot', 'moneylover', 'spendee', 'generic', 'receipt'];
const TYPES = ['expense', 'income', 'transfer'];
const ROW_KEYS = ['source_row_id', 'occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note', 'issues'];

const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isUsage = (value: unknown) => isRecord(value) && keysAre(value, ['max_rss_kb', 'cpu_ms']) && isCount(value.max_rss_kb) && isCount(value.cpu_ms);
const isText = (value: unknown) => value === null || (typeof value === 'string' && value.length > 0 && value.length <= LIMITS.cellChars);

function isDate(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return year >= 1970 && check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function isIssue(value: unknown): boolean {
  return isRecord(value) && keysAre(value, ['field', 'code']) && (value.field === null || (FIELDS as readonly unknown[]).includes(value.field)) && typeof value.code === 'string' && CODE.test(value.code);
}

function isRow(value: unknown): boolean {
  return (
    isRecord(value) &&
    keysAre(value, ROW_KEYS) &&
    typeof value.source_row_id === 'string' &&
    ROW_ID.test(value.source_row_id) &&
    isDate(value.occurred_on) &&
    (value.type === null || TYPES.includes(value.type as string)) &&
    (value.amount_minor === null || (typeof value.amount_minor === 'string' && AMOUNT.test(value.amount_minor) && BigInt(value.amount_minor) <= AMOUNT_MAX_MINOR)) &&
    isText(value.wallet_label) &&
    isText(value.category_label) &&
    isText(value.merchant) &&
    isText(value.note) &&
    Array.isArray(value.issues) &&
    value.issues.length <= 16 &&
    value.issues.every(isIssue)
  );
}

function isImageResult(value: unknown): boolean {
  if (!isRecord(value) || !keysAre(value, ['format', 'width', 'height', 'base64'])) return false;
  const { format, width, height, base64 } = value;
  return (
    (IMAGE_FORMATS as readonly unknown[]).includes(format) &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    (width as number) >= 1 &&
    (height as number) >= 1 &&
    (width as number) * (height as number) <= LIMITS.imagePixels &&
    typeof base64 === 'string' &&
    base64.length > 0 &&
    base64.length % 4 === 0 &&
    base64.length <= Math.ceil(LIMITS.inputBytes / 3) * 4 &&
    BASE64.test(base64)
  );
}

/** The child's output if it is exactly the protocol, else null. */
export function validateParseResult(value: unknown): ParseResult | null {
  if (!isRecord(value)) return null;
  if (value.ok === false) {
    return keysAre(value, ['ok', 'code', 'usage']) && typeof value.code === 'string' && CODE.test(value.code) && isUsage(value.usage) ? (value as ParseResult) : null;
  }
  if (value.ok !== true || !keysAre(value, ['ok', 'layout', 'rows', 'file_issues', 'image', 'usage'])) return null;
  if (!LAYOUTS.includes(value.layout as string) || !isUsage(value.usage)) return null;
  if (!Array.isArray(value.file_issues) || value.file_issues.length > 32 || !value.file_issues.every((code) => typeof code === 'string' && CODE.test(code))) return null;
  if (!Array.isArray(value.rows) || value.rows.length > LIMITS.candidateRows || !value.rows.every(isRow)) return null;
  const ids = new Set(value.rows.map((row) => (row as { source_row_id: string }).source_row_id));
  if (ids.size !== value.rows.length) return null;
  // Exactly the receipt layout carries an image.
  if ((value.layout === 'receipt') !== (value.image !== null)) return null;
  if (value.image !== null && !isImageResult(value.image)) return null;
  return value as ParseResult;
}
