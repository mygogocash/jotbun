// P2b: the worker's import_parse handler. One run per accepted upload:
//   1. gogospend_import_parse_source (current lease, active account, upload
//      accepted and its raw file not expired) names the quarantine parts in
//      order; each part's size and SHA-256, and the whole file's, must match
//      the registry and the upload record before anything is parsed;
//   2. the file is parsed in a separate, killable child process
//      (parser-runner); the worker never parses uploaded content itself;
//   3. the child's output is re-validated and its text normalized with the
//      transaction rules (a value that does not fit becomes NULL with an
//      issue, never a guess);
//   4. a sanitized image is reserved, PUT and published for 24 hours, and the
//      preview, candidates and its 7-day expiry job are recorded - all in
//      P1's fenced completion transaction, so a lease lost on the way
//      publishes and records nothing (the sweep deletes the late object).
// A file the parser cannot read, a child that times out, crashes, floods its
// output or exceeds the memory budget gives a `rejected` preview with the
// reason: it fails visibly and never retries a poison file. A child that
// could not be started, or a runtime whose parser sandbox does not hold
// (parser-runner), fails the job retryably and records nothing. A sanitized
// image is read again here: its own header must give the size the child
// claimed and carry no metadata, or nothing is published. Nothing here (or
// in the parser) can reach the transaction repository: the worker login has
// no financial privileges at all.
// What a run's outcome means as a preview, and the image checks, are in
// parse-outcome.ts, which the stateless parse server (parse-server.ts) shares.
import { createHash } from 'node:crypto';

import { IMPORT_IMAGE_TTL_HOURS, bangkokDate } from '@gogospend/contracts';
import type { Pool } from 'pg';

import type { FeatureGates } from '../common/feature-gates';
import type { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob, JobLease } from '../jobs/job-types';
import type { ObjectPublicationService, PublishedObject } from '../storage/object-publication.service';
import { ObjectStoreError } from '../storage/object-store';
import type { ObjectStore } from '../storage/object-store';
import { previewFromOutcome } from './parse-outcome';
import type { PreviewRecord, SanitizedImage } from './parse-outcome';
import { PARSER_CHILD_MEMORY_MIB, ParserRunner } from './parser-runner';
import type { ParserRunnerPort } from './parser-runner';
import { IMAGE_FORMATS, TABLE_FORMATS } from './parsers/protocol';
import type { ImageFormat, ParseFormat } from './parsers/protocol';

// The preview types and checks moved to parse-outcome.ts; re-exported so existing imports keep working.
export type { CandidateRecord, PreviewRecord } from './parse-outcome';
export { sanitizedImageHeader, toPreviewRecord } from './parse-outcome';

export type ParseHandlerDeps = { jobs: JobRepository; publication: ObjectPublicationService; store: ObjectStore; pool: Pool };
/** `gates`: while its `ocr` scope is paused, an image parse is released (attempt-neutral) instead of run. */
export type ParseHandlerOptions = { runner?: ParserRunnerPort; memoryBudgetKb?: number; gates?: FeatureGates };

type Source = { format: ParseFormat; bytes: number; sha256: string; partCount: number; expiresAt: Date; parts: { key: string; bytes: number; sha256: string }[] };
type SourceRow = { format: string; bytes: string; sha256: string; part_count: number; expires_at: Date; part_keys: string[]; part_bytes: string[]; part_sha256: string[] };

// A parse must not start on a raw file about to expire (the expiry job may delete it mid-read).
const MIN_RAW_LIFETIME_MS = 5 * 60_000;
const IMAGE_EXTENSIONS: Readonly<Record<ImageFormat, string>> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const IMAGE_TYPES: Readonly<Record<ImageFormat, string>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

class QuarantineError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export class ParseHandler {
  private readonly runner: ParserRunnerPort;
  private readonly memoryBudgetKb: number;
  private readonly gates: FeatureGates | undefined;

  constructor(
    private readonly deps: ParseHandlerDeps,
    options: ParseHandlerOptions = {},
  ) {
    this.runner = options.runner ?? new ParserRunner();
    this.memoryBudgetKb = options.memoryBudgetKb ?? PARSER_CHILD_MEMORY_MIB * 1024;
    this.gates = options.gates;
  }

