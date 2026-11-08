import { createHash, randomUUID } from 'node:crypto';

import {
  ContractValidationError,
  IMPORT_CONTENT_TYPES,
  IMPORT_HEIC_MESSAGE_KEY,
  IMPORT_LIMIT_MESSAGE_KEYS,
  IMPORT_QUOTAS,
  IMPORT_TIMEOUT_MESSAGE_KEY,
  IMPORT_UPLOAD_IDLE_SECONDS,
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_UPLOAD_RECEIVE_SECONDS,
  importFormatForContentType,
  importFormatForExtension,
  isImportJobDto,
  parseImportFileName,
} from '@gogospend/contracts';
import type { ImportFormat, ImportJobDto, ImportLimit, SessionContext } from '@gogospend/contracts';

import { ProblemException } from '../common/api-problem.filter';
import { MemoryObjectStore, ObjectStoreError } from '../storage/object-store';
import type { ObjectBody } from '../storage/object-store';
import { PATH_LIKE_NAMES, SYNTHETIC, meteredStream } from './fixtures/synthetic-uploads';
import type { BeginInput, BeginResult, FinishInput, FinishResult, ImportIntakeRepository, IntakeOutcomeCode } from './import.repository';
import { QUARANTINE_PART_BYTES, UploadIntake, importIntakeConfigFromEnv, sniffImportFormat } from './upload-intake';
import type { UploadIntakeLimits, UploadMetadata } from './upload-intake';

const MiB = 1024 * 1024;
const CAP = IMPORT_UPLOAD_MAX_BYTES;

const session = (): SessionContext => ({ accountId: randomUUID(), subject: 'auth0|synthetic', clientId: 'native-test', bindingId: randomUUID(), sessionGeneration: 0 });

const dto = (overrides: Partial<ImportJobDto> = {}): ImportJobDto => ({
  job_id: randomUUID(),
  status: 'queued',
  format: 'csv',
  file_name: 'statement.csv',
  bytes: 10,
  received_at: '2026-10-17T00:00:00.000Z',
  expires_at: '2026-10-18T00:00:00.000Z',
  ...overrides,
});

/** An in-memory ImportIntakeRepository that records every call. */
class FakeImports implements ImportIntakeRepository {
  readonly begun: BeginInput[] = [];
  readonly reserved: string[] = [];
  readonly finished: FinishInput[] = [];
  readonly aborted: { status: 'rejected' | 'failed'; code: IntakeOutcomeCode }[] = [];
  readonly published = new Set<string>();
  readonly retryNeeds: number[] = [];
  beginResult: BeginResult = { kind: 'started', remainingBytes: Number.MAX_SAFE_INTEGER };
  finishResult: ((input: FinishInput) => FinishResult) | null = null;
  refuseReservationAt: number | null = null;
  bytesRetryAfter = 1;

  async bytesRetry(_ctx: SessionContext, need: number): Promise<number> {
    this.retryNeeds.push(need);
    return this.bytesRetryAfter;
  }

  async begin(_ctx: SessionContext, input: BeginInput): Promise<BeginResult> {
    this.begun.push(input);
    return this.beginResult;
  }

  async reservePart(ctx: SessionContext, jobId: string, intakeToken: string, index: number): Promise<string | null> {
    if (this.refuseReservationAt !== null && index >= this.refuseReservationAt) return null;
    const key = `import_quarantine/${ctx.accountId}/${jobId}/${intakeToken}/part-${String(index).padStart(4, '0')}`;
    this.reserved.push(key);
    return key;
  }

  async finish(_ctx: SessionContext, input: FinishInput): Promise<FinishResult> {
    this.finished.push(input);
    if (this.finishResult) return this.finishResult(input);
    return { kind: 'accepted', dto: dto({ job_id: input.jobId, format: input.format, bytes: input.bytes }) };
  }

  async abort(_ctx: SessionContext, _jobId: string, intakeToken: string, status: 'rejected' | 'failed', code: IntakeOutcomeCode): Promise<string[]> {
    this.aborted.push({ status, code });
    // Like the routine: only reservations still unpublished are handed back for deletion.
    return this.reserved.filter((key) => key.includes(`/${intakeToken}/`) && !this.published.has(key));
  }
}

/** A failure-adapter store that also records what each PUT received. */
class MeteredStore extends MemoryObjectStore {
  readonly puts: { key: string; bytes: number }[] = [];

  async putStream(key: string, body: ObjectBody, options?: { contentType?: string; signal?: AbortSignal }): Promise<{ bytes: number; sha256: string }> {
    const written = await super.putStream(key, body, options);
    this.puts.push({ key, bytes: written.bytes });
    return written;
  }

