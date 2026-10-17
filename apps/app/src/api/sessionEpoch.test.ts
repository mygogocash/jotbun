import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { V1Error, createV1Transport } from './client.ts';
import type { V1Credentials } from './client.ts';

type Reply = { status: number; body?: unknown; delayMs?: number };
let baseUrl = '';
let seen: { headers: IncomingHttpHeaders; body: string }[] = [];
let replies: Reply[] = [];
let onRequest: (() => void) | null = null;
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ headers: req.headers, body });
  const reply = replies.shift() ?? { status: 200, body: { ok: true } };
  onRequest?.();
  if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(reply.body ?? null));
});
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

let token = 'token-1';
let snapshot = { binding: 'b'.repeat(43) as string | null, epoch: 1 };
let refreshes = 0;
let refreshResult = true;
beforeEach(() => {
  seen = [];
  replies = [];
  onRequest = null;
  token = 'token-1';
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
  refreshes = 0;
  refreshResult = true;
});
const credentials: V1Credentials = {
  getAccessToken: async () => token,
  getSessionSnapshot: () => snapshot,
  async refreshAfterUnauthorized() {
    refreshes += 1;
    if (refreshResult) token = 'token-2';
    return refreshResult;
  },
};
const transport = () => createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 });
const ok = (value: unknown): value is { ok: boolean } => typeof value === 'object' && value !== null;
const command = { id: '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e', schemaVersion: 1 };
const failure = (run: () => Promise<unknown>) => run().then(() => null, (error: unknown) => error as V1Error);

test('a token renewed while a request is in flight keeps its response (same identity)', async () => {
  replies.push({ status: 200, body: { ok: true }, delayMs: 20 });
  onRequest = () => void (token = 'token-renewed');
  assert.deepEqual(await transport().request('GET', '/v1/wallets', { validate: ok }), { ok: true });
});

test('a sign-out, account switch or A -> B -> A during a request drops its response', async () => {
  replies.push({ status: 200, body: { ok: true }, delayMs: 20 });
  onRequest = () => void (snapshot = { binding: null, epoch: 2 });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'session_changed');
  snapshot = { binding: 'a'.repeat(43), epoch: 3 };
  replies.push({ status: 200, body: { ok: true }, delayMs: 20 });
  // Switched to B and back to A while the request was out: still not A's original session.
  onRequest = () => void (snapshot = { binding: 'a'.repeat(43), epoch: 5 });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'session_changed');
});

test('one 401 allows one refresh and one resend of the same body and key; a second 401 signs out', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 201, body: { ok: true } });
  assert.deepEqual(await transport().request('POST', '/v1/transactions', { body: { id: 'x', amount_minor: '1' }, command, validate: ok }), { ok: true });
  assert.equal(refreshes, 1);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].body, seen[1].body);
  assert.equal(seen[1].headers['idempotency-key'], command.id);
  assert.equal(seen[1].headers.authorization, 'Bearer token-2');
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 401, body: { code: 'UNAUTHENTICATED' } });
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'signed_out');
  assert.equal(refreshes, 2);
  refreshResult = false;
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
  assert.equal(refreshes, 3);
});

test('426 never triggers a refresh or a sign-out; other auth refusals are not refreshed either', async () => {
  replies.push({ status: 426, body: { code: 'CLIENT_UPGRADE_REQUIRED' } });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'upgrade_required');
  replies.push({ status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } }, { status: 401, body: { code: 'REAUTH_REQUIRED' } });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
  assert.equal(refreshes, 0);
});

test('token-only routes need no binding and send none', async () => {
  snapshot = { binding: null, epoch: 1 };
  replies.push({ status: 200, body: { ok: true } });
  assert.deepEqual(await transport().request('POST', '/v1/auth/challenges', { body: {}, tokenOnly: true, validate: ok }), { ok: true });
  assert.equal(seen[0].headers['x-gogospend-session'], undefined);
  assert.equal(seen[0].headers.authorization, 'Bearer token-1');
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
});
