import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import { AuthUnavailable, createBetterAuthPort } from '../auth/betterAuthPort.ts';
import { createCredentialProvider } from '../auth/credentialProvider.ts';
import type { CredentialProvider } from '../auth/credentialProvider.ts';
import * as session from '../auth/session.ts';
import type { SessionRecordStore, StoredSession } from '../auth/sessionStore.ts';
import { createFakeAuthServer } from '../auth/testing/fakeAuthServer.ts';
import { createDiarySessionResolver } from '../spend/v1/diarySession.ts';
import { createKnownAccount } from '../spend/v1/knownAccount.ts';
import { V1Error, createV1Transport } from './client.ts';
import type { V1Credentials } from './client.ts';

type Reply = { status: number; body?: unknown; delayMs?: number; gate?: Promise<void>; drop?: boolean };
let baseUrl = '';
let seen: { url: string; headers: IncomingHttpHeaders; body: string }[] = [];
let replies: Reply[] = [];
let onRequest: (() => void) | null = null;
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  seen.push({ url: req.url ?? '', headers: req.headers, body });
  const reply = replies.shift() ?? { status: 200, body: { ok: true } };
  onRequest?.();
  if (reply.drop) {
    req.socket.destroy();
    return;
  }
  if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
  if (reply.gate) await reply.gate;
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
let onRefresh: (() => void) | null = null;
let onTokenRead: (() => void) | null = null;
let ended: { code: string; epoch: number }[] = [];
beforeEach(() => {
  seen = [];
  replies = [];
  onRequest = null;
  token = 'token-1';
  snapshot = { binding: 'b'.repeat(43), epoch: 1 };
  refreshes = 0;
  refreshResult = true;
  onRefresh = null;
  onTokenRead = null;
  ended = [];
});
const credentials: V1Credentials = {
  async getAccessToken() {
    onTokenRead?.();
    return token;
  },
  getSessionSnapshot: () => snapshot,
  async refreshAfterUnauthorized() {
    refreshes += 1;
    onRefresh?.();
    if (refreshResult) token = 'token-2';
    return refreshResult;
  },
  sessionEnded: (event) => void ended.push(event),
};
const CLIENT = { platform: 'ios', version: '1.2.3' } as const;
const transport = (over: Partial<V1Credentials> = {}) => createV1Transport({ baseUrl, credentials: { ...credentials, ...over }, client: CLIENT, timeoutMs: 2_000 });
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
  assert.deepEqual(ended, []);
  replies.push({ status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } }, { status: 401, body: { code: 'REAUTH_REQUIRED' } });
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
  assert.equal(refreshes, 0);
});

test('token-only routes need no binding and send none, even from a bound session', async () => {
  assert.deepEqual(await transport().request('POST', '/v1/auth/challenges', { body: {}, tokenOnly: true, validate: ok }), { ok: true });
  assert.equal(seen[0].headers['x-gogospend-session'], undefined, "a bound session's binding never goes to a token-only route");
  snapshot = { binding: null, epoch: 1 };
  assert.deepEqual(await transport().request('POST', '/v1/auth/challenges', { body: {}, tokenOnly: true, validate: ok }), { ok: true });
  assert.equal(seen[1].headers['x-gogospend-session'], undefined);
  assert.equal(seen[1].headers.authorization, 'Bearer token-1');
  assert.equal((await failure(() => transport().request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'signed_out');
});

test("a session change while the token is read sends nothing (never one identity's binding with another's token)", async () => {
  onTokenRead = () => {
    snapshot = { binding: 'c'.repeat(43), epoch: 2 };
    token = 'token-of-c';
  };
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'session_changed');
  assert.equal(seen.length, 0);
});

test('a 401 that arrives after the session changed is neither refreshed nor resent', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' }, delayMs: 20 });
  onRequest = () => void (snapshot = { binding: 'c'.repeat(43), epoch: 2 });
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'session_changed');
  assert.equal(refreshes, 0);
  assert.equal(seen.length, 1);
});

test('a session change while the token is re-read or refreshed stops the resend (never sent under another identity)', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } });
  onRefresh = () => void (snapshot = { binding: 'c'.repeat(43), epoch: 2 });
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'session_changed');
  assert.equal(refreshes, 1);
  assert.equal(seen.length, 1, 'not resent after a refresh under another identity');
  snapshot = { binding: 'b'.repeat(43), epoch: 3 };
  token = 'token-1';
  onRefresh = null;
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } });
  let reads = 0;
  onTokenRead = () => {
    reads += 1;
    // The re-read after the 401 already belongs to another session.
    if (reads === 2) {
      snapshot = { binding: 'c'.repeat(43), epoch: 4 };
      token = 'token-of-c';
    }
  };
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'session_changed');
  assert.equal(seen.length, 2, 'not resent with the other session token');
  assert.equal(refreshes, 1);
});