  received(): number {
    return this.puts.reduce((sum, put) => sum + put.bytes, 0);
  }

  async quarantined(): Promise<string[]> {
    return (await this.list('import_quarantine/')).map((object) => object.key);
  }
}

type Problem = { status: number; code: string; messageKey?: string; retryAfterSeconds?: number; field?: string };

/** The problem an accept call ends with; a resolved call reads as status 200. */
async function outcome(promise: Promise<unknown>): Promise<Problem> {
  try {
    await promise;
    return { status: 200, code: 'ACCEPTED' };
  } catch (error) {
    if (error instanceof ProblemException) {
      return { status: error.getStatus(), code: error.code, messageKey: error.problem.messageKey, retryAfterSeconds: error.problem.retryAfterSeconds };
    }
    if (error instanceof ContractValidationError) return { status: 422, code: error.code, field: error.field };
    throw error;
  }
}

const meta = (format: ImportFormat, overrides: Partial<UploadMetadata> = {}): UploadMetadata => ({
  idempotencyKey: randomUUID(),
  fileName: `statement.${format === 'jpeg' ? 'jpg' : format}`,
  contentType: IMPORT_CONTENT_TYPES[format],
  declaredBytes: null,
  ...overrides,
});

function setup(limits: Partial<UploadIntakeLimits> = {}) {
  const imports = new FakeImports();
  const store = new MeteredStore();
  const intake = new UploadIntake(imports, store, limits);
  return { imports, store, intake };
}

const once = (body: Uint8Array) => meteredStream(body, body.byteLength);

describe('file names, types and declared sizes are refused before any byte is read', () => {
  it.each(PATH_LIKE_NAMES)('refuses the path-like or disguised name %j', async (fileName) => {
    const { imports, store, intake } = setup();
    const source = once(SYNTHETIC.csv);
    expect(await outcome(intake.accept(session(), source.stream, meta('csv', { fileName })))).toMatchObject({ status: 422, code: 'INVALID_FILE_NAME', field: 'file_name' });
    expect(source.pulled()).toBe(0);
    expect(imports.begun).toEqual([]);
    expect(await store.quarantined()).toEqual([]);
  });

  it('accepts ordinary names, including Thai, and keeps them as labels only', async () => {
    for (const name of ['statement.csv', 'รายการเดือนมีนาคม 2569.csv', 'March (copy) v2.final.csv', 'ใบเสร็จ.JPG']) {
      expect(() => parseImportFileName(name)).not.toThrow();
    }
    expect(parseImportFileName('ใบเสร็จ.JPG')).toEqual({ name: 'ใบเสร็จ.JPG', extension: 'jpg' });
    expect(() => parseImportFileName('a'.repeat(124) + '.csv')).not.toThrow();
  });

  it.each(['image/heic', 'image/heif', 'application/pdf', 'application/octet-stream', 'application/json', 'text/plain', ''])(
    'refuses the declared content type %j as unsupported (415)',
    async (contentType) => {
      const { imports, intake } = setup();
      const source = once(SYNTHETIC.csv);
      const result = await outcome(intake.accept(session(), source.stream, meta('csv', { contentType })));
      expect(result).toMatchObject({ status: 415, code: 'UPLOAD_UNSUPPORTED_TYPE' });
      if (contentType.startsWith('image/hei')) expect(result.messageKey).toBe(IMPORT_HEIC_MESSAGE_KEY);
      expect(source.pulled()).toBe(0);
      expect(imports.begun).toEqual([]);
    },
  );

  it('refuses an extension that does not match the declared type (422) and an unsupported extension (415)', async () => {
    const { intake } = setup();
    const mismatch = once(SYNTHETIC.png);
    expect(await outcome(intake.accept(session(), mismatch.stream, meta('png', { fileName: 'statement.csv' })))).toMatchObject({ status: 422, code: 'UPLOAD_TYPE_MISMATCH' });
    expect(mismatch.pulled()).toBe(0);
    const heic = once(SYNTHETIC.heic);
    expect(await outcome(intake.accept(session(), heic.stream, meta('jpeg', { fileName: 'IMG_0001.HEIC' })))).toMatchObject({ status: 415, code: 'UPLOAD_UNSUPPORTED_TYPE', messageKey: IMPORT_HEIC_MESSAGE_KEY });
    expect(heic.pulled()).toBe(0);
  });

  it('refuses a declared length over 12 MiB (413) or of zero (422) without reading', async () => {
    const { imports, intake } = setup();
    const big = meteredStream(SYNTHETIC.csv, CAP + 1);
    expect(await outcome(intake.accept(session(), big.stream, meta('csv', { declaredBytes: CAP + 1 })))).toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
    expect(big.pulled()).toBe(0);
    const empty = once(Buffer.alloc(0));
    expect(await outcome(intake.accept(session(), empty.stream, meta('csv', { declaredBytes: 0 })))).toMatchObject({ status: 422, code: 'UPLOAD_EMPTY' });
    expect(imports.begun).toEqual([]);
  });

  it('requires a UUID Idempotency-Key', async () => {
    const { imports, intake } = setup();
    const source = once(SYNTHETIC.csv);
    expect(await outcome(intake.accept(session(), source.stream, meta('csv', { idempotencyKey: 'not-a-uuid' })))).toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(source.pulled()).toBe(0);
    expect(imports.begun).toEqual([]);
  });
});

