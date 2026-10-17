import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials } from '../../api/client.ts';
import { V1_COMMAND_SCHEMA, createSpendV1Resources } from './resources.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; raw?: string; drop?: boolean };

const WALLET = { id: '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11', name: 'Cash', currency: 'THB', opening_minor: '403200', tracking_start: '2026-09-01', archived: false, version: 1, balance_minor: '235000' };
const ACK = { command_id: '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e', entity_id: '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', version: 1, committed_revision: '7', outcome: 'created', entity_state: 'active' };

let baseUrl = '';
let seen: Seen[] = [];
let replies: Reply[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
  const reply = replies.shift() ?? { status: 200, body: [] };
  if (reply.drop) {
    req.socket.destroy();
    return;
  }
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(reply.raw ?? JSON.stringify(reply.body ?? null));
});

let token: string | null = 'access-token';
let snapshot = { binding: 'b'.repeat(43) as string | null, epoch: 1 };
const credentials: V1Credentials = { getAccessToken: async () => token, getSessionSnapshot: () => snapshot };
const transport = () => createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 });
const resources = () => createSpendV1Resources(transport());

async function outcome(run: () => Promise<unknown>): Promise<V1Error> {
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
  token = 'access-token';
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
});

test('reads send the access token, binding and client version, and no command headers', async () => {
  replies.push({ status: 200, body: [WALLET] });
  assert.deepEqual(await resources().wallets(), [WALLET]);
  const [request] = seen;
  assert.equal(request.method, 'GET');
  assert.equal(request.url, '/v1/wallets');
  assert.equal(request.headers.authorization, 'Bearer access-token');
  assert.equal(request.headers['x-gogospend-session'], 'b'.repeat(43));
  assert.equal(request.headers['x-gogospend-client'], 'ios/1.2.3');
  assert.equal(request.headers['idempotency-key'], undefined);
});

test('signed out, unbound or unsupported clients fail before any request', async () => {
  token = null;
  assert.equal((await outcome(() => resources().wallets())).outcome, 'signed_out');
  token = 'access-token';
  snapshot = { binding: null, epoch: 1 };
  assert.equal((await outcome(() => resources().wallets())).outcome, 'signed_out');
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
  const web = createSpendV1Resources(createV1Transport({ baseUrl, credentials, client: null }));
  assert.equal((await outcome(() => web.wallets())).outcome, 'unsupported_platform');
  assert.equal(seen.length, 0);
});

test('commands send their key, the command schema and If-Match with the exact body', async () => {
  replies.push({ status: 201, body: ACK }, { status: 201, body: ACK }, { status: 200, body: ACK });
  const key = randomUUID();
  const entry = { id: ACK.entity_id, type: 'expense' as const, amount_minor: '6500', occurred_on: '2026-09-20', wallet_id: WALLET.id, category_id: '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a', note: null };
  assert.deepEqual(await resources().createTransaction(entry, key), ACK);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].url, '/v1/transactions');
  assert.equal(seen[0].headers['idempotency-key'], key);
  assert.equal(seen[0].headers['x-gogospend-command-schema'], String(V1_COMMAND_SCHEMA));
  assert.equal(seen[0].headers['if-match'], undefined);
  assert.deepEqual(JSON.parse(seen[0].body), entry);
  await resources().createTransfer({ id: randomUUID(), amount_minor: '150000', occurred_on: '2026-09-28', source_wallet_id: WALLET.id, destination_wallet_id: ACK.entity_id }, randomUUID());
  assert.equal(JSON.parse(seen[1].body).type, 'transfer');
  await resources().updateTransaction(ACK.entity_id, 3, { amount_minor: '7000' }, randomUUID());
  assert.equal(seen[2].method, 'PATCH');
  assert.equal(seen[2].url, `/v1/transactions/${ACK.entity_id}`);
  assert.equal(seen[2].headers['if-match'], '"3"');
});

test('a lost response is retried as the same immutable command', async () => {
  replies.push({ status: 0, drop: true }, { status: 201, body: ACK });
  const key = randomUUID();
  const entry = { id: ACK.entity_id, type: 'income' as const, amount_minor: '2800000', occurred_on: '2026-09-25', wallet_id: WALLET.id, category_id: '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a', note: 'Salary' };
  assert.deepEqual(await resources().createTransaction(entry, key), ACK);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].headers['idempotency-key'], key);
  assert.equal(seen[1].body, seen[0].body);
});

test('DTOs with number money or unknown fields are refused, not coerced', async () => {
  replies.push({ status: 200, body: [{ ...WALLET, opening_minor: 403200 }] });
  assert.equal((await outcome(() => resources().wallets())).outcome, 'invalid_response');
  replies.push({ status: 200, body: [{ ...WALLET, owner: 'x' }] });
  assert.equal((await outcome(() => resources().wallets())).outcome, 'invalid_response');
  replies.push({ status: 201, body: { ...ACK, version: '1' } });
  assert.equal((await outcome(() => resources().createWallet({ id: WALLET.id, name: 'Cash', opening_minor: '0', tracking_start: '2026-09-01' }, randomUUID()))).outcome, 'invalid_response');
  replies.push({ status: 200, raw: 'not json' });
  assert.equal((await outcome(() => resources().wallets())).outcome, 'invalid_response');
});

