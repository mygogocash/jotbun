// Runs one parse in a separate, killable Node process (the worker never
// parses uploaded content itself). The child gets:
//   - an explicit environment of `TZ=UTC` only: no database, R2, Auth0,
//     digest or recovery credentials, and no NODE_OPTIONS;
//   - stdin/stdout/stderr pipes and nothing else (Node opens every other
//     descriptor close-on-exec, so none is inherited); stderr is drained and
//     never logged (it could quote the file);
//   - Node's permission model (`--permission`): no network (Node 25 and
//     later only, see below), child processes, workers, WASI, inspector or
//     file writes, and reads only of its own directory - plus, for the image
//     child alone, the resolved sharp, @img/*, detect-libc and semver package
//     directories and native addons (`--allow-addons`), which run outside the
//     permission model;
//   - no eval (`--disallow-code-generation-from-strings`), no `__proto__`;
//   - a 256 MiB JS heap and a 352 MiB memory budget (the 512 MiB worker
//     container less the worker's own 160 MiB): checked against the child's
//     own sampled peak and, on Linux, the kernel's high-water mark the runner
//     polls - past it the child is killed (memory_limit);
//   - a 30-second deadline, an output cap, and SIGKILL on either or when the
//     job's lease is lost. The runner waits for the process to exit, so a
//     killed child is always reaped.
//
// Fail closed (P2b review fixes): Node's permission model restricts the
// network only from Node 25 on. Before its first parse of each kind (table or
// image) the runner starts that real child, with exactly a parse's flags, in
// its self-check mode (parsers/sandbox-check.ts) and parses nothing - every
// run answers `sandbox_unsupported` - unless the child was denied the network,
// file reads and writes outside its roots, processes, workers and eval, saw
// no credential and inherited no descriptor. The job worker runs the same
// check at startup and does not register import_parse when it fails
// (imports/import-parsing.ts).
//
// This scrubbed, permission-limited process is not a complete exploit
// sandbox: a native-code exploit in libvips would bypass the permission
// model. Parser exposure still requires the dependency/security gate.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, existsSync, fstatSync, mkdtempSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, sep } from 'node:path';

import { IMPORT_FILE_ISSUE_CODES, IMPORT_PARSE_DEADLINE_SECONDS, IMPORT_PARSER_MEMORY_BUDGET_MIB, IMPORT_ROW_ISSUE_CODES } from '@gogospend/contracts';

import { AMOUNT_MAX_MINOR, FIELDS, IMAGE_FORMATS, LIMITS, TABLE_FORMATS } from './parsers/protocol';
import type { ParseFormat, ParseResult } from './parsers/protocol';

export type ParserRunInput = { format: ParseFormat; bytes: Uint8Array; today: string; signal?: AbortSignal; onSpawn?: (pid: number) => void };
export type ParserRunOutcome =
  | { kind: 'result'; result: ParseResult }
  | { kind: 'timeout' }
  | { kind: 'aborted' }
  | { kind: 'crashed' }
  | { kind: 'output_too_large' }
  | { kind: 'output_invalid' }
  | { kind: 'memory_limit' }
  | { kind: 'spawn_failed' }
  | { kind: 'sandbox_unsupported' };
