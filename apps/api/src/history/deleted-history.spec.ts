// "Recently deleted" (GET /v1/history/deleted) without a database: request
// parsing, the keyset cursor, how a page is put together from the query's
// rows, and the route's access class over HTTP with a fake owner
// transaction. The window, ordering, paging and ownership against real rows
// are in deleted-history.integration.spec.ts.
import { ContractValidationError, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, RESTORE_WINDOW_DAYS, isTransactionSnapshot } from '@gogospend/contracts';
import type { SessionContext } from '@gogospend/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { PolicyGate, SessionResolver } from '../auth/application-session.guard';
import type { TokenVerifier } from '../auth/auth0-token-verifier';
import { routeManifest } from '../auth/route-policy';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { createV1TestApp } from '../testing/v1-test-app';
import { decodeCursor, decodeDeletedCursor, encodeCursor, encodeDeletedCursor } from './cursor';
import { DeletedHistoryQuery, parseDeletedHistoryRequest } from './deleted-history-query';
import { HistoryController } from './history.controller';

const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-00000000000a';
const WALLET = '0b5c9a8e-1d2f-4e3a-8b7c-6d5e4f3a2b1c';
const CATEGORY = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a';
const idOf = (n: number) => `6a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, '0')}`;

function failure(fn: () => unknown): { code: string; field: string | undefined } {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContractValidationError) return { code: error.code, field: error.field };
    throw error;
  }
  throw new Error('expected a ContractValidationError');
}

/** A record row as the query reads it, plus the exact deletion instant the cursor keeps. */
const row = (n: number, deletedKey: string) => ({
  id: idOf(n), type: 'expense', amount_minor: String(6500 + n), occurred_on: '2026-10-01', wallet_id: WALLET, category_id: CATEGORY,
  source_wallet_id: null, destination_wallet_id: null, note: `note ${n}`, merchant: null, deleted_at: new Date(deletedKey), version: 2, attachment_id: null,
  deleted_key: deletedKey,
});

type Seen = { text: string; values: unknown[] };
/** An owner transaction that answers the revision read and returns `rows` for the listing. */
function fakeTx(rows: readonly Record<string, unknown>[], revision = '9') {
  const seen: Seen[] = [];
  const tx = {
    accountId: ACCOUNT,
    async query(text: string, values: unknown[] = []) {
      seen.push({ text, values });
      if (text.includes('account_sync_state')) return [{ revision }];
      return rows;
    },
  };
  return { tx: tx as unknown as OwnerTx, seen, listing: () => seen.find((query) => query.text.includes('FROM transactions')) };
}