test('a lost command is not resent once the session changed', async () => {
  replies.push({ status: 200, drop: true });
  onRequest = () => void (snapshot = { binding: null, epoch: 2 });
  assert.equal((await failure(() => transport().request('POST', '/v1/transactions', { body: {}, command, validate: ok })))?.outcome, 'session_changed');
  assert.equal(seen.length, 1);
});

test('a 401 for a token another request already renewed is resent with the new token, without a second refresh', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 401, body: { code: 'UNAUTHENTICATED' }, delayMs: 40 });
  const results = await Promise.all([transport().request('GET', '/v1/a', { validate: ok }), transport().request('GET', '/v1/b', { validate: ok })]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
  assert.deepEqual(seen.slice(2).map((r) => r.headers.authorization), ['Bearer token-2', 'Bearer token-2']);
});

test('credentials that cannot be read right now are a network outcome, never a sign-out', async () => {
  const offline = async (): Promise<never> => {
    throw new AuthUnavailable();
  };
  assert.equal((await failure(() => transport({ getAccessToken: offline }).request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'network');
  assert.equal(seen.length, 0);
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } });
  assert.equal((await failure(() => transport({ refreshAfterUnauthorized: offline }).request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'network');
  assert.deepEqual(ended, []);
});

test('a request with its own credentials uses them, is never refreshed and never ends the session', async () => {
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 401, body: { code: 'SESSION_REQUIRED' } });
  assert.equal((await failure(() => transport().request('POST', '/v1/auth/bootstrap', { body: {}, tokenOnly: true, credentials: { accessToken: 'pending' }, validate: ok })))?.outcome, 'signed_out');
  assert.equal(seen[0].headers.authorization, 'Bearer pending');
  assert.equal(seen[0].headers['x-gogospend-session'], undefined);
  assert.equal((await failure(() => transport().request('POST', '/v1/me/logout', { body: {}, credentials: { accessToken: 'at-z', binding: 'z'.repeat(43) }, validate: ok })))?.outcome, 'signed_out');
  assert.equal(seen[1].headers.authorization, 'Bearer at-z');
  assert.equal(seen[1].headers['x-gogospend-session'], undefined);
  assert.equal(refreshes, 0);
  assert.deepEqual(ended, []);
});

test('a server-ended session is reported with the epoch the request started under; proof and token-only refusals are not', async () => {
  replies.push({ status: 401, body: { code: 'SESSION_REQUIRED' } }, { status: 401, body: { code: 'REAUTH_REQUIRED' } }, { status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } });
  for (let i = 0; i < 3; i += 1) assert.equal((await failure(() => transport().request('GET', '/v1/me', { validate: ok })))?.outcome, 'signed_out');
  assert.deepEqual(ended, [
    { code: 'SESSION_REQUIRED', epoch: 1 },
    { code: 'REAUTH_REQUIRED', epoch: 1 },
    { code: 'ACCOUNT_UNAVAILABLE', epoch: 1 },
  ]);
  replies.push({ status: 401, body: { code: 'REAUTH_REQUIRED' } }, { status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } }, { status: 403, body: { code: 'FORBIDDEN' } });
  await failure(() => transport().request('POST', '/v1/me/global-logout', { body: {}, command, proof: true, validate: ok }));
  await failure(() => transport().request('POST', '/v1/auth/challenges', { body: {}, tokenOnly: true, validate: ok }));
  await failure(() => transport().request('GET', '/v1/me', { validate: ok }));
  assert.equal(ended.length, 3);
  // After the one allowed refresh.
  replies.push({ status: 401, body: { code: 'UNAUTHENTICATED' } }, { status: 401, body: { code: 'SESSION_REQUIRED' } });
  await failure(() => transport().request('GET', '/v1/me', { validate: ok }));
  assert.equal(refreshes, 1);
  assert.deepEqual(ended.at(-1), { code: 'SESSION_REQUIRED', epoch: 1 });
});

// ---- the real provider behind the shared session seam ----

const EMAIL = 'kan@example.test';
const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));
const seamTransport = () => createV1Transport({ baseUrl, credentials: session.v1SessionCredentials, client: CLIENT, timeoutMs: 2_000 });
const openGate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};