describe('the 12 MiB cap holds while streaming', () => {
  it('rejects a body past 12 MiB at the cap: nothing beyond it is buffered or stored, and nothing stays in quarantine', async () => {
    const { imports, store, intake } = setup();
    const chunk = 64 * 1024;
    const source = meteredStream(SYNTHETIC.csv, 20 * MiB, { chunk });
    const result = await outcome(intake.accept(session(), source.stream, meta('csv')));
    expect(result).toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
    // It stopped pulling at the first chunk that crossed the cap...
    expect(source.pulled()).toBeLessThanOrEqual(CAP + chunk);
    expect(source.returned()).toBe(true);
    // ...never stored a byte beyond it, never held more than one part...
    const bytesBufferedBeyondCap = Math.max(0, store.received() - CAP);
    expect(bytesBufferedBeyondCap).toBe(0);
    expect(Math.max(...store.puts.map((put) => put.bytes))).toBeLessThanOrEqual(QUARANTINE_PART_BYTES);
    // ...and deleted what it had written.
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'rejected', code: 'too_large' }]);
    expect(imports.finished).toEqual([]);
  });

  it('a declared length that understates the body is still capped while streaming', async () => {
    const { store, intake } = setup();
    const source = meteredStream(SYNTHETIC.csv, CAP + 1);
    expect(await outcome(intake.accept(session(), source.stream, meta('csv', { declaredBytes: 1024 })))).toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
    expect(store.received()).toBeLessThanOrEqual(CAP);
    expect(await store.quarantined()).toEqual([]);
  });

  it('accepts exactly 12 MiB as 1 MiB parts whose concatenation is the upload', async () => {
    const { imports, store, intake } = setup();
    const source = meteredStream(SYNTHETIC.csv, CAP, { chunk: 100_000 });
    const accepted = await intake.accept(session(), source.stream, meta('csv'));
    expect(accepted.bytes).toBe(CAP);
    expect(imports.finished).toHaveLength(1);
    const [finish] = imports.finished;
    expect(finish.parts.map((part) => part.index)).toEqual([...Array(12).keys()]);
    expect(finish.parts.every((part) => part.bytes === QUARANTINE_PART_BYTES)).toBe(true);
    const whole = createHash('sha256');
    for (const part of finish.parts) {
      const stored = (await store.get(part.key)) as Uint8Array;
      expect(createHash('sha256').update(stored).digest('hex')).toBe(part.sha256);
      whole.update(stored);
    }
    expect(finish.sha256).toBe(whole.digest('hex'));
    expect(finish.bytes).toBe(CAP);
    expect(imports.aborted).toEqual([]);
  });

  it('stores a small upload as one part, with server-generated keys only', async () => {
    const { imports, store, intake } = setup();
    const ctx = session();
    const accepted = await intake.accept(ctx, once(SYNTHETIC.csv).stream, meta('csv', { fileName: 'statement..v2.csv' }));
    expect(accepted.format).toBe('csv');
    expect(imports.finished).toHaveLength(1);
    const [finish] = imports.finished;
    expect(finish.parts).toHaveLength(1);
    expect(finish.parts[0].key).toMatch(new RegExp(`^import_quarantine/${ctx.accountId}/${finish.jobId}/[0-9a-f-]{36}/part-0000$`));
    expect(Buffer.from((await store.get(finish.parts[0].key)) as Uint8Array).equals(SYNTHETIC.csv)).toBe(true);
    expect(imports.begun[0]).toMatchObject({ fileName: 'statement..v2.csv', declaredType: 'text/csv', declaredBytes: null });
  });
});

