import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { isUuid } from '@gogospend/contracts';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials } from '../../api/client.ts';
import type { FreshOutcome, RequestCredentials } from '../../auth/credentialProvider.ts';
import { createPrivacyResources, downloadExport, pollExport, requestExport, retryExportRequest } from './privacy.ts';
import type { ExportDeps } from './privacy.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; raw?: string; type?: string; drop?: boolean };

const MARCH = { from: '2026-03-01', through: '2026-03-31' };
const EXPORT_ID = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CSV = '﻿record_id,date\r\n6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d,2026-03-01\r\n';
const CSV_BYTES = Buffer.byteLength(CSV);
const CSV_SHA = createHash('sha256').update(CSV).digest('hex');
const BASE = { export_id: EXPORT_ID, from: MARCH.from, through: MARCH.through, requested_at: '2026-10-17T03:00:00.000Z' };
const READY = { ...BASE, status: 'ready', as_of_revision: '12', row_count: 1, bytes: CSV_BYTES, sha256: CSV_SHA, expires_at: '2026-10-18T03:00:00.000Z' };
const GRANT = { url: '/v1/export-files/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOp', expires_at: '2026-10-17T03:05:00.000Z' };

let baseUrl = '';
let seen: Seen[] = [];
let replies: Reply[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
  const reply = replies.shift() ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
  if (reply.drop) {
    req.socket.destroy();
    return;
  }
  res.writeHead(reply.status, { 'content-type': reply.type ?? 'application/json' });
  res.end(reply.raw ?? JSON.stringify(reply.body ?? null));
});

// The shared transport's own session (status checks, grants and downloads use it) and the fresh session's credentials (the request uses them).
const snapshot = { binding: '0e000000-0000-4000-8000-00000000000e', epoch: 1 };
const credentials: V1Credentials = { getAccessToken: async () => 'session-token', getSessionSnapshot: () => snapshot };
const FRESH: RequestCredentials = { accessToken: 'fresh-token', sessionId: '0d000000-0000-4000-8000-00000000000d' };
const sha256Hex = async (text: string) => createHash('sha256').update(text).digest('hex');
const resources = () => createPrivacyResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }), { sha256Hex });

const ackFor = (commandId: string) => ({ command_id: commandId, entity_id: EXPORT_ID, version: 1, committed_revision: '12', outcome: 'accepted', entity_state: 'active' });

/** The journey's dependencies: a fresh sign-in answering `fresh`, the fresh session's credentials, recorded ids, instant waits. */
function deps(overrides: Partial<ExportDeps> = {}): ExportDeps & { sleeps: number[]; log: string[]; drawn: string[] } {
  const sleeps: number[] = [];
  const log: string[] = [];
  const drawn: string[] = [];
  return {
    resources: resources(),
    freshSignIn: async (): Promise<FreshOutcome> => { log.push('freshSignIn'); return 'fresh'; },
    credentials: async () => { log.push('credentials'); return FRESH; },
    newId: () => { const id = randomUUID(); drawn.push(id); return id; },
    sleep: async (ms) => void sleeps.push(ms),
    pollMs: 2_000,
    maxPolls: 3,
    sleeps,
    log,
    drawn,
    ...overrides,
  };
}

async function failure(run: () => Promise<unknown>): Promise<V1Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof V1Error) return error;
    throw error;
  }
  throw new Error('expected a V1Error');
}

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen = [];
  replies = [];
});

test("a fresh sign-in, then today's export body with a random proof id and the new session's own token", async () => {
  // The ids the app will draw, known up front so the acknowledgement can name the command.
  const ids = [randomUUID(), randomUUID()];
  const d = deps({ maxPolls: 1 });
  d.newId = () => {
    const id = ids[d.drawn.length] ?? randomUUID();
    d.drawn.push(id);
    return id;
  };
  replies.push({ status: 202, body: ackFor(ids[0]) }, { status: 200, body: READY });
  assert.deepEqual(await requestExport(MARCH, d), { state: 'ready', exportId: EXPORT_ID, file: READY });
  assert.deepEqual(d.log, ['freshSignIn', 'credentials']);
  const [sent, status] = seen;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, '/v1/exports');
  const [command, proof] = d.drawn;
  assert.deepEqual(JSON.parse(sent.body), { proof_id: proof, from: MARCH.from, through: MARCH.through });
  assert.ok(isUuid(proof));
  assert.notEqual(proof, command);
  assert.equal(sent.headers['idempotency-key'], command);
  assert.equal(sent.headers['x-gogospend-command-schema'], '1');
  assert.equal(sent.headers.authorization, 'Bearer fresh-token');
  assert.equal(sent.headers['x-gogospend-session'], undefined);
  // The status check reads on the shared session (which, after the fresh sign-in, is that new session).
  assert.equal(status.url, `/v1/exports/${EXPORT_ID}`);
  assert.equal(status.headers.authorization, 'Bearer session-token');
  // An acknowledgement for another command, or not "accepted", is refused.
  const request = { commandId: randomUUID(), proofId: randomUUID() };
  replies.push({ status: 202, body: ackFor(randomUUID()) });
  assert.equal((await failure(() => resources().requestExport(MARCH, request, FRESH))).outcome, 'invalid_response');
  replies.push({ status: 202, body: { ...ackFor(request.commandId), outcome: 'created' } });
  assert.equal((await failure(() => resources().requestExport(MARCH, request, FRESH))).outcome, 'invalid_response');
});