describe('GET /v1/history/deleted request', () => {
  it('takes only limit and cursor; the limit defaults and is bounded like history', () => {
    expect(parseDeletedHistoryRequest({})).toEqual({ limit: HISTORY_DEFAULT_LIMIT });
    expect(parseDeletedHistoryRequest({ limit: '1' }).limit).toBe(1);
    expect(parseDeletedHistoryRequest({ limit: String(HISTORY_MAX_LIMIT) }).limit).toBe(HISTORY_MAX_LIMIT);
    expect(parseDeletedHistoryRequest({ cursor: 'abc_-1' }).cursor).toBe('abc_-1');
    for (const limit of ['0', String(HISTORY_MAX_LIMIT + 1), 'abc', '1.5', '', '01']) {
      expect(failure(() => parseDeletedHistoryRequest({ limit }))).toEqual({ code: 'VALIDATION_FAILED', field: 'limit' });
    }
    // History's filters mean nothing here, so they are refused rather than ignored.
    for (const field of ['from', 'through', 'wallet_id', 'type', 'query', 'sort', 'owner_id']) {
      expect(failure(() => parseDeletedHistoryRequest({ [field]: 'x' }))).toEqual({ code: 'UNKNOWN_FIELD', field });
    }
    expect(failure(() => parseDeletedHistoryRequest({ cursor: ['a', 'b'] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'cursor' });
    expect(failure(() => parseDeletedHistoryRequest({ limit: ['1', '2'] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'limit' });
  });
});

describe('the deleted-records cursor', () => {
  const position = { deletedAt: '2026-10-20T03:04:05.123456Z', id: idOf(1), revision: '42' };
  const forge = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  it('keeps the deletion instant to the microsecond and round-trips', () => {
    const cursor = encodeDeletedCursor(position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
    expect(decodeDeletedCursor(cursor)).toEqual(position);
  });

  it('refuses a malformed or forged cursor, and a history cursor, as a 422 on the cursor', () => {
    let good: Record<string, unknown> = {};
    try {
      good = JSON.parse(Buffer.from(encodeDeletedCursor(position), 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      // Not JSON: every forged cursor below is then just as wrong.
    }
    /** The good cursor with one of its values replaced, whatever the field is called. */
    const swap = (from: unknown, to: unknown) => forge(Object.fromEntries(Object.entries(good).map(([key, value]) => [key, value === from ? to : value])));
    const bad = [
      'not a cursor!',
      'x'.repeat(600),
      forge({}),
      swap(1, 2),
      // Its kind is part of it: a cursor of another listing shaped like this one is still refused.
      swap('deleted', 'history'),
      swap(position.id, 'not-a-uuid'),
      swap(position.revision, '-1'),
      swap(position.deletedAt, '2026-02-30T00:00:00.000000Z'),
      swap(position.deletedAt, '2026-10-20 03:04:05'),
      swap(position.deletedAt, '2026-10-20T03:04:05.123Z'),
      encodeCursor({ from: '2026-01-01', through: '2026-12-31', sort: 'date_desc' }, { occurredOn: '2026-10-01', id: idOf(1), revision: '42' }),
    ];
    for (const cursor of bad) expect(failure(() => decodeDeletedCursor(cursor))).toEqual({ code: 'VALIDATION_FAILED', field: 'cursor' });
    // ...and history refuses this listing's cursor.
    expect(failure(() => decodeCursor({ from: '2026-01-01', through: '2026-12-31', sort: 'date_desc' }, encodeDeletedCursor(position))).field).toBe('cursor');
  });
});

describe('a page of recently deleted records', () => {
  const rows = [row(3, '2026-10-20T03:00:00.000003Z'), row(2, '2026-10-20T03:00:00.000002Z'), row(1, '2026-10-19T00:00:00.000000Z')];

  it('maps rows to the persisted record shape, keeps their order and cursors after the last one shown', async () => {
    const { tx, listing } = fakeTx(rows);
    const page = await DeletedHistoryQuery.list(tx, undefined, 2);
    expect(Object.keys(page).sort()).toEqual(['as_of_revision', 'items', 'next_cursor', 'refresh_suggested']);
    expect(page.items.map((item) => item.id)).toEqual([idOf(3), idOf(2)]);
    expect(page.items[0]).toEqual({
      id: idOf(3), type: 'expense', amount_minor: '6503', occurred_on: '2026-10-01', wallet_id: WALLET, category_id: CATEGORY,
      note: 'note 3', merchant: null, deleted_at: '2026-10-20T03:00:00.000Z', version: 2,
    });
    expect(page.items.every(isTransactionSnapshot)).toBe(true);
    expect([page.as_of_revision, page.refresh_suggested]).toEqual(['9', false]);
    expect(decodeDeletedCursor(page.next_cursor as string)).toEqual({ deletedAt: '2026-10-20T03:00:00.000002Z', id: idOf(2), revision: '9' });
    // One row more than the page, to know whether another follows; the window is the restore command's.
    const query = listing();
    expect(query?.text).toMatch(/LIMIT 3\b/);
    expect(query?.values[0]).toBe(RESTORE_WINDOW_DAYS);
  });

  it('ends without a cursor when nothing follows', async () => {
    const page = await DeletedHistoryQuery.list(fakeTx(rows.slice(0, 2)).tx, undefined, 2);
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).toBeNull();
    expect((await DeletedHistoryQuery.list(fakeTx([]).tx)).items).toEqual([]);
  });

  it('a later page starts after its cursor and suggests a refresh once the account has changed', async () => {
    const cursor = encodeDeletedCursor({ deletedAt: '2026-10-20T03:00:00.000002Z', id: idOf(2), revision: '7' });
    const changed = fakeTx(rows.slice(2), '9');
    const page = await DeletedHistoryQuery.list(changed.tx, cursor, 1);
    expect(changed.listing()?.values).toEqual([RESTORE_WINDOW_DAYS, '2026-10-20T03:00:00.000002Z', idOf(2)]);
    expect([page.items.map((item) => item.id), page.as_of_revision, page.refresh_suggested]).toEqual([[idOf(1)], '9', true]);
    const unchanged = await DeletedHistoryQuery.list(fakeTx(rows.slice(2, 3).concat(rows.slice(2, 3)), '7').tx, cursor, 1);
    expect(unchanged.refresh_suggested).toBe(false);
    // The next cursor carries the chain's first revision, as history's does.
    expect(decodeDeletedCursor(unchanged.next_cursor as string).revision).toBe('7');
  });
});

describe('GET /v1/history/deleted over HTTP', () => {
  const BINDING = 'b'.repeat(43);
  const CLIENT = { 'x-gogospend-client': 'ios/1.4.0', authorization: 'Bearer good-token' };
  const verifier: TokenVerifier = {
    async verifyApiAccessToken() {
      return { issuer: 'https://tenant.example/', subject: 'auth0|user', clientId: 'native', scopes: [] };
    },
  };
  const resolver: SessionResolver = {
    async resolve(identity, binding) {
      return binding === BINDING ? { accountId: ACCOUNT, subject: identity.subject, clientId: identity.clientId, bindingId: 'binding-1', sessionGeneration: 1 } : null;
    },
  };
  // A read: newly required terms never block it.
  const policies: PolicyGate = { currentPolicyState: async () => 'pending' };
  const transactions: { accountId: string; options: unknown }[] = [];
  const db = {
    async withOwnerTransaction<T>(ctx: SessionContext, fn: (tx: OwnerTx) => Promise<T>, options: unknown): Promise<T> {
      transactions.push({ accountId: ctx.accountId, options });
      return fn(fakeTx([row(1, '2026-10-19T00:00:00.000000Z')]).tx);
    },
  };
  let app: INestApplication;

  beforeAll(async () => {
    app = await createV1TestApp([HistoryController], { verifier, resolver, policies, providers: [{ provide: DatabaseService, useValue: db }] });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    transactions.length = 0;
  });

  it('is a bound-session read that no operational pause stops', () => {
    expect(routeManifest(app).find((entry) => entry.route === 'GET /v1/history/deleted')).toEqual({ route: 'GET /v1/history/deleted', access: 'bound_session', gates: [] });
  });

  it('needs a bound session before any database work', async () => {
    const res = await request(app.getHttpServer()).get('/v1/history/deleted').set(CLIENT);
    expect([res.status, res.body.code]).toEqual([401, 'SESSION_REQUIRED']);
    expect(transactions).toEqual([]);
  });

  it("reads the session's own account in one snapshot transaction", async () => {
    const res = await request(app.getHttpServer()).get('/v1/history/deleted?limit=10').set({ ...CLIENT, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(200);
    expect(transactions).toEqual([{ accountId: ACCOUNT, options: { snapshot: true } }]);
    expect(res.body).toEqual({
      items: [expect.objectContaining({ id: idOf(1), deleted_at: '2026-10-19T00:00:00.000Z', version: 2 })],
      next_cursor: null,
      as_of_revision: '9',
      refresh_suggested: false,
    });
  });

  it.each([['from', 'from=2026-01-01'], ['limit', 'limit=0'], ['cursor', 'cursor=nope!']])('refuses a bad %s with a 422 naming it', async (field, query) => {
    const res = await request(app.getHttpServer()).get(`/v1/history/deleted?${query}`).set({ ...CLIENT, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(422);
    expect(res.body.fields).toHaveProperty(field);
  });
});
