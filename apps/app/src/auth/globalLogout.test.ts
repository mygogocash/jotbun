import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { createV1Transport } from '../api/client.ts';
import type { V1Credentials, V1SessionEnd } from '../api/client.ts';
import { createGlobalLogoutResources, requestGlobalLogout, submitGlobalLogout } from './globalLogout.ts';
import type { Proof } from './reauthentication.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; drop?: boolean };

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
  res.end(JSON.stringify(reply.body ?? null));
});

const BINDING = 'b'.repeat(43);
let ended: V1SessionEnd[] = [];
const credentials: V1Credentials = {
  getAccessToken: async () => 'access-token',
  getSessionSnapshot: () => ({ binding: BINDING, epoch: 1 }),
  sessionEnded: (event) => void ended.push(event),
};
const resources = () => createGlobalLogoutResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));
const proof = (): Proof => ({ proofId: randomUUID(), commandId: randomUUID(), expiresAt: '2026-10-20T03:05:00.000Z' });
const problem = (status: number, code: string): Reply => ({ status, body: { code, request_id: randomUUID(), message_key: 'errors.x' } });
const ACCEPTED: Reply = { status: 202, body: { generation: 4, provider_cleanup: 'pending' } };

/** A fresh sign-in that hands out `p` and counts how often it was asked. */
function signIn(p: Proof | null) {
  const asked = { count: 0 };
  return { asked, reauthenticate: async () => { asked.count += 1; return p; } };
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

test('accepted: one fresh sign-in, then the proof as the body and its command as the key, on this session; every binding is now dead', async () => {
  const p = proof();
  const auth = signIn(p);
  replies.push(ACCEPTED);
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: auth.reauthenticate }), { state: 'signed_out' });
  assert.equal(auth.asked.count, 1);
  const [sent] = seen;
  assert.equal(seen.length, 1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url, '/v1/me/global-logout');
  assert.equal(sent.headers['idempotency-key'], p.commandId);
  assert.equal(sent.headers['x-gogospend-session'], BINDING);
  assert.equal(sent.headers['x-gogospend-command-schema'], '1');
  assert.deepEqual(JSON.parse(sent.body), { proof_id: p.proofId });
});

test('the person cancels the fresh sign-in: nothing is sent', async () => {
  const auth = signIn(null);
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: auth.reauthenticate }), { state: 'cancelled' });
  assert.equal(auth.asked.count, 1);
  assert.equal(seen.length, 0);
});

test('a sign-in that fails throws to the caller, and nothing is sent', async () => {
  const reauthenticate = async (): Promise<Proof | null> => { throw new Error('Could not reach the sign-in service.'); };
  await assert.rejects(requestGlobalLogout({ resources: resources(), reauthenticate }), /sign-in service/);
  assert.equal(seen.length, 0);
});

test('a lost answer: the transport resends the same request, which meets 401 SESSION_REQUIRED because the first one landed; that is signed out', async () => {
  const p = proof();
  replies.push({ status: 0, drop: true }, problem(401, 'SESSION_REQUIRED'));
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(p).reauthenticate }), { state: 'signed_out' });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((request) => request.headers['idempotency-key']), [p.commandId, p.commandId]);
  assert.equal(seen[1].body, seen[0].body);
});

test('Jotbun cannot be reached at all: still signed in here, and Try again resends exactly that request with no new sign-in', async () => {
  const p = proof();
  const auth = signIn(p);
  replies.push({ status: 0, drop: true }, { status: 0, drop: true }, { status: 0, drop: true });
  const first = await requestGlobalLogout({ resources: resources(), reauthenticate: auth.reauthenticate });
  assert.deepEqual(first, { state: 'unconfirmed', request: { proofId: p.proofId, commandId: p.commandId } });
  assert.equal(seen.length, 3, "the first send and the transport's two resends");
  if (first.state !== 'unconfirmed') return;
  // The request did land after all: the resend meets a dead binding.
  replies.push(problem(401, 'SESSION_REQUIRED'));
  assert.deepEqual(await submitGlobalLogout(first.request, { resources: resources() }), { state: 'signed_out' });
  assert.equal(auth.asked.count, 1);
  assert.equal(seen[3].headers['idempotency-key'], p.commandId);
  assert.equal(seen[3].body, seen[0].body);
  // Or it had not: the resend is accepted.
  replies.push(ACCEPTED);
  assert.deepEqual(await submitGlobalLogout(first.request, { resources: resources() }), { state: 'signed_out' });
});

test('a used or stale proof: nothing changed, and the session is not reported ended (the proof was refused, not the session)', async () => {
  replies.push(problem(401, 'REAUTH_REQUIRED'));
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(proof()).reauthenticate }), { state: 'reauth_required' });
  assert.deepEqual(ended, []);
});

test('an outage, a gateway or a rate limit is not an answer: still signed in here, resend the same request', async () => {
  for (const reply of [problem(503, 'SERVICE_UNAVAILABLE'), problem(429, 'RATE_LIMITED')]) {
    const p = proof();
    replies.push(reply);
    assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(p).reauthenticate }), {
      state: 'unconfirmed',
      request: { proofId: p.proofId, commandId: p.commandId },
    });
  }
});

test('a success that is not exactly the result may still have landed: unconfirmed, never signed out on a guess', async () => {
  for (const body of [{ generation: 4 }, { generation: '4', provider_cleanup: 'pending' }, { generation: 4, provider_cleanup: 'done' }, { generation: 4, provider_cleanup: 'pending', extra: 1 }]) {
    replies.push({ status: 202, body });
    const state = await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(proof()).reauthenticate });
    assert.equal(state.state, 'unconfirmed', JSON.stringify(body));
  }
});

test('any other refusal changes nothing and says which', async () => {
  replies.push(problem(400, 'VALIDATION_FAILED'));
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(proof()).reauthenticate }), { state: 'refused', code: 'VALIDATION_FAILED' });
  // A proof whose command id is not a UUID never leaves the phone.
  const bad = { ...proof(), commandId: 'not-a-uuid' };
  const before = seen.length;
  assert.deepEqual(await requestGlobalLogout({ resources: resources(), reauthenticate: signIn(bad).reauthenticate }), { state: 'refused', code: 'INVALID_ID' });
  assert.equal(seen.length, before);
});
