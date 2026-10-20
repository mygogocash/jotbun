// P2c client adapter (R7): retain, replace and remove a record's receipt, ask
// for a five-minute grant and download the receipt's bytes through it, against
// a local HTTP server that checks the method, path, headers and exact body.
// The time limits are checked over a held fetch with mocked timers and clock.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { RECEIPT_RETENTION_CONSENT } from '@gogospend/contracts';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials, V1SessionEnd, V1Transport } from '../../api/client.ts';
import { createAttachmentResources } from './attachments.ts';
import { V1_COMMAND_SCHEMA } from './resources.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; bytes?: Buffer; contentType?: string; drop?: boolean };

const RECORD = '0000000b-0000-4000-8000-000000000002';
const RECEIPT = '9e8d7c6b-5a49-4382-a716-151413121110';
const OTHER = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
/** A few bytes that are not text: a PNG's signature and some high bytes, so a text decoding would change them. */
const IMAGE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x41]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const GRANT = { url: '/v1/attachment-files/Zm9vYmFyLWdyYW50LXRva2Vu', expires_at: '2026-09-29T03:05:00.000Z', content_type: 'image/png', bytes: IMAGE.length, sha256: sha(IMAGE) } as const;
const ack = (commandId: string, version = 4, extra: Record<string, unknown> = {}) => ({
  command_id: commandId, entity_id: RECORD, version, committed_revision: '41', outcome: 'updated', entity_state: 'active', ...extra,
});

let baseUrl = '';
let seen: Seen[] = [];
let replies: Reply[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
  const reply = replies.shift() ?? { status: 200, body: null };
  if (reply.drop) {
    req.socket.destroy();
    return;
  }
  if (reply.bytes) {
    res.writeHead(reply.status, { 'content-type': reply.contentType ?? 'image/png', 'content-length': String(reply.bytes.length) });
    res.end(reply.bytes);
    return;
  }
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(reply.body ?? null));
});

let token: string | null = 'access-token';
let snapshot = { binding: 'b'.repeat(43) as string | null, epoch: 1 };
let ended: V1SessionEnd[] = [];
let refreshes = 0;
const credentials: V1Credentials = {
  getAccessToken: async () => token,
  getSessionSnapshot: () => snapshot,
  refreshAfterUnauthorized: async () => {
    refreshes += 1;
    token = 'renewed-token';
    return true;
  },
  sessionEnded: (event) => { ended.push(event); },
};
const client = { platform: 'ios' as const, version: '1.2.3' };
const attachments = (transport: V1Transport = createV1Transport({ baseUrl, credentials, client, timeoutMs: 2_000 })) =>
  createAttachmentResources(transport, { sha256Hex: async (bytes) => sha(bytes) });

/**
 * The app's transport (its default limit for an ordinary call) over a fetch
 * that answers only when the test says, and fails as soon as its request is
 * aborted: with mocked timers, a test moves the clock past a time limit.
 */
function heldAttachments() {
  const sent: { headers: Record<string, string>; body: unknown; signal: AbortSignal; answer: (body: unknown, status?: number) => void }[] = [];
  const fetchImpl = ((_url: string | URL | Request, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
    const signal = init.signal as AbortSignal;
    const answer = (body: unknown, status = 200) => resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
    sent.push({ headers: init.headers as Record<string, string>, body: init.body, signal, answer });
    signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  })) as typeof fetch;
  return { sent, resources: attachments(createV1Transport({ baseUrl, credentials, client, fetchImpl })) };
}
/** Lets every pending promise step run (timers are mocked; setImmediate is not). */
const settle = () => new Promise<void>((resolve) => { setImmediate(resolve); });

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
  ended = [];
  refreshes = 0;
  token = 'access-token';
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
});

function assertCommand(request: Seen, method: string, key: string, ifMatch: number) {
  assert.equal(request.method, method);
  assert.equal(request.url, `/v1/transactions/${RECORD}/attachment`);
  assert.equal(request.headers['idempotency-key'], key);
  assert.equal(request.headers['x-gogospend-command-schema'], String(V1_COMMAND_SCHEMA));
  assert.equal(request.headers['if-match'], `"${ifMatch}"`);
  assert.equal(request.headers.authorization, 'Bearer access-token');
  assert.equal(request.headers['x-gogospend-session'], 'b'.repeat(43));
  assert.equal(request.headers['x-gogospend-client'], 'ios/1.2.3');
}

