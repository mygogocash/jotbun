// R7 receipts: the rules a record's receipt photo follows (plan §6.5), kept
// apart from React so they are tested on their own.
//
// - A picked photo is checked on the phone (type and size) before the consent
//   sheet asks anything, and is uploaded under a plain name, never the
//   photo's own file name.
// - An attachment id comes only from a ready import preview whose cleaned
//   photo is still inside its attachable window.
// - A grant is used while it has more than a small margin left; after that a
//   new one is asked for, so no image is fetched with a grant that is about to
//   lapse.
// - Every failure maps to what the person can do. Only an outcome that may
//   have committed (or waits for room) keeps the command frozen, to be resent
//   as itself with the same key.
// - Verified bytes become an in-memory data URI; a receipt is never written
//   to the phone's storage.
import { ATTACHMENT_CONTENT_TYPES, ATTACHMENT_MAX_BYTES, IMPORT_EXTENSIONS } from '@gogospend/contracts';
import type { AttachmentContentType, AttachmentGrant, ImportPreview } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import type { ImportFile } from '../../imports.ts';

/** A photo the picker handed back: its bytes, its declared type and, for a preview, its local URI. */
export type PickedPhoto = { bytes: Uint8Array; contentType: string; uri?: string };
/** What choosing a photo came to. Nothing leaves the phone here. */
export type PickResult = { kind: 'picked'; photo: PickedPhoto } | { kind: 'cancelled' } | { kind: 'denied' } | { kind: 'unavailable' };
/** The photo picker, behind a port so tests and the catalogue never open the real one. */
export type ReceiptPicker = { pick(): Promise<PickResult> };

export type ReceiptCommandKind = 'upload' | 'retain' | 'replace' | 'remove';
export type ReceiptMode = 'attach' | 'replace';
/**
 * A command the panel sent, kept as it was sent until its outcome is known:
 * Try again resends exactly this (same key, version and body).
 */
export type ReceiptCommand =
  | { kind: 'upload'; mode: ReceiptMode; key: string; file: ImportFile }
  | { kind: 'retain' | 'replace'; key: string; version: number; attachmentId: string }
  | { kind: 'remove'; key: string; version: number };

export type ReceiptProblem =
  /** The outcome is unknown (lost answer, gateway, garbled reply): frozen, Try again resends the same command. */
  | 'unconfirmed'
  /** A switch on the server is paused for now: frozen, the same command later. */
  | 'paused'
  /** Too many at once: frozen, the same command once there is room. */
  | 'busy'
  /** The server has photo uploads switched off (`IMPORT_UPLOADS_ENABLED`): uploads answer 404. */
  | 'uploads_off'
  /** The record moved on, or no longer holds what the command expected. */
  | 'conflict'
  /** The record was deleted, purged or is not this person's. */
  | 'gone'
  /** The photo's attachable window passed. */
  | 'expired'
  /** That receipt was removed; it can never be attached again. */
  | 'removed'
  /** The server refused the photo's format. */
  | 'unsupported'
  | 'too_large'
  /** A definite refusal of this upload or command: start again. */
  | 'failed'
  /** Nothing can be sent until the person acts elsewhere (sign in, terms, update). */
  | 'blocked';

/** How long before a grant's expiry it stops being used. */
export const GRANT_MARGIN_MS = 30_000;

const EXTENSION: Readonly<Record<AttachmentContentType, string>> = {
  'image/jpeg': IMPORT_EXTENSIONS.jpeg[0],
  'image/png': IMPORT_EXTENSIONS.png[0],
  'image/webp': IMPORT_EXTENSIONS.webp[0],
};

/** The upload for a picked photo, or why it can't be one. */
export function receiptFile(photo: PickedPhoto): { ok: true; file: ImportFile } | { ok: false; reason: 'too_large' | 'unsupported' | 'empty' } {
  const contentType = photo.contentType.trim().toLowerCase();
  if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) return { ok: false, reason: 'unsupported' };
  if (photo.bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  if (photo.bytes.byteLength > ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, file: { bytes: photo.bytes, contentType, name: `receipt.${EXTENSION[contentType as AttachmentContentType]}` } };
}

/** Whether the preview's photo can be kept now, is still being prepared, or never will be. */
export function attachableFrom(preview: ImportPreview, now: Date): { kind: 'attachable'; attachmentId: string; until: string } | { kind: 'waiting' } | { kind: 'unusable' } {
  if (preview.status === 'queued' || preview.status === 'parsing') return { kind: 'waiting' };
  const image = preview.status === 'ready' ? preview.summary?.image : null;
  if (!image || image.attachable_until === null || Date.parse(image.attachable_until) <= now.getTime()) return { kind: 'unusable' };
  return { kind: 'attachable', attachmentId: image.attachment_id, until: image.attachable_until };
}