export type SandboxFamily = 'table' | 'image';
export const SANDBOX_FAILURES = ['permission', 'net', 'fs_write', 'child', 'worker', 'fs_read', 'codegen', 'env', 'descriptors', 'probe_failed'] as const;
export type SandboxFailure = (typeof SANDBOX_FAILURES)[number];
export type SandboxVerdict = { supported: true } | { supported: false; reason: SandboxFailure };
/** A self-check's report, with what the runner itself saw: connections to its port, the file it may have written. */
export type SandboxInspection = { report: unknown; connections: number; wrote: boolean };
/** The job worker's own share of the 512 MiB container while a child runs (measured near 150 MiB on Linux). */
export const PARSER_WORKER_HEADROOM_MIB = 160;
/** A parser child's peak memory budget: the container less the worker's headroom. */
export const PARSER_CHILD_MEMORY_MIB = IMPORT_PARSER_MEMORY_BUDGET_MIB - PARSER_WORKER_HEADROOM_MIB;
export type ChildExit = {
  reason: 'exited' | 'timeout' | 'aborted' | 'output_too_large' | 'memory_limit' | 'spawn_failed';
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  /** The kernel's high-water mark of the child's resident memory, as last polled (Linux), else null. */
  peakKb: number | null;
};
export type ChildLaunch = { command: string; args: string[]; env: Record<string, string>; cwd: string };
export type ParserRunnerOptions = {
  timeoutMs?: number;
  heapMb?: number;
  maxOutputBytes?: number;
  memoryBudgetKb?: number;
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
const SANDBOX_TIMEOUT_MS = 10_000;
const SANDBOX_DATE = '1970-01-01';
// Linux exposes each process's resident high-water mark (VmHWM) in /proc.
const PROC_STATUS = existsSync('/proc/self/status');
const MEMORY_POLL_MS = 25;

const isImage = (format: ParseFormat) => (IMAGE_FORMATS as readonly string[]).includes(format);
const withSep = (path: string) => (path.endsWith(sep) ? path : `${path}${sep}`);

/** The directory Node would load package `name` from, resolving as `from` does (nearest node_modules first). */
function packageDir(name: string, from: string): string | null {
  for (const dir of createRequire(from).resolve.paths(name) ?? []) {
    const candidate = join(dir, name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

/**
 * The package.json files Node reads while looking for `name` from `from`, in
 * the node_modules directories it tries before the one that holds the
 * package. Node reads a candidate's package.json even when it is missing, and
 * outside the child's roots the permission model answers that read with
 * ERR_ACCESS_DENIED rather than "not found", so the child would crash (the
 * release image hoists detect-libc and semver above sharp). Each is allowed
 * by exact path; Node skips node_modules directories that do not exist.
 */
function lookupFiles(name: string, from: string): string[] {
  const files: string[] = [];
  for (const dir of createRequire(from).resolve.paths(name) ?? []) {
    const candidate = join(dir, name, 'package.json');
    if (existsSync(candidate)) return files;
    if (existsSync(dir)) files.push(candidate);
  }
  return files;
}

/**
 * What the image child reads to load sharp: the package directories of sharp
 * itself, its dependencies (detect-libc, semver, @img/colour) and the
 * prebuilt binding and libvips packages installed for this platform
 * (@img/sharp-*) - each resolved as sharp resolves it, never a whole
 * node_modules - and the missing package.json files Node reads on the way to
 * each (`lookupFiles`). Exported for its test.
 */
export function imageReadRoots(entry: string = PARSER_ENTRIES.image): string[] {
  const sharpDir = packageDir('sharp', entry);
  if (!sharpDir) return [];
  const fromSharp = join(sharpDir, 'package.json');
  const names = new Set(['detect-libc', 'semver', '@img/colour']);
  for (const dir of createRequire(fromSharp).resolve.paths('@img/colour') ?? []) {
    const scope = join(dir, '@img');
    if (!existsSync(scope)) continue;
    for (const scoped of readdirSync(scope)) if (scoped.startsWith('sharp-')) names.add(`@img/${scoped}`);
  }
  const dirs = [sharpDir, ...[...names].map((name) => packageDir(name, fromSharp)).filter((dir): dir is string => dir !== null)];
  const files = [...lookupFiles('sharp', entry), ...[...names].flatMap((name) => lookupFiles(name, fromSharp))];
  return [...new Set([...dirs.map(withSep), ...files])];
}

type SpawnOptions = { timeoutMs: number; signal?: AbortSignal; onSpawn?: (pid: number) => void; memoryLimitKb?: number };

export class ParserRunner implements ParserRunnerPort {
  readonly timeoutMs: number;
  private readonly heapMb: number;
  private readonly maxOutputBytes: number;
  private readonly memoryBudgetKb: number;
  private readonly entries: { table: string; image: string };
  private readonly verdicts = new Map<SandboxFamily, Promise<SandboxVerdict>>();

  constructor(options: ParserRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? IMPORT_PARSE_DEADLINE_SECONDS * 1000;
    this.heapMb = options.heapMb ?? DEFAULT_HEAP_MB;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.memoryBudgetKb = options.memoryBudgetKb ?? PARSER_CHILD_MEMORY_MIB * 1024;
    this.entries = { table: options.entries?.table ?? PARSER_ENTRIES.table, image: options.entries?.image ?? PARSER_ENTRIES.image };
  }

  /** How a child for `format` is started (without its trailing format/today arguments). */
  launch(format: ParseFormat, entryOverride?: string): ChildLaunch {
    const image = isImage(format);
    const entry = entryOverride ?? (image ? this.entries.image : this.entries.table);
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

  /** Starts the child, feeds it the file and collects its output (bounded, killed on deadline/abort/memory). */
  exec(input: ParserRunInput): Promise<ChildExit> {
    if (!([...TABLE_FORMATS, ...IMAGE_FORMATS] as string[]).includes(input.format) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.today)) {
      return Promise.reject(new RangeError('a parse needs a known format and a YYYY-MM-DD date'));
    }
    return this.spawnChild(this.launch(input.format), [input.format, input.today], input.bytes, {
      timeoutMs: this.timeoutMs,
      signal: input.signal,
      onSpawn: input.onSpawn,
      memoryLimitKb: this.memoryBudgetKb,
    });
  }

  /**
   * Starts the real `family` child with exactly a parse's flags in its
   * self-check mode, against a loopback port this runner listens on, a file
   * outside the child's read roots (held open, to see whether the child
   * inherits it) and a path to try writing. Null when the check did not run
   * to a report (it is then not a sandbox either).
   */
  async inspectSandbox(family: SandboxFamily): Promise<SandboxInspection | null> {
    const dir = mkdtempSync(join(tmpdir(), 'gogospend-parser-sandbox-'));
    const readPath = join(dir, 'outside');
    const writePath = join(dir, 'written');
    writeFileSync(readPath, 'outside the parser read roots');
    const fd = openSync(readPath, 'r');
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const { port } = server.address() as AddressInfo;
      const { dev, ino } = fstatSync(fd);
      const probe = Buffer.from(JSON.stringify({ port, readPath, writePath, dev, ino }));
      const exit = await this.spawnChild(this.launch(family === 'table' ? 'csv' : 'png', PARSER_ENTRIES[family]), ['sandbox', SANDBOX_DATE], probe, { timeoutMs: SANDBOX_TIMEOUT_MS });
      const wrote = existsSync(writePath);
      if (exit.reason !== 'exited' || exit.code !== 0 || exit.signal !== null) return null;
      try {
        return { report: JSON.parse(exit.stdout.toString('utf8')) as unknown, connections, wrote };
      } catch {
        return null;
      }
    } finally {
      closeSync(fd);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Whether both children run sandboxed on this runtime (checked once per runner and kind). */
  async verifySandbox(): Promise<SandboxVerdict> {
    for (const family of ['table', 'image'] as const) {
      const verdict = await this.sandbox(family);
      if (!verdict.supported) return verdict;
    }
    return { supported: true };
  }

  protected async verify(family: SandboxFamily): Promise<SandboxVerdict> {
    const inspection = await this.inspectSandbox(family);
    return inspection ? sandboxVerdict(inspection.report, inspection) : { supported: false, reason: 'probe_failed' };
  }

  private sandbox(family: SandboxFamily): Promise<SandboxVerdict> {
    let verdict = this.verdicts.get(family);
    if (!verdict) {
      verdict = this.verify(family).catch((): SandboxVerdict => ({ supported: false, reason: 'probe_failed' }));
      this.verdicts.set(family, verdict);
    }
    return verdict;
  }

  async run(input: ParserRunInput): Promise<ParserRunOutcome> {
    if (!(await this.sandbox(isImage(input.format) ? 'image' : 'table')).supported) return { kind: 'sandbox_unsupported' };
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
    if (!result) return { kind: 'output_invalid' };
    // The child's own sampled peak, or the kernel's high-water mark the runner saw, whichever is larger.
    if (Math.max(result.usage.max_rss_kb, exit.peakKb ?? 0) > this.memoryBudgetKb) return { kind: 'memory_limit' };
    return { kind: 'result', result };
  }

  private spawnChild(launch: ChildLaunch, tail: string[], stdin: Uint8Array, options: SpawnOptions): Promise<ChildExit> {
    return new Promise<ChildExit>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(launch.command, [...launch.args, ...tail], { env: launch.env, cwd: launch.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch {
        resolve({ reason: 'spawn_failed', code: null, signal: null, stdout: Buffer.alloc(0), peakKb: null });
        return;
      }
      let reason: ChildExit['reason'] = 'exited';
      let settled = false;
      let size = 0;
      let peakKb: number | null = null;
      const chunks: Buffer[] = [];
      const kill = (why: Exclude<ChildExit['reason'], 'exited' | 'spawn_failed'>) => {
        if (reason === 'exited') reason = why;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(() => kill('timeout'), options.timeoutMs);
      const onAbort = () => kill('aborted');
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener('abort', onAbort, { once: true });
      // Linux: poll the child's resident high-water mark and stop it once it passes the budget.
      let polling = false;
      const limit = options.memoryLimitKb;
      const poll =
        PROC_STATUS && limit !== undefined && child.pid !== undefined
          ? setInterval(() => {
              if (polling || settled) return;
              polling = true;
              readFile(`/proc/${child.pid}/status`, 'utf8')
                .then((status) => {
                  const match = /^VmHWM:\s+([0-9]+) kB$/m.exec(status);
                  if (!match || settled) return;
                  peakKb = Math.max(peakKb ?? 0, Number(match[1]));
                  if (peakKb > limit) kill('memory_limit');
                })
                .catch(() => undefined)
                .finally(() => {
                  polling = false;
                });
            }, MEMORY_POLL_MS)
          : undefined;
      const settle = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
        options.signal?.removeEventListener('abort', onAbort);
        resolve({ reason, code, signal, stdout: Buffer.concat(chunks), peakKb });
      };
      if (child.pid !== undefined) options.onSpawn?.(child.pid);
      child.stdout?.on('data', (chunk: Buffer) => {
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
      child.stderr?.on('data', () => undefined);
      // The child may exit (or be killed, or never start) before reading all of its input.
      child.stdin?.on('error', () => undefined);
      child.on('error', () => {
        // No pid: the process never started (a missing executable, no memory or descriptors left). Retryable.
        if (child.pid === undefined && reason === 'exited') reason = 'spawn_failed';
        settle(null, null);
      });
      child.on('close', (code, signal) => settle(code, signal));
      child.stdin?.end(Buffer.from(stdin.buffer, stdin.byteOffset, stdin.byteLength));
    });
  }
}

// ---------------------------------------------------------------------------
// The sandbox self-check's verdict: fail closed on anything but a report of
// exactly the expected shape in which every capability was denied.
// ---------------------------------------------------------------------------

const DENIED = 'ERR_ACCESS_DENIED';
const REPORT_KEYS = ['argv', 'child', 'codegen', 'envKeys', 'fsRead', 'fsWrite', 'inherited', 'net', 'permission', 'worker'];
// Names a platform adds to every process environment (macOS's locale marker; libvips' home).
const PLATFORM_ENV = ['__CF_USER_TEXT_ENCODING', 'VIPSHOME'];
const unsupported = (reason: SandboxFailure): SandboxVerdict => ({ supported: false, reason });

export function sandboxVerdict(report: unknown, observed: { connections: number; wrote: boolean }): SandboxVerdict {
  if (!isRecord(report) || !keysAre(report, REPORT_KEYS)) return unsupported('probe_failed');
  const { permission, net, fsRead, fsWrite, child, worker, codegen, envKeys, inherited } = report;
  if (
    typeof permission !== 'boolean' ||
    ![net, fsRead, fsWrite, child, worker, codegen].every((value) => typeof value === 'string') ||
    !Array.isArray(envKeys) ||
    !envKeys.every((name) => typeof name === 'string') ||
    !Array.isArray(inherited) ||
    !inherited.every((fd) => Number.isSafeInteger(fd))
  ) {
    return unsupported('probe_failed');
  }
  if (!permission) return unsupported('permission');
  if (net !== DENIED || observed.connections > 0) return unsupported('net');
  if (fsWrite !== DENIED || observed.wrote) return unsupported('fs_write');
  if (child !== DENIED) return unsupported('child');
  if (worker !== DENIED) return unsupported('worker');
  if (fsRead !== DENIED) return unsupported('fs_read');
  if (codegen !== 'EvalError') return unsupported('codegen');
  if (!envKeys.includes('TZ') || envKeys.some((name) => name !== 'TZ' && !PLATFORM_ENV.includes(name as string))) return unsupported('env');
  if (inherited.length > 0) return unsupported('descriptors');
  return { supported: true };
}

// ---------------------------------------------------------------------------
// The child's output is untrusted: it is checked field by field before
// anything is recorded.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ROW_ID = /^row:[1-9][0-9]{0,7}$/;
const AMOUNT = /^[1-9][0-9]{0,10}$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const LAYOUTS = ['meowjot', 'moneylover', 'spendee', 'generic', 'receipt'];
const TYPES = ['expense', 'income', 'transfer'];
const ROW_KEYS = ['source_row_id', 'occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note', 'issues'];
const ROW_ISSUES: readonly string[] = IMPORT_ROW_ISSUE_CODES;
const FILE_ISSUES: readonly string[] = IMPORT_FILE_ISSUE_CODES;
/** A receipt yields exactly this review-only row: nothing is read from the picture. */
const RECEIPT_ROW = JSON.stringify({
  source_row_id: 'image:1',
  occurred_on: null,
  type: null,
  amount_minor: null,
  wallet_label: null,
  category_label: null,
  merchant: null,
  note: null,
  issues: [
    { field: 'occurred_on', code: 'missing_date' },
    { field: 'type', code: 'missing_type' },
    { field: 'amount_minor', code: 'missing_amount' },
    { field: 'wallet_label', code: 'missing_wallet' },
  ],
});

const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isUsage = (value: unknown) => isRecord(value) && keysAre(value, ['max_rss_kb', 'cpu_ms']) && isCount(value.max_rss_kb) && isCount(value.cpu_ms);
const isText = (value: unknown) => value === null || (typeof value === 'string' && value.length > 0 && value.length <= LIMITS.cellChars);
/** A table's header fingerprint (64 lowercase hex), or null. */
const isFingerprint = (value: unknown) => value === null || (typeof value === 'string' && FINGERPRINT.test(value));

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
  return (
    isRecord(value) &&
    keysAre(value, ['field', 'code']) &&
    (value.field === null || (FIELDS as readonly unknown[]).includes(value.field)) &&
    typeof value.code === 'string' &&
    ROW_ISSUES.includes(value.code)
  );
}

/** A table row (never the image's id). */
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

/** Exactly the receipt's one review-only row, keys in the protocol's order. */
function isReceiptRow(value: unknown): boolean {
  return isRecord(value) && keysAre(value, ROW_KEYS) && JSON.stringify(Object.fromEntries(ROW_KEYS.map((key) => [key, value[key]]))) === RECEIPT_ROW;
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
  if (value.ok !== true || !keysAre(value, ['ok', 'layout', 'rows', 'file_issues', 'image', 'header_fingerprint', 'usage'])) return null;
  if (!LAYOUTS.includes(value.layout as string) || !isUsage(value.usage) || !isFingerprint(value.header_fingerprint)) return null;
  if (!Array.isArray(value.file_issues) || value.file_issues.length > 32 || !value.file_issues.every((code) => typeof code === 'string' && FILE_ISSUES.includes(code))) return null;
  if (!Array.isArray(value.rows)) return null;
  if (value.layout === 'receipt') {
    // Exactly one image, one review-only row and the notice that nothing was read from it; an image has no header.
    if (value.image === null || !isImageResult(value.image) || value.header_fingerprint !== null) return null;
    if (value.rows.length !== 1 || !isReceiptRow(value.rows[0]) || JSON.stringify(value.file_issues) !== '["receipt_fields_unread"]') return null;
    return value as ParseResult;
  }
  if (value.image !== null || value.rows.length > LIMITS.candidateRows || !value.rows.every(isRow)) return null;
  const ids = new Set(value.rows.map((row) => (row as { source_row_id: string }).source_row_id));
  return ids.size === value.rows.length ? (value as ParseResult) : null;
}