test('retain posts the receipt with the retention consent, its own key and the record\'s If-Match', async () => {
  const key = randomUUID();
  replies.push({ status: 200, body: ack(key) });
  // Anything else the caller hands over is not sent: only the receipt and the consent.
  const input = { attachment_id: RECEIPT, consent: 'something else', note: 'x' } as unknown as { attachment_id: string };
  assert.deepEqual(await attachments().retain(RECORD, 3, input, key), ack(key));
  assertCommand(seen[0], 'POST', key, 3);
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.equal(seen[0].body, JSON.stringify({ attachment_id: RECEIPT, consent: 'retain_receipt' }));
  assert.equal(RECEIPT_RETENTION_CONSENT, 'retain_receipt');
});

test('replace puts the new receipt with the consent; remove deletes with no body', async () => {
  const replaceKey = randomUUID();
  const removeKey = randomUUID();
  replies.push({ status: 200, body: ack(replaceKey, 6) }, { status: 200, body: ack(removeKey, 7) });
  assert.deepEqual(await attachments().replace(RECORD, 5, { attachment_id: OTHER }, replaceKey), ack(replaceKey, 6));
  assertCommand(seen[0], 'PUT', replaceKey, 5);
  assert.equal(seen[0].body, JSON.stringify({ attachment_id: OTHER, consent: RECEIPT_RETENTION_CONSENT }));
  assert.deepEqual(await attachments().remove(RECORD, 6, removeKey), ack(removeKey, 7));
  assertCommand(seen[1], 'DELETE', removeKey, 6);
  assert.equal(seen[1].body, '');
  assert.equal(seen[1].headers['content-type'], undefined);
});

test('a lost response is resent as the same command: same key, same If-Match, same body', async () => {
  const key = randomUUID();
  replies.push({ status: 0, drop: true }, { status: 200, body: ack(key) });
  assert.deepEqual(await attachments().retain(RECORD, 3, { attachment_id: RECEIPT }, key), ack(key));
  assert.equal(seen.length, 2);
  assert.equal(seen[1].headers['idempotency-key'], key);
  assert.equal(seen[1].headers['if-match'], '"3"');
  assert.equal(seen[1].body, seen[0].body);
});

test('an acknowledgement must be this command\'s, for this record, an update past the version sent', async () => {
  const key = randomUUID();
  const refused = [
    ack(randomUUID()),
    { ...ack(key), entity_id: OTHER },
    ack(key, 4, { outcome: 'created' }),
    ack(key, 4, { entity_state: 'deleted' }),
    ack(key, 3),
    { ...ack(key), extra: true },
  ];
  for (const body of refused) {
    replies.push({ status: 200, body });
    const error = await outcome(() => attachments().retain(RECORD, 3, { attachment_id: RECEIPT }, key));
    assert.equal(error.outcome, 'invalid_response', JSON.stringify(body));
  }
  for (const body of [ack(randomUUID(), 6), { ...ack(key, 6), entity_id: OTHER }]) {
    replies.push({ status: 200, body });
    assert.equal((await outcome(() => attachments().remove(RECORD, 5, key))).outcome, 'invalid_response');
  }
});

test('malformed ids, keys and versions are refused before anything is sent, as rejections', async () => {
  const key = randomUUID();
  const resources = attachments();
  const attempts: [string, () => Promise<unknown>][] = [
    ['record', () => resources.retain('not-a-uuid', 3, { attachment_id: RECEIPT }, key)],
    ['upper-case record', () => resources.retain('0000000B-0000-4000-8000-000000000002', 3, { attachment_id: RECEIPT }, key)],
    ['path in record', () => resources.remove(`${RECORD}/../x`, 3, key)],
    ['receipt', () => resources.retain(RECORD, 3, { attachment_id: 'receipt/1/image.jpg' }, key)],
    ['replace receipt', () => resources.replace(RECORD, 3, { attachment_id: '' }, key)],
    ['key', () => resources.retain(RECORD, 3, { attachment_id: RECEIPT }, 'key-1')],
    ['remove key', () => resources.remove(RECORD, 3, '')],
    ['zero version', () => resources.retain(RECORD, 0, { attachment_id: RECEIPT }, key)],
    ['fractional version', () => resources.replace(RECORD, 1.5, { attachment_id: RECEIPT }, key)],
    ['negative version', () => resources.remove(RECORD, -2, key)],
    ['grant id', () => resources.grant('../imports')],
  ];
  for (const [name, attempt] of attempts) {
    let promise: Promise<unknown> | undefined;
    assert.doesNotThrow(() => { promise = attempt(); }, name);
    const error = await outcome(() => promise as Promise<unknown>);
    assert.equal(error.outcome, 'invalid', name);
  }
  assert.equal(seen.length, 0);
});

