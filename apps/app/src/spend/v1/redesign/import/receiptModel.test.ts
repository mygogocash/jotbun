// R7 receipts: the rules RecordReceipt follows, without React. A picked photo
// is checked on the phone before anything is asked or sent; a preview only
// gives an attachment id once it is ready with a photo still attachable; a
// grant is used only while it has time left; every failure maps to what the
// person can do (and whether the command stays frozen for Try again); and the
// verified bytes become an in-memory data URI, never a file.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ATTACHMENT_MAX_BYTES } from '@gogospend/contracts';
import type { AttachmentGrant, ImportPreview } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import { untranslated } from '../testing/catalog.ts';
import { FROZEN_WORDS, GRANT_MARGIN_MS, REFUSED_WORDS, attachableFrom, base64Of, classifyFailure, dataUriOf, freezes, grantUsable, receiptFile } from './receiptModel.ts';

const NOW = new Date('2026-09-29T03:00:00.000Z');
const JOB = '7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';
const RECEIPT = '9e8d7c6b-5a49-4382-a716-151413121110';

test('a picked photo becomes an upload of a plain name and its own type, inside the size cap', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(receiptFile({ bytes, contentType: 'image/jpeg' }), { ok: true, file: { bytes, contentType: 'image/jpeg', name: 'receipt.jpg' } });
  assert.deepEqual(receiptFile({ bytes, contentType: 'image/png', uri: 'file:///IMG_0042.PNG' }), { ok: true, file: { bytes, contentType: 'image/png', name: 'receipt.png' } });
  assert.deepEqual(receiptFile({ bytes, contentType: 'IMAGE/WEBP' }), { ok: true, file: { bytes, contentType: 'image/webp', name: 'receipt.webp' } });
  assert.deepEqual(receiptFile({ bytes, contentType: 'image/heic' }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(receiptFile({ bytes, contentType: 'application/pdf' }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(receiptFile({ bytes: new Uint8Array(0), contentType: 'image/jpeg' }), { ok: false, reason: 'empty' });
  assert.deepEqual(receiptFile({ bytes: new Uint8Array(ATTACHMENT_MAX_BYTES + 1), contentType: 'image/jpeg' }), { ok: false, reason: 'too_large' });
  assert.equal(receiptFile({ bytes: new Uint8Array(ATTACHMENT_MAX_BYTES), contentType: 'image/jpeg' }).ok, true);
});

function preview(status: ImportPreview['status'], image: { attachable_until: string | null } | null): ImportPreview {
  const ready = status === 'ready';
  return {
    job_id: JOB, status, candidates: [], issues: [], duplicate_advice: [], review_revision: ready ? '1' : null, expires_at: ready ? '2026-09-30T03:00:00.000Z' : null,
    summary: ready ? { layout: 'receipt', candidate_count: 1, review_required_count: 1, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' }, image: image ? { width: 600, height: 900, attachment_id: RECEIPT, ...image } : null } : null,
  };
}

test('only a ready preview with a photo still inside its window gives an attachment id', () => {
  assert.deepEqual(attachableFrom(preview('ready', { attachable_until: '2026-09-30T02:58:00.000Z' }), NOW), { kind: 'attachable', attachmentId: RECEIPT, until: '2026-09-30T02:58:00.000Z' });
  for (const status of ['queued', 'parsing'] as const) assert.deepEqual(attachableFrom(preview(status, null), NOW), { kind: 'waiting' });
  for (const status of ['rejected', 'failed', 'cancelled', 'expired'] as const) assert.deepEqual(attachableFrom(preview(status, null), NOW), { kind: 'unusable' });
  assert.deepEqual(attachableFrom(preview('ready', null), NOW), { kind: 'unusable' });
  assert.deepEqual(attachableFrom(preview('ready', { attachable_until: null }), NOW), { kind: 'unusable' });
  assert.deepEqual(attachableFrom(preview('ready', { attachable_until: '2026-09-29T03:00:00.000Z' }), NOW), { kind: 'unusable' });
});

test('a grant is used only while it has more than the margin left', () => {
  const grant = (expires: string): AttachmentGrant => ({ url: '/v1/attachment-files/abc', expires_at: expires, content_type: 'image/png', bytes: 3, sha256: 'a'.repeat(64) });
  assert.equal(grantUsable(null, NOW), false);
  assert.equal(grantUsable(grant('2026-09-29T03:05:00.000Z'), NOW), true);
  assert.equal(grantUsable(grant(new Date(NOW.getTime() + GRANT_MARGIN_MS + 1).toISOString()), NOW), true);
  assert.equal(grantUsable(grant(new Date(NOW.getTime() + GRANT_MARGIN_MS).toISOString()), NOW), false);
  assert.equal(grantUsable(grant('2026-09-29T02:59:59.000Z'), NOW), false);
});

const problem = (outcome: ConstructorParameters<typeof V1Error>[0], status: number, code: string, extra: ConstructorParameters<typeof V1Error>[3] = {}) => new V1Error(outcome, status, code, extra);

test('an upload: unknown outcomes freeze, a switched-off server says so, the photo\'s own refusals start over', () => {
  const cases: [unknown, string][] = [
    [problem('network', 0, 'NETWORK_ERROR'), 'unconfirmed'],
    [problem('invalid_response', 202, 'INVALID_RESPONSE'), 'unconfirmed'],
    [problem('unavailable', 502, 'HTTP_502'), 'unconfirmed'],
    [new Error('boom'), 'unconfirmed'],
    [problem('unavailable', 503, 'UPLOADS_PAUSED', { retryAfterSeconds: 300 }), 'paused'],
    [problem('unavailable', 503, 'OCR_PAUSED', { retryAfterSeconds: 300 }), 'paused'],
    [problem('rate_limited', 429, 'UPLOAD_LIMIT_REACHED', { retryAfterSeconds: 60 }), 'busy'],
    [problem('not_found', 404, 'NOT_FOUND'), 'uploads_off'],
    [problem('invalid', 415, 'UPLOAD_UNSUPPORTED_TYPE'), 'unsupported'],
    [problem('invalid', 422, 'UPLOAD_TYPE_MISMATCH'), 'unsupported'],
    // As the transport classifies them: a 413 and a 409 the outcome table does not name.
    [problem('invalid', 413, 'UPLOAD_TOO_LARGE'), 'too_large'],
    [problem('conflict', 409, 'UPLOAD_IN_PROGRESS', { retryAfterSeconds: 5 }), 'busy'],
    [problem('conflict', 409, 'UPLOAD_FAILED'), 'failed'],
    [problem('invalid', 422, 'UPLOAD_EMPTY'), 'failed'],
    [problem('invalid', 408, 'UPLOAD_INCOMPLETE'), 'failed'],
    [problem('signed_out', 401, 'SESSION_REQUIRED'), 'blocked'],
    [problem('policy_required', 403, 'POLICY_ACCEPTANCE_REQUIRED'), 'blocked'],
    [problem('upgrade_required', 426, 'CLIENT_UPGRADE_REQUIRED'), 'blocked'],
    [problem('session_changed', 0, 'SESSION_CHANGED'), 'blocked'],
  ];
  for (const [error, expected] of cases) assert.equal(classifyFailure(error, 'upload'), expected, error instanceof V1Error ? error.code : String(error));
});

test('a receipt command: the record moved on, went away, or the photo can no longer be kept', () => {
  const field = (key: string) => problem('invalid', 422, 'VALIDATION_FAILED', { fields: { attachment_id: key } });
  for (const kind of ['retain', 'replace', 'remove'] as const) {
    assert.equal(classifyFailure(problem('network', 0, 'TIMEOUT'), kind), 'unconfirmed');
    assert.equal(classifyFailure(problem('unavailable', 503, 'WRITES_PAUSED'), kind), 'paused');
    assert.equal(classifyFailure(problem('conflict', 409, 'VERSION_CONFLICT'), kind), 'conflict');
    assert.equal(classifyFailure(field('errors.attachment_present'), kind), 'conflict');
    assert.equal(classifyFailure(field('errors.attachment_missing'), kind), 'conflict');
    assert.equal(classifyFailure(field('errors.attachment_unchanged'), kind), 'conflict');
    assert.equal(classifyFailure(problem('deleted', 409, 'ENTITY_DELETED'), kind), 'gone');
    assert.equal(classifyFailure(problem('purged', 410, 'ENTITY_PURGED'), kind), 'gone');
    assert.equal(classifyFailure(problem('not_found', 404, 'NOT_FOUND'), kind), 'gone');
  }
  assert.equal(classifyFailure(field('errors.attachment_expired'), 'retain'), 'expired');
  assert.equal(classifyFailure(field('errors.attachment_removed'), 'replace'), 'removed');
  assert.equal(classifyFailure(problem('invalid', 422, 'VALIDATION_FAILED', { fields: { consent: 'errors.consent_required' } }), 'retain'), 'failed');
});

test('only the outcomes that may have committed, or that wait for room, keep the command frozen', () => {
  assert.deepEqual(['unconfirmed', 'paused', 'busy', 'uploads_off', 'conflict', 'gone', 'expired', 'removed', 'unsupported', 'too_large', 'failed', 'blocked'].filter((kind) => freezes(kind as Parameters<typeof freezes>[0])), ['unconfirmed', 'paused', 'busy']);
});

// Copy is looked up by its English text, and the panel passes these words to
// `tc` from the tables, where the literal guard can't see them (R7, E2
// checkpoint 5).
test('a frozen command and each refusal say so in words that are copy in en.json, with Thai', () => {
  const frozen = ['unconfirmed', 'paused', 'busy'] as const;
  assert.deepEqual(Object.keys(FROZEN_WORDS).sort(), [...frozen].sort(), 'every outcome that freezes has its words');
  for (const kind of frozen) assert.ok(freezes(kind));
  assert.deepEqual(Object.keys(REFUSED_WORDS).sort(), ['expired', 'failed', 'removed', 'unsupported']);
  assert.deepEqual(untranslated([...Object.values(FROZEN_WORDS), ...Object.values(REFUSED_WORDS)]), []);
});

test('verified bytes become a base64 data URI in memory', () => {
  assert.equal(base64Of(new Uint8Array([])), '');
  assert.equal(base64Of(new TextEncoder().encode('f')), 'Zg==');
  assert.equal(base64Of(new TextEncoder().encode('fo')), 'Zm8=');
  assert.equal(base64Of(new TextEncoder().encode('foo')), 'Zm9v');
  assert.equal(base64Of(new TextEncoder().encode('foobar')), 'Zm9vYmFy');
  const every = Uint8Array.from({ length: 256 * 3 + 1 }, (_, i) => (i * 7) % 256);
  assert.equal(base64Of(every), Buffer.from(every).toString('base64'));
  assert.equal(dataUriOf('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'data:image/png;base64,iVBORw==');
});
