## Appendix: the code

Every block below is the kit's file, byte for byte (its SHA-256 is in `PL/SHA256SUMS`). Copy the files from PL as Steps 2 and 4 say; never retype them. `stubs/apps/app/src/spend/v1/DeviceDiaryProvider.tsx` is not shown: it is the head's file as it is (`orig/`).

### The slip calls

`PL/real/apps/app/src/slips/slipResources.ts` (SHA-256 `00c080d4b038...`):

```ts
// The phone's slip calls (P4-T12, S13): the salt, slip batches read inside
// their request, drafts reviewed online, slip accounts mapped to wallets, a
// single read's slip ref, the bank album catalog and this device's push
// registration. Every answer must be exactly its contract DTO; nothing is
// coerced. Confirm and dismiss are commands under the caller's key. The
// account update is a plain write, sent as a command only because a command
// is how the transport sends If-Match. The slip read is no command, so the
// transport never resends it after a lost answer: the scan engine's next run
// sends the batch again (P4-T14). Its batch goes as the JSON's UTF-8 bytes,
// typed application/octet-stream: POST /v1/slips reads up to 8 MiB from the
// request's stream and parses it itself (P4-T6), while the edge's dispatcher
// parses an application/json body (up to 2 MiB) before the route and then
// hands it no stream.
// Pure: contracts and relative imports only, so Node loads it.
import {
  SLIP_INBOX_ID,
  SLIP_LIMITS,
  isBankAlbumsDto,
  isSlipAccountDto,
  isSlipAccountsDto,
  isSlipBatchResult,
  isSlipDraftsPage,
  isSlipSaltDto,
  isUuid,
} from '@gogospend/contracts';
import type {
  BankAlbumDto,
  CommandAck,
  DeviceRegistration,
  SlipAccountDto,
  SlipBatchRequest,
  SlipBatchResult,
  SlipConfirmRequest,
  SlipDraftsPage,
  SlipRefRequest,
  SlipSaltDto,
} from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import type { V1Transport } from '../api/client.ts';
import { V1_COMMAND_SCHEMA, isCommandAck } from '../spend/v1/resources.ts';

export type SlipResources = {
  /** GET /v1/slips/salt: answers before slip import opens (S13). */
  salt(): Promise<SlipSaltDto>;
  /** POST /v1/slips, the batch as its JSON bytes for the route's stream: waits SLIP_LIMITS.clientTimeoutMs (90 s); not a command, so the transport never resends it. */
  read(request: SlipBatchRequest): Promise<SlipBatchResult>;
  drafts(cursor?: string, limit?: number): Promise<SlipDraftsPage>;
  confirm(drafts: SlipConfirmRequest['drafts'], commandId: string): Promise<CommandAck>;
  dismiss(draftId: string, commandId: string): Promise<CommandAck>;
  accounts(): Promise<SlipAccountDto[]>;
  /** A command with a new id and If-Match `version`; a stale version throws V1Error VERSION_CONFLICT (its `current` is the account) for the caller to reload. */
  updateAccount(id: string, version: number, walletId: string | null): Promise<SlipAccountDto>;
  /** POST /v1/slips/refs (204): answers before slip import opens (S13). */
  recordRef(request: SlipRefRequest): Promise<void>;
  bankAlbums(): Promise<BankAlbumDto[]>;
  /** PUT /v1/devices (204); a null push_token forgets this session's device. */
  registerDevice(registration: DeviceRegistration): Promise<void>;
};

/** The slip batch's type: bytes the route reads itself, never a JSON body the dispatcher parses first. */
const SLIP_BATCH_TYPE = 'application/octet-stream';

/** A 204 answer: no body at all. */
const isNoContent = (value: unknown): value is null => value === null;

/** An acknowledgement of this command for the vault's one slip_inbox entity (S1): confirm and dismiss. */
const inboxAck = (commandId: string) => (value: unknown): value is CommandAck =>
  isCommandAck(value) && value.command_id === commandId && value.entity_id === SLIP_INBOX_ID;

/** A draft or account id in a path: only a UUID, so nothing else can reach another route. */
const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

/** A new command id from expo-crypto, loaded only when an account update is sent (Hermes has no Web Crypto). */
const expoUuid = async (): Promise<string> => (await import('expo-crypto')).randomUUID();

export function createSlipResources(transport: V1Transport, newId: () => Promise<string> = expoUuid): SlipResources {
  return {
    salt: () => transport.request('GET', '/v1/slips/salt', { validate: isSlipSaltDto }),
    read: async (request) =>
      transport.request('POST', '/v1/slips', {
        raw: { bytes: new TextEncoder().encode(JSON.stringify(request)), contentType: SLIP_BATCH_TYPE },
        timeoutMs: SLIP_LIMITS.clientTimeoutMs,
        validate: isSlipBatchResult,
      }),
    drafts: (cursor, limit) => {
      const query = new URLSearchParams();
      if (cursor !== undefined) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      const search = query.toString();
      return transport.request('GET', `/v1/drafts${search ? `?${search}` : ''}`, { validate: isSlipDraftsPage });
    },
    confirm: (drafts, commandId) =>
      transport.request('POST', '/v1/drafts/confirm', { body: { drafts }, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate: inboxAck(commandId) }),
    // Async, so an id that is not a UUID is a rejection like any other refusal.
    dismiss: async (draftId, commandId) =>
      transport.request('POST', `/v1/drafts/${segment(draftId)}/dismiss`, { body: {}, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate: inboxAck(commandId) }),
    accounts: async () => (await transport.request('GET', '/v1/slip-accounts', { validate: isSlipAccountsDto })).accounts,
    updateAccount: async (id, version, walletId) => {
      const path = `/v1/slip-accounts/${segment(id)}`;
      return transport.request('PUT', path, {
        body: { wallet_id: walletId },
        command: { id: await newId(), schemaVersion: V1_COMMAND_SCHEMA, ifMatch: version },
        validate: (value): value is SlipAccountDto => isSlipAccountDto(value) && value.id === id,
      });
    },
    recordRef: async (request) => {
      await transport.request('POST', '/v1/slips/refs', { body: request, validate: isNoContent });
    },
    bankAlbums: async () => (await transport.request('GET', '/v1/catalog/bank-albums', { validate: isBankAlbumsDto })).albums,
    registerDevice: async (registration) => {
      await transport.request('PUT', '/v1/devices', { body: registration, validate: isNoContent });
    },
  };
}
```

