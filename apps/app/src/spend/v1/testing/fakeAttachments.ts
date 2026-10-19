// In-memory P2c receipts for render tests and the catalogue (R7): the
// attachment commands on a record (retain, replace, remove) with versions,
// conflicts and the server's state refusals; image uploads whose preview
// becomes ready with an attachable photo; five-minute grants on a clock the
// test moves, so a grant expires; a photo picker; scripted failures, held
// calls and commits whose answer is lost. Records are shared with
// `createFakeResources`, so a record read shows the receipt it holds and its
// new version. It mirrors the server's rules only as far as the screen needs.
// Test and development use only.
import { ATTACHMENT_DOWNLOAD_PATH, ATTACHMENT_GRANT_MINUTES } from '@gogospend/contracts';
import type { AttachmentContentType, AttachmentGrant, CommandAck, ImportFormat, ImportJobDto, ImportPreview, TransactionDto } from '@gogospend/contracts';

import { V1Error } from '../../../api/client';
import type { V1Outcome } from '../../../api/client';
import type { AttachmentResources } from '../attachments';
import type { ImportFile, ImportResources } from '../imports';
import type { PickResult, PickedPhoto, ReceiptPicker } from '../redesign/import/receiptModel';

export type FakeReceiptUploads = Pick<ImportResources, 'upload' | 'preview'>;
export type FakeAttachmentMethod = keyof AttachmentResources | 'upload' | 'preview' | 'pick';
export type FakeAttachmentCall = { method: FakeAttachmentMethod; args: unknown[] };

/** 2026-09-29 10:00 in Bangkok, the catalogue's and the render tests' "now". */
export const FAKE_RECEIPT_START = new Date('2026-09-29T03:00:00.000Z');

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAADwAAABaCAIAAABrM6JiAAAA40lEQVR42u3bQQqDMBRFUffRQQfdhVvphjvrJlxEJ2JThOLEkkpq/5cDDwkK5oGXS0Kwu9+Gkml8lKQYl2v3vpslr9K5Gs/JWTolHpjGdBOmz9fp12nPdKDS9R8lSOnvmA5Umqd52toD022ZnncKldk29+Y35yy99iBs6SN6erkB/uOAp3map3map3map3map3map3map3map3map3map3map3map3na2bizcUxHYfpy6iME05jem+nKmXZiOnTpNTzClv7EdOjSh2Kap3naehrTmMY0pjGNaUxjGtOhmE73s/sTBWY5P4Bh14kAAAAASUVORK5CYII=';

/** Base64 to bytes, without Buffer (the catalogue runs on a phone). */
function bytesOf(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of clean) {
    value = (value << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (value >> bits) & 0xff;
      index += 1;
    }
  }
  return out;
}

/** A small real PNG of a paper receipt (60 × 90), for the picker and the thumbnails. */
export const SAMPLE_RECEIPT_PNG: Uint8Array = bytesOf(SAMPLE_PNG_BASE64);
export const SAMPLE_PHOTO: PickedPhoto = { bytes: SAMPLE_RECEIPT_PNG, contentType: 'image/png', uri: 'file:///fake/receipt.png' };

/** Not a real SHA-256 (the fake stands after the adapter's digest check): a stable 64-hex stand-in. */
function standInDigest(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
}

type Image = { bytes: Uint8Array; contentType: AttachmentContentType; attachableUntil: number; status: 'preview' | 'retained' | 'released' };
type Job = { id: string; attachmentId: string; format: ImportFormat; statuses: ImportPreview['status'][]; receivedAt: string; bytes: number };

const FORMATS: Readonly<Record<AttachmentContentType, ImportFormat>> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const MINUTE = 60_000;

