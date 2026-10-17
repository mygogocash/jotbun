import { createHash, randomUUID } from 'node:crypto';

import {
  ContractValidationError,
  IMPORT_CONTENT_TYPES,
  IMPORT_HEIC_MESSAGE_KEY,
  IMPORT_LIMIT_MESSAGE_KEYS,
  IMPORT_TIMEOUT_MESSAGE_KEY,
  IMPORT_UPLOAD_IDLE_SECONDS,
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_UPLOAD_RECEIVE_SECONDS,
  importFormatForContentType,
  importFormatForExtension,
  isUuid,
  parseImportFileName,
} from '@gogospend/contracts';
import type { ImportFormat, ImportLimit, SessionContext, UploadAccepted } from '@gogospend/contracts';

import { ProblemException } from '../common/api-problem.filter';
import { derivedUuid } from '../commands/derived-id';
import { ObjectStoreError } from '../storage/object-store';
import type { ObjectStore } from '../storage/object-store';
import type { FinishResult, ImportIntakeRepository, IntakeOutcomeCode, QuarantinePart } from './import.repository';

/** Each quarantine object holds at most this much of an upload: the most the intake ever holds in memory per upload. */
export const QUARANTINE_PART_BYTES = 1024 * 1024;
/** The body is sniffed once this many bytes (or the whole, shorter body) arrived, before anything is written. */
const SNIFF_BYTES = 64;
// Per process. With at most IMPORT_QUOTAS.uploadsInProgress per account, a
// stalled account cannot take them all; each holds at most one part (1 MiB)
// in memory, plus the store's copy while it is written.
const DEFAULT_MAX_CONCURRENT = 16;

export type UploadMetadata = { idempotencyKey: unknown; fileName: unknown; contentType: unknown; declaredBytes: number | null };
export type UploadIntakeLimits = { maxBytes: number; partBytes: number; maxConcurrent: number; idleMs: number; receiveMs: number };

/** What the first bytes of a body are: a supported format, HEIC/HEIF, another known unsupported format, or unrecognised binary. */
export type SniffedFormat = ImportFormat | 'heic' | 'unsupported' | 'binary';

const HEIC_CONTENT_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif', 'hif']);
// ISO-BMFF brands. HEIC stills and sequences, or a generic HEIF major brand
// with no AVIF brand, get the HEIC hint; AVIF and other `ftyp` files (video)
// are plainly unsupported.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

// C0 controls other than TAB, LF and CR never appear in a CSV, in any
// single-byte or UTF-8 encoding; NUL also marks UTF-16/32 text.
const BINARY_BYTE = new Uint8Array(256);
for (let byte = 0; byte < 0x20; byte += 1) BINARY_BYTE[byte] = byte === 0x09 || byte === 0x0a || byte === 0x0d ? 0 : 1;

function hasBinaryByte(data: Uint8Array): boolean {
  for (let index = 0; index < data.length; index += 1) if (BINARY_BYTE[data[index]] === 1) return true;
  return false;
}

const ascii = (head: Uint8Array, at: number, length: number) => (head.length >= at + length ? String.fromCharCode(...head.subarray(at, at + length)) : '');

/** An ISO-BMFF (`ftyp`) body: HEIC/HEIF, or another unsupported format (AVIF, video). */
function ftypFormat(head: Uint8Array): SniffedFormat {
  const size = head.length >= 4 ? ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0 : 0;
  const end = Math.min(head.length, size >= 16 ? size : head.length);
  const major = ascii(head, 8, 4);
  const brands = [major];
  for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(head, at, 4));
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'unsupported';
  if (brands.some((brand) => HEIC_BRANDS.has(brand)) || HEIF_GENERIC_BRANDS.has(major)) return 'heic';
  return 'unsupported';
}

/**
 * Classifies a body by its first bytes (at least SNIFF_BYTES, or the whole
 * body if shorter). A PDF is recognised by its exact header line
 * (`%PDF-1.7` and a line break), which may be all text. Otherwise text - no C0
 * control bytes besides TAB, LF and CR - is CSV whatever word it starts with
 * ("GIF8 code", "%PDF-ref", "qty,ftyp"): every binary format checked here has
 * a control byte in its first 64 bytes (a length field, a NUL or an EOF
 * marker).
 */