describe('magic bytes decide, not the name or the declared type', () => {
  it.each<[string, Buffer, ImportFormat, number, string]>([
    ['a PNG named and declared as JPEG', SYNTHETIC.png, 'jpeg', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a JPEG declared as PNG', SYNTHETIC.jpeg, 'png', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['an XLSX (ZIP) declared as CSV', SYNTHETIC.xlsx, 'csv', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['an executable declared as CSV', SYNTHETIC.exe, 'csv', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['CSV text declared as an image', SYNTHETIC.csv, 'webp', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['RIFF audio declared as WebP', SYNTHETIC.wave, 'webp', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['an empty ZIP declared as XLSX', SYNTHETIC.emptyZip, 'xlsx', 422, 'UPLOAD_TYPE_MISMATCH'],
    ['a HEIC photo declared as JPEG', SYNTHETIC.heic, 'jpeg', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a HEIF photo declared as PNG', SYNTHETIC.heif, 'png', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['an AVIF photo declared as WebP', SYNTHETIC.avif, 'webp', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a PDF declared as CSV', SYNTHETIC.pdf, 'csv', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a GIF declared as PNG', SYNTHETIC.gif, 'png', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['a legacy XLS declared as XLSX', SYNTHETIC.xls, 'xlsx', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
    ['UTF-16 text declared as CSV', SYNTHETIC.csvUtf16, 'csv', 415, 'UPLOAD_UNSUPPORTED_TYPE'],
  ])('refuses %s before writing anything', async (_label, body, format, status, code) => {
    const { imports, store, intake } = setup();
    const result = await outcome(intake.accept(session(), once(body).stream, meta(format)));
    expect(result).toMatchObject({ status, code });
    if (body === SYNTHETIC.heic || body === SYNTHETIC.heif) expect(result.messageKey).toBe(IMPORT_HEIC_MESSAGE_KEY);
    expect(store.puts).toEqual([]);
    expect(imports.reserved).toEqual([]);
    expect(imports.aborted).toHaveLength(1);
    expect(imports.aborted[0].status).toBe('rejected');
    expect(imports.finished).toEqual([]);
  });

  it.each<[string, Buffer, ImportFormat]>([
    ['CSV', SYNTHETIC.csv, 'csv'],
    ['CSV with a UTF-8 byte-order mark and Thai text', SYNTHETIC.csvBom, 'csv'],
    ['CSV in a Thai single-byte code page', SYNTHETIC.csvTis620, 'csv'],
    ['XLSX', SYNTHETIC.xlsx, 'xlsx'],
    ['JPEG', SYNTHETIC.jpeg, 'jpeg'],
    ['PNG', SYNTHETIC.png, 'png'],
    ['WebP', SYNTHETIC.webp, 'webp'],
  ])('accepts %s into quarantine', async (_label, body, format) => {
    const { imports, intake } = setup();
    const accepted = await intake.accept(session(), once(body).stream, meta(format));
    expect(accepted.format).toBe(format);
    expect(imports.finished[0]).toMatchObject({ format, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex') });
  });

  it('refuses CSV with binary content after its first part, and deletes the parts already written', async () => {
    const { imports, store, intake } = setup();
    const source = meteredStream(SYNTHETIC.csv, 3 * MiB, { chunk: 256 * 1024 });
    // Binary from 1.5 MiB onwards: the sniffed head was fine.
    const poisoned = {
      async *[Symbol.asyncIterator]() {
        let offset = 0;
        for await (const piece of source.stream) {
          const copy = Buffer.from(piece);
          if (offset + copy.length > 1.5 * MiB) copy[copy.length - 1] = 0x00;
          offset += copy.length;
          yield copy;
        }
      },
    };
    expect(await outcome(intake.accept(session(), poisoned, meta('csv')))).toMatchObject({ status: 422, code: 'UPLOAD_TYPE_MISMATCH' });
    expect(store.puts.length).toBeGreaterThan(0);
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'rejected', code: 'type_mismatch' }]);
  });

  it('refuses an empty body (422)', async () => {
    const { imports, store, intake } = setup();
    expect(await outcome(intake.accept(session(), once(Buffer.alloc(0)).stream, meta('csv')))).toMatchObject({ status: 422, code: 'UPLOAD_EMPTY' });
    expect(store.puts).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'rejected', code: 'empty' }]);
  });

  it('sniffs each signature from the first bytes only', () => {
    const cases: [Buffer, ReturnType<typeof sniffImportFormat>][] = [
      [SYNTHETIC.csv, 'csv'],
      [SYNTHETIC.csvBom, 'csv'],
      [SYNTHETIC.csvTis620, 'csv'],
      [SYNTHETIC.xlsx, 'xlsx'],
      [SYNTHETIC.jpeg, 'jpeg'],
      [SYNTHETIC.png, 'png'],
      [SYNTHETIC.webp, 'webp'],
      [SYNTHETIC.heic, 'heic'],
      [SYNTHETIC.heif, 'heic'],
      [SYNTHETIC.avif, 'unsupported'],
      [SYNTHETIC.pdf, 'unsupported'],
      [SYNTHETIC.gif, 'unsupported'],
      [SYNTHETIC.xls, 'unsupported'],
      [SYNTHETIC.csvUtf16, 'unsupported'],
      [SYNTHETIC.emptyZip, 'binary'],
      [SYNTHETIC.exe, 'binary'],
      [SYNTHETIC.wave, 'binary'],
      [SYNTHETIC.csvWithNul, 'binary'],
    ];
    for (const [body, expected] of cases) expect([body.subarray(0, 12).toString('hex'), sniffImportFormat(body.subarray(0, 64))]).toEqual([body.subarray(0, 12).toString('hex'), expected]);
  });
});