/** A grant with more than the margin left. */
export function grantUsable(grant: AttachmentGrant | null, now: Date): boolean {
  return grant !== null && Date.parse(grant.expires_at) - now.getTime() > GRANT_MARGIN_MS;
}

const PREPARE_PROBLEMS: Readonly<Record<string, ReceiptProblem>> = {
  'errors.attachment_expired': 'expired',
  'errors.attachment_removed': 'removed',
  'errors.attachment_present': 'conflict',
  'errors.attachment_missing': 'conflict',
  'errors.attachment_unchanged': 'conflict',
};

/** What a failed upload or receipt command means for the person. */
export function classifyFailure(error: unknown, kind: ReceiptCommandKind): ReceiptProblem {
  // Anything else happened after sending: it may have committed.
  if (!(error instanceof V1Error)) return 'unconfirmed';
  switch (error.outcome) {
    case 'network':
    case 'invalid_response':
      return 'unconfirmed';
    case 'unavailable':
      return error.code.endsWith('_PAUSED') ? 'paused' : 'unconfirmed';
    case 'rate_limited':
      return 'busy';
    case 'signed_out':
    case 'session_changed':
    case 'policy_required':
    case 'upgrade_required':
    case 'unsupported_platform':
    case 'schema_unsupported':
      return 'blocked';
    case 'too_large':
      return 'too_large';
    default:
      break;
  }
  if (kind === 'upload') {
    // Uploads answer 404 while the server's IMPORT_UPLOADS_ENABLED is off.
    if (error.outcome === 'not_found') return 'uploads_off';
    if (error.code === 'UPLOAD_UNSUPPORTED_TYPE' || error.code === 'UPLOAD_TYPE_MISMATCH') return 'unsupported';
    if (error.code === 'UPLOAD_TOO_LARGE') return 'too_large';
    // The same key is still streaming: wait, then resend it.
    if (error.code === 'UPLOAD_IN_PROGRESS') return 'busy';
    // UPLOAD_FAILED, UPLOAD_INCOMPLETE, UPLOAD_EMPTY: that key is spent; start again.
    return 'failed';
  }
  if (error.outcome === 'conflict') return 'conflict';
  if (error.outcome === 'deleted' || error.outcome === 'purged' || error.outcome === 'not_found') return 'gone';
  const field = error.fields?.attachment_id;
  return (field && PREPARE_PROBLEMS[field]) || 'failed';
}

/** Whether the command stays frozen, to be resent as itself (same key, version and body). */
export function freezes(problem: ReceiptProblem): boolean {
  return problem === 'unconfirmed' || problem === 'paused' || problem === 'busy';
}

/** What a frozen command says beside its Try again (English, for the panel's `tc`). */
export const FROZEN_WORDS: Readonly<Partial<Record<ReceiptProblem, string>>> = {
  unconfirmed: 'Not confirmed yet. Try again.',
  paused: 'Jotbun has paused this for a moment. Try again later.',
  busy: 'Too many photos at once. Try again in a moment.',
};

/** What a definite refusal of the photo says; any other refusal reads as `failed`. */
export const REFUSED_WORDS: Readonly<Partial<Record<ReceiptProblem, string>>> = {
  expired: "That photo can't be attached any more. Choose it again.",
  removed: "That receipt photo was removed and can't be attached again.",
  unsupported: 'Choose a JPEG, PNG or WebP photo.',
  failed: "The photo wasn't saved. Attach it again.",
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Bytes per joined piece, so a 12 MiB photo is not built one character at a time. */
const PIECE = 3 * 4096;

export function base64Of(bytes: Uint8Array): string {
  const pieces: string[] = [];
  for (let start = 0; start < bytes.length; start += PIECE) {
    const end = Math.min(start + PIECE, bytes.length);
    let piece = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i];
      const b = i + 1 < end ? bytes[i + 1] : 0;
      const c = i + 2 < end ? bytes[i + 2] : 0;
      const triple = (a << 16) | (b << 8) | c;
      piece += ALPHABET[(triple >> 18) & 63] + ALPHABET[(triple >> 12) & 63];
      piece += i + 1 < end ? ALPHABET[(triple >> 6) & 63] : '=';
      piece += i + 2 < end ? ALPHABET[triple & 63] : '=';
    }
    pieces.push(piece);
  }
  return pieces.join('');
}

/** The image as a data URI, held in memory only. */
export function dataUriOf(contentType: string, bytes: Uint8Array): string {
  return `data:${contentType};base64,${base64Of(bytes)}`;
}
