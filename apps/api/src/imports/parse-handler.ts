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
// reason: it fails visibly and never retries a poison file. Nothing here (or
// in the parser) can reach the transaction repository: the worker login has
// no financial privileges at all.
import { createHash } from 'node:crypto';

import {
  IMPORT_FILE_ISSUE_CODES,
  IMPORT_IMAGE_TTL_HOURS,
  IMPORT_PARSER_MEMORY_BUDGET_MIB,
  bangkokDate,
  normalizeMerchant,
  normalizeName,
  normalizeNote,
} from '@gogospend/contracts';
import type { Pool } from 'pg';

import type { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob, JobLease } from '../jobs/job-types';
import type { ObjectPublicationService, PublishedObject } from '../storage/object-publication.service';
import { ObjectStoreError } from '../storage/object-store';
import type { ObjectStore } from '../storage/object-store';
import { ParserRunner } from './parser-runner';
import type { ParserRunOutcome, ParserRunnerPort } from './parser-runner';
import { IMAGE_FORMATS, LIMITS, TABLE_FORMATS } from './parsers/protocol';
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
export type PreviewRecord = {
  preview: { status: 'ready' | 'rejected'; layout: Layout | null; issues: string[]; image: { width: number; height: number } | null };
  candidates: CandidateRecord[];
};

export type ParseHandlerDeps = { jobs: JobRepository; publication: ObjectPublicationService; store: ObjectStore; pool: Pool };
export type ParseHandlerOptions = { runner?: ParserRunnerPort; memoryBudgetKb?: number };

type Source = { format: ParseFormat; bytes: number; sha256: string; partCount: number; expiresAt: Date; parts: { key: string; bytes: number; sha256: string }[] };
type SourceRow = { format: string; bytes: string; sha256: string; part_count: number; expires_at: Date; part_keys: string[]; part_bytes: string[]; part_sha256: string[] };

const FILE_ISSUES: readonly string[] = IMPORT_FILE_ISSUE_CODES;
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
const rejected = (code: string): PreviewRecord => ({ preview: { status: 'rejected', layout: null, issues: [code], image: null }, candidates: [] });

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
    preview: { status: 'ready', layout: result.layout, issues, image: result.image ? { width: result.image.width, height: result.image.height } : null },
    candidates,
  };
}

export class ParseHandler {
  private readonly runner: ParserRunnerPort;
  private readonly memoryBudgetKb: number;

  constructor(
    private readonly deps: ParseHandlerDeps,
    options: ParseHandlerOptions = {},
  ) {
    this.runner = options.runner ?? new ParserRunner();
    this.memoryBudgetKb = options.memoryBudgetKb ?? IMPORT_PARSER_MEMORY_BUDGET_MIB * 1024;
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
    let bytes: Buffer;
    try {
      bytes = await this.readQuarantine(source, lease.signal);
    } catch (error) {
      if (!(error instanceof QuarantineError)) throw error;
      if (await jobs.isHeld(lease)) await jobs.fail(lease, { code: error.code, retryable: error.retryable });
      return;
    }
    const outcome = await this.runner.run({ format: source.format, bytes, today: bangkokDate(new Date()), signal: lease.signal });
    // The lease was lost or the worker is stopping: the worker requeues (or the job is already gone).
    if (outcome.kind === 'aborted') throw new Error('parse aborted');
    const { record, image } = this.recordFor(source.format, outcome);
    await this.finish(lease, record, image);
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

  private recordFor(format: ParseFormat, outcome: Exclude<ParserRunOutcome, { kind: 'aborted' }>): { record: PreviewRecord; image: SanitizedImage | null } {
    switch (outcome.kind) {
      case 'timeout':
        return { record: rejected('parse_timeout'), image: null };
      case 'output_too_large':
        return { record: rejected('parse_resource_limit'), image: null };
      case 'crashed':
      case 'output_invalid':
        return { record: rejected('parse_failed'), image: null };
    }
    const result = outcome.result;
    if (result.usage.max_rss_kb > this.memoryBudgetKb) return { record: rejected('parse_resource_limit'), image: null };
    if (!result.ok) return { record: rejected(FILE_ISSUES.includes(result.code) ? result.code : 'parse_failed'), image: null };
    // A table file never yields an image; an image file yields exactly its own sanitized format.
    const image = result.image;
    const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format);
    if (expectsImage !== (image !== null) || (image !== null && image.format !== format)) return { record: rejected('parse_failed'), image: null };
    if (!image) return { record: toPreviewRecord(result), image: null };
    const bytes = Buffer.from(image.base64, 'base64');
    // The bytes must really be the declared format (magic bytes), within the upload cap.
    if (bytes.length === 0 || bytes.length > LIMITS.inputBytes || magicFormat(bytes) !== image.format) return { record: rejected('parse_failed'), image: null };
    return { record: toPreviewRecord(result), image: { bytes, format: image.format } };
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

type SanitizedImage = { bytes: Buffer; format: ImageFormat };

function magicFormat(image: Buffer): ImageFormat | null {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'jpeg';
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (image.length >= 12 && image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
