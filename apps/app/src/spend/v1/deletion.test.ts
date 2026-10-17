import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { createV1Transport } from '../../api/client.ts';
import type { V1Credentials } from '../../api/client.ts';
import type { Proof } from '../../auth/reauthentication.ts';
import { confirmDeletionRequest, createDeletionResources, mayEraseDeviceData, requestAccountDeletion, settleDeviceCopy, submitDeletionRequest } from './deletion.ts';
import type { DeletionState, DeviceCopy } from './deletion.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; raw?: string; drop?: boolean };

const REQUEST_ID = '7b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
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
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(reply.raw ?? JSON.stringify(reply.body ?? null));
});

const BINDING = 'b'.repeat(43);
const credentials: V1Credentials = { getAccessToken: async () => 'access-token', getSessionSnapshot: () => ({ binding: BINDING, epoch: 1 }) };
const resources = () => createDeletionResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));
const proof = (): Proof => ({ proofId: randomUUID(), commandId: randomUUID(), expiresAt: '2026-10-17T03:05:00.000Z' });
const problem = (status: number, code: string): Reply => ({ status, body: { code, request_id: randomUUID(), message_key: 'errors.x' } });

/** A device copy that records what happened to it. */
function deviceCopy(): DeviceCopy & { erased: number; locked: number } {
  return {
    erased: 0,
    locked: 0,
    async eraseForSignOut() {
      this.erased += 1;
    },
    async lock() {
      this.locked += 1;
    },
  };
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

test('a confirmed acceptance: the proof is the body, its command the key, and only then may the device erase its copy', async () => {
  const p = proof();
  replies.push({ status: 202, body: { request_id: REQUEST_ID, status: 'accepted' } });
  const state = await requestAccountDeletion({ resources: resources(), reauthenticate: async () => p });
  assert.deepEqual(state, { state: 'accepted', requestId: REQUEST_ID, completed: false });
  const [sent] = seen;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, '/v1/me/deletion');
  assert.equal(sent.headers['idempotency-key'], p.commandId);
  assert.equal(sent.headers['x-gogospend-session'], BINDING);
  assert.deepEqual(JSON.parse(sent.body), { proof_id: p.proofId });
  assert.equal(mayEraseDeviceData(state), true);
  const copy = deviceCopy();
  assert.equal(await settleDeviceCopy(state, copy), 'erased');
  assert.equal(copy.erased, 1);
});

test('a lost acceptance: the identical resend is refused, and the receipt confirms it', async () => {
  const p = proof();
  replies.push({ drop: true, status: 0 }, problem(401, 'SESSION_REQUIRED'), { status: 200, body: { request_id: REQUEST_ID, status: 'accepted' } });
  const state = await submitDeletionRequest({ proofId: p.proofId, commandId: p.commandId }, { resources: resources() });
  assert.deepEqual(state, { state: 'accepted', requestId: REQUEST_ID, completed: false });
  const posts = seen.filter((request) => request.url === '/v1/me/deletion');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body, posts[1].body);
  assert.equal(posts[0].headers['idempotency-key'], posts[1].headers['idempotency-key']);
  const asked = seen.find((request) => request.url === '/v1/auth/deletion-receipt');
  assert.ok(asked);
  assert.equal(asked.headers['x-gogospend-session'], BINDING);
  assert.deepEqual(JSON.parse(asked.body), { command_id: p.commandId });
});

test('signed out with no receipt is a refusal: nothing was deleted, and the copy is locked with its drafts', async () => {
  for (const refusal of [problem(401, 'SESSION_REQUIRED'), problem(403, 'ACCOUNT_UNAVAILABLE'), problem(401, 'UNAUTHENTICATED')]) {
    seen = [];
    replies = [refusal, problem(404, 'NOT_FOUND')];
    const state = await submitDeletionRequest({ proofId: randomUUID(), commandId: randomUUID() }, { resources: resources() });
    assert.equal(state.state, 'denied');
    assert.equal(mayEraseDeviceData(state), false);
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'locked');
    assert.equal(copy.erased, 0);
    assert.equal(copy.locked, 1);
  }
});

test('an unknown outcome keeps everything and the exact request; it never implies deletion', async () => {
  const cases: Reply[][] = [
    // Network: the transport resends the command twice, then the receipt is unreachable too.
    [{ drop: true, status: 0 }, { drop: true, status: 0 }, { drop: true, status: 0 }, { drop: true, status: 0 }],
    [problem(503, 'SERVICE_UNAVAILABLE'), problem(404, 'NOT_FOUND')],
    [problem(429, 'RATE_LIMITED'), problem(404, 'NOT_FOUND')],
    [{ status: 202, raw: '<html>gateway</html>' }, problem(404, 'NOT_FOUND')],
    // Refused, but the receipt check itself failed: still unknown.
    [problem(401, 'SESSION_REQUIRED'), problem(502, 'HTTP_502')],
  ];
  for (const replyList of cases) {
    seen = [];
    replies = [...replyList];
    const request = { proofId: randomUUID(), commandId: randomUUID() };
    const state = await submitDeletionRequest(request, { resources: resources() });
    assert.deepEqual(state, { state: 'unconfirmed', request });
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'kept');
    assert.equal(copy.erased + copy.locked, 0);
  }
});

test('a stale proof asks for a new one; a cancelled sign-in requests nothing', async () => {
  replies.push(problem(401, 'REAUTH_REQUIRED'));
  assert.deepEqual(await submitDeletionRequest({ proofId: randomUUID(), commandId: randomUUID() }, { resources: resources() }), { state: 'reauth_required' });
  assert.equal(seen.length, 1);
  seen = [];
  assert.deepEqual(await requestAccountDeletion({ resources: resources(), reauthenticate: async () => null }), { state: 'cancelled' });
  assert.equal(seen.length, 0);
  for (const state of [{ state: 'reauth_required' }, { state: 'cancelled' }] as DeletionState[]) {
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'kept');
    assert.equal(copy.erased, 0);
  }
});

test('a receipt reports completion once the server data is purged; a malformed receipt is not trusted', async () => {
  const request = { proofId: randomUUID(), commandId: randomUUID() };
  replies.push({ status: 200, body: { request_id: REQUEST_ID, status: 'completed' } });
  assert.deepEqual(await confirmDeletionRequest(request, { resources: resources() }), { state: 'accepted', requestId: REQUEST_ID, completed: true });
  replies.push({ status: 200, body: { request_id: REQUEST_ID, status: 'deleted', extra: true } });
  assert.deepEqual(await confirmDeletionRequest(request, { resources: resources() }), { state: 'unconfirmed', request });
  replies.push({ status: 202, body: { request_id: 'not-a-uuid', status: 'accepted' } }, problem(404, 'NOT_FOUND'));
  assert.deepEqual(await submitDeletionRequest(request, { resources: resources() }), { state: 'unconfirmed', request });
});