test('refusals keep their outcome: a stale version carries the current record, a passed window names the field', async () => {
  const key = randomUUID();
  const current = { id: RECORD, type: 'expense', amount_minor: '18200', occurred_on: '2026-09-26', wallet_id: OTHER, category_id: OTHER, note: null, merchant: null, deleted_at: null, version: 5 };
  replies.push(
    { status: 409, body: { code: 'VERSION_CONFLICT', message: 'stale', current } },
    { status: 422, body: { code: 'VALIDATION_FAILED', message: 'expired', fields: { attachment_id: 'errors.attachment_expired' } } },
    { status: 503, body: { code: 'IMPORTS_PAUSED', message: 'paused', retry_after_seconds: 300 } },
  );
  const conflict = await outcome(() => attachments().retain(RECORD, 3, { attachment_id: RECEIPT }, key));
  assert.equal(conflict.outcome, 'conflict');
  assert.deepEqual(conflict.current, current);
  const expired = await outcome(() => attachments().retain(RECORD, 3, { attachment_id: RECEIPT }, key));
  assert.equal(expired.outcome, 'invalid');
  assert.deepEqual(expired.fields, { attachment_id: 'errors.attachment_expired' });
  const paused = await outcome(() => attachments().remove(RECORD, 3, key));
  assert.equal(paused.outcome, 'unavailable');
  assert.equal(paused.code, 'IMPORTS_PAUSED');
});

test('a grant is read for the receipt (no command headers) and must be exactly the grant shape', async () => {
  replies.push({ status: 200, body: GRANT });
  assert.deepEqual(await attachments().grant(RECEIPT), GRANT);
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].url, `/v1/attachments/${RECEIPT}/grant`);
  assert.equal(seen[0].headers['idempotency-key'], undefined);
  assert.equal(seen[0].headers['if-match'], undefined);
  for (const body of [{ ...GRANT, key: 'receipt/a/b/image.png' }, { ...GRANT, url: 'https://r2.example/receipt.png' }, { ...GRANT, bytes: '15' }, { ...GRANT, sha256: 'ABC' }]) {
    replies.push({ status: 200, body });
    assert.equal((await outcome(() => attachments().grant(RECEIPT))).outcome, 'invalid_response', JSON.stringify(body));
  }
  replies.push({ status: 404, body: { code: 'NOT_FOUND', message: 'nope' } });
  assert.equal((await outcome(() => attachments().grant(RECEIPT))).outcome, 'not_found');
});

test('the file comes through the grant with the session\'s headers, byte for byte, checked against its size and digest', async () => {
  replies.push({ status: 200, bytes: IMAGE });
  const bytes = await attachments().file(GRANT);
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes], [...IMAGE]);
  const [request] = seen;
  assert.equal(request.method, 'GET');
  assert.equal(request.url, GRANT.url);
  assert.equal(request.headers.authorization, 'Bearer access-token');
  assert.equal(request.headers['x-gogospend-session'], 'b'.repeat(43));
  assert.equal(request.headers['x-gogospend-client'], 'ios/1.2.3');
  assert.equal(request.headers.accept, 'image/jpeg, image/png, image/webp, application/json');
  assert.equal(request.headers['idempotency-key'], undefined);

  const changed = Buffer.from(IMAGE);
  changed[9] = 0x00;
  replies.push({ status: 200, bytes: changed }, { status: 200, bytes: IMAGE.subarray(0, 10) });
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'invalid_response');
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'invalid_response');
});

