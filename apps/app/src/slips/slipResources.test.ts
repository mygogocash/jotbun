// P4-T12: the phone's slip calls, through the real v1 transport to a local
// server that records each request. Each call sends its route, its body and
// its headers and refuses an answer of any other shape; the slip read sends
// its batch as JSON bytes for the route's stream, waits 90 seconds and is
// never resent by the transport; a stale account update throws
// VERSION_CONFLICT with the account as it is now. And the fake slip server
// that later tasks drive answers as the server does.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { SLIP_INBOX_ID, SLIP_LIMITS, isBankAlbumsDto, isSlipAccountsDto, isSlipBatchResult, isSlipDraftsPage, isSlipSaltDto } from '@gogospend/contracts';
import type { BankAlbumDto, DeviceRegistration, SlipAccountDto, SlipBatchRequest, SlipBatchResult, SlipDraftDto, SlipDraftsPage } from '@gogospend/contracts';

import { V1Error, createV1Transport } from '../api/client.ts';
import type { V1Credentials, V1RequestOptions, V1Transport } from '../api/client.ts';
import { isCommandAck } from '../spend/v1/resources.ts';
import { createSlipResources } from './slipResources.ts';
import type { SlipResources } from './slipResources.ts';
import { FAKE_SLIP_SALT, fakeSlipResources } from './testing/fakeSlipResources.ts';

type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
type Reply = { status: number; body?: unknown; drop?: boolean };

const SALT = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA';
const HASH = 'c4f3b6c8f15a0e588cfdb0a59d02f281e28eae69f0a3f8b22d6bda69f7ec1493';
const HASH_2 = 'f206ae1301b4dc7472cc7680335bc23d1eb1fae34c91eaa6094ca2b9c21fb531';
const KEY = '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e'; // the caller's command id
const NEW_KEY = '7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'; // the account update's own new id
const DRAFT_ID = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const RECORD_ID = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a';
const ACCOUNT_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const WALLET_ID = '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11';

const BATCH: SlipBatchRequest = { purpose: 'backfill', last: true, today: '2026-11-09', locale: 'th', slips: [{ ref_hash: HASH, image_base64: '/9j/4AAQSkZJRg==', media_type: 'image/jpeg', album: 'K PLUS', origin: 'album' }] };
const DRAFT: SlipDraftDto = {
  id: DRAFT_ID, amount_minor: '125050', occurred_on: '2026-11-08', occurred_time: '18:40', direction: 'out',
  from: { bank: 'kbank', account_last4: '1234', name: 'นาย กานต์ ใจดี' }, to: { bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง ข้าวแกง' },
  category_id: null, category_guessed: false, flags: [], album: 'K PLUS', origin: 'album', model: 'claude-haiku-5-5', escalated: false,
  created_at: '2026-11-09T02:00:00.000Z', expires_at: '2026-12-09T02:00:00.000Z', duplicate_of: null,
};
const RESULT: SlipBatchResult = { results: [{ ref_hash: HASH, outcome: 'read', draft: DRAFT }], uses_left: { live: 10, backfill: 499 }, retry_after_seconds: null };
const PAGE: SlipDraftsPage = { drafts: [DRAFT], total: 1, next_cursor: null };
const ACCOUNT: SlipAccountDto = { id: ACCOUNT_ID, version: 1, bank: 'kbank', account_last4: '1234', wallet_id: null, open_drafts: 3 };
const ALBUM: BankAlbumDto = { bank: 'kbank', platform: 'ios', album_name: 'K PLUS' };
const DEVICE: DeviceRegistration = { push_token: 'ExponentPushToken[abc123]', platform: 'ios', language: 'th', slip_notices: true };
const CONFIRMING = [{ draft_id: DRAFT_ID, transaction: { id: RECORD_ID, type: 'expense', amount_minor: '125050' } }];
const ackOf = (commandId: string, outcome: string) => ({ command_id: commandId, entity_id: SLIP_INBOX_ID, version: 4, committed_revision: '12', outcome, entity_state: 'active' });

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
  res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body));
});