describe('quota, replay and failure outcomes', () => {
  it.each<ImportLimit>(['uploads', 'bytes', 'parse_jobs'])('a reached %s limit is 429 with its retry time and message key, before reading', async (limit) => {
    const { imports, intake } = setup();
    imports.beginResult = { kind: 'limited', limit, retryAfterSeconds: 321 };
    const source = once(SYNTHETIC.csv);
    expect(await outcome(intake.accept(session(), source.stream, meta('csv')))).toEqual({
      status: 429,
      code: 'UPLOAD_LIMIT_REACHED',
      messageKey: IMPORT_LIMIT_MESSAGE_KEYS[limit],
      retryAfterSeconds: 321,
    });
    expect(source.pulled()).toBe(0);
  });

  it('a limit reached by the time the upload finishes refuses it and deletes its parts', async () => {
    const { imports, store, intake } = setup();
    imports.finishResult = () => ({ kind: 'limited', limit: 'bytes', retryAfterSeconds: 60 });
    expect(await outcome(intake.accept(session(), meteredStream(SYNTHETIC.csv, 2 * MiB).stream, meta('csv')))).toMatchObject({
      status: 429,
      code: 'UPLOAD_LIMIT_REACHED',
      messageKey: IMPORT_LIMIT_MESSAGE_KEYS.bytes,
      retryAfterSeconds: 60,
    });
    expect(await store.quarantined()).toEqual([]);
  });

  it('a replay of an accepted key returns the original upload without reading; other content under the key is a mismatch', async () => {
    const { imports, store, intake } = setup();
    const original = dto({ format: 'csv' });
    imports.beginResult = { kind: 'replay', upload: { dto: original, fileName: 'statement.csv', declaredType: 'text/csv' } };
    const same = once(SYNTHETIC.csv);
    await expect(intake.accept(session(), same.stream, meta('csv'))).resolves.toEqual(original);
    expect(same.pulled()).toBe(0);
    const other = once(SYNTHETIC.csv);
    expect(await outcome(intake.accept(session(), other.stream, meta('csv', { fileName: 'other.csv' })))).toMatchObject({ status: 409, code: 'IDEMPOTENCY_MISMATCH' });
    expect(other.pulled()).toBe(0);
    expect(store.puts).toEqual([]);
  });

  it('a key still streaming is 409 UPLOAD_IN_PROGRESS; a refused key repeats its refusal; a failed key is 409 UPLOAD_FAILED', async () => {
    const { imports, intake } = setup();
    imports.beginResult = { kind: 'in_progress', retryAfterSeconds: 30 };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 409, code: 'UPLOAD_IN_PROGRESS', retryAfterSeconds: 30 });
    imports.beginResult = { kind: 'ended', status: 'rejected', code: 'too_large' };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
    imports.beginResult = { kind: 'ended', status: 'rejected', code: 'unsupported_heic' };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 415, messageKey: IMPORT_HEIC_MESSAGE_KEY });
    imports.beginResult = { kind: 'ended', status: 'failed', code: 'upload_incomplete' };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 409, code: 'UPLOAD_FAILED' });
  });

  it('a client that goes away mid-stream fails the upload and leaves nothing in quarantine', async () => {
    const { imports, store, intake } = setup();
    const source = meteredStream(SYNTHETIC.csv, 4 * MiB, { failAt: 2.5 * MiB });
    expect(await outcome(intake.accept(session(), source.stream, meta('csv')))).toMatchObject({ status: 400, code: 'UPLOAD_INCOMPLETE' });
    expect(store.puts.length).toBeGreaterThan(0);
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'upload_incomplete' }]);
  });

  it('a body shorter than its declared length is incomplete', async () => {
    const { imports, intake } = setup();
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv', { declaredBytes: SYNTHETIC.csv.length + 10 })))).toMatchObject({ status: 400, code: 'UPLOAD_INCOMPLETE' });
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'upload_incomplete' }]);
  });

  it('a storage failure is 503 and fails the upload without leaving parts', async () => {
    const { imports, store, intake } = setup();
    const source = meteredStream(SYNTHETIC.csv, 3 * MiB);
    let puts = 0;
    const original = store.putStream.bind(store);
    store.putStream = async (key, body, options) => {
      puts += 1;
      if (puts === 2) throw new ObjectStoreError('unavailable');
      return original(key, body, options);
    };
    expect(await outcome(intake.accept(session(), source.stream, meta('csv')))).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', retryAfterSeconds: 5 });
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'storage_unavailable' }]);
  });

  it('a refused part reservation (deadline passed, account changed) fails the upload', async () => {
    const { imports, store, intake } = setup();
    imports.refuseReservationAt = 1;
    expect(await outcome(intake.accept(session(), meteredStream(SYNTHETIC.csv, 3 * MiB).stream, meta('csv')))).toMatchObject({ status: 409, code: 'UPLOAD_FAILED' });
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'reservation_refused' }]);
  });

  it('a refused finish (deadline passed, account changed) fails the upload and deletes its parts', async () => {
    const { imports, store, intake } = setup();
    imports.finishResult = () => ({ kind: 'refused', code: 'account_changed' });
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 409, code: 'UPLOAD_FAILED' });
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'account_changed' }]);
  });

  it('a session or account problem found under the lock at finish deletes the parts and is passed on', async () => {
    const { imports, store, intake } = setup();
    imports.finishResult = () => {
      throw new ProblemException(401, 'SESSION_REQUIRED');
    };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 401, code: 'SESSION_REQUIRED' });
    expect(await store.quarantined()).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'session_ended' }]);
  });

  it('bounds concurrent intakes per process: the next one is 503 before reading', async () => {
    const { intake } = setup({ maxConcurrent: 1 });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = {
      async *[Symbol.asyncIterator]() {
        yield SYNTHETIC.csv.subarray(0, 8);
        await gate;
        yield SYNTHETIC.csv.subarray(8);
      },
    };
    const first = intake.accept(session(), slow, meta('csv'));
    await new Promise((resolve) => setImmediate(resolve));
    const second = once(SYNTHETIC.csv);
    expect(await outcome(intake.accept(session(), second.stream, meta('csv')))).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(second.pulled()).toBe(0);
    release();
    await expect(first).resolves.toMatchObject({ format: 'csv' });
    await expect(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv'))).resolves.toMatchObject({ format: 'csv' });
  });
});