`PL/real/apps/app/src/slips/slipResources.test.ts` (SHA-256 `8c74508cc474...`):

```ts
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
```

### The salt store and the salted hash

`PL/real/apps/app/src/slips/slipRefs.ts` (SHA-256 `345855b64db6...`):

```ts
// The slip reference the phone sends (P4-T12; §6.8 step 4, A25, B12, S16):
// the vault's salt, kept per account in SecureStore on this device only and
// readable only while it is unlocked, and the salted SHA-256 of a slip QR's
// normalized reference. Only the hash leaves the phone. A reference that
// cannot be normalized gives no hash, and its photo stays on the phone. The
// QR check itself is P3's slipQrIn (A13). Default pending owner Q5 (B12).
// expo-secure-store and expo-crypto load only when used (src/lib/haptics.ts's
// pattern), so Node loads this module.
import { normalizeSlipRef, slipRefHash } from '@gogospend/contracts';
import type { SlipSaltDto } from '@gogospend/contracts';

import type { SlipQr } from './slipQr.ts';
import type { SlipResources } from './slipResources.ts';

type SecureStoreModule = typeof import('expo-secure-store');
type CryptoModule = typeof import('expo-crypto');

export type SaltStore = {
  /** null when this account keeps no salt here; rejects when the keychain cannot be read (a locked phone, P4-T15). */
  read(accountId: string): Promise<Uint8Array | null>;
  write(accountId: string, salt: Uint8Array): Promise<void>;
  forget(accountId: string): Promise<void>;
};

export const SALT_KEY_PREFIX = 'jotbun.slip-salt.';

/** A kept salt: its 32 bytes as 64 lowercase hex digits. */
const HEX_SALT = /^[0-9a-f]{64}$/;
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));

const loadSecureStore = async (): Promise<SecureStoreModule> => import('expo-secure-store');

/**
 * Each account's salt under `jotbun.slip-salt.<account id>`, readable only
 * while this device is unlocked and never restored to another device (B12,
 * S16); in `accessGroup` when one is given (P6A's share extension). A kept
 * value that is not 32 bytes reads as no salt, so the hasher fetches the
 * vault's again (it never changes).
 */
export function secureSaltStore(options: { accessGroup?: string; loadModule?: () => Promise<SecureStoreModule> } = {}): SaltStore {
  const load = options.loadModule ?? loadSecureStore;
  const open = async () => {
    const store = await load();
    const secret = { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY, ...(options.accessGroup === undefined ? {} : { accessGroup: options.accessGroup }) };
    return { store, secret };
  };
  return {
    async read(accountId) {
      const { store, secret } = await open();
      const text = await store.getItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);
      return text !== null && HEX_SALT.test(text) ? fromHex(text) : null;
    },
    async write(accountId, salt) {
      const { store, secret } = await open();
      await store.setItemAsync(`${SALT_KEY_PREFIX}${accountId}`, toHex(salt), secret);
    },
    async forget(accountId) {
      const { store, secret } = await open();
      await store.deleteItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);
    },
  };
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

const loadCrypto = async (): Promise<CryptoModule> => import('expo-crypto');

/**
 * SHA-256 through expo-crypto's digest: the app runs on Hermes, which has no
 * Web Crypto. The input goes as a copy on its own ArrayBuffer, the
 * BufferSource digest takes (a Uint8Array may view a shared buffer).
 */
export function expoSha256(loadModule: () => Promise<CryptoModule> = loadCrypto): Sha256 {
  return async (data) => {
    const expoCrypto = await loadModule();
    return new Uint8Array(await expoCrypto.digest(expoCrypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data)));
  };
}

export type SlipHasher = (slip: SlipQr) => Promise<string | null>;

/** The vault's 32 salt bytes, sent as base64url without padding (isSlipSaltDto). */
function saltBytes(dto: SlipSaltDto): Uint8Array {
  const base64 = dto.salt.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

/**
 * Hashes a slip QR's reference with this account's salt: the kept salt, else
 * the vault's, fetched once, kept and held in memory. A salt that could not
 * be read, fetched or kept is asked for again with the next slip. A reference
 * that cannot be normalized gives null and asks for no salt.
 */
export function createSlipHasher(deps: { accountId: string; store: SaltStore; resources: Pick<SlipResources, 'salt'>; sha256: Sha256 }): SlipHasher {
  let salt: Promise<Uint8Array> | null = null;
  const load = async (): Promise<Uint8Array> => {
    const kept = await deps.store.read(deps.accountId);
    if (kept !== null) return kept;
    const fetched = saltBytes(await deps.resources.salt());
    await deps.store.write(deps.accountId, fetched);
    return fetched;
  };
  return async (slip) => {
    const normalized = normalizeSlipRef(slip.bankCode, slip.reference);
    if (normalized === null) return null;
    const pending = (salt ??= load().catch((error: unknown) => {
      salt = null;
      throw error;
    }));
    return slipRefHash(await pending, normalized, deps.sha256);
  };
}
```

`PL/real/apps/app/src/slips/slipRefs.test.ts` (SHA-256 `b042a81cf723...`):