test('statuses and grants must be exactly the shared shapes', async () => {
  replies.push({ status: 200, body: READY });
  assert.deepEqual(await resources().exportStatus(EXPORT_ID), READY);
  assert.equal(seen[0].url, `/v1/exports/${EXPORT_ID}`);
  replies.push({ status: 200, body: { ...READY, bytes: String(CSV_BYTES) } });
  assert.equal((await failure(() => resources().exportStatus(EXPORT_ID))).outcome, 'invalid_response');
  replies.push({ status: 200, body: { ...BASE, status: 'pending', object_key: 'export/x' } });
  assert.equal((await failure(() => resources().exportStatus(EXPORT_ID))).outcome, 'invalid_response');
  replies.push({ status: 200, body: { ...READY, export_id: randomUUID() } });
  assert.equal((await failure(() => resources().exportStatus(EXPORT_ID))).outcome, 'invalid_response');
  replies.push({ status: 200, body: GRANT });
  assert.deepEqual(await resources().exportGrant(EXPORT_ID), GRANT);
  assert.equal(seen.at(-1)?.url, `/v1/exports/${EXPORT_ID}/grant`);
  replies.push({ status: 200, body: { ...GRANT, url: 'https://storage.example/export.csv' } });
  assert.equal((await failure(() => resources().exportGrant(EXPORT_ID))).outcome, 'invalid_response');
  assert.equal((await failure(() => resources().exportStatus('not-a-uuid'))).code, 'INVALID_ID');
});

test('a download is checked against the ready export size and digest, byte order mark included', async () => {
  replies.push({ status: 200, raw: CSV, type: 'text/csv; charset=utf-8' });
  const csv = await resources().downloadExport(GRANT, { bytes: CSV_BYTES, sha256: CSV_SHA });
  assert.equal(csv, CSV);
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].url, GRANT.url);
  assert.equal(seen[0].headers['x-gogospend-session'], undefined);
  replies.push({ status: 200, raw: CSV.replace('2026-03-01', '2026-03-02'), type: 'text/csv; charset=utf-8' });
  assert.equal((await failure(() => resources().downloadExport(GRANT, { bytes: CSV_BYTES, sha256: CSV_SHA }))).outcome, 'invalid_response');
  replies.push({ status: 200, raw: CSV.slice(0, -2), type: 'text/csv; charset=utf-8' });
  assert.equal((await failure(() => resources().downloadExport(GRANT, { bytes: CSV_BYTES, sha256: CSV_SHA }))).outcome, 'invalid_response');
  assert.equal((await failure(() => resources().downloadExport({ ...GRANT, url: 'https://elsewhere.example/x' }, { bytes: CSV_BYTES, sha256: CSV_SHA }))).code, 'INVALID_GRANT');
});

test('cancelling the fresh sign-in requests nothing', async () => {
  const d = deps({ freshSignIn: async () => 'cancelled' });
  assert.deepEqual(await requestExport(MARCH, d), { state: 'cancelled' });
  assert.deepEqual(d.log, [], 'the credentials are never read');
  assert.equal(seen.length, 0);
});

test('ready after polling: the journey returns the ready export and paces its polls', async () => {
  const commandId = randomUUID();
  replies.push({ status: 202, body: ackFor(commandId) }, { status: 200, body: { ...BASE, status: 'pending' } }, { status: 200, body: { ...BASE, status: 'pending' } }, { status: 200, body: READY });
  const d = deps({ newId: () => commandId });
  assert.deepEqual(await requestExport(MARCH, d), { state: 'ready', exportId: EXPORT_ID, file: READY });
  assert.deepEqual(d.sleeps, [2_000, 2_000]);
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ['POST /v1/exports', `GET /v1/exports/${EXPORT_ID}`, `GET /v1/exports/${EXPORT_ID}`, `GET /v1/exports/${EXPORT_ID}`]);
});