describe('contract helpers and configuration', () => {
  it('maps content types and extensions to formats', () => {
    expect(importFormatForContentType('text/csv')).toBe('csv');
    expect(importFormatForContentType('Text/CSV; charset=utf-8')).toBe('csv');
    expect(importFormatForContentType(IMPORT_CONTENT_TYPES.xlsx)).toBe('xlsx');
    expect(importFormatForContentType('image/jpeg')).toBe('jpeg');
    expect(importFormatForContentType('image/heic')).toBeNull();
    expect(importFormatForContentType('image/jpeg; charset=utf-8')).toBeNull();
    expect(importFormatForContentType(undefined)).toBeNull();
    expect(importFormatForExtension('jpg')).toBe('jpeg');
    expect(importFormatForExtension('jpeg')).toBe('jpeg');
    expect(importFormatForExtension('heic')).toBeNull();
  });

  it('validates import DTOs strictly', () => {
    expect(isImportJobDto(dto())).toBe(true);
    expect(isImportJobDto(dto({ file_name: null, status: 'expired' }))).toBe(true);
    expect(isImportJobDto({ ...dto(), object_key: 'import_quarantine/x' })).toBe(false);
    expect(isImportJobDto({ ...dto(), bytes: '10' })).toBe(false);
    expect(isImportJobDto({ ...dto(), job_id: 'nope' })).toBe(false);
    expect(isImportJobDto({ ...dto(), format: 'heic' })).toBe(false);
  });

  it('keeps uploads disabled unless IMPORT_UPLOADS_ENABLED is explicitly on', () => {
    expect(importIntakeConfigFromEnv({})).toEqual({ uploadsEnabled: false });
    expect(importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: '' })).toEqual({ uploadsEnabled: false });
    expect(importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: '0' })).toEqual({ uploadsEnabled: false });
    expect(importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: 'false' })).toEqual({ uploadsEnabled: false });
    expect(importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: '1' })).toEqual({ uploadsEnabled: true });
    expect(importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: 'true' })).toEqual({ uploadsEnabled: true });
    expect(() => importIntakeConfigFromEnv({ IMPORT_UPLOADS_ENABLED: 'yes' })).toThrow(/IMPORT_UPLOADS_ENABLED/);
  });
});

