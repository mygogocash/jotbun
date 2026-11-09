// The terms client (1C-T8, K24) over the real v1 transport and a local
// node:http server that records each request.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials, V1Transport } from '../../api/client.ts';
import { acceptPending, createPolicyClient, watchPolicyRequired } from './policies.ts';

type Seen = { method: string; url: string; body: string };
type Reply = { status: number; body?: unknown; raw?: string };

let baseUrl = '';
let seen: Seen[] = [];
let replies: Reply[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ method: req.method ?? '', url: req.url ?? '', body });
  const reply = replies.shift() ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
  if (reply.raw === '') {
    res.writeHead(reply.status);
    res.end();
    return;
  }
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(reply.raw ?? JSON.stringify(reply.body ?? null));
});

const session: V1Credentials = {
  getAccessToken: async () => 'session-token',
  getSessionSnapshot: () => ({ binding: '0e000000-0000-4000-8000-00000000000e', epoch: 1 }),
};
const transport = () => createV1Transport({ baseUrl, credentials: session, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 });
const problem = (status: number, code: string): Reply => ({ status, body: { code, request_id: randomUUID(), message_key: 'errors.x' } });
const NO_CONTENT: Reply = { status: 204, raw: '' };
const acceptances = () => seen.filter((request) => request.method === 'POST' && request.url === '/v1/me/policy-acceptances');
const me = (pending: unknown): Reply => ({
  status: 200,
  body: { account_id: '0a000000-0000-4000-8000-00000000000a', status: 'active', pending_policies: pending, privacy: { analytics: false } },
});

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

test('accept posts exactly { kind, version } and takes the empty 204', async () => {
  replies = [NO_CONTENT];
  const answer = await createPolicyClient(transport()).accept({ kind: 'terms', version: 3 });
  assert.equal(answer, undefined);
  assert.equal(acceptances().length, 1);
  assert.deepEqual(JSON.parse(acceptances()[0].body), { kind: 'terms', version: 3 });
  assert.equal(seen.length, 1);
});

test('acceptPending accepts each pending version once, in order, and stops at the first refusal', async () => {
  const client = createPolicyClient(transport());
  replies = [NO_CONTENT, NO_CONTENT];
  await acceptPending(client, [{ kind: 'privacy', version: 2 }, { kind: 'terms', version: 3 }]);
  assert.deepEqual(acceptances().map((request) => JSON.parse(request.body)), [{ kind: 'privacy', version: 2 }, { kind: 'terms', version: 3 }]);

  seen = [];
  replies = [problem(400, 'VALIDATION_FAILED'), NO_CONTENT];
  await assert.rejects(acceptPending(client, [{ kind: 'privacy', version: 2 }, { kind: 'terms', version: 3 }]), (error: unknown) => error instanceof V1Error && error.code === 'VALIDATION_FAILED');
  assert.equal(acceptances().length, 1);
  assert.deepEqual(JSON.parse(acceptances()[0].body), { kind: 'privacy', version: 2 });
});

test('pending reads only pending_policies, whatever else /v1/me carries', async () => {
  replies = [{
    status: 200,
    body: {
      account_id: '0a000000-0000-4000-8000-00000000000a',
      status: 'active',
      pending_policies: [{ kind: 'terms', version: 2, title: 'Terms' }, { kind: 'privacy', version: 5 }],
      privacy: { analytics: true },
      plan: { name: 'later field' },
    },
  }];
  assert.deepEqual(await createPolicyClient(transport()).pending(), [{ kind: 'terms', version: 2 }, { kind: 'privacy', version: 5 }]);
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`), ['GET /v1/me']);
  replies = [me([])];
  assert.deepEqual(await createPolicyClient(transport()).pending(), []);
});

test('a malformed pending list is invalid_response', async () => {
  const invalid = (error: unknown) => error instanceof V1Error && error.outcome === 'invalid_response';
  for (const pending of [[{ kind: 'cookies', version: 1 }], [{ kind: 'terms', version: 0 }], [{ kind: 'terms', version: 1.5 }], [{ kind: 'terms' }], 'terms', null]) {
    replies = [me(pending)];
    await assert.rejects(createPolicyClient(transport()).pending(), invalid, JSON.stringify(pending));
  }
});

test('watchPolicyRequired reports each policy_required answer and rethrows it', async () => {
  let required = 0;
  // The transport underneath, recording what it threw, so the rethrow can be checked as the same error.
  const inner = transport();
  let thrown: unknown = null;
  const recording: V1Transport = {
    request: (method, path, options) => inner.request(method, path, options).catch((error: unknown) => {
      thrown = error;
      throw error;
    }),
  };
  const watched = watchPolicyRequired(recording, () => { required += 1; });
  const client = createPolicyClient(watched);

  replies = [problem(403, 'POLICY_ACCEPTANCE_REQUIRED')];
  let caught: unknown = null;
  await client.pending().catch((error: unknown) => { caught = error; });
  assert.equal(required, 1);
  assert.ok(caught instanceof V1Error);
  assert.equal(caught, thrown);
  assert.equal(caught.outcome, 'policy_required');
  assert.equal(caught.status, 403);
  assert.equal(caught.code, 'POLICY_ACCEPTANCE_REQUIRED');

  replies = [problem(400, 'VALIDATION_FAILED')];
  await assert.rejects(client.accept({ kind: 'terms', version: 1 }), (error: unknown) => error instanceof V1Error && error.code === 'VALIDATION_FAILED');
  replies = [me([])];
  assert.deepEqual(await client.pending(), []);
  assert.equal(required, 1);
});

// The 1C-T8 fix round (review m1, RV7): published() checks every field of every version it is given.
test('a malformed published list is invalid_response', async () => {
  const invalid = (error: unknown) => error instanceof V1Error && error.outcome === 'invalid_response';
  const terms = { kind: 'terms', version: 2, required: true, published_at: '2026-10-01T00:00:00.000Z', text: { th: 'ข้อกำหนด', en: 'Terms' } };
  for (const entry of [{ ...terms, kind: 'cookies' }, { ...terms, version: 0 }, { ...terms, required: 'yes' }, { ...terms, published_at: 1 }, { ...terms, text: null }, { ...terms, text: { th: 'ข้อกำหนด' } }]) {
    replies = [{ status: 200, body: [entry] }];
    await assert.rejects(createPolicyClient(transport()).published(), invalid, JSON.stringify(entry));
  }
  replies = [{ status: 200, body: [terms] }];
  assert.deepEqual(await createPolicyClient(transport()).published(), [terms]);
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`).at(-1), 'GET /v1/policies');
});
