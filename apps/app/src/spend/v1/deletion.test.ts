import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { isUuid } from '@gogospend/contracts';

import { createV1Transport } from '../../api/client.ts';
import type { V1Credentials, V1SessionEnd } from '../../api/client.ts';
import type { FreshOutcome, RequestCredentials } from '../../auth/credentialProvider.ts';
import { FRESH_SIGN_IN_FAILED, confirmDeletionRequest, createDeletionResources, mayEraseDeviceData, requestAccountDeletion, settleDeviceCopy, submitDeletionRequest } from './deletion.ts';
import type { DeletionDeps, DeletionState, DeviceCopy, PendingDeletionRequest } from './deletion.ts';

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

// The shared transport's own session (the one before the fresh sign-in) and the fresh session's credentials.
let ended: V1SessionEnd[] = [];
const session: V1Credentials = {
  getAccessToken: async () => 'session-token',
  getSessionSnapshot: () => ({ binding: '0e000000-0000-4000-8000-00000000000e', epoch: 1 }),
  sessionEnded: (event) => void ended.push(event),
};
const FRESH: RequestCredentials = { accessToken: 'fresh-token', sessionId: '0d000000-0000-4000-8000-00000000000d' };
const resources = () => createDeletionResources(createV1Transport({ baseUrl, credentials: session, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));
const problem = (status: number, code: string): Reply => ({ status, body: { code, request_id: randomUUID(), message_key: 'errors.x' } });
const ACCEPTED: Reply = { status: 202, body: { request_id: REQUEST_ID, status: 'accepted' } };
const pending = (): PendingDeletionRequest => ({ commandId: randomUUID(), proofId: randomUUID(), language: 'th', credentials: FRESH });
const posts = () => seen.filter((request) => request.url === '/v1/me/deletion');
const receipts = () => seen.filter((request) => request.url === '/v1/auth/deletion-receipt');

/** The journey's dependencies: a fresh sign-in answering `fresh`, the fresh session's credentials, recorded ids, Thai. */
function deps(overrides: Partial<DeletionDeps> = {}): DeletionDeps & { log: string[]; drawn: string[] } {
  const log: string[] = [];
  const drawn: string[] = [];
  return {
    resources: resources(),
    freshSignIn: async (): Promise<FreshOutcome> => { log.push('freshSignIn'); return 'fresh'; },
    credentials: async () => { log.push('credentials'); return FRESH; },
    newId: () => { const id = randomUUID(); drawn.push(id); return id; },
    language: 'th',
    log,
    drawn,
    ...overrides,
  };
}

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
  ended = [];
});

test("a fresh sign-in, then today's body with a random proof id, the command id as the key, the new session's own token and the app's language", async () => {
  const d = deps();
  replies.push(ACCEPTED);
  const state = await requestAccountDeletion(d);
  assert.deepEqual(state, { state: 'accepted', requestId: REQUEST_ID, completed: false });
  assert.deepEqual(d.log, ['freshSignIn', 'credentials']);
  const [sent] = seen;
  assert.equal(seen.length, 1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, '/v1/me/deletion');
  const [command, proof] = d.drawn;
  assert.deepEqual(JSON.parse(sent.body), { proof_id: proof });
  assert.ok(isUuid(proof));
  assert.notEqual(proof, command);
  assert.equal(sent.headers['idempotency-key'], command);
  assert.equal(sent.headers['x-gogospend-command-schema'], '1');
  assert.equal(sent.headers.authorization, 'Bearer fresh-token');
  assert.equal(sent.headers['accept-language'], 'th');
  assert.equal(sent.headers['x-gogospend-session'], undefined);
  // English when the app is in English.
  replies.push(ACCEPTED);
  await requestAccountDeletion(deps({ language: 'en' }));
  assert.equal(seen[1].headers['accept-language'], 'en');
});

test('cancelling the fresh sign-in requests nothing', async () => {
  const d = deps({ freshSignIn: async () => 'cancelled' });
  assert.deepEqual(await requestAccountDeletion(d), { state: 'cancelled' });
  assert.deepEqual(d.log, [], 'the credentials are never read');
  assert.equal(seen.length, 0);
});

test('a fresh sign-in that does not go through, or a new session that cannot be read, requests nothing', async () => {
  assert.equal(FRESH_SIGN_IN_FAILED, 'FRESH_SIGN_IN_FAILED');
  for (const outcome of ['failed', 'unavailable', 'not_configured', 'other_account', 'wrong_code', 'rate_limited'] as const) {
    const d = deps({ freshSignIn: async () => outcome });
    assert.deepEqual(await requestAccountDeletion(d), { state: 'denied', code: FRESH_SIGN_IN_FAILED }, outcome);
    assert.deepEqual(d.log, [], `${outcome}: the credentials are never read`);
  }
  assert.deepEqual(await requestAccountDeletion(deps({ credentials: async () => null })), { state: 'reauth_required' });
  assert.equal(seen.length, 0);
});

test('REAUTH_REQUIRED requests nothing more', async () => {
  replies.push(problem(401, 'REAUTH_REQUIRED'));
  assert.deepEqual(await requestAccountDeletion(deps()), { state: 'reauth_required' });
  assert.equal(seen.length, 1, 'no receipt is asked for');
  assert.deepEqual(ended, [], "the request's own credentials never end the shared session");
});