function recordStore(): SessionRecordStore & { current(): StoredSession | null } {
  let value: StoredSession | null = null;
  return {
    current: () => value,
    async load() { return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

async function withProvider(provider: CredentialProvider, body: () => Promise<void>): Promise<void> {
  session.installCredentialProvider(provider);
  try {
    await body();
  } finally {
    session.installCredentialProvider(null);
  }
}

async function emailSignIn(provider: CredentialProvider, server: ReturnType<typeof createFakeAuthServer>, port: ReturnType<typeof createBetterAuthPort>) {
  await port.sendEmailCode(EMAIL);
  const result = await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(result.outcome, 'active');
  return result;
}

/** An unverified JWT claim, read as the provider reads `sid` (R86). */
function claimOf(token: string, name: 'sub' | 'sid'): unknown {
  const part = token.split('.')[1] ?? '';
  try {
    const json: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (typeof json !== 'object' || json === null) return undefined;
    return Object.entries(json).find(([key]) => key === name)?.[1];
  } catch {
    return undefined;
  }
}

test('return_to_a_does_not_accept_old_a_response', async () => {
  const server = createFakeAuthServer();
  const sessions = recordStore();
  const port = createBetterAuthPort({ client: server.client, native: server.native({ google: { sub: 'google-sub', email: 'g@example.test' } }) });
  const provider = createCredentialProvider({ port, sessions });
  await withProvider(provider, async () => {
    await emailSignIn(provider, server, port);
    const firstA = provider.getSessionSnapshot();
    const firstAResponse = { ok: true, wallets: ['A-first'] };
    const gate = openGate();
    replies.push({ status: 200, body: firstAResponse, gate: gate.promise });
    const appliedResponses: unknown[] = [];
    const late = seamTransport()
      .request('GET', '/v1/wallets', { validate: ok })
      .then((value) => void appliedResponses.push(value), (error: unknown) => error);
    while (seen.length === 0) await tick();
    // The vault reads the session from the JWT. The session id is not a header.
    assert.equal(seen[0].headers['x-gogospend-session'], undefined);
    assert.equal((await provider.signIn({ method: 'google', signUp: true })).outcome, 'active');
    await emailSignIn(provider, server, port);
    const view = () => ({ session: provider.getSessionSnapshot(), seam: session.getV1SessionSnapshot(), applied: [...appliedResponses] });
    const stateBeforeLateResponse = view();
    const back = stateBeforeLateResponse.session;
    // Each sign-in mints a new session id, so the binding cannot be the one the late request started under.
    assert.equal(back.state, 'active');
    assert.equal(back.accountId, firstA.accountId);
    assert.notEqual(back.binding, firstA.binding);
    assert.ok(back.epoch > firstA.epoch);
    gate.release();
    const outcome = await late;
    const stateAfterLateResponse = view();
    assert.ok(!appliedResponses.some((response) => isDeepStrictEqual(response, firstAResponse)), "A's first response is never applied");
    assert.deepEqual(stateAfterLateResponse, stateBeforeLateResponse);
    assert.equal((outcome as V1Error).outcome, 'session_changed');
  });
});

test('a server-ended session leaves active through the seam; a stale report from an earlier session changes nothing', async () => {
  const server = createFakeAuthServer();
  const sessions = recordStore();
  const port = createBetterAuthPort({ client: server.client, native: server.native({ google: { sub: 'google-sub', email: 'g@example.test' } }) });
  const provider = createCredentialProvider({ port, sessions });
  await withProvider(provider, async () => {
    await emailSignIn(provider, server, port);
    const active = provider.getSessionSnapshot();
    replies.push({ status: 401, body: { code: 'SESSION_REQUIRED' } });
    assert.equal((await failure(() => seamTransport().request('GET', '/v1/me', { validate: ok })))?.code, 'SESSION_REQUIRED');
    assert.deepEqual(provider.getSessionSnapshot(), { ...active, state: 'reauth_required' });
    assert.equal(provider.endedReason(), 'signed_out_elsewhere');
    assert.equal(session.getV1SessionSnapshot().binding, null);
    assert.deepEqual(sessions.current()?.accountId, active.accountId);
    await emailSignIn(provider, server, port);
    const a = provider.getSessionSnapshot();
    // A request sent as A whose SESSION_REQUIRED arrives after a switch to B.
    const gate = openGate();
    replies.push({ status: 401, body: { code: 'SESSION_REQUIRED' }, gate: gate.promise });
    const stale = failure(() => seamTransport().request('GET', '/v1/me', { validate: ok }));
    while (seen.length < 2) await tick();
    assert.equal((await provider.signIn({ method: 'google', signUp: true })).outcome, 'active');
    const b = provider.getSessionSnapshot();
    gate.release();
    assert.equal((await stale)?.outcome, 'session_changed');
    provider.sessionEnded({ code: 'ACCOUNT_UNAVAILABLE', epoch: a.epoch });
    assert.deepEqual(provider.getSessionSnapshot(), b, 'B stays active');
    replies.push({ status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } });
    await failure(() => seamTransport().request('GET', '/v1/me', { validate: ok }));
    // ACCOUNT_UNAVAILABLE keeps the account (D37). It used to sign out.
    assert.equal(provider.getSessionSnapshot().state, 'reauth_required');
    assert.equal(provider.endedReason(), 'account_unavailable');
    assert.equal(sessions.current()?.accountId, b.accountId);
    await provider.hydrate();
    assert.equal(sessions.current()?.accountId, b.accountId);
    assert.equal(provider.getSessionSnapshot().state, 'reauth_required');
  });
});

test('sign-out from a locked session still revokes its binding over the transport', async () => {
  const server = createFakeAuthServer();
  const sessions = recordStore();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const provider = createCredentialProvider({
    port,
    sessions,
    logoutVault: async (credentials) => {
      await seamTransport().request('POST', '/v1/me/logout', {
        body: {},
        credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },
        validate: (value): value is null => value === null,
      });
    },
  });
  await withProvider(provider, async () => {
    await emailSignIn(provider, server, port);
    const token = await provider.getAccessToken();
    server.deleteSession(provider.getSessionSnapshot().binding ?? '');
    assert.equal(await provider.refreshAfterUnauthorized(), false);
    assert.equal(provider.getSessionSnapshot().state, 'locked');
    assert.equal(await port.accessToken(), token, 'a refused refresh keeps the last token so sign-out can still reach the vault');
    replies.push({ status: 200, body: null });
    await provider.signOut();
    const revoke = seen.find((r) => r.url === '/v1/me/logout');
    assert.ok(revoke, 'POST /v1/me/logout was sent');
    assert.equal(revoke.headers['x-gogospend-session'], undefined);
    assert.equal(revoke.headers.authorization, `Bearer ${token}`);
    assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  });
});

test("a request begun during an account switch sends nothing: never the next session's token under the first session (R86)", async () => {
  const server = createFakeAuthServer();
  const sessions = recordStore();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const provider = createCredentialProvider({ port, sessions });
  await withProvider(provider, async () => {
    await emailSignIn(provider, server, port);
    const a = provider.getSessionSnapshot();
    const gate = openGate();
    let reached!: () => void;
    const saving = new Promise<void>((resolve) => (reached = resolve));
    const save = sessions.save.bind(sessions);
    sessions.save = async (next) => {
      reached();
      await gate.promise;
      return save(next);
    };
    await port.sendEmailCode('b@example.test');
    const switching = provider.signIn({ method: 'email', email: 'b@example.test', code: server.codeFor('b@example.test') });
    await saving;
    const during = await failure(() => seamTransport().request('POST', '/v1/transactions', { body: { id: 'x' }, command, validate: ok }));
    assert.deepEqual([during?.outcome, during?.status, during?.code], ['signed_out', 0, 'SESSION_REQUIRED'], 'refused before sending, as while signing in');
    assert.equal(seen.length, 0, 'nothing reached the vault');
    assert.deepEqual(provider.getSessionSnapshot(), a, 'the first session, unlocked');
    gate.release();
    assert.equal((await switching).outcome, 'active');
    const b = provider.getSessionSnapshot();
    assert.deepEqual(await seamTransport().request('GET', '/v1/wallets', { validate: ok }), { ok: true });
    const bearer = (seen[0]?.headers.authorization ?? '').replace(/^Bearer /, '');
    assert.deepEqual([claimOf(bearer, 'sub'), claimOf(bearer, 'sid')], [b.accountId, b.binding]);
  });
});

test('offline token reads neither lock the session nor close the diary (S4 resolver)', async () => {
  const server = createFakeAuthServer();
  server.state.tokenTtlSeconds = 30;
  const sessions = recordStore();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const provider = createCredentialProvider({ port, sessions });
  await withProvider(provider, async () => {
    await emailSignIn(provider, server, port);
    const accountId = provider.getSessionSnapshot().accountId;
    let slot: string | null = null;
    const known = createKnownAccount(
      { get: async () => slot, set: async (value) => void (slot = value), remove: async () => void (slot = null) },
      async (text) => createHash('sha256').update(text).digest('hex'),
    );
    const t = seamTransport();
    const resolver = createDiarySessionResolver({
      snapshot: session.getV1SessionSnapshot,
      fetchAccountId: async () => (await t.request('GET', '/v1/me', { validate: (v): v is { account_id: string } => typeof v === 'object' && v !== null })).account_id,
      known,
      sessionChanged: async () => undefined,
    });
    const unsubscribe = session.subscribeSession(() => void resolver.refresh());
    try {
      replies.push({ status: 200, body: { account_id: accountId } });
      await resolver.refresh();
      const open = resolver.current();
      assert.equal(open.accountId, accountId);
      server.state.offline = true;
      assert.equal((await failure(() => t.request('GET', '/v1/wallets', { validate: ok })))?.outcome, 'network');
      await tick(5);
      await resolver.refresh();
      assert.equal(provider.getSessionSnapshot().state, 'active', 'offline never locks');
      assert.deepEqual(resolver.current(), open, 'the diary stays on its account');
    } finally {
      unsubscribe();
    }
  });
});