  async run(job: ClaimedJob): Promise<void> {
    const { jobs } = this.deps;
    const lease = job.lease;
    const source = await this.source(lease);
    if (!source || source.expiresAt.getTime() - Date.now() < MIN_RAW_LIFETIME_MS) {
      // Not this lease's, the account changed, or the raw file is (nearly) gone: never parse it.
      if (await jobs.isHeld(lease)) await jobs.fail(lease, { code: 'import_unavailable', retryable: false });
      return;
    }
    // An OCR pause parks image parses only (spreadsheets are unaffected): given back with
    // their attempt, held for the retry-after so the worker does not claim the job again at once.
    // Checked after the expiry test above, so a raw file about to expire still fails visibly.
    if (this.gates?.isPaused('ocr') && (IMAGE_FORMATS as readonly string[]).includes(source.format)) {
      await jobs.release(lease, 'ocr_paused', { delaySeconds: this.gates.retryAfterSeconds });
      return;
    }
    let bytes: Buffer;
    try {
      bytes = await this.readQuarantine(source, lease.signal);
    } catch (error) {
      if (!(error instanceof QuarantineError)) throw error;
      if (await jobs.isHeld(lease)) await jobs.fail(lease, { code: error.code, retryable: error.retryable });
      return;
    }
    const outcome = await this.runner.run({ format: source.format, bytes, today: bangkokDate(new Date()), signal: lease.signal });
    const decided = previewFromOutcome(source.format, outcome, this.memoryBudgetKb, bangkokDate(new Date()));
    // The lease was lost or the worker is stopping: the worker requeues (or the job is already gone).
    if (decided.kind === 'aborted') throw new Error('parse aborted');
    // Not the file's fault: no child could be started, or this runtime cannot sandbox one. Retry; record nothing.
    if (decided.kind === 'retry') {
      if (await jobs.isHeld(lease)) await jobs.fail(lease, { code: decided.code, retryable: true });
      return;
    }
    await this.finish(lease, decided.record, decided.image);
  }

  private async source(lease: JobLease): Promise<Source | null> {
    const { rows } = await this.deps.pool.query<SourceRow>('SELECT * FROM gogospend_import_parse_source($1, $2)', [lease.jobId, lease.leaseToken]);
    const row = rows[0];
    const formats: readonly string[] = [...TABLE_FORMATS, ...IMAGE_FORMATS];
    if (!row || !formats.includes(row.format)) return null;
    return {
      format: row.format as ParseFormat,
      bytes: Number(row.bytes),
      sha256: row.sha256,
      partCount: row.part_count,
      expiresAt: row.expires_at,
      parts: row.part_keys.map((key, index) => ({ key, bytes: Number(row.part_bytes[index]), sha256: row.part_sha256[index] })),
    };
  }

  private async readQuarantine(source: Source, signal: AbortSignal): Promise<Buffer> {
    if (source.parts.length !== source.partCount) throw new QuarantineError('quarantine_missing', false);
    const parts: Buffer[] = [];
    for (const part of source.parts) {
      signal.throwIfAborted();
      let data: Uint8Array | null;
      try {
        data = await this.deps.store.get(part.key);
      } catch (error) {
        if (error instanceof ObjectStoreError) throw new QuarantineError('storage_unavailable', true);
        throw error;
      }
      if (data === null) throw new QuarantineError('quarantine_missing', false);
      if (data.byteLength !== part.bytes || sha256(data) !== part.sha256) throw new QuarantineError('quarantine_corrupt', false);
      parts.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    }
    const whole = Buffer.concat(parts);
    if (whole.length !== source.bytes || sha256(whole) !== source.sha256) throw new QuarantineError('quarantine_corrupt', false);
    return whole;
  }

  private async finish(lease: JobLease, record: PreviewRecord, image: SanitizedImage | null): Promise<void> {
    const { jobs, publication, store } = this.deps;
    const objects: PublishedObject[] = [];
    let imageKey: string | null = null;
    if (image) {
      imageKey = await publication.reserve(lease, 'import_image', `image.${IMAGE_EXTENSIONS[image.format]}`);
      const written = await store.putStream(imageKey, image.bytes, { contentType: IMAGE_TYPES[image.format], signal: lease.signal });
      objects.push({ key: imageKey, bytes: written.bytes, sha256: written.sha256 });
    }
    const preview = {
      status: record.preview.status,
      layout: record.preview.layout,
      issues: record.preview.issues,
      image_key: imageKey,
      image_width: record.preview.image?.width ?? null,
      image_height: record.preview.image?.height ?? null,
    };
    const expiresAt = new Date(Date.now() + IMPORT_IMAGE_TTL_HOURS * 3_600_000);
    const done = await publication.finishWithObjects(jobs, lease, objects, expiresAt, async (client) => {
      const { rows } = await client.query<{ ok: boolean }>('SELECT gogospend_record_import_preview($1, $2, $3::jsonb, $4::jsonb) AS ok', [
        lease.jobId,
        lease.leaseToken,
        JSON.stringify(preview),
        JSON.stringify(record.candidates),
      ]);
      return rows[0]?.ok === true;
    });
    // Not recorded but still held: retry. Not held: the lease was lost and its late object is swept.
    if (!done && (await jobs.isHeld(lease))) await jobs.fail(lease, { code: 'preview_not_recorded', retryable: true });
  }
}