```ts
// P4-T12: the slip salt and the salted hash on the phone (§6.8 step 4, B12,
// S16). The salt is fetched once per account, kept in SecureStore on this
// device only while it is unlocked (in the given access group), held in
// memory, and asked for again after a failure; the phone's hash of P3's slip
// QR is the contract's vector; a reference that cannot be normalized gives no
// hash and asks for no salt. SecureStore and expo-crypto come in through
// loadModule, so Node runs these.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { SLIP_REF_HASH_LABEL } from '@gogospend/contracts';
import type { SlipSaltDto } from '@gogospend/contracts';

import { V1Error } from '../api/client.ts';
import { parseSlipQr } from './slipQr.ts';
import { SALT_KEY_PREFIX, createSlipHasher, expoSha256, secureSaltStore } from './slipRefs.ts';
import type { Sha256 } from './slipRefs.ts';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const SALT_BYTES = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SALT: SlipSaltDto = { salt: Buffer.from(SALT_BYTES).toString('base64url') };
const OTHER_SALT: SlipSaltDto = { salt: Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => 255 - index)).toString('base64url') };
// P3-T1's 004 slip (bank 004, reference 016298105512345678) and its 002 slip.
const SLIP_004 = parseSlipQr(' 00390006000001010300402180162981055123456785102TH91043BF7 ')!;
const SLIP_002 = parseSlipQr('004000060000010103002021900021231231212000115102TH91049C30')!;
const VECTOR = 'c4f3b6c8f15a0e588cfdb0a59d02f281e28eae69f0a3f8b22d6bda69f7ec1493';

const nodeSha256: Sha256 = async (data) => new Uint8Array(createHash('sha256').update(data).digest());
/** The contract's hash, as P4-T1's vector test computes it. */
const vector = (salt: Uint8Array, normalized: string) =>
  createHash('sha256').update(salt).update(SLIP_REF_HASH_LABEL).update(Buffer.from([0])).update(normalized).digest('hex');

type KeychainCall = { op: 'get' | 'set' | 'delete'; key: string; value?: string; options: unknown };
/** expo-secure-store as loadModule hands it over: items in memory, every call recorded; a locked one refuses reads. */
function fakeKeychain() {
  const items = new Map<string, string>();
  const calls: KeychainCall[] = [];
  const state = { locked: false };
  const keychain = {
    WHEN_UNLOCKED: 0,
    AFTER_FIRST_UNLOCK: 1,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    async getItemAsync(key: string, options?: unknown) {
      calls.push({ op: 'get', key, options });
      if (state.locked) throw new Error('User interaction is not allowed.');
      return items.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string, options?: unknown) {
      calls.push({ op: 'set', key, value, options });
      items.set(key, value);
    },
    async deleteItemAsync(key: string, options?: unknown) {
      calls.push({ op: 'delete', key, options });
      items.delete(key);
    },
  };
  return { items, calls, state, loadModule: async () => keychain as unknown as typeof import('expo-secure-store') };
}

/** The vault's salt route: each account's own salt, every fetch counted. */
function vault(salts: Record<string, SlipSaltDto>) {
  const fetched: string[] = [];
  return {
    fetched,
    resourcesFor: (accountId: string) => ({
      salt: async () => {
        fetched.push(accountId);
        return salts[accountId];
      },
    }),
  };
}

test('the salt is fetched once per account and kept with WHEN_UNLOCKED_THIS_DEVICE_ONLY, and in the given accessGroup', async () => {
  assert.equal(SALT_KEY_PREFIX, 'jotbun.slip-salt.');
  const keychain = fakeKeychain();
  const store = secureSaltStore({ accessGroup: 'group.app.jotbun', loadModule: keychain.loadModule });
  const server = vault({ [A]: SALT, [B]: OTHER_SALT });
  const hashA = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  // Two slips at once, then one more: one fetch, one keychain read, one write.
  const [first, second] = await Promise.all([hashA(SLIP_004), hashA(SLIP_002)]);
  assert.equal(await hashA(SLIP_004), first);
  assert.deepEqual([first, second], [VECTOR, vector(SALT_BYTES, '002:0002123123121200011')]);
  assert.deepEqual(server.fetched, [A]);
  const secret = { keychainAccessible: 6, accessGroup: 'group.app.jotbun' };
  assert.deepEqual(keychain.calls, [
    { op: 'get', key: `jotbun.slip-salt.${A}`, options: secret },
    { op: 'set', key: `jotbun.slip-salt.${A}`, value: Buffer.from(SALT_BYTES).toString('hex'), options: secret },
  ]);
  // The next launch hashes with the kept salt and fetches nothing.
  const again = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await again(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A]);
  // Another account fetches and keeps its own.
  const hashB = createSlipHasher({ accountId: B, store, resources: server.resourcesFor(B), sha256: nodeSha256 });
  assert.notEqual(await hashB(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A, B]);
  assert.deepEqual([...keychain.items.keys()], [`jotbun.slip-salt.${A}`, `jotbun.slip-salt.${B}`]);
  // Without an access group the options name only how the salt is kept.
  const plain = fakeKeychain();
  await secureSaltStore({ loadModule: plain.loadModule }).read(A);
  assert.deepEqual(plain.calls, [{ op: 'get', key: `jotbun.slip-salt.${A}`, options: { keychainAccessible: 6 } }]);
});

test("forgetting deletes only that account's salt, and a kept value that is not a salt is fetched again", async () => {
  const keychain = fakeKeychain();
  const store = secureSaltStore({ loadModule: keychain.loadModule });
  await store.write(A, SALT_BYTES);
  await store.write(B, SALT_BYTES);
  assert.deepEqual(await store.read(A), SALT_BYTES);
  await store.forget(A);
  assert.equal(await store.read(A), null);
  assert.deepEqual(await store.read(B), SALT_BYTES);
  assert.deepEqual(keychain.calls.filter((call) => call.op === 'delete'), [{ op: 'delete', key: `jotbun.slip-salt.${A}`, options: { keychainAccessible: 6 } }]);
  for (const damaged of ['0102', 'AB'.repeat(32), `${'0'.repeat(63)}g`]) {
    keychain.items.set(`jotbun.slip-salt.${A}`, damaged);
    assert.equal(await store.read(A), null, damaged);
  }
  const server = vault({ [A]: SALT });
  const hash = createSlipHasher({ accountId: A, store, resources: server.resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.deepEqual(server.fetched, [A]);
  assert.equal(keychain.items.get(`jotbun.slip-salt.${A}`), Buffer.from(SALT_BYTES).toString('hex'));
});

test("the phone's hash of P3's slip QR is the contract's vector", async () => {
  assert.deepEqual(SLIP_004, { bankCode: '004', reference: '016298105512345678' });
  assert.equal(vector(SALT_BYTES, '004:016298105512345678'), VECTOR);
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: fakeKeychain().loadModule }), resources: vault({ [A]: SALT }).resourcesFor(A), sha256: nodeSha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  // The same bank code unpadded, and the same reference with spaces in it, is the same slip.
  assert.equal(await hash({ bankCode: '4', reference: ' 0162981055 1234567 8 ' }), VECTOR);
});

test("the app's SHA-256 is expo-crypto's digest, and gives the same vector", async () => {
  const asked: string[] = [];
  const expoCrypto = {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' },
    async digest(algorithm: string, data: Uint8Array) {
      asked.push(algorithm);
      const digest = createHash(algorithm.replace('-', '').toLowerCase()).update(data).digest();
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
    },
  };
  const sha256 = expoSha256(async () => expoCrypto as unknown as typeof import('expo-crypto'));
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: fakeKeychain().loadModule }), resources: vault({ [A]: SALT }).resourcesFor(A), sha256 });
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.deepEqual(asked, ['SHA-256']);
});

test('a reference that cannot be normalized gives no hash, and asks for no salt', async () => {
  const keychain = fakeKeychain();
  const server = vault({ [A]: SALT });
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources: server.resourcesFor(A), sha256: nodeSha256 });
  for (const slip of [{ bankCode: '0041', reference: 'A1' }, { bankCode: 'kb', reference: 'A1' }, { bankCode: '004', reference: '' }, { bankCode: '004', reference: 'ก1' }, { bankCode: '004', reference: 'A'.repeat(65) }]) {
    assert.equal(await hash(slip), null, JSON.stringify(slip));
  }
  assert.deepEqual(server.fetched, []);
  assert.deepEqual(keychain.calls, []);
});

test('a salt that could not be fetched is asked for again, and a locked keychain fetches none', async () => {
  const keychain = fakeKeychain();
  let failures = 1;
  let fetched = 0;
  const resources = {
    salt: async () => {
      fetched += 1;
      if (failures-- > 0) throw new V1Error('network', 0, 'NETWORK_ERROR');
      return SALT;
    },
  };
  const hash = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources, sha256: nodeSha256 });
  await assert.rejects(hash(SLIP_004), (error: unknown) => error instanceof V1Error && error.code === 'NETWORK_ERROR');
  assert.equal(keychain.items.size, 0);
  assert.equal(await hash(SLIP_004), VECTOR);
  assert.equal(fetched, 2);
  // While the phone is locked the kept salt cannot be read: the hash fails, and no salt is fetched past it (P4-T15).
  keychain.state.locked = true;
  const locked = createSlipHasher({ accountId: A, store: secureSaltStore({ loadModule: keychain.loadModule }), resources, sha256: nodeSha256 });
  await assert.rejects(locked(SLIP_004), /User interaction is not allowed/);
  assert.equal(fetched, 2);
  keychain.state.locked = false;
  assert.equal(await locked(SLIP_004), VECTOR);
  assert.equal(fetched, 2);
});
```