export function sniffImportFormat(head: Uint8Array): SniffedFormat {
  if (/^%PDF-\d\.\d[\r\n]/.test(ascii(head, 0, Math.min(head.length, 10)))) return 'unsupported';
  if (!hasBinaryByte(head)) return 'csv';
  const starts = (signature: readonly number[], at = 0) => head.length >= at + signature.length && signature.every((value, index) => head[at + index] === value);
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(head, 0, 4) === 'RIFF') return ascii(head, 8, 4) === 'WEBP' ? 'webp' : 'binary';
  // A ZIP local file header; an XLSX's contents are checked by the parser (P2b).
  if (starts([0x50, 0x4b, 0x03, 0x04])) return 'xlsx';
  if (ascii(head, 4, 4) === 'ftyp') return ftypFormat(head);
  // Legacy .xls (OLE2), PDF, GIF, TIFF, and UTF-16 text by its byte-order mark.
  if (starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'unsupported';
  if (ascii(head, 0, 5) === '%PDF-' || ascii(head, 0, 4) === 'GIF8' || starts([0x49, 0x49, 0x2a, 0x00]) || starts([0x4d, 0x4d, 0x00, 0x2a])) return 'unsupported';
  if (starts([0xff, 0xfe]) || starts([0xfe, 0xff])) return 'unsupported';
  return 'binary';
}

export type ImportIntakeConfig = { uploadsEnabled: boolean };
export const IMPORT_INTAKE_CONFIG = Symbol('IMPORT_INTAKE_CONFIG');

/**
 * `IMPORT_UPLOADS_ENABLED`: uploads stay off (404) unless this is `1`/`true`.
 * Turn it on only after P1's hosted R2 gate and one real bounded quarantine
 * upload/expiry check. Any other value stops startup.
 */
export function importIntakeConfigFromEnv(env: NodeJS.ProcessEnv): ImportIntakeConfig {
  const value = env.IMPORT_UPLOADS_ENABLED;
  if (value === undefined || value === '' || value === '0' || value === 'false') return { uploadsEnabled: false };
  if (value === '1' || value === 'true') return { uploadsEnabled: true };
  throw new Error('IMPORT_UPLOADS_ENABLED must be 1/true or 0/false (off by default).');
}

/** Refused for what the upload is: recorded as `rejected`, and a retry with the same key repeats it. */
class IntakeRejection extends Error {
  constructor(readonly code: IntakeOutcomeCode, readonly problem: ProblemException = problemFor(code)) {
    super(code);
  }
}

/** Ended by something other than its content (stream, storage, deadline, session): recorded as `failed`. */
class IntakeFailure extends Error {
  constructor(readonly code: IntakeOutcomeCode, readonly problem: ProblemException | Error = problemFor(code)) {
    super(code);
  }
}

function limitProblem(limit: ImportLimit, retryAfterSeconds?: number): ProblemException {
  return new ProblemException(429, 'UPLOAD_LIMIT_REACHED', { messageKey: IMPORT_LIMIT_MESSAGE_KEYS[limit], retryAfterSeconds });
}

/** The problem an outcome code answers with (also when a retry replays it). */
function problemFor(code: string): ProblemException {
  switch (code) {
    case 'too_large':
      return new ProblemException(413, 'UPLOAD_TOO_LARGE');
    case 'empty':
      return new ProblemException(422, 'UPLOAD_EMPTY');
    case 'unsupported_heic':
      return new ProblemException(415, 'UPLOAD_UNSUPPORTED_TYPE', { messageKey: IMPORT_HEIC_MESSAGE_KEY });
    case 'unsupported_type':
      return new ProblemException(415, 'UPLOAD_UNSUPPORTED_TYPE');
    case 'type_mismatch':
      return new ProblemException(422, 'UPLOAD_TYPE_MISMATCH');
    case 'limit_bytes':
      return limitProblem('bytes');
    case 'limit_parse_jobs':
      return limitProblem('parse_jobs');
    case 'upload_incomplete':
      return new ProblemException(400, 'UPLOAD_INCOMPLETE');
    case 'upload_stalled':
    case 'upload_timeout':
      return new ProblemException(408, 'UPLOAD_INCOMPLETE', { messageKey: IMPORT_TIMEOUT_MESSAGE_KEY });
    case 'storage_unavailable':
      return new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    default:
      // The upload under this key cannot finish; start again with a new key.
      return new ProblemException(409, 'UPLOAD_FAILED');
  }
}

