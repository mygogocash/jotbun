import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { V1Error, createV1Transport } from '../api/client.ts';
import type { V1Credentials } from '../api/client.ts';
import { createAnalyticsServer } from './analyticsServer.ts';

type Seen = { method: string; url: string; body: string };
type Reply = { status: number; body?: unknown };

const ANALYTICS_ID = 'a'.repeat(64);
const ME = { account_id: '00000000-0000-4000-8000-0000000000aa', status: 'active', pending_policies: [] };

let baseUrl = '';
let seen: Seen[] = [];
let replies: Reply[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ method: req.method ?? '', url: req.url ?? '', body });
  const reply = replies.shift() ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(reply.body ?? null));
});

const credentials: V1Credentials = { getAccessToken: async () => 'access-token', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) };
const analyticsServer = () => createAnalyticsServer(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));

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

test('read answers the consent, the analytics id and the weeks', async () => {
  replies = [{ status: 200, body: { analytics_id: ANALYTICS_ID, weeks_since_signup: 3, consent: 'yes' } }];
  assert.deepEqual(await analyticsServer().read(), { consent: 'yes', analyticsId: ANALYTICS_ID, weeksSinceSignup: 3 });
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`), ['GET /v1/me/analytics']);
});

test('a null analytics id is accepted, a malformed one is invalid_response', async () => {
  replies = [{ status: 200, body: { analytics_id: null, weeks_since_signup: 0, consent: 'no' } }];
  assert.deepEqual(await analyticsServer().read(), { consent: 'no', analyticsId: null, weeksSinceSignup: 0 });
  const malformed = [
    { analytics_id: 'a'.repeat(63), weeks_since_signup: 3, consent: 'yes' },
    { analytics_id: 'A'.repeat(64), weeks_since_signup: 3, consent: 'yes' },
    { analytics_id: ANALYTICS_ID, weeks_since_signup: -1, consent: 'yes' },
    { analytics_id: ANALYTICS_ID, weeks_since_signup: 1041, consent: 'yes' },
    { analytics_id: ANALYTICS_ID, weeks_since_signup: 2.5, consent: 'yes' },
    { analytics_id: ANALYTICS_ID, weeks_since_signup: 3, consent: 'maybe' },
    { analytics_id: ANALYTICS_ID, weeks_since_signup: 3, consent: 'yes', email: 'kan@example.com' },
  ];
  for (const body of malformed) {
    replies = [{ status: 200, body }];
    const error = await failure(() => analyticsServer().read());
    assert.equal(error.outcome, 'invalid_response', JSON.stringify(body));
  }
});

test('a server without the route falls back to /v1/me', async () => {
  replies = [{ status: 404, body: { code: 'NOT_FOUND' } }, { status: 200, body: { ...ME, privacy: { analytics: false } } }];
  assert.deepEqual(await analyticsServer().read(), { consent: 'unasked', analyticsId: null, weeksSinceSignup: null });
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`), ['GET /v1/me/analytics', 'GET /v1/me']);

  seen = [];
  replies = [{ status: 404, body: { code: 'NOT_FOUND' } }, { status: 200, body: { ...ME, privacy: { analytics: true } } }];
  assert.deepEqual(await analyticsServer().read(), { consent: 'yes', analyticsId: null, weeksSinceSignup: null });

  // Any other failure is the read's failure, not a missing route.
  seen = [];
  replies = [{ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } }];
  assert.equal((await failure(() => analyticsServer().read())).outcome, 'unavailable');
  assert.deepEqual(seen.map((request) => request.url), ['/v1/me/analytics']);
});

test('setConsent sends exactly { analytics } and checks the answer', async () => {
  replies = [{ status: 200, body: { analytics: true } }];
  await analyticsServer().setConsent(true);
  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`), ['PUT /v1/me/privacy-preferences']);
  assert.deepEqual(JSON.parse(seen[0]!.body), { analytics: true });
  assert.equal(seen[0]!.body, '{"analytics":true}');

  for (const body of [{ analytics: true }, { analytics: false, email: 'kan@example.com' }, null]) {
    replies = [{ status: 200, body }];
    assert.equal((await failure(() => analyticsServer().setConsent(false))).outcome, 'invalid_response', JSON.stringify(body));
  }
});