/** Settles `promise` as an outcome, or reports it still running after `ms`. */
async function within(promise: Promise<unknown>, ms: number): Promise<Problem> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Problem>((resolve) => {
    timer = setTimeout(() => resolve({ status: -1, code: 'STILL_RUNNING' }), ms);
  });
  try {
    return await Promise.race([outcome(promise), late]);
  } finally {
    clearTimeout(timer);
  }
}

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('review fixes: stalled and slow bodies', () => {
  it('a body that stops arriving is ended after the idle timeout: 408, its parts deleted, its slot freed', async () => {
    const { imports, store, intake } = setup({ idleMs: 50, maxConcurrent: 1 });
    const release = gate();
    const stalled = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.concat([SYNTHETIC.csv, Buffer.alloc(QUARANTINE_PART_BYTES, 0x61)]);
        await release.opened;
      },
    };
    try {
      expect(await within(intake.accept(session(), stalled, meta('csv')), 3_000)).toMatchObject({ status: 408, code: 'UPLOAD_INCOMPLETE', messageKey: IMPORT_TIMEOUT_MESSAGE_KEY });
      expect(imports.aborted).toEqual([{ status: 'failed', code: 'upload_stalled' }]);
      expect(store.puts).toHaveLength(1);
      expect(await store.quarantined()).toEqual([]);
      expect(await within(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')), 3_000)).toEqual({ status: 200, code: 'ACCEPTED' });
    } finally {
      release.open();
    }
  });

  it('a body that keeps trickling is ended at the absolute receive deadline: 408', async () => {
    const { imports, store, intake } = setup({ idleMs: 1_000, receiveMs: 150 });
    let dripping = true;
    const trickle = {
      async *[Symbol.asyncIterator]() {
        yield SYNTHETIC.csv;
        while (dripping) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          yield Buffer.from('2026-03-01,expense,food,1.00,drip\n');
        }
      },
    };
    try {
      expect(await within(intake.accept(session(), trickle, meta('csv')), 3_000)).toMatchObject({ status: 408, code: 'UPLOAD_INCOMPLETE', messageKey: IMPORT_TIMEOUT_MESSAGE_KEY });
      expect(imports.aborted).toEqual([{ status: 'failed', code: 'upload_timeout' }]);
      expect(await store.quarantined()).toEqual([]);
    } finally {
      dripping = false;
    }
  });

  it('a timer that fires a millisecond before the receive deadline is still a timeout: 408', async () => {
    // The wait is the time left (under idleMs), so its timer is the deadline itself. Node can fire it a millisecond
    // before Date.now() reaches the deadline, so the reason must not depend on that reading.
    const { imports, store, intake } = setup({ idleMs: 5_000, receiveMs: 100 });
    const release = gate();
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    const silent = {
      async *[Symbol.asyncIterator]() {
        // The intake has read the clock for its deadline (start + 100) and for the time left, both as the start time.
        // Its wait begins with this pull, so the reading taken once the timer fires is 1 ms short of the deadline.
        now.mockReturnValue(start + 99);
        await release.opened;
      },
    };
    try {
      expect(await within(intake.accept(session(), silent, meta('csv')), 3_000)).toMatchObject({ status: 408, code: 'UPLOAD_INCOMPLETE', messageKey: IMPORT_TIMEOUT_MESSAGE_KEY });
      expect(imports.aborted).toEqual([{ status: 'failed', code: 'upload_timeout' }]);
      expect(await store.quarantined()).toEqual([]);
    } finally {
      release.open();
      now.mockRestore();
    }
  });

  it('defaults to the published idle and receive bounds', () => {
    const { intake } = setup();
    const limits = (intake as unknown as { limits: UploadIntakeLimits }).limits;
    expect([limits.idleMs, limits.receiveMs]).toEqual([IMPORT_UPLOAD_IDLE_SECONDS * 1000, IMPORT_UPLOAD_RECEIVE_SECONDS * 1000]);
    expect(limits.maxConcurrent).toBeGreaterThanOrEqual(8 * IMPORT_QUOTAS.uploadsInProgress);
  });
});