test('a lost answer asks for the receipt with the same token: found is accepted; not found keeps it unconfirmed', async () => {
  // The answer is lost; the transport's resend meets a dead session (the first one landed); the receipt says accepted.
  const request = pending();
  replies.push({ drop: true, status: 0 }, problem(401, 'SESSION_REQUIRED'), { status: 200, body: { request_id: REQUEST_ID, status: 'accepted' } });
  assert.deepEqual(await submitDeletionRequest(request, { resources: resources() }), { state: 'accepted', requestId: REQUEST_ID, completed: false });
  const [asked] = receipts();
  assert.equal(asked.headers.authorization, 'Bearer fresh-token');
  assert.deepEqual(JSON.parse(asked.body), { command_id: request.commandId });
  // A gateway error, then no receipt: still unknown, and the exact request is kept.
  seen = [];
  replies.push(problem(503, 'SERVICE_UNAVAILABLE'), problem(404, 'NOT_FOUND'));
  assert.deepEqual(await submitDeletionRequest(request, { resources: resources() }), { state: 'unconfirmed', request });
  assert.equal(receipts()[0].headers.authorization, 'Bearer fresh-token');
});

test('a resend after a lost answer repeats the same key, proof id and token', async () => {
  const d = deps();
  // Network: the transport sends the command three times; then the receipt finds nothing.
  replies.push({ drop: true, status: 0 }, { drop: true, status: 0 }, { drop: true, status: 0 }, problem(404, 'NOT_FOUND'));
  const first = await requestAccountDeletion(d);
  assert.equal(first.state, 'unconfirmed');
  if (first.state !== 'unconfirmed') return;
  // Try again: the very same request, with no new sign-in.
  replies.push(ACCEPTED);
  assert.deepEqual(await submitDeletionRequest(first.request, { resources: resources() }), { state: 'accepted', requestId: REQUEST_ID, completed: false });
  const sends = posts();
  assert.equal(sends.length, 4);
  for (const sent of sends) {
    assert.equal(sent.headers['idempotency-key'], d.drawn[0]);
    assert.equal(sent.body, sends[0].body);
    assert.equal(sent.headers.authorization, 'Bearer fresh-token');
    assert.equal(sent.headers['accept-language'], 'th');
  }
  assert.deepEqual(JSON.parse(sends[0].body), { proof_id: d.drawn[1] });
  assert.equal(d.drawn.length, 2);
  assert.deepEqual(d.log, ['freshSignIn', 'credentials']);
});

test('only a confirmed acceptance lets the device erase its copy; a refusal locks it and keeps the drafts', async () => {
  replies.push(ACCEPTED);
  const accepted = await requestAccountDeletion(deps());
  assert.equal(mayEraseDeviceData(accepted), true);
  const erased = deviceCopy();
  assert.equal(await settleDeviceCopy(accepted, erased), 'erased');
  assert.equal(erased.erased, 1);
  // Refused, and no receipt: nothing was deleted, and the copy is locked with its drafts.
  for (const refusal of [problem(401, 'SESSION_REQUIRED'), problem(403, 'ACCOUNT_UNAVAILABLE'), problem(401, 'UNAUTHENTICATED')]) {
    replies = [refusal, problem(404, 'NOT_FOUND')];
    const state = await submitDeletionRequest(pending(), { resources: resources() });
    assert.equal(state.state, 'denied');
    assert.equal(mayEraseDeviceData(state), false);
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'locked');
    assert.equal(copy.erased, 0);
    assert.equal(copy.locked, 1);
  }
  // An unknown outcome never implies deletion.
  const unknown: Reply[][] = [
    [problem(503, 'SERVICE_UNAVAILABLE'), problem(404, 'NOT_FOUND')],
    [problem(429, 'RATE_LIMITED'), problem(404, 'NOT_FOUND')],
    [{ status: 202, raw: '<html>gateway</html>' }, problem(404, 'NOT_FOUND')],
    // Refused, but the receipt check itself failed: still unknown.
    [problem(401, 'SESSION_REQUIRED'), problem(502, 'HTTP_502')],
  ];
  for (const replyList of unknown) {
    replies = [...replyList];
    const request = pending();
    const state = await submitDeletionRequest(request, { resources: resources() });
    assert.deepEqual(state, { state: 'unconfirmed', request });
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'kept');
    assert.equal(copy.erased + copy.locked, 0);
  }
  for (const state of [{ state: 'reauth_required' }, { state: 'cancelled' }] as DeletionState[]) {
    const copy = deviceCopy();
    assert.equal(await settleDeviceCopy(state, copy), 'kept');
    assert.equal(copy.erased + copy.locked, 0);
  }
});

test('a receipt reports completion once the server data is purged; a malformed receipt is not trusted', async () => {
  const request = pending();
  replies.push({ status: 200, body: { request_id: REQUEST_ID, status: 'completed' } });
  assert.deepEqual(await confirmDeletionRequest(request, { resources: resources() }), { state: 'accepted', requestId: REQUEST_ID, completed: true });
  replies.push({ status: 200, body: { request_id: REQUEST_ID, status: 'deleted', extra: true } });
  assert.deepEqual(await confirmDeletionRequest(request, { resources: resources() }), { state: 'unconfirmed', request });
  replies.push({ status: 202, body: { request_id: 'not-a-uuid', status: 'accepted' } }, problem(404, 'NOT_FOUND'));
  assert.deepEqual(await submitDeletionRequest(request, { resources: resources() }), { state: 'unconfirmed', request });
});