const credentials: V1Credentials = { getAccessToken: async () => 'access-token', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) };
const slips = () => createSlipResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }), async () => NEW_KEY);

async function refusal(run: () => Promise<unknown>): Promise<V1Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof V1Error) return error;
    throw error;
  }
  return assert.fail('expected a V1Error');
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

test('each slip call sends its route, its body and its headers, and refuses an answer of any other shape', async () => {
  // `type`: the Content-Type sent. JSON bodies go as application/json; the slip batch as bytes for the route's stream.
  type Case = { name: string; call: (resources: SlipResources) => Promise<unknown>; method: string; url: string; body?: unknown; type?: string; key?: string; ifMatch?: string; reply: Reply; answer: unknown; bad: unknown };
  const JSON_TYPE = 'application/json';
  const mapped = { ...ACCOUNT, version: 2, wallet_id: WALLET_ID };
  const cases: Case[] = [
    { name: 'salt', call: (r) => r.salt(), method: 'GET', url: '/v1/slips/salt', reply: { status: 200, body: { salt: SALT } }, answer: { salt: SALT }, bad: { salt: SALT.slice(1) } },
    { name: 'read', call: (r) => r.read(BATCH), method: 'POST', url: '/v1/slips', body: BATCH, type: 'application/octet-stream', reply: { status: 200, body: RESULT }, answer: RESULT, bad: { ...RESULT, uses_left: { live: 10 } } },
    { name: 'drafts', call: (r) => r.drafts(), method: 'GET', url: '/v1/drafts', reply: { status: 200, body: PAGE }, answer: PAGE, bad: { ...PAGE, drafts: [{ ...DRAFT, amount_minor: 125050 }] } },
    { name: 'drafts, a later page', call: (r) => r.drafts('c2xpcHM_-1', 20), method: 'GET', url: '/v1/drafts?cursor=c2xpcHM_-1&limit=20', reply: { status: 200, body: PAGE }, answer: PAGE, bad: { ...PAGE, next_cursor: 'not a cursor' } },
    { name: 'confirm', call: (r) => r.confirm(CONFIRMING, KEY), method: 'POST', url: '/v1/drafts/confirm', body: { drafts: CONFIRMING }, type: JSON_TYPE, key: KEY, reply: { status: 200, body: ackOf(KEY, 'accepted') }, answer: ackOf(KEY, 'accepted'), bad: { ...ackOf(KEY, 'accepted'), entity_id: RECORD_ID } },
    { name: 'dismiss', call: (r) => r.dismiss(DRAFT_ID, KEY), method: 'POST', url: `/v1/drafts/${DRAFT_ID}/dismiss`, body: {}, type: JSON_TYPE, key: KEY, reply: { status: 200, body: ackOf(KEY, 'updated') }, answer: ackOf(KEY, 'updated'), bad: ackOf(NEW_KEY, 'updated') },
    { name: 'accounts', call: (r) => r.accounts(), method: 'GET', url: '/v1/slip-accounts', reply: { status: 200, body: { accounts: [ACCOUNT] } }, answer: [ACCOUNT], bad: [ACCOUNT] },
    { name: 'map an account', call: (r) => r.updateAccount(ACCOUNT_ID, 1, WALLET_ID), method: 'PUT', url: `/v1/slip-accounts/${ACCOUNT_ID}`, body: { wallet_id: WALLET_ID }, type: JSON_TYPE, key: NEW_KEY, ifMatch: '"1"', reply: { status: 200, body: mapped }, answer: mapped, bad: { ...mapped, id: WALLET_ID } },
    { name: 'unmap an account', call: (r) => r.updateAccount(ACCOUNT_ID, 2, null), method: 'PUT', url: `/v1/slip-accounts/${ACCOUNT_ID}`, body: { wallet_id: null }, type: JSON_TYPE, key: NEW_KEY, ifMatch: '"2"', reply: { status: 200, body: { ...ACCOUNT, version: 3 } }, answer: { ...ACCOUNT, version: 3 }, bad: { ...ACCOUNT, version: 3, open_drafts: -1 } },
    { name: 'recordRef', call: (r) => r.recordRef({ ref_hash: HASH, transaction_id: RECORD_ID }), method: 'POST', url: '/v1/slips/refs', body: { ref_hash: HASH, transaction_id: RECORD_ID }, type: JSON_TYPE, reply: { status: 204 }, answer: undefined, bad: {} },
    { name: 'bankAlbums', call: (r) => r.bankAlbums(), method: 'GET', url: '/v1/catalog/bank-albums', reply: { status: 200, body: { albums: [ALBUM] } }, answer: [ALBUM], bad: { albums: [{ ...ALBUM, bank: 'krungthai' }] } },
    { name: 'registerDevice', call: (r) => r.registerDevice(DEVICE), method: 'PUT', url: '/v1/devices', body: DEVICE, type: JSON_TYPE, reply: { status: 204 }, answer: undefined, bad: { registered: true } },
  ];
  for (const c of cases) {
    seen = [];
    replies = [c.reply, { status: 200, body: c.bad }];
    assert.deepEqual(await c.call(slips()), c.answer, c.name);
    const [request] = seen;
    assert.equal(request.method, c.method, c.name);
    assert.equal(request.url, c.url, c.name);
    assert.deepEqual(request.body === '' ? undefined : JSON.parse(request.body), c.body, c.name);
    assert.equal(request.headers['content-type'], c.type, c.name);
    assert.equal(request.headers['idempotency-key'], c.key, c.name);
    assert.equal(request.headers['x-gogospend-command-schema'], c.key === undefined ? undefined : '1', c.name);
    assert.equal(request.headers['if-match'], c.ifMatch, c.name);
    assert.equal((await refusal(() => c.call(slips()))).code, 'INVALID_RESPONSE', c.name);
    assert.equal(seen.length, 2, c.name);
  }
  // An id in a path is a UUID, or nothing is sent.
  seen = [];
  assert.equal((await refusal(() => slips().dismiss('../../me/logout', KEY))).code, 'INVALID_ID');
  assert.equal((await refusal(() => slips().updateAccount('kbank-1234', 1, null))).code, 'INVALID_ID');
  assert.equal(seen.length, 0);
});

