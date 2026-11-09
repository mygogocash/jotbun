import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ExportDto } from '@gogospend/contracts';

import { bangkokClock, deletionPhase, downloadPhase, exportFilter, exportPhase } from './privacyModel.ts';

const EXPORT_ID = '7b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
const READY: Extract<ExportDto, { status: 'ready' }> = {
  export_id: EXPORT_ID, status: 'ready', from: '1970-01-01', through: '2026-09-29', requested_at: '2026-09-29T03:00:00.000Z',
  as_of_revision: '42', row_count: 4, bytes: 512, sha256: 'a'.repeat(64), expires_at: '2026-09-30T03:05:00.000Z',
};
const REQUEST = { filter: { from: '1970-01-01', through: '2026-09-29' }, proofId: '11111111-1111-4111-8111-111111111111', commandId: '22222222-2222-4222-8222-222222222222' };

test('the export period: everything up to today, or this year when everything is too large for one file', () => {
  assert.deepEqual(exportFilter('2026-09-29', 'everything'), { from: '1970-01-01', through: '2026-09-29' });
  assert.deepEqual(exportFilter('2026-09-29', 'this_year'), { from: '2026-01-01', through: '2026-09-29' });
  assert.deepEqual(exportFilter('2027-01-01', 'this_year'), { from: '2027-01-01', through: '2027-01-01' });
});

test("a ready file's expiry on Bangkok's clock (UTC+7, no daylight saving)", () => {
  assert.deepEqual(bangkokClock('2026-09-30T03:05:00.000Z'), { date: '2026-09-30', time: '10:05' });
  assert.deepEqual(bangkokClock('2026-09-29T17:30:00.000Z'), { date: '2026-09-30', time: '00:30' }, 'past midnight in Bangkok is the next day');
  assert.deepEqual(bangkokClock('2026-09-29T16:59:00Z'), { date: '2026-09-29', time: '23:59' });
});

test("privacy.ts's journey states as the screen shows them", () => {
  assert.deepEqual(exportPhase({ state: 'cancelled' }), { phase: 'idle', note: 'cancelled' });
  assert.deepEqual(exportPhase({ state: 'reauth_required' }), { phase: 'idle', note: 'reauth_required' });
  // A lost answer keeps the very request, so a retry sends the same key, body and proof.
  assert.deepEqual(exportPhase({ state: 'unconfirmed', request: REQUEST }), { phase: 'unconfirmed', request: REQUEST });
  assert.deepEqual(exportPhase({ state: 'queued', exportId: EXPORT_ID }), { phase: 'preparing', exportId: EXPORT_ID, offline: false });
  assert.deepEqual(exportPhase({ state: 'ready', exportId: EXPORT_ID, file: READY }), { phase: 'ready', exportId: EXPORT_ID, file: READY, download: 'idle' });
  assert.deepEqual(exportPhase({ state: 'failed', exportId: EXPORT_ID, reason: 'too_large' }), { phase: 'failed', exportId: EXPORT_ID, reason: 'too_large' });
  assert.deepEqual(exportPhase({ state: 'expired', exportId: EXPORT_ID }), { phase: 'expired', exportId: EXPORT_ID });
});

test('after a download: a file that expired or failed meanwhile says so; one still being made is preparing', () => {
  assert.deepEqual(downloadPhase(EXPORT_ID, READY, { state: 'downloaded', csv: 'x', fileName: 'f.csv' }, true), { phase: 'ready', exportId: EXPORT_ID, file: READY, download: 'saved', fileName: 'f.csv' });
  // Ready is not saved: a file the person did not send anywhere stays ready, never "downloaded".
  assert.deepEqual(downloadPhase(EXPORT_ID, READY, { state: 'downloaded', csv: 'x', fileName: 'f.csv' }, false), { phase: 'ready', exportId: EXPORT_ID, file: READY, download: 'idle' });
  assert.deepEqual(downloadPhase(EXPORT_ID, READY, { state: 'expired' }, false), { phase: 'expired', exportId: EXPORT_ID });
  assert.deepEqual(downloadPhase(EXPORT_ID, READY, { state: 'failed' }, false), { phase: 'failed', exportId: EXPORT_ID, reason: 'error' });
  assert.deepEqual(downloadPhase(EXPORT_ID, READY, { state: 'queued' }, false), { phase: 'preparing', exportId: EXPORT_ID, offline: false });
});

test("deletion: what the screen shows for each of deletion.ts's outcomes, with this device's copy", () => {
  assert.deepEqual(deletionPhase({ state: 'cancelled' }, 'kept'), { phase: 'idle', note: 'cancelled' });
  assert.deepEqual(deletionPhase({ state: 'reauth_required' }, 'kept'), { phase: 'idle', note: 'reauth_required' });
  assert.deepEqual(deletionPhase({ state: 'accepted', requestId: EXPORT_ID, completed: false }, 'erased'), { phase: 'accepted', requestId: EXPORT_ID, completed: false, device: 'erased' });
  assert.deepEqual(deletionPhase({ state: 'denied', code: 'SESSION_REQUIRED' }, 'locked'), { phase: 'refused', device: 'locked' });
  const request = { proofId: REQUEST.proofId, commandId: REQUEST.commandId };
  assert.deepEqual(deletionPhase({ state: 'unconfirmed', request }, 'kept'), { phase: 'unconfirmed', request, device: 'kept' });
});