test('problems map to outcomes a screen can act on', async () => {
  const cases: [number, Record<string, unknown>, string][] = [
    [401, { code: 'SESSION_REQUIRED' }, 'signed_out'],
    [403, { code: 'POLICY_ACCEPTANCE_REQUIRED' }, 'policy_required'],
    [404, { code: 'NOT_FOUND' }, 'not_found'],
    [409, { code: 'VERSION_CONFLICT', current: { id: 'x' } }, 'conflict'],
    [409, { code: 'ENTITY_DELETED' }, 'deleted'],
    [409, { code: 'IDEMPOTENCY_MISMATCH' }, 'idempotency_mismatch'],
    [410, { code: 'ENTITY_PURGED' }, 'purged'],
    [413, { code: 'COMMAND_TOO_LARGE' }, 'too_large'],
    [422, { code: 'VALIDATION_FAILED', fields: { amount_minor: 'x' } }, 'invalid'],
    [422, { code: 'COMMAND_SCHEMA_UNSUPPORTED' }, 'schema_unsupported'],
    [426, { code: 'CLIENT_UPGRADE_REQUIRED' }, 'upgrade_required'],
    [429, { code: 'RATE_LIMITED', retry_after_seconds: 7 }, 'rate_limited'],
    [503, { code: 'SERVICE_UNAVAILABLE' }, 'unavailable'],
  ];
  for (const [status, body, expected] of cases) {
    replies.push({ status, body: { request_id: 'r', message_key: 'm', ...body } });
    const error = await outcome(() => resources().updateTransaction(ACK.entity_id, 1, { note: 'x' }, randomUUID()));
    assert.equal(error.outcome, expected, `${status} ${String(body.code)}`);
  }
  replies.push({ status: 409, body: { code: 'VERSION_CONFLICT', request_id: 'r', message_key: 'm', current: { id: 'x', version: 2 } } });
  assert.deepEqual((await outcome(() => resources().deleteTransaction(ACK.entity_id, 1, randomUUID()))).current, { id: 'x', version: 2 });
  replies.push({ status: 422, body: { code: 'VALIDATION_FAILED', request_id: 'r', message_key: 'm', fields: { amount_minor: 'errors.x' } } });
  assert.deepEqual((await outcome(() => resources().restoreTransaction(ACK.entity_id, 1, randomUUID()))).fields, { amount_minor: 'errors.x' });
  replies.push({ status: 429, body: { code: 'RATE_LIMITED', request_id: 'r', message_key: 'm', retry_after_seconds: 7 } });
  assert.equal((await outcome(() => resources().wallets())).retryAfterSeconds, 7);
});

test('a response that arrives after a sign-out or account switch is dropped', async () => {
  replies.push({ status: 200, body: [WALLET] });
  const pending = createSpendV1Resources(createV1Transport({
    baseUrl,
    client: { platform: 'android', version: '1.2.3' },
    credentials: {
      getAccessToken: async () => 'access-token',
      getSessionSnapshot: () => {
        const current = snapshot;
        snapshot = { binding: 'c'.repeat(43), epoch: 2 };
        return current;
      },
    },
  })).wallets();
  assert.equal((await outcome(() => pending)).outcome, 'session_changed');
});

test('history builds its query from the filter; a month without a budget is null', async () => {
  const page = { items: [], next_cursor: null, as_of_revision: '3', refresh_suggested: false, summary: { income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {}, count: 0 } };
  replies.push({ status: 200, body: page }, { status: 404, body: { code: 'NOT_FOUND', request_id: 'r', message_key: 'm' } });
  assert.deepEqual(await resources().history({ from: '2026-09-01', through: '2026-09-30', type: 'expense', query: 'coffee & tea', wallet_id: WALLET.id, sort: 'date_desc' }, 'abc_-1', 50), page);
  const url = new URL(seen[0].url, 'http://x');
  assert.equal(url.pathname, '/v1/history');
  assert.deepEqual(Object.fromEntries(url.searchParams), { from: '2026-09-01', through: '2026-09-30', type: 'expense', query: 'coffee & tea', wallet_id: WALLET.id, sort: 'date_desc', cursor: 'abc_-1', limit: '50' });
  assert.equal(await resources().budget('2026-09'), null);
});

test('only https, or loopback http, API addresses are accepted', () => {
  assert.throws(() => createV1Transport({ baseUrl: 'http://api.example.com', credentials, client: null }), V1Error);
  assert.throws(() => createV1Transport({ baseUrl: 'https://user:pw@api.example.com', credentials, client: null }), V1Error);
  assert.doesNotThrow(() => createV1Transport({ baseUrl: 'https://api.example.com/', credentials, client: null }));
});