test('the slip read waits 90 seconds and a lost answer is not resent by the transport', async () => {
  const asked: { method: string; path: string; options: V1RequestOptions<unknown> }[] = [];
  const recording: V1Transport = {
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, options: V1RequestOptions<T>): Promise<T> {
      asked.push({ method, path, options: options as V1RequestOptions<unknown> });
      const answer: unknown = RESULT;
      if (!options.validate(answer)) throw new Error('not a slip batch answer');
      return answer;
    },
  };
  assert.deepEqual(await createSlipResources(recording).read(BATCH), RESULT);
  assert.equal(SLIP_LIMITS.clientTimeoutMs, 90_000);
  assert.deepEqual(asked.map(({ method, path, options }) => [method, path, options.timeoutMs, options.command, options.body, options.raw?.contentType]), [
    ['POST', '/v1/slips', 90_000, undefined, undefined, 'application/octet-stream'],
  ]);
  // The bytes are the batch's JSON, which the route reads from its stream and parses (P4-T6).
  assert.deepEqual(JSON.parse(new TextDecoder().decode(asked[0].options.raw?.bytes)), BATCH);
  // Over the real transport a dropped connection is one request: nothing sends the batch again.
  replies = [{ status: 0, drop: true }, { status: 200, body: RESULT }];
  const lost = await refusal(() => slips().read(BATCH));
  assert.equal(lost.outcome, 'network');
  assert.equal(seen.length, 1);
});