type Received = { parts: QuarantinePart[]; bytes: number; sha256: string };
type Pulled = { value: IteratorResult<Uint8Array> } | { error: unknown } | 'timed_out';

/**
 * P2a's upload intake. An upload streams into private quarantine under
 * server-generated keys (`import_quarantine/<account>/<job>/<intake token>/
 * part-NNNN`), never buffered whole:
 *   1. name, declared type, extension and declared length are checked
 *      before any byte is read; at most `maxConcurrent` intakes run per process;
 *   2. under the account lock, the per-account quotas (including at most two
 *      uploads streaming at once) and the idempotency key are checked and the
 *      attempt is recorded (`begin`);
 *   3. the body is read chunk by chunk: the first bytes are sniffed before
 *      anything is written; the 12 MiB cap (and a declared length) and the
 *      bytes still allowed today are enforced before a chunk is kept; CSV is
 *      checked for binary bytes throughout; a pause longer than `idleMs` or a
 *      body still arriving after `receiveMs` ends the upload (408); every
 *      1 MiB part is registered in P1's publication registry before its PUT;
 *   4. under the account lock again, the session, account and quotas are
 *      re-checked, the parts are published for 24 hours and one parse job
 *      (plus its 24-hour expiry job) is queued (`finish`).
 * Any refusal or failure after step 2 records the outcome and deletes what
 * was written; anything a crash leaves behind is swept after its deadline.
 * Nothing here parses the file or writes a financial record.
 */
export class UploadIntake {
  private readonly limits: UploadIntakeLimits;
  private active = 0;

  constructor(
    private readonly imports: ImportIntakeRepository,
    private readonly store: ObjectStore,
    limits: Partial<UploadIntakeLimits> = {},
  ) {
    this.limits = {
      maxBytes: IMPORT_UPLOAD_MAX_BYTES,
      partBytes: QUARANTINE_PART_BYTES,
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      idleMs: IMPORT_UPLOAD_IDLE_SECONDS * 1000,
      receiveMs: IMPORT_UPLOAD_RECEIVE_SECONDS * 1000,
      ...limits,
    };
    if (this.limits.partBytes < SNIFF_BYTES || this.limits.maxBytes / this.limits.partBytes > 12) throw new RangeError('parts must cover the cap in at most 12');
  }