### The fake slip server

`PL/real/apps/app/src/slips/testing/fakeSlipResources.ts` (SHA-256 `bca4aab6370c...`):

```ts
// A fake slip server for tests (P4-T12). It answers in the contract's shapes,
// keeps the drafts and slip accounts it is given and refuses as the vault
// does (P4-T3, P4-T7): confirm and dismiss take drafts out, a confirm naming
// a draft that is gone is 409 VERSION_CONFLICT with nothing taken out, a
// dismiss of one is 404, and an account update needs the account's version
// (409 with the account as it is) and a known id (404). It records each call
// with what it carried: the request for read,
// recordRef and registerDevice; `{ cursor, limit }` (null when not given) for
// drafts; `{ drafts, commandId }` for confirm; `{ draftId, commandId }` for
// dismiss; `{ id, version, walletId }` for updateAccount; nothing for the
// reads without arguments. With `slipImportOn: false` the calls behind
// SLIP_IMPORT_ENABLED are 404 NOT_FOUND, as the server answers until slip
// import opens (S13); the salt, slip refs, bank albums and devices still
// answer. A slip without a scripted read comes back `unreadable`.
// Pure, so Node and render tests both load it. Test use only.
import { SLIP_INBOX_ID, SLIP_LIMITS } from '@gogospend/contracts';
import type { BankAlbumDto, CommandAck, SlipAccountDto, SlipBatchItem, SlipDraftDto, SlipResult, SlipSaltDto } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { SlipResources } from '../slipResources.ts';

export type FakeSlipCall = { method: keyof SlipResources; body?: unknown };

/** The fake's salt: the bytes 1 to 32, base64url without padding. */
export const FAKE_SLIP_SALT: SlipSaltDto = { salt: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA' };

/** The calls the server answers 404 until slip import opens (S13). */
const RELEASED: ReadonlySet<keyof SlipResources> = new Set<keyof SlipResources>(['read', 'drafts', 'confirm', 'dismiss', 'accounts', 'updateAccount']);

/** The server's page when no limit is asked for (P4-T7). */
const DRAFTS_PAGE = 50;

export function fakeSlipResources(options: {
  read?: (item: SlipBatchItem, index: number) => SlipResult;
  drafts?: SlipDraftDto[];
  accounts?: SlipAccountDto[];
  albums?: BankAlbumDto[];
  slipImportOn?: boolean;
} = {}): SlipResources & { calls: FakeSlipCall[] } {
  const calls: FakeSlipCall[] = [];
  let drafts = [...(options.drafts ?? [])];
  let accounts = [...(options.accounts ?? [])];
  let revision = 0;
  const receive = (method: keyof SlipResources, body?: unknown) => {
    calls.push(body === undefined ? { method } : { method, body });
    if (options.slipImportOn === false && RELEASED.has(method)) throw new V1Error('not_found', 404, 'NOT_FOUND');
  };
  const inboxAck = (commandId: string, outcome: CommandAck['outcome']): CommandAck => {
    revision += 1;
    return { command_id: commandId, entity_id: SLIP_INBOX_ID, version: revision, committed_revision: String(revision), outcome, entity_state: 'active' };
  };
  return {
    calls,
    async salt() {
      receive('salt');
      return FAKE_SLIP_SALT;
    },
    async read(request) {
      receive('read', request);
      const results = request.slips.map((item, index): SlipResult => options.read?.(item, index) ?? { ref_hash: item.ref_hash, outcome: 'unreadable', draft: null });
      return { results, uses_left: { live: SLIP_LIMITS.liveDaily, backfill: SLIP_LIMITS.backfillUses }, retry_after_seconds: null };
    },
    async drafts(cursor, limit) {
      receive('drafts', { cursor: cursor ?? null, limit: limit ?? null });
      const start = cursor === undefined ? 0 : Number(cursor);
      const end = start + (limit ?? DRAFTS_PAGE);
      return { drafts: drafts.slice(start, end), total: drafts.length, next_cursor: end < drafts.length ? String(end) : null };
    },
    async confirm(items, commandId) {
      receive('confirm', { drafts: items, commandId });
      if (!items.every((item) => drafts.some((draft) => draft.id === item.draft_id))) throw new V1Error('conflict', 409, 'VERSION_CONFLICT');
      drafts = drafts.filter((draft) => !items.some((item) => item.draft_id === draft.id));
      return inboxAck(commandId, 'accepted');
    },
    async dismiss(draftId, commandId) {
      receive('dismiss', { draftId, commandId });
      if (!drafts.some((draft) => draft.id === draftId)) throw new V1Error('not_found', 404, 'NOT_FOUND');
      drafts = drafts.filter((draft) => draft.id !== draftId);
      return inboxAck(commandId, 'updated');
    },
    async accounts() {
      receive('accounts');
      return accounts.map((account) => ({ ...account }));
    },
    async updateAccount(id, version, walletId) {
      receive('updateAccount', { id, version, walletId });
      const current = accounts.find((account) => account.id === id);
      if (!current) throw new V1Error('not_found', 404, 'NOT_FOUND');
      if (current.version !== version) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...current } });
      const updated = { ...current, version: version + 1, wallet_id: walletId };
      accounts = accounts.map((account) => (account.id === id ? updated : account));
      return { ...updated };
    },
    async recordRef(request) {
      receive('recordRef', request);
    },
    async bankAlbums() {
      receive('bankAlbums');
      return [...(options.albums ?? [])];
    },
    async registerDevice(registration) {
      receive('registerDevice', registration);
    },
  };
}
```