test('a stale account update throws VERSION_CONFLICT with the current account', async () => {
  const current = { ...ACCOUNT, version: 2, wallet_id: WALLET_ID };
  replies = [{ status: 409, body: { code: 'VERSION_CONFLICT', current } }];
  const stale = await refusal(() => slips().updateAccount(ACCOUNT_ID, 1, null));
  assert.deepEqual([stale.status, stale.code, stale.outcome], [409, 'VERSION_CONFLICT', 'conflict']);
  assert.deepEqual(stale.current, current);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers['if-match'], '"1"');
});

test('the fake slip server answers in the contract shapes, keeps what was confirmed, dismissed and mapped, and refuses a draft that is gone', async () => {
  const second = { ...DRAFT, id: '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4e' };
  const third = { ...DRAFT, id: '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4f' };
  const fake = fakeSlipResources({
    drafts: [DRAFT, second, third],
    accounts: [ACCOUNT],
    albums: [ALBUM],
    read: (item, index) => (index === 0 ? { ref_hash: item.ref_hash, outcome: 'read', draft: DRAFT } : { ref_hash: item.ref_hash, outcome: 'duplicate', draft: null }),
  });
  assert.deepEqual(await fake.salt(), FAKE_SLIP_SALT);
  assert.ok(isSlipSaltDto(FAKE_SLIP_SALT));
  const read = await fake.read({ ...BATCH, slips: [BATCH.slips[0], { ...BATCH.slips[0], ref_hash: HASH_2 }] });
  assert.ok(isSlipBatchResult(read));
  assert.deepEqual(read.results.map((result) => [result.ref_hash, result.outcome]), [[HASH, 'read'], [HASH_2, 'duplicate']]);
  assert.deepEqual((await fakeSlipResources().read(BATCH)).results, [{ ref_hash: HASH, outcome: 'unreadable', draft: null }]);
  const first = await fake.drafts(undefined, 2);
  assert.ok(isSlipDraftsPage(first));
  assert.deepEqual([first.drafts.map((draft) => draft.id), first.total, first.next_cursor], [[DRAFT.id, second.id], 3, '2']);
  const rest = await fake.drafts('2', 2);
  assert.deepEqual([rest.drafts.map((draft) => draft.id), rest.total, rest.next_cursor], [[third.id], 3, null]);
  const confirmed = await fake.confirm(CONFIRMING, KEY);
  const dismissed = await fake.dismiss(second.id, NEW_KEY);
  assert.ok(isCommandAck(confirmed) && isCommandAck(dismissed));
  assert.deepEqual([confirmed.command_id, confirmed.entity_id, confirmed.outcome], [KEY, SLIP_INBOX_ID, 'accepted']);
  assert.deepEqual([dismissed.command_id, dismissed.entity_id, dismissed.outcome], [NEW_KEY, SLIP_INBOX_ID, 'updated']);
  const left = await fake.drafts();
  assert.deepEqual([left.drafts.map((draft) => draft.id), left.total, left.next_cursor], [[third.id], 1, null]);
  // A draft already gone (confirmed or dismissed, here or on another phone): the whole confirm is 409 and takes
  // nothing out, and its dismiss is 404 (P4-T7).
  const stillOpen = { draft_id: third.id, transaction: { id: RECORD_ID } };
  const raced = await refusal(() => fake.confirm([stillOpen, ...CONFIRMING], NEW_KEY));
  assert.deepEqual([raced.status, raced.code, raced.outcome], [409, 'VERSION_CONFLICT', 'conflict']);
  assert.equal((await refusal(() => fake.dismiss(second.id, KEY))).status, 404);
  assert.deepEqual((await fake.drafts()).drafts.map((draft) => draft.id), [third.id]);
  const mapped = await fake.updateAccount(ACCOUNT_ID, 1, WALLET_ID);
  assert.deepEqual(mapped, { ...ACCOUNT, version: 2, wallet_id: WALLET_ID });
  const accounts = await fake.accounts();
  assert.ok(isSlipAccountsDto({ accounts }));
  assert.deepEqual(accounts, [mapped]);
  const stale = await refusal(() => fake.updateAccount(ACCOUNT_ID, 1, null));
  assert.deepEqual([stale.status, stale.code, stale.current], [409, 'VERSION_CONFLICT', mapped]);
  assert.equal((await refusal(() => fake.updateAccount(WALLET_ID, 1, null))).status, 404);
  await fake.recordRef({ ref_hash: HASH, transaction_id: RECORD_ID });
  const albums = await fake.bankAlbums();
  assert.ok(isBankAlbumsDto({ albums }));
  assert.deepEqual(albums, [ALBUM]);
  await fake.registerDevice(DEVICE);
  assert.deepEqual(fake.calls.slice(1, 4), [
    { method: 'read', body: { ...BATCH, slips: [BATCH.slips[0], { ...BATCH.slips[0], ref_hash: HASH_2 }] } },
    { method: 'drafts', body: { cursor: null, limit: 2 } },
    { method: 'drafts', body: { cursor: '2', limit: 2 } },
  ]);
  assert.deepEqual(fake.calls.slice(4), [
    { method: 'confirm', body: { drafts: CONFIRMING, commandId: KEY } },
    { method: 'dismiss', body: { draftId: second.id, commandId: NEW_KEY } },
    { method: 'drafts', body: { cursor: null, limit: null } },
    { method: 'confirm', body: { drafts: [stillOpen, ...CONFIRMING], commandId: NEW_KEY } },
    { method: 'dismiss', body: { draftId: second.id, commandId: KEY } },
    { method: 'drafts', body: { cursor: null, limit: null } },
    { method: 'updateAccount', body: { id: ACCOUNT_ID, version: 1, walletId: WALLET_ID } },
    { method: 'accounts' },
    { method: 'updateAccount', body: { id: ACCOUNT_ID, version: 1, walletId: null } },
    { method: 'updateAccount', body: { id: WALLET_ID, version: 1, walletId: null } },
    { method: 'recordRef', body: { ref_hash: HASH, transaction_id: RECORD_ID } },
    { method: 'bankAlbums' },
    { method: 'registerDevice', body: DEVICE },
  ]);
});