  async accept(ctx: SessionContext, stream: AsyncIterable<Uint8Array>, metadata: UploadMetadata): Promise<UploadAccepted> {
    if (!isUuid(metadata.idempotencyKey)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency-key');
    const declared = importFormatForContentType(metadata.contentType);
    if (!declared) {
      const type = typeof metadata.contentType === 'string' ? metadata.contentType.split(';')[0].trim().toLowerCase() : '';
      throw problemFor(HEIC_CONTENT_TYPES.has(type) ? 'unsupported_heic' : 'unsupported_type');
    }
    const { name, extension } = parseImportFileName(metadata.fileName);
    const byExtension = importFormatForExtension(extension);
    if (!byExtension) throw problemFor(HEIC_EXTENSIONS.has(extension) ? 'unsupported_heic' : 'unsupported_type');
    if (byExtension !== declared) throw problemFor('type_mismatch');
    if (metadata.declaredBytes !== null) {
      if (metadata.declaredBytes > this.limits.maxBytes) throw problemFor('too_large');
      if (metadata.declaredBytes === 0) throw problemFor('empty');
    }
    if (this.active >= this.limits.maxConcurrent) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    this.active += 1;
    try {
      return await this.intake(ctx, stream, { key: metadata.idempotencyKey, name, format: declared, declaredBytes: metadata.declaredBytes });
    } finally {
      this.active -= 1;
    }
  }

  private async intake(ctx: SessionContext, stream: AsyncIterable<Uint8Array>, upload: { key: string; name: string; format: ImportFormat; declaredBytes: number | null }): Promise<UploadAccepted> {
    const jobId = derivedUuid(ctx.accountId, 'import-upload', upload.key);
    const intakeToken = randomUUID();
    const declaredType = IMPORT_CONTENT_TYPES[upload.format];
    const begun = await this.imports.begin(ctx, { jobId, intakeToken, fileName: upload.name, declaredType, declaredBytes: upload.declaredBytes });
    switch (begun.kind) {
      case 'replay':
        // The same key names the same upload: another file under it is a mismatch.
        if (begun.upload.declaredType !== declaredType || (begun.upload.fileName !== null && begun.upload.fileName !== upload.name)) {
          throw new ProblemException(409, 'IDEMPOTENCY_MISMATCH');
        }
        return begun.upload.dto;
      case 'in_progress':
        throw new ProblemException(409, 'UPLOAD_IN_PROGRESS', { retryAfterSeconds: begun.retryAfterSeconds });
      case 'ended':
        throw begun.status === 'rejected' ? problemFor(begun.code) : new ProblemException(409, 'UPLOAD_FAILED');
      case 'limited':
        throw limitProblem(begun.limit, begun.retryAfterSeconds);
      case 'started':
        break;
    }

    try {
      const received = await this.receive(ctx, jobId, intakeToken, upload.format, upload.declaredBytes, begun.remainingBytes, stream);
      for (const part of received.parts) {
        const stored = await this.store.head(part.key);
        if (!stored || stored.bytes !== part.bytes || stored.sha256 !== part.sha256) throw new IntakeFailure('storage_unavailable');
      }
      let finished: FinishResult;
      try {
        finished = await this.imports.finish(ctx, { jobId, intakeToken, format: upload.format, bytes: received.bytes, sha256: received.sha256, parts: received.parts });
      } catch (error) {
        // Session, account or policy found changed under the lock.
        if (error instanceof ProblemException) throw new IntakeFailure('session_ended', error);
        throw error;
      }
      if (finished.kind === 'accepted') return finished.dto;
      if (finished.kind === 'limited') throw new IntakeRejection(finished.limit === 'bytes' ? 'limit_bytes' : 'limit_parse_jobs', limitProblem(finished.limit, finished.retryAfterSeconds));
      throw new IntakeFailure(finished.code);
    } catch (error) {
      if (error instanceof IntakeRejection) {
        await this.discard(ctx, jobId, intakeToken, 'rejected', error.code);
        throw error.problem;
      }
      if (error instanceof IntakeFailure) {
        await this.discard(ctx, jobId, intakeToken, 'failed', error.code);
        throw error.problem;
      }
      if (error instanceof ObjectStoreError) {
        await this.discard(ctx, jobId, intakeToken, 'failed', 'storage_unavailable');
        throw problemFor('storage_unavailable');
      }
      // Possibly after the finish committed (a lost reply): only what is still
      // unpublished is discarded, and a retry with the key replays the outcome.
      await this.discard(ctx, jobId, intakeToken, 'failed', 'intake_error');
      throw error;
    }
  }

  /**
   * Reads the body into registered quarantine parts, enforcing the cap, the
   * bytes the account may still have accepted today, the sniffed type, CSV
   * text throughout, a pause of at most `idleMs` and the `receiveMs` bound.
   */
  private async receive(
    ctx: SessionContext,
    jobId: string,
    intakeToken: string,
    format: ImportFormat,
    declaredBytes: number | null,
    remainingBytes: number,
    stream: AsyncIterable<Uint8Array>,
  ): Promise<Received> {
    const limit = Math.min(this.limits.maxBytes, declaredBytes ?? Number.POSITIVE_INFINITY);
    const deadline = Date.now() + this.limits.receiveMs;
    const whole = createHash('sha256');
    const parts: QuarantinePart[] = [];
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let total = 0;
    let sniffed = false;

    const sniff = () => {
      sniffed = true;
      const found = sniffImportFormat(Buffer.concat(pending, Math.min(pendingBytes, SNIFF_BYTES)));
      if (found === format) return;
      if (found === 'heic') throw new IntakeRejection('unsupported_heic');
      if (found === 'unsupported') throw new IntakeRejection('unsupported_type');
      throw new IntakeRejection('type_mismatch');
    };
    const flush = async () => {
      if (pendingBytes === 0) return;
      const index = parts.length;
      // Registered (and committed) before the PUT, so the sweep can always find it.
      const key = await this.imports.reservePart(ctx, jobId, intakeToken, index);
      if (!key) throw new IntakeFailure('reservation_refused');
      const body = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingBytes);
      pending = [];
      pendingBytes = 0;
      const stored = await this.store.putStream(key, body, { contentType: 'application/octet-stream' });
      parts.push({ index, key, bytes: stored.bytes, sha256: stored.sha256 });
    };

    const source = stream[Symbol.asyncIterator]();
    // A pull still waiting when the upload ends (a stalled client): never awaited again.
    let stalledPull: Promise<IteratorResult<Uint8Array>> | null = null;
    let ended = false;
    try {
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0) throw new IntakeFailure('upload_timeout');
        const pull = source.next();
        const pulled = await this.pullWithin(pull, Math.min(this.limits.idleMs, left));
        if (pulled === 'timed_out') {
          stalledPull = pull;
          throw new IntakeFailure(Date.now() >= deadline ? 'upload_timeout' : 'upload_stalled');
        }
        if ('error' in pulled) {
          ended = true;
          throw new IntakeFailure('upload_incomplete');
        }
        if (pulled.value.done) {
          ended = true;
          break;
        }
        const chunk = pulled.value.value;
        let data = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        // Nothing past the cap (or past a declared length) is ever kept...
        if (total + data.length > limit) throw new IntakeRejection('too_large');
        // ...nor past what the account may still have accepted today.
        if (total + data.length > remainingBytes) {
          const retry = await this.imports.bytesRetry(ctx, total + data.length).catch(() => 60);
          throw new IntakeRejection('limit_bytes', limitProblem('bytes', retry));
        }
        total += data.length;
        whole.update(data);
        while (data.length > 0) {
          const take = data.subarray(0, this.limits.partBytes - pendingBytes);
          pending.push(take);
          pendingBytes += take.length;
          data = data.subarray(take.length);
          if (!sniffed) {
            if (pendingBytes >= SNIFF_BYTES) {
              sniff();
              // Everything held so far is checked as text once the type is known.
              if (format === 'csv' && pending.some((piece) => hasBinaryByte(piece))) throw new IntakeRejection('type_mismatch');
            }
          } else if (format === 'csv' && hasBinaryByte(take)) {
            throw new IntakeRejection('type_mismatch');
          }
          if (pendingBytes === this.limits.partBytes) await flush();
        }
      }
    } finally {
      if (stalledPull) {
        // Waiting on a stalled source would hang: let it settle (or the
        // connection close) on its own, and close it then.
        stalledPull.catch(() => undefined);
        void source.return?.()?.catch(() => undefined);
      } else if (!ended) {
        // Stop reading without destroying the connection (the caller discards the rest).
        await source.return?.().catch(() => undefined);
      }
    }
    if (total === 0) throw new IntakeRejection('empty');
    if (declaredBytes !== null && total !== declaredBytes) throw new IntakeFailure('upload_incomplete');
    if (!sniffed) {
      sniff();
      if (format === 'csv' && pending.some((piece) => hasBinaryByte(piece))) throw new IntakeRejection('type_mismatch');
    }
    await flush();
    return { parts, bytes: total, sha256: whole.digest('hex') };
  }

  /** The next chunk, the source's error, or `timed_out` after `ms` (the pull is left running). */
  private async pullWithin(pull: Promise<IteratorResult<Uint8Array>>, ms: number): Promise<Pulled> {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<'timed_out'>((resolve) => {
      timer = setTimeout(() => resolve('timed_out'), ms);
    });
    try {
      return await Promise.race([pull.then((value) => ({ value }), (error: unknown) => ({ error })), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Records the outcome and deletes, now, exactly the parts the database hands
   * back as still unpublished (never one a finish already published); the
   * sweep is the backstop if any step fails.
   */
  private async discard(ctx: SessionContext, jobId: string, intakeToken: string, status: 'rejected' | 'failed', code: IntakeOutcomeCode): Promise<void> {
    let keys: string[] = [];
    try {
      keys = await this.imports.abort(ctx, jobId, intakeToken, status, code);
    } catch {
      // The reservations stay until their deadline; the sweep removes them.
      return;
    }
    const deleted: string[] = [];
    for (const key of keys) {
      try {
        await this.store.delete(key);
        deleted.push(key);
      } catch {
        // Left `deleting`: the sweep retries it.
      }
    }
    await this.imports.discarded?.(ctx, jobId, intakeToken, deleted).catch(() => undefined);
  }
}