test('a download whose access token expired is refreshed once and sent again, as every v1 read is', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED', message: 'expired' } }, { status: 200, bytes: IMAGE });
  const bytes = await attachments().file(GRANT);
  assert.deepEqual([...bytes], [...IMAGE]);
  assert.equal(refreshes, 1);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].url, GRANT.url);
  assert.equal(seen[1].headers.authorization, 'Bearer renewed-token');
  assert.equal(seen[1].headers['x-gogospend-session'], 'b'.repeat(43));
  assert.deepEqual(ended, []);

  // One refresh per download: a second 401 is a sign-out.
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 401, body: { code: 'UNAUTHENTICATED' } });
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'signed_out');
  assert.equal(refreshes, 2);
  assert.equal(seen.length, 4);
});

test('an expired or foreign grant is not found; a busy server is unavailable; nothing is sent for a malformed grant', async () => {
  replies.push({ status: 404, body: { code: 'NOT_FOUND', message: 'gone' } }, { status: 503, body: { code: 'SERVICE_UNAVAILABLE', message: 'busy', retry_after_seconds: 5 } });
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'not_found');
  const busy = await outcome(() => attachments().file(GRANT));
  assert.equal(busy.outcome, 'unavailable');
  assert.equal(busy.retryAfterSeconds, 5);
  const before = seen.length;
  for (const grant of [{ ...GRANT, url: 'https://storage.example/receipt.png' }, { ...GRANT, url: '/v1/attachment-files/../exports/x' }, { ...GRANT, bytes: 0 }]) {
    assert.equal((await outcome(() => attachments().file(grant as typeof GRANT))).outcome, 'invalid', grant.url);
  }
  assert.equal(seen.length, before);
});

test('downloads need a session: signed out, unbound, another platform and a session that changed meanwhile', async () => {
  token = null;
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'signed_out');
  token = 'access-token';
  snapshot = { binding: null, epoch: 1 };
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'signed_out');
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
  const web = attachments(createV1Transport({ baseUrl, credentials, client: null }));
  assert.equal((await outcome(() => web.file(GRANT))).outcome, 'unsupported_platform');
  assert.equal(seen.length, 0);
  // The transport it goes through refuses a remote API without HTTPS.
  assert.throws(() => createV1Transport({ baseUrl: 'http://example.com', credentials, client }), (error: unknown) => error instanceof V1Error && error.code === 'CONFIG_REQUIRED');

  // The session moves on while the image is on its way: its bytes are dropped.
  const moving: V1Credentials = { ...credentials, getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: seen.length > 0 ? 2 : 1 }) };
  replies.push({ status: 200, bytes: IMAGE });
  assert.equal((await outcome(() => attachments(createV1Transport({ baseUrl, credentials: moving, client })).file(GRANT))).outcome, 'session_changed');

  // The server ended the session: reported with the epoch the request went under, and not refreshed.
  replies.push({ status: 401, body: { code: 'SESSION_REQUIRED', message: 'ended' } });
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'signed_out');
  assert.deepEqual(ended, [{ code: 'SESSION_REQUIRED', epoch: 1 }]);
  assert.equal(refreshes, 0);

  // Nothing reachable: an outage, not a sign-out.
  replies.push({ status: 0, drop: true });
  assert.equal((await outcome(() => attachments().file(GRANT))).outcome, 'network');
});

test('retain and replace wait past the server\'s 60 s copy, where an ordinary call would have given up', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sent, resources } = heldAttachments();
  const retainKey = randomUUID();
  const replaceKey = randomUUID();
  const commands = [
    { name: 'retain', key: retainKey, run: () => resources.retain(RECORD, 3, { attachment_id: RECEIPT }, retainKey) },
    { name: 'replace', key: replaceKey, run: () => resources.replace(RECORD, 3, { attachment_id: OTHER }, replaceKey) },
  ];
  for (const command of commands) {
    const answered = command.run();
    await settle();
    const request = sent.at(-1);
    assert.ok(request, command.name);
    t.mock.timers.tick(61_000);
    assert.equal(request.signal.aborted, false, `${command.name} still waits for the copy at 61 s`);
    request.answer(ack(command.key));
    assert.deepEqual(await answered, ack(command.key), command.name);
  }
  assert.equal(sent.length, 2);
});

test('a retain that does give up is resent as the same command: same key, same If-Match, same body', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { sent, resources } = heldAttachments();
  const key = randomUUID();
  const retained = resources.retain(RECORD, 3, { attachment_id: RECEIPT }, key);
  await settle();
  // Not forever: by 90 s it gave up on that answer.
  t.mock.timers.tick(90_000);
  assert.equal(sent[0].signal.aborted, true);
  await settle();
  t.mock.timers.tick(250);
  await settle();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].headers['Idempotency-Key'], key);
  assert.equal(sent[1].headers['If-Match'], '"3"');
  assert.equal(sent[1].body, sent[0].body);
  sent[1].answer(ack(key));
  assert.deepEqual(await retained, ack(key));
});