### The typed links and the ten routes

`PL/real/apps/app/src/slips/slipRoutes.ts` (SHA-256 `c150f622f0d7...`):

```ts
// The slip area's typed links (P4-T12). Every route under app/spend/slips/
// exists from this task on, each a redirect to /spend until its screen task
// (P4-T18 to P4-T21), so `typecheck:routes` checks each link P4-T17 to
// P4-T21 makes.
import type { Href } from 'expo-router';

export const SLIPS_HREF: Href = '/spend/slips';
export const SLIP_SCAN_HREF: Href = '/spend/slips/scan';
/** A run over photos picked by hand (P4-T19). */
export const SLIP_MANUAL_SCAN_HREF: Href = { pathname: '/spend/slips/scan', params: { run: 'manual' } };
export const SLIP_REVIEW_HREF: Href = '/spend/slips/review';
```

`PL/real/apps/app/app/spend/slips/index.tsx` (SHA-256 `997add135be7...`):

```tsx
import { Redirect } from 'expo-router';

/** The slip area's home: sl-intro (P4-T18), then sl-settings once albums are connected (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipsRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/permission.tsx` (SHA-256 `fd16efcba26f...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-permission and es-photos-denied (P4-T18); until then it goes back to /spend (P4-T12). */
export default function SlipPermissionRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/albums.tsx` (SHA-256 `be76cd450821...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-albums (P4-T18); until then it goes back to /spend (P4-T12). */
export default function SlipAlbumsRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/scan.tsx` (SHA-256 `c93f0069b2b2...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-scanning, and a run over photos picked by hand with run=manual (P4-T19); until then it goes back to /spend (P4-T12). */
export default function SlipScanRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/summary.tsx` (SHA-256 `8455f779aaef...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-summary (P4-T19); until then it goes back to /spend (P4-T12). */
export default function SlipSummaryRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/accounts.tsx` (SHA-256 `ebeb684b9768...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-wallet-map (P4-T20); until then it goes back to /spend (P4-T12). */
export default function SlipAccountsRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/review.tsx` (SHA-256 `e401d4cb9a77...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-review and sl-slip-detail (P4-T20); until then it goes back to /spend (P4-T12). */
export default function SlipReviewRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/done.tsx` (SHA-256 `4c0c8c6f6539...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-done (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipDoneRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/settings.tsx` (SHA-256 `241f00419dce...`):

```tsx
import { Redirect } from 'expo-router';

/** sl-settings (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipSettingsRoute() {
  return <Redirect href="/spend" />;
}
```

`PL/real/apps/app/app/spend/slips/notifications.tsx` (SHA-256 `c873a179738c...`):

```tsx
import { Redirect } from 'expo-router';

/** es-notifications-off (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipNotificationsRoute() {
  return <Redirect href="/spend" />;
}
```

### The shared client and its header test (m4)

`PL/diffs/apps_app_src_api_sharedV1.ts.diff` (SHA-256 `ba0667290e48...`):

```diff
--- a/apps/app/src/api/sharedV1.ts
+++ b/apps/app/src/api/sharedV1.ts
@@ -10,6 +10,8 @@
 import type { SpendV1Resources } from '@mobile/spend/v1/resources';
 import { createAiResources } from '@mobile/spend/v1/ai/aiResources';
 import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
+import { createSlipResources } from '@mobile/slips/slipResources';
+import type { SlipResources } from '@mobile/slips/slipResources';
 import { isUuid } from '@gogospend/contracts';
 import * as Crypto from 'expo-crypto';
 
@@ -33,6 +35,7 @@
 let sync: SyncRemote | null = null;
 let ai: AiResources | null = null;
 let analyticsServer: AnalyticsDeps['server'] | null = null;
+let slips: SlipResources | null = null;
 
 /** The one v1 transport. Sign-out uses it so a second client is not opened. */
 export function getSharedV1Transport(): V1Transport {
@@ -96,3 +99,13 @@
   analyticsServer ??= createAnalyticsServer(sharedTransport());
   return analyticsServer;
 }
+
+/**
+ * The slip calls (P4-T12) over the same transport, so each carries
+ * X-GoGoSpend-Analytics: off unless this phone's answer is yes: the slip read
+ * can lead to the server's slip_scan_finished (1D-T6's m4).
+ */
+export function getSharedSlipResources(): SlipResources {
+  slips ??= createSlipResources(sharedTransport());
+  return slips;
+}
```

`PL/real/apps/app/src/slips/sharedSlipResources.render.test.tsx` (SHA-256 `9cf451fde94f...`):

```tsx
// 1D-T6's m4 (followups): the slip calls go over the one shared transport, so
// each carries X-GoGoSpend-Analytics: off unless this phone's answer is yes.
// The slip read is the call pinned here: it can lead to the server's
// slip_scan_finished (P4-T6). An account update's new command id comes from
// expo-crypto, loaded when the update is sent.
import { Platform } from 'react-native';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';

// Metro defines __DEV__; the shared transport reads it for the LAN rule.
vi.hoisted(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = false; });
vi.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
vi.mock('expo-crypto', () => ({ digestStringAsync: async () => '', randomUUID: () => '7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { getSharedSlipResources } from '@mobile/api/sharedV1';
import { setSession } from '@mobile/auth/session';
import type { SlipAccountDto, SlipBatchRequest, SlipBatchResult } from '@gogospend/contracts';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const SLIP_ACCOUNT: SlipAccountDto = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', version: 2, bank: 'kbank', account_last4: '1234', wallet_id: null, open_drafts: 0 };
const BATCH: SlipBatchRequest = { purpose: 'live', last: false, today: '2026-11-09', locale: 'th', slips: [{ ref_hash: 'c4f3b6c8f15a0e588cfdb0a59d02f281e28eae69f0a3f8b22d6bda69f7ec1493', image_base64: '/9j/4AAQSkZJRg==', media_type: 'image/jpeg', album: null, origin: 'share' }] };
const ANSWER: SlipBatchResult = { results: [], uses_left: { live: 9, backfill: 500 }, retry_after_seconds: null };
afterAll(() => { delete (globalThis as { __DEV__?: boolean }).__DEV__; });
const sent: { method: string; path: string; headers: Record<string, string> }[] = [];
const os = Platform.OS;

beforeEach(() => {
  sent.length = 0;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    sent.push({ method: init.method ?? 'GET', path, headers: { ...(init.headers as Record<string, string>) } });
    const body = path === '/v1/slips' ? ANSWER : SLIP_ACCOUNT;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
  setAnalytics(null);
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

test("slip calls carry X-GoGoSpend-Analytics: off unless this phone's answer is yes, over the one shared transport", async () => {
  expect(getAnalytics()).toBeNull();
  const slips = getSharedSlipResources();
  expect(getSharedSlipResources()).toBe(slips);
  await slips.read(BATCH);
  const { analytics } = await recordAnalytics();
  expect(analytics.allowsAnalytics()).toBe(true);
  await slips.read(BATCH);
  await analytics.answer('no');
  await slips.read(BATCH);
  await slips.updateAccount(SLIP_ACCOUNT.id, 1, null);
  expect(sent.map((request) => [request.method, request.path, request.headers['X-GoGoSpend-Analytics'] ?? null])).toEqual([
    ['POST', '/v1/slips', 'off'],
    ['POST', '/v1/slips', null],
    ['POST', '/v1/slips', 'off'],
    ['PUT', `/v1/slip-accounts/${SLIP_ACCOUNT.id}`, 'off'],
  ]);
  expect([sent[3].headers['Idempotency-Key'], sent[3].headers['If-Match']]).toEqual(['7a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', '"1"']);
});
```

### The sign-out erase

`PL/diffs/apps_app_src_spend_v1_DeviceDiaryProvider.tsx.diff` (SHA-256 `d9a7a8df9ab1...`):

```diff
--- a/apps/app/src/spend/v1/DeviceDiaryProvider.tsx
+++ b/apps/app/src/spend/v1/DeviceDiaryProvider.tsx
@@ -19,6 +19,7 @@
 import { eraseCelebratedWeek } from '@mobile/screens/redesign/insights/celebrationWeek';
 import { eraseCashbackDeclined } from '@mobile/screens/redesign/insights/cashbackDecline';
 import { eraseStoredHapticPreference } from '@mobile/lib/hapticPreferenceStorage';
+import { secureSaltStore } from '@mobile/slips/slipRefs';
 import type { AccountDatabase } from '@mobile/storage/accountDatabase';
 import { createDeviceAccountDatabase } from '@mobile/storage/deviceDiary';
 import { createDeviceSync } from '@mobile/sync/deviceSync';
@@ -46,21 +47,27 @@
   },
   (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
 );
+// Each account's slip salt (P4-T12, S16), in the secure store on iOS and
+// Android until that account's sign-out erase. The web keeps none.
+const slipSalts = secureSaltStore();
+const eraseSlipSalt = async (accountId: string): Promise<void> => {
+  if (Platform.OS !== 'web') await slipSalts.forget(accountId);
+};
 
 /**
  * The explicit sign-out erase, with the diary (which takes its own import
  * draft): a plain-text import draft an older build left for this account, the
  * bun's device settings (its intensity and the day the Quick add cheer last
- * showed), History's view kept while a record is open (memory only), and the
- * wallet's device settings, and this phone's analytics answer (1D-T6), so the
- * next person starts from the defaults. An
- * account's looks stay. A setting that cannot be erased never stops the
+ * showed), History's view kept while a record is open (memory only), the
+ * wallet's device settings, this phone's analytics answer (1D-T6) and this
+ * account's slip salt (P4-T12), so the next person starts from the defaults.
+ * An account's looks stay. A setting that cannot be erased never stops the
  * diary's erase. Exported for its test.
  */
 export async function eraseWithDiary(accountId: string): Promise<void> {
   forgetKeptHistory();
   await eraseLegacyImportDraft(accountId);
-  await Promise.all([eraseStoredBunIntensity().catch(() => undefined), eraseStoredHapticPreference().catch(() => undefined), eraseCheerDay(), eraseCelebratedWeek(), eraseCashbackDeclined(), eraseStoredConsent().catch(() => undefined)]);
+  await Promise.all([eraseStoredBunIntensity().catch(() => undefined), eraseStoredHapticPreference().catch(() => undefined), eraseCheerDay(), eraseCelebratedWeek(), eraseCashbackDeclined(), eraseStoredConsent().catch(() => undefined), eraseSlipSalt(accountId).catch(() => undefined)]);
   await eraseDeviceSettings().catch(() => undefined);
 }
 
```

`PL/diffs/apps_app_src_spend_v1_DeviceDiaryProvider.render.test.tsx.diff` (SHA-256 `ef12fc5fa76e...`):

```diff
--- a/apps/app/src/spend/v1/DeviceDiaryProvider.render.test.tsx
+++ b/apps/app/src/spend/v1/DeviceDiaryProvider.render.test.tsx
@@ -39,13 +39,24 @@
     return () => { sessions.unsubscribed += 1; };
   },
 }));
-vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only' }));
+// The keychain keeps what is set; a key in `refuse` cannot be deleted (a locked phone).
+const secure = vi.hoisted(() => ({ items: new Map<string, string>(), refuse: new Set<string>() }));
+vi.mock('expo-secure-store', () => ({
+  getItemAsync: async (key: string) => secure.items.get(key) ?? null,
+  setItemAsync: async (key: string, value: string) => void secure.items.set(key, value),
+  deleteItemAsync: async (key: string) => {
+    if (secure.refuse.has(key)) throw new Error('the keychain is locked');
+    secure.items.delete(key);
+  },
+  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
+}));
 vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
 // History's kept view follows the route: a record is open over History here.
 vi.mock('expo-router', () => ({ usePathname: () => '/spend/record/r1' }));
 
 import { HistoryKeepProvider, useHistoryKeep } from '@mobile/screens/redesign/HistoryKeepProvider';
 import type { HistoryKeep } from '@mobile/screens/redesign/historyKeep';
+import { SALT_KEY_PREFIX } from '@mobile/slips/slipRefs';
 import { DeviceDiaryProvider } from './DeviceDiaryProvider';
 import { useSpendDiary } from './SpendDiaryContext';
 import { IMPORT_DRAFT_KEY_PREFIX } from './importDraftStore';
@@ -61,6 +72,8 @@
   await new Promise((resolve) => setTimeout(resolve, 0));
   Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
   plain.clear();
+  secure.items.clear();
+  secure.refuse.clear();
   captured.deps = null;
   captured.created = [];
   sessions.subscribed = 0;
@@ -143,3 +156,19 @@
   expect(plain.has('jotbun.wallet.lock')).toBe(false);
   expect(plain.get(`jotbun.account.${B}.looks`)).toBe('warm');
 });
+
+test("the sign-out erase forgets this account's slip salt, and a keychain that refuses never stops the erase", async () => {
+  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
+  secure.items.set(`${SALT_KEY_PREFIX}${A}`, 'a'.repeat(64));
+  secure.items.set(`${SALT_KEY_PREFIX}${B}`, 'b'.repeat(64));
+  render(<DeviceDiaryProvider><Text>screens</Text></DeviceDiaryProvider>);
+  const deps = captured.deps as { eraseWithDiary?: (accountId: string) => Promise<void> };
+  await deps.eraseWithDiary?.(B);
+  expect([...secure.items.keys()]).toEqual([`${SALT_KEY_PREFIX}${A}`]);
+  // A salt the locked keychain keeps: the rest of the erase still runs.
+  secure.refuse.add(`${SALT_KEY_PREFIX}${A}`);
+  plain.set('jotbun.wallet.lock', 'on');
+  await expect(deps.eraseWithDiary?.(A)).resolves.toBeUndefined();
+  expect(plain.has('jotbun.wallet.lock')).toBe(false);
+  expect([...secure.items.keys()]).toEqual([`${SALT_KEY_PREFIX}${A}`]);
+});
```

`PL/diffs/apps_app_src_mascot_bunSettingsErase.render.test.tsx.diff` (SHA-256 `b2e2ec9f708e...`):

```diff
--- a/apps/app/src/mascot/bunSettingsErase.render.test.tsx
+++ b/apps/app/src/mascot/bunSettingsErase.render.test.tsx
@@ -10,6 +10,7 @@
 import { HAPTIC_PREFERENCE_STORAGE_KEY } from '@mobile/lib/hapticPreferenceStorage';
 import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
 import { ANALYTICS_CONSENT_KEY } from '@mobile/analytics/consentStorage';
+import { SALT_KEY_PREFIX } from '@mobile/slips/slipRefs';
 import { BUN_INTENSITY_STORAGE_KEY, eraseStoredBunIntensity } from './bunIntensityStorage';
 import { installBrowserStorage } from './mascotTestHarness';
 
@@ -76,7 +77,8 @@
   Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
   store.deleteItemAsync.mockRejectedValue(new Error('keychain locked'));
   await expect(eraseWithDiary('a0000000-0000-4000-8000-000000000001')).resolves.toBeUndefined();
-  expect(store.deleteItemAsync.mock.calls.map((call) => (call as unknown[])[0])).toEqual([BUN_INTENSITY_STORAGE_KEY, HAPTIC_PREFERENCE_STORAGE_KEY, QUICK_ADD_CHEER_KEY, CELEBRATION_WEEK_KEY, CASHBACK_DECLINED_KEY, ANALYTICS_CONSENT_KEY]);
+  // With this account's slip salt (P4-T12), on native only: the web erase above deleted nothing here.
+  expect(store.deleteItemAsync.mock.calls.map((call) => (call as unknown[])[0])).toEqual([BUN_INTENSITY_STORAGE_KEY, HAPTIC_PREFERENCE_STORAGE_KEY, QUICK_ADD_CHEER_KEY, CELEBRATION_WEEK_KEY, CASHBACK_DECLINED_KEY, ANALYTICS_CONSENT_KEY, `${SALT_KEY_PREFIX}a0000000-0000-4000-8000-000000000001`]);
   store.deleteItemAsync.mockReset();
   store.deleteItemAsync.mockImplementation(async () => undefined);
 });
```

### The typed stubs (RED)

`PL/stubs/apps/app/src/slips/slipResources.ts` (SHA-256 `547c6eb63f88...`):

```ts
// RED stub (P4-T12): the plan's interface, with no behaviour yet.
import type {
  BankAlbumDto,
  CommandAck,
  DeviceRegistration,
  SlipAccountDto,
  SlipBatchRequest,
  SlipBatchResult,
  SlipConfirmRequest,
  SlipDraftsPage,
  SlipRefRequest,
  SlipSaltDto,
} from '@gogospend/contracts';

import type { V1Transport } from '../api/client.ts';

export type SlipResources = {
  salt(): Promise<SlipSaltDto>;
  read(request: SlipBatchRequest): Promise<SlipBatchResult>;
  drafts(cursor?: string, limit?: number): Promise<SlipDraftsPage>;
  confirm(drafts: SlipConfirmRequest['drafts'], commandId: string): Promise<CommandAck>;
  dismiss(draftId: string, commandId: string): Promise<CommandAck>;
  accounts(): Promise<SlipAccountDto[]>;
  updateAccount(id: string, version: number, walletId: string | null): Promise<SlipAccountDto>;
  recordRef(request: SlipRefRequest): Promise<void>;
  bankAlbums(): Promise<BankAlbumDto[]>;
  registerDevice(registration: DeviceRegistration): Promise<void>;
};

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 1, committed_revision: '0', outcome: 'accepted', entity_state: 'active' };
const NO_ACCOUNT: SlipAccountDto = { id: '', version: 1, bank: 'other', account_last4: '', wallet_id: null, open_drafts: 0 };

export function createSlipResources(_transport: V1Transport, _newId?: () => Promise<string>): SlipResources {
  return {
    salt: async () => ({ salt: '' }),
    read: async () => ({ results: [], uses_left: { live: 0, backfill: 0 }, retry_after_seconds: null }),
    drafts: async () => ({ drafts: [], total: 0, next_cursor: null }),
    confirm: async () => NO_ACK,
    dismiss: async () => NO_ACK,
    accounts: async () => [],
    updateAccount: async () => NO_ACCOUNT,
    recordRef: async () => undefined,
    bankAlbums: async () => [],
    registerDevice: async () => undefined,
  };
}
```

`PL/stubs/apps/app/src/slips/slipRefs.ts` (SHA-256 `26c4ffd31bd0...`):

```ts
// RED stub (P4-T12): the plan's interface, with no behaviour yet.
import type { SlipQr } from './slipQr.ts';
import type { SlipResources } from './slipResources.ts';

type SecureStoreModule = typeof import('expo-secure-store');
type CryptoModule = typeof import('expo-crypto');

export type SaltStore = {
  read(accountId: string): Promise<Uint8Array | null>;
  write(accountId: string, salt: Uint8Array): Promise<void>;
  forget(accountId: string): Promise<void>;
};

export const SALT_KEY_PREFIX = '';

export function secureSaltStore(_options: { accessGroup?: string; loadModule?: () => Promise<SecureStoreModule> } = {}): SaltStore {
  return { read: async () => null, write: async () => undefined, forget: async () => undefined };
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

export function expoSha256(_loadModule?: () => Promise<CryptoModule>): Sha256 {
  return async () => new Uint8Array();
}

export type SlipHasher = (slip: SlipQr) => Promise<string | null>;

export function createSlipHasher(_deps: { accountId: string; store: SaltStore; resources: Pick<SlipResources, 'salt'>; sha256: Sha256 }): SlipHasher {
  return async () => '';
}
```

`PL/stubs/apps/app/src/slips/testing/fakeSlipResources.ts` (SHA-256 `efcbe8d5fb00...`):

```ts
// RED stub (P4-T12): the plan's interface, with no behaviour yet.
import type { BankAlbumDto, CommandAck, SlipAccountDto, SlipBatchItem, SlipDraftDto, SlipResult, SlipSaltDto } from '@gogospend/contracts';

import type { SlipResources } from '../slipResources.ts';

export type FakeSlipCall = { method: keyof SlipResources; body?: unknown };

export const FAKE_SLIP_SALT: SlipSaltDto = { salt: '' };

const NO_ACK: CommandAck = { command_id: '', entity_id: '', version: 1, committed_revision: '0', outcome: 'accepted', entity_state: 'active' };
const NO_ACCOUNT: SlipAccountDto = { id: '', version: 1, bank: 'other', account_last4: '', wallet_id: null, open_drafts: 0 };

export function fakeSlipResources(_options: {
  read?: (item: SlipBatchItem, index: number) => SlipResult;
  drafts?: SlipDraftDto[];
  accounts?: SlipAccountDto[];
  albums?: BankAlbumDto[];
  slipImportOn?: boolean;
} = {}): SlipResources & { calls: FakeSlipCall[] } {
  return {
    calls: [],
    salt: async () => FAKE_SLIP_SALT,
    read: async () => ({ results: [], uses_left: { live: 0, backfill: 0 }, retry_after_seconds: null }),
    drafts: async () => ({ drafts: [], total: 0, next_cursor: null }),
    confirm: async () => NO_ACK,
    dismiss: async () => NO_ACK,
    accounts: async () => [],
    updateAccount: async () => NO_ACCOUNT,
    recordRef: async () => undefined,
    bankAlbums: async () => [],
    registerDevice: async () => undefined,
  };
}
```