describe('review fixes: quotas while streaming, lost replies and verification', () => {
  it('a body is refused as soon as it passes what the account may still have accepted today: 429 bytes, nothing written', async () => {
    const { imports, store, intake } = setup();
    imports.beginResult = { kind: 'started', remainingBytes: 1000 };
    imports.bytesRetryAfter = 777;
    const source = meteredStream(SYNTHETIC.csv, 5 * MiB, { chunk: 512 });
    expect(await outcome(intake.accept(session(), source.stream, meta('csv')))).toEqual({
      status: 429,
      code: 'UPLOAD_LIMIT_REACHED',
      messageKey: IMPORT_LIMIT_MESSAGE_KEYS.bytes,
      retryAfterSeconds: 777,
    });
    expect(source.pulled()).toBeLessThanOrEqual(1024);
    expect(store.puts).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'rejected', code: 'limit_bytes' }]);
    expect(imports.retryNeeds).toEqual([1024]);
  });

  it('the 12 MiB cap still answers 413 when today allows more', async () => {
    const { imports, intake } = setup();
    imports.beginResult = { kind: 'started', remainingBytes: 40 * MiB };
    expect(await outcome(intake.accept(session(), meteredStream(SYNTHETIC.csv, CAP + 1).stream, meta('csv')))).toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
    expect(imports.retryNeeds).toEqual([]);
  });

  it('a finish that committed but whose reply was lost leaves the published parts alone', async () => {
    const { imports, store, intake } = setup();
    imports.finishResult = (input) => {
      for (const part of input.parts) imports.published.add(part.key);
      throw new Error('Connection terminated unexpectedly');
    };
    await expect(intake.accept(session(), meteredStream(SYNTHETIC.csv, 1.5 * MiB).stream, meta('csv'))).rejects.toThrow('Connection terminated');
    expect(imports.published.size).toBe(2);
    expect(await store.quarantined()).toEqual([...imports.published].sort());
  });

  it('a part whose stored size or digest differs from what was written fails the upload (503) and is deleted', async () => {
    const { imports, store, intake } = setup();
    const head = store.head.bind(store);
    store.head = async (key) => {
      const info = await head(key);
      return info && { ...info, sha256: '0'.repeat(64) };
    };
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv')))).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(imports.finished).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'failed', code: 'storage_unavailable' }]);
    expect(await store.quarantined()).toEqual([]);
  });

  it('refuses CSV with a NUL after the sniffed bytes of its first chunk', async () => {
    const { imports, store, intake } = setup();
    const body = Buffer.concat([Buffer.from('date,amount,note\n'.repeat(6)), Buffer.from([0x00]), Buffer.from('tail\n')]);
    expect(body.indexOf(0)).toBeGreaterThan(64);
    expect(await outcome(intake.accept(session(), once(body).stream, meta('csv')))).toMatchObject({ status: 422, code: 'UPLOAD_TYPE_MISMATCH' });
    expect(store.puts).toEqual([]);
    expect(imports.aborted).toEqual([{ status: 'rejected', code: 'type_mismatch' }]);
  });

  it('after its file name was cleared (expiry), the same key replays its import under any name, but not under another type', async () => {
    const { imports, intake } = setup();
    const expired = dto({ status: 'expired', file_name: null });
    imports.beginResult = { kind: 'replay', upload: { dto: expired, fileName: null, declaredType: 'text/csv' } };
    await expect(intake.accept(session(), once(SYNTHETIC.csv).stream, meta('csv', { fileName: 'different.csv' }))).resolves.toEqual(expired);
    expect(await outcome(intake.accept(session(), once(SYNTHETIC.xlsx).stream, meta('xlsx')))).toMatchObject({ status: 409, code: 'IDEMPOTENCY_MISMATCH' });
  });
});

describe('review fixes: sniffing and names', () => {
  it('text that starts like a binary signature is still text; AVIF under the HEIF brand is not HEIC', () => {
    const text = (value: string) => Buffer.from(value.padEnd(64, ' '), 'latin1');
    expect(sniffImportFormat(text('GIF8 code,amount\n1,2\n'))).toBe('csv');
    expect(sniffImportFormat(text('%PDF-ref,amount\n1,2\n'))).toBe('csv');
    expect(sniffImportFormat(text('qty,ftyp,amount\n1,a,2\n'))).toBe('csv');
    expect(sniffImportFormat(text('RIFFLE,amount\n1,2\n'))).toBe('csv');
    expect(sniffImportFormat(SYNTHETIC.avifMif1)).toBe('unsupported');
    expect(sniffImportFormat(SYNTHETIC.heif)).toBe('heic');
  });

  it('accepts an emoji with its presentation selector', () => {
    expect(parseImportFileName('receipt \u2615\uFE0F.jpg')).toEqual({ name: 'receipt \u2615\uFE0F.jpg', extension: 'jpg' });
  });
});