test('a retain or replace ends by 100 s in all: a resend gets only what is left, never a fresh 90 s', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { sent, resources } = heldAttachments();
  const retainKey = randomUUID();
  const replaceKey = randomUUID();
  const commands = [
    { name: 'retain', key: retainKey, run: () => resources.retain(RECORD, 3, { attachment_id: RECEIPT }, retainKey) },
    { name: 'replace', key: replaceKey, run: () => resources.replace(RECORD, 3, { attachment_id: OTHER }, replaceKey) },
  ];
  for (const command of commands) {
    const first = sent.length;
    const failed = outcome(command.run);
    await settle();
    t.mock.timers.tick(90_000);
    assert.equal(sent[first].signal.aborted, true, `${command.name} gives up on that answer at 90 s`);
    await settle();
    t.mock.timers.tick(250);
    await settle();
    const resend = sent[first + 1];
    assert.ok(resend, `${command.name} is resent`);
    assert.equal(resend.headers['Idempotency-Key'], command.key);
    t.mock.timers.tick(8_750);
    assert.equal(resend.signal.aborted, false, `${command.name}'s resend still waits at 99 s`);
    t.mock.timers.tick(1_000);
    assert.equal(resend.signal.aborted, true, `${command.name} has given up by 100 s`);
    await settle();
    t.mock.timers.tick(500);
    await settle();
    assert.equal(sent.length, first + 2, `${command.name}: nothing is sent past the limit`);
    const timedOut = await failed;
    assert.equal(timedOut.outcome, 'network', command.name);
    assert.equal(timedOut.code, 'TIMEOUT', command.name);
  }
});

test('a retain refreshed after a 401 stays within the same 100 s: its resend gets only what is left', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { sent, resources } = heldAttachments();
  const key = randomUUID();
  const failed = outcome(() => resources.retain(RECORD, 3, { attachment_id: RECEIPT }, key));
  await settle();
  t.mock.timers.tick(60_000);
  sent[0].answer({ code: 'UNAUTHENTICATED' }, 401);
  for (let step = 0; step < 5 && sent.length < 2; step += 1) await settle();
  assert.equal(refreshes, 1);
  const resend = sent[1];
  assert.ok(resend, 'resent with the renewed token');
  assert.equal(resend.headers.Authorization, 'Bearer renewed-token');
  assert.equal(resend.headers['Idempotency-Key'], key);
  assert.equal(resend.body, sent[0].body);
  t.mock.timers.tick(39_000);
  assert.equal(resend.signal.aborted, false, 'still waits at 99 s');
  t.mock.timers.tick(1_000);
  assert.equal(resend.signal.aborted, true, 'given up by 100 s, not at 150 s');
  await settle();
  t.mock.timers.tick(250);
  await settle();
  assert.equal(sent.length, 2, 'nothing is sent past the limit');
  assert.equal((await failed).code, 'TIMEOUT');
});

test('remove and the grant keep the transport\'s own limit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { sent, resources } = heldAttachments();
  const granted = resources.grant(RECEIPT);
  await settle();
  t.mock.timers.tick(20_000);
  assert.equal(sent[0].signal.aborted, true);
  const timedOut = await outcome(() => granted);
  assert.equal(timedOut.outcome, 'network');
  assert.equal(timedOut.code, 'TIMEOUT');
  assert.equal(sent.length, 1, 'a read is not resent');

  const key = randomUUID();
  const removed = resources.remove(RECORD, 3, key);
  await settle();
  t.mock.timers.tick(20_000);
  assert.equal(sent[1].signal.aborted, true);
  await settle();
  t.mock.timers.tick(250);
  await settle();
  assert.equal(sent[2].headers['Idempotency-Key'], key);
  // No overall limit here: the resend gets the transport's full 20 s again.
  t.mock.timers.tick(19_999);
  assert.equal(sent[2].signal.aborted, false);
  sent[2].answer(ack(key));
  assert.deepEqual(await removed, ack(key));
});