test('a stale sign-in is reauth_required', async () => {
  // The server finds the sign-in too old.
  replies.push({ status: 401, body: { code: 'REAUTH_REQUIRED', request_id: 'r', message_key: 'errors.reauth_required' } });
  assert.deepEqual(await requestExport(MARCH, deps()), { state: 'reauth_required' });
  assert.equal(seen.length, 1);
  // A fresh sign-in that does not go through, or a new session that cannot be read: the same, and nothing is sent.
  seen = [];
  for (const outcome of ['failed', 'unavailable', 'not_configured', 'other_account', 'wrong_code', 'rate_limited'] as const) {
    const d = deps({ freshSignIn: async () => outcome });
    assert.deepEqual(await requestExport(MARCH, d), { state: 'reauth_required' }, outcome);
    assert.deepEqual(d.log, [], `${outcome}: the credentials are never read`);
  }
  assert.deepEqual(await requestExport(MARCH, deps({ credentials: async () => null })), { state: 'reauth_required' });
  assert.equal(seen.length, 0);
});

test('a lost answer resends the same request with the same token, key and proof id', async () => {
  const d = deps();
  replies.push({ status: 0, drop: true }, { status: 0, drop: true }, { status: 0, drop: true });
  const outcome = await requestExport(MARCH, d);
  const [commandId, proofId] = d.drawn;
  assert.deepEqual(outcome, { state: 'unconfirmed', request: { filter: MARCH, commandId, proofId, credentials: FRESH } });
  assert.equal(seen.length, 3);
  assert.ok(seen.every((s) => s.headers['idempotency-key'] === commandId && s.body === seen[0].body && s.headers.authorization === 'Bearer fresh-token'));
  seen = [];
  replies.push({ status: 202, body: ackFor(commandId) }, { status: 200, body: READY });
  if (outcome.state !== 'unconfirmed') throw new Error('expected unconfirmed');
  // Try again: no new sign-in, no new ids.
  assert.deepEqual(await retryExportRequest(outcome.request, deps()), { state: 'ready', exportId: EXPORT_ID, file: READY });
  assert.equal(seen[0].headers['idempotency-key'], commandId);
  assert.equal(seen[0].headers.authorization, 'Bearer fresh-token');
  assert.deepEqual(JSON.parse(seen[0].body), { proof_id: proofId, ...MARCH });
  assert.equal(d.drawn.length, 2);
  assert.deepEqual(d.log, ['freshSignIn', 'credentials']);
});

test('polling reports queued after its budget, and failed, expired or unknown exports as such', async () => {
  replies.push({ status: 200, body: { ...BASE, status: 'pending' } }, { status: 200, body: { ...BASE, status: 'pending' } }, { status: 200, body: { ...BASE, status: 'pending' } });
  assert.deepEqual(await pollExport(EXPORT_ID, deps()), { state: 'queued', exportId: EXPORT_ID });
  replies.push({ status: 200, body: { ...BASE, status: 'failed', reason: 'too_large' } });
  assert.deepEqual(await pollExport(EXPORT_ID, deps()), { state: 'failed', exportId: EXPORT_ID, reason: 'too_large' });
  replies.push({ status: 200, body: { ...BASE, status: 'expired' } });
  assert.deepEqual(await pollExport(EXPORT_ID, deps()), { state: 'expired', exportId: EXPORT_ID });
  replies.push({ status: 404, body: { code: 'NOT_FOUND', request_id: 'r', message_key: 'errors.not_found' } });
  assert.deepEqual(await pollExport(EXPORT_ID, deps()), { state: 'failed', exportId: EXPORT_ID, reason: 'error' });
});

test('downloading a ready export asks for a fresh grant; an expired one asks for nothing', async () => {
  replies.push({ status: 200, body: READY }, { status: 200, body: GRANT }, { status: 200, raw: CSV, type: 'text/csv; charset=utf-8' });
  assert.deepEqual(await downloadExport(EXPORT_ID, deps()), { state: 'downloaded', csv: CSV, fileName: 'jotbun-export-2026-03-01-to-2026-03-31.csv' });
  assert.deepEqual(seen.map((s) => s.url), [`/v1/exports/${EXPORT_ID}`, `/v1/exports/${EXPORT_ID}/grant`, GRANT.url]);
  seen = [];
  replies.push({ status: 200, body: { ...BASE, status: 'expired' } });
  assert.deepEqual(await downloadExport(EXPORT_ID, deps()), { state: 'expired' });
  assert.equal(seen.length, 1);
  replies.push({ status: 200, body: READY }, { status: 404, body: { code: 'NOT_FOUND', request_id: 'r', message_key: 'errors.not_found' } });
  assert.deepEqual(await downloadExport(EXPORT_ID, deps()), { state: 'expired' });
  replies.push({ status: 200, body: { ...BASE, status: 'pending' } });
  assert.deepEqual(await downloadExport(EXPORT_ID, deps()), { state: 'queued' });
});