export function createFakeAttachments(options: { records: Map<string, TransactionDto>; now?: () => Date; photo?: PickedPhoto }) {
  const { records } = options;
  let clock = FAKE_RECEIPT_START.getTime();
  const now = () => options.now?.() ?? new Date(clock);
  const images = new Map<string, Image>();
  const jobs = new Map<string, Job>();
  const grants = new Map<string, { attachmentId: string; expiresAt: number }>();
  const replies = new Map<string, unknown>();
  const calls: FakeAttachmentCall[] = [];
  const failures = new Map<FakeAttachmentMethod, V1Error[]>();
  const afterCommit = new Map<FakeAttachmentMethod, V1Error[]>();
  const pending = new Map<FakeAttachmentMethod, Promise<void>>();
  const picks: PickResult[] = [];
  /** Preview states each new upload passes through before `ready` (or ends on). */
  let previewSteps: ImportPreview['status'][] = ['parsing'];
  let uploadsOn = true;
  let sequence = 0;
  let revision = 200;
  const id = (prefix: string) => {
    sequence += 1;
    return `${prefix}-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
  };

  async function step(method: FakeAttachmentMethod, args: unknown[]) {
    calls.push({ method, args });
    await pending.get(method);
    const failure = failures.get(method)?.shift();
    if (failure) throw failure;
  }
  /** Runs once per key (a resend replays the first answer), then any lost answer. */
  async function once<T>(method: FakeAttachmentMethod, key: string, run: () => T): Promise<T> {
    const result = (replies.has(key) ? replies.get(key) : run()) as T;
    replies.set(key, result);
    const lost = afterCommit.get(method)?.shift();
    if (lost) throw lost;
    return result;
  }

  const notFound = () => new V1Error('not_found', 404, 'NOT_FOUND');
  const stateProblem = (key: string) => new V1Error('invalid', 422, 'VALIDATION_FAILED', { fields: { attachment_id: key } });
  function liveRecord(recordId: string, version: number): TransactionDto {
    const record = records.get(recordId);
    if (!record) throw notFound();
    if (record.deleted_at) throw new V1Error('deleted', 409, 'ENTITY_DELETED');
    if (record.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...record } });
    return record;
  }
  /** The receipt is kept (newly, from a preview inside its window, or already). */
  function keep(attachmentId: string) {
    const image = images.get(attachmentId);
    if (!image) throw notFound();
    if (image.status === 'released') throw stateProblem('errors.attachment_removed');
    if (image.status === 'preview' && image.attachableUntil <= now().getTime()) throw stateProblem('errors.attachment_expired');
    image.status = 'retained';
  }
  const heldByActive = (attachmentId: string) => [...records.values()].some((record) => record.attachment_id === attachmentId && !record.deleted_at);
  const heldByAny = (attachmentId: string) => [...records.values()].some((record) => record.attachment_id === attachmentId);
  function releaseIfUnheld(attachmentId: string) {
    const image = images.get(attachmentId);
    if (image && !heldByAny(attachmentId)) image.status = 'released';
  }
  function moved(record: TransactionDto, attachmentId: string | null, commandId: string): CommandAck {
    const { attachment_id: _held, ...rest } = record;
    const next = { ...rest, version: record.version + 1, ...(attachmentId ? { attachment_id: attachmentId } : {}) } as TransactionDto;
    records.set(record.id, next);
    revision += 1;
    return { command_id: commandId, entity_id: record.id, version: next.version, committed_revision: String(revision), outcome: 'updated', entity_state: 'active' };
  }

  const attachments: AttachmentResources = {
    async retain(recordId, version, input, commandId) {
      await step('retain', [recordId, version, { ...input }, commandId]);
      return once('retain', commandId, () => {
        const record = liveRecord(recordId, version);
        if (record.attachment_id) throw stateProblem('errors.attachment_present');
        keep(input.attachment_id);
        return moved(record, input.attachment_id, commandId);
      });
    },
    async replace(recordId, version, input, commandId) {
      await step('replace', [recordId, version, { ...input }, commandId]);
      return once('replace', commandId, () => {
        const record = liveRecord(recordId, version);
        const previous = record.attachment_id;
        if (!previous) throw stateProblem('errors.attachment_missing');
        if (previous === input.attachment_id) throw stateProblem('errors.attachment_unchanged');
        keep(input.attachment_id);
        const ack = moved(record, input.attachment_id, commandId);
        releaseIfUnheld(previous);
        return ack;
      });
    },
    async remove(recordId, version, commandId) {
      await step('remove', [recordId, version, commandId]);
      return once('remove', commandId, () => {
        const record = liveRecord(recordId, version);
        const previous = record.attachment_id;
        if (!previous) throw stateProblem('errors.attachment_missing');
        const ack = moved(record, null, commandId);
        releaseIfUnheld(previous);
        return ack;
      });
    },
    async grant(attachmentId) {
      await step('grant', [attachmentId]);
      const image = images.get(attachmentId);
      if (!image || image.status !== 'retained' || !heldByActive(attachmentId)) throw notFound();
      const token = `grant${(sequence += 1)}`;
      const expiresAt = now().getTime() + ATTACHMENT_GRANT_MINUTES * MINUTE;
      grants.set(token, { attachmentId, expiresAt });
      return { url: `${ATTACHMENT_DOWNLOAD_PATH}${token}`, expires_at: new Date(expiresAt).toISOString(), content_type: image.contentType, bytes: image.bytes.byteLength, sha256: standInDigest(image.bytes) };
    },
    async file(grant: AttachmentGrant) {
      await step('file', [grant]);
      const issued = grants.get(grant.url.slice(ATTACHMENT_DOWNLOAD_PATH.length));
      // An expired, foreign or unknown grant, and a receipt no active record holds, are the same 404.
      if (!issued || issued.expiresAt <= now().getTime()) throw notFound();
      const image = images.get(issued.attachmentId);
      if (!image || image.status !== 'retained' || !heldByActive(issued.attachmentId)) throw notFound();
      return new Uint8Array(image.bytes);
    },
  };

  const uploads: FakeReceiptUploads = {
    async upload(file: ImportFile, commandId: string) {
      await step('upload', [{ ...file, bytes: file.bytes.byteLength }, commandId]);
      // While IMPORT_UPLOADS_ENABLED is off the route answers 404, before anything is read.
      if (!uploadsOn) throw notFound();
      return once('upload', commandId, (): ImportJobDto => {
        const contentType = file.contentType as AttachmentContentType;
        const attachmentId = id('a77ac400');
        const at = now().getTime();
        // The server's window: the image's 24 hours, less 2 minutes.
        images.set(attachmentId, { bytes: new Uint8Array(file.bytes), contentType, attachableUntil: at + (24 * 60 - 2) * MINUTE, status: 'preview' });
        const job: Job = { id: id('10b00000'), attachmentId, format: FORMATS[contentType] ?? 'jpeg', statuses: [...previewSteps], receivedAt: new Date(at).toISOString(), bytes: file.bytes.byteLength };
        jobs.set(job.id, job);
        return { job_id: job.id, status: 'queued', format: job.format, file_name: file.name, bytes: job.bytes, received_at: job.receivedAt, expires_at: new Date(at + 24 * 60 * MINUTE).toISOString() };
      });
    },
    async preview(jobId: string) {
      await step('preview', [jobId]);
      const job = jobs.get(jobId);
      if (!job) throw notFound();
      // Queued and parsing pass with each read; a final state (failed, rejected, …) stays; then ready.
      const next = job.statuses[0];
      const status: ImportPreview['status'] = next ?? 'ready';
      if (next === 'queued' || next === 'parsing') job.statuses.shift();
      const image = images.get(job.attachmentId);
      if (status !== 'ready' || !image) {
        return { job_id: jobId, status, candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null };
      }
      const attachable = image.status !== 'released' && image.attachableUntil > now().getTime();
      return {
        job_id: jobId, status, issues: [{ code: 'receipt_fields_unread', source_row_id: null, field: null }], duplicate_advice: [], review_revision: '1',
        expires_at: new Date(image.attachableUntil + 2 * MINUTE).toISOString(),
        candidates: [{ source_row_id: 'image:1', ordinal: 1, occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, review_required: true }],
        summary: {
          layout: 'receipt', candidate_count: 1, review_required_count: 1, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' },
          image: { width: 60, height: 90, attachment_id: job.attachmentId, attachable_until: attachable ? new Date(image.attachableUntil).toISOString() : null },
        },
      };
    },
  };

  const picker: ReceiptPicker = {
    async pick(): Promise<PickResult> {
      await step('pick', []);
      return picks.shift() ?? { kind: 'picked', photo: options.photo ?? SAMPLE_PHOTO };
    },
  };

  return {
    attachments,
    uploads,
    picker,
    calls,
    callsOf: (method: FakeAttachmentMethod) => calls.filter((call) => call.method === method),
    now,
    /** Moves the fake clock (grants and attachable windows follow it). */
    advance(ms: number) {
      clock += ms;
    },
    /** A record already holding a kept receipt (its version unchanged); returns the receipt's id. */
    seedReceipt(recordId: string, photo: { bytes: Uint8Array; contentType: AttachmentContentType } = { bytes: SAMPLE_RECEIPT_PNG, contentType: 'image/png' }): string {
      const record = records.get(recordId);
      if (!record) throw new Error(`no record ${recordId}`);
      const attachmentId = id('a77ac400');
      images.set(attachmentId, { ...photo, attachableUntil: 0, status: 'retained' });
      records.set(recordId, { ...record, attachment_id: attachmentId });
      return attachmentId;
    },
    /** Whether a receipt is still kept, waiting in a preview, or released (its photo deleted). */
    statusOf: (attachmentId: string) => images.get(attachmentId)?.status ?? null,
    /** The states each later upload's preview passes through (the last one stays; `ready` when none is left). */
    setPreviewSteps(steps: ImportPreview['status'][]) {
      previewSteps = [...steps];
    },
    /** The server's IMPORT_UPLOADS_ENABLED: off answers 404 to every upload. */
    setUploadsEnabled(on: boolean) {
      uploadsOn = on;
    },
    /** What the next picks return (afterwards: the sample photo). */
    queuePick(...next: PickResult[]) {
      picks.push(...next);
    },
    /** The next call(s) of `method` fail with these outcomes, before anything changes. */
    fail(method: FakeAttachmentMethod, outcome: V1Outcome, extra: { status?: number; code?: string; fields?: Record<string, string>; current?: unknown; retryAfterSeconds?: number } = {}) {
      const list = failures.get(method) ?? [];
      list.push(new V1Error(outcome, extra.status ?? 0, extra.code ?? outcome.toUpperCase(), extra));
      failures.set(method, list);
    },
    /** The next call of `method` commits, then its answer is lost (or arrives unreadable). */
    loseResponse(method: FakeAttachmentMethod, outcome: V1Outcome = 'network') {
      const list = afterCommit.get(method) ?? [];
      list.push(new V1Error(outcome, 0, outcome === 'network' ? 'NETWORK_ERROR' : 'INVALID_RESPONSE'));
      afterCommit.set(method, list);
    },
    /** Holds `method` until the returned release is called. */
    hold(method: FakeAttachmentMethod): () => void {
      let release!: () => void;
      pending.set(method, new Promise<void>((resolve) => { release = resolve; }));
      return () => {
        pending.delete(method);
        release();
      };
    },
  };
}

export type FakeAttachments = ReturnType<typeof createFakeAttachments>;