test('with slip import closed the fake answers only the salt, slip refs, bank albums and devices, and every other slip call is 404', async () => {
  const fake = fakeSlipResources({ slipImportOn: false, drafts: [DRAFT], accounts: [ACCOUNT], albums: [ALBUM] });
  assert.deepEqual(await fake.salt(), FAKE_SLIP_SALT);
  await fake.recordRef({ ref_hash: HASH, transaction_id: RECORD_ID });
  assert.deepEqual(await fake.bankAlbums(), [ALBUM]);
  await fake.registerDevice(DEVICE);
  const closed: [string, () => Promise<unknown>][] = [
    ['read', () => fake.read(BATCH)],
    ['drafts', () => fake.drafts()],
    ['confirm', () => fake.confirm(CONFIRMING, KEY)],
    ['dismiss', () => fake.dismiss(DRAFT_ID, KEY)],
    ['accounts', () => fake.accounts()],
    ['updateAccount', () => fake.updateAccount(ACCOUNT_ID, 1, null)],
  ];
  for (const [name, run] of closed) {
    const error = await refusal(run);
    assert.deepEqual([error.status, error.code, error.outcome], [404, 'NOT_FOUND', 'not_found'], name);
  }
  assert.deepEqual(fake.calls.map((call) => call.method), ['salt', 'recordRef', 'bankAlbums', 'registerDevice', 'read', 'drafts', 'confirm', 'dismiss', 'accounts', 'updateAccount']);
});
