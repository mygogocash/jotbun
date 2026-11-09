#!/usr/bin/env python3
"""The 1C-T5 round-2 edits, as data. The brief's Find/Replace blocks are generated
from this file, and `apply.py` applies them to a scratch tree, so the brief and the
proof cannot drift apart.

Each edit: (id, stage, path relative to the repo root, find, replace).
`find` None means "create this file with `replace` as its whole content".
Stages: 'red' (tests and the fake server), 'green' (the fixes), 'receipt'.
"""

AUTH = 'apps/app/src/auth/'
RECEIPT = 'docs/implementation/premium-progress.md'

EDITS = []


def edit(eid, stage, path, find, replace):
    EDITS.append((eid, stage, path, find, replace))


# ---------------------------------------------------------------- RED: tests and the fake

edit('R1', 'red', AUTH + 'testing/fakeAuthServer.ts',
r'''  const ok = <T>(data: T): ClientResult<T> => ({ data, error: null });
''',
r'''  const ok = <T>(data: T): ClientResult<T> => ({ data, error: null });
  // 204 No Content, as Better Auth's client reads it: no data and no error (its JSON parser answers null for an empty body).
  const noContent = (): ClientResult<unknown> => ({ data: null, error: null });
''')

edit('R2', 'red', AUTH + 'testing/fakeAuthServer.ts',
r'''      calls.push(`signOutDevice:${id}`);
      const session = current();
      if (!isSession(session)) return session;
      return ok({});
''',
r'''      calls.push(`signOutDevice:${id}`);
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
''')

edit('R3', 'red', AUTH + 'testing/fakeAuthServer.ts',
r'''      calls.push('signOutEverywhere');
      const session = current();
      if (!isSession(session)) return session;
      return ok({});
''',
r'''      calls.push('signOutEverywhere');
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
''')

edit('R4', 'red', AUTH + 'betterAuthPort.test.ts',
r'''async function emailSession(email = EMAIL) {
  const ready = portFor();
  await ready.port.sendEmailCode(email);
  const session = await ready.port.signIn({ method: 'email', email, code: ready.server.codeFor(email) });
  return { ...ready, session };
}
''',
r'''async function emailSession(email = EMAIL) {
  const ready = portFor();
  await ready.port.sendEmailCode(email);
  const session = await ready.port.signIn({ method: 'email', email, code: ready.server.codeFor(email) });
  return { ...ready, session };
}

/** The first token call leaves with the cookie it was sent with; its answer comes back only after `release()`. */
function holdFirstToken(server: ReturnType<typeof createFakeAuthServer>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let sent!: () => void;
  const left = new Promise<void>((resolve) => { sent = resolve; });
  const inner = server.client.token.bind(server.client);
  let held = true;
  server.client.token = async () => {
    if (!held) return inner();
    held = false;
    const answer = await inner();
    sent();
    await gate;
    return answer;
  };
  return { release, left };
}
''')

edit('R5', 'red', AUTH + 'betterAuthPort.test.ts',
r'''test('refresh always renews', async () => {
''',
r'''test('a token read in flight across a sign-in is never kept for the new account (email and Google)', async () => {
  const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
  await port.sendEmailCode(EMAIL);
  const byEmail = await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  const first = holdFirstToken(server);
  const underEmail = port.accessToken();
  await first.left;
  const byGoogle = await port.signIn({ method: 'google', signUp: true });
  first.release();
  assert.equal(idTokenSubject((await underEmail) ?? ''), byEmail.accountId, 'the read answers the caller that asked under the email account');
  assert.equal(idTokenSubject((await port.accessToken()) ?? ''), byGoogle.accountId);
  const other = portFor({ google: { sub: 'google-sub-2', email: 'g2@example.test' } });
  const google = await other.port.signIn({ method: 'google', signUp: true });
  const second = holdFirstToken(other.server);
  const underGoogle = other.port.accessToken();
  await second.left;
  await other.port.sendEmailCode(EMAIL);
  const email = await other.port.signIn({ method: 'email', email: EMAIL, code: other.server.codeFor(EMAIL) });
  second.release();
  assert.equal(idTokenSubject((await underGoogle) ?? ''), google.accountId);
  assert.equal(idTokenSubject((await other.port.accessToken()) ?? ''), email.accountId);
});

test('a refresh in flight across a fresh sign-in is never kept for the new session', async () => {
  const { server, port, session } = await emailSession();
  const held = holdFirstToken(server);
  const refreshing = port.refresh();
  await held.left;
  await port.sendEmailCode(EMAIL);
  const fresh = await port.freshSignIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) }, { accountId: session.accountId, email: EMAIL });
  held.release();
  assert.equal(await refreshing, true);
  assert.notEqual(fresh.sessionId, session.sessionId);
  const before = server.calls.filter((call) => call === 'token').length;
  assert.equal(idTokenSubject((await port.accessToken()) ?? ''), session.accountId);
  assert.equal(server.calls.filter((call) => call === 'token').length, before + 1, 'the next read asks the server for the new session');
});

test('a token read in flight across a sign-out is not kept for after it', async () => {
  const { server, port } = await emailSession();
  const held = holdFirstToken(server);
  const before = port.accessToken();
  await held.left;
  await port.signOut();
  held.release();
  assert.equal(typeof (await before), 'string');
  assert.equal(await port.accessToken(), null, 'signed out: no cookie, so no token');
});

test('signing out a device or everywhere answers 204 with no body, which is success', async () => {
  const { server, port, session } = await emailSession();
  await assert.doesNotReject(() => port.signOutDevice(session.sessionId));
  await assert.doesNotReject(() => port.signOutEverywhere());
  assert.ok(server.calls.includes(`signOutDevice:${session.sessionId}`));
  assert.ok(server.calls.includes('signOutEverywhere'));
});

test('refresh always renews', async () => {
''')

edit('R6', 'red', AUTH + 'credentialProvider.test.ts',
r'''import * as session from './session.ts';
''',
r'''import { idTokenSubject } from './nativeSignIn.ts';
import * as session from './session.ts';
''')

edit('R7', 'red', AUTH + 'credentialProvider.test.ts',
r"""test('the server ending the session keeps the account and says why'""",
r"""test('a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record', async () => {
  const ready = await signedIn();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const reached = new Promise<void>((resolve) => { mark = resolve; });
  const save = ready.sessions.save.bind(ready.sessions);
  ready.sessions.save = async (next) => {
    mark();
    await gate;
    return save(next);
  };
  await ready.port.sendEmailCode(EMAIL);
  const fresh = ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  await reached;
  const out = ready.provider.signOut();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await out;
  assert.equal(await fresh, 'cancelled');
  assert.equal(ready.sessions.current(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(await ready.port.hasSession(), false);
});

test('the server ending the session keeps the account and says why'""")

edit('R8', 'red', AUTH + 'credentialProvider.test.ts',
r'''test('a fresh sign-in into the same account swaps the session''',
r'''test('after an account switch, a token read that began before it never reaches the new account', async () => {
  const ready = await signedIn();
  const before = ready.sessions.current();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const left = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.token.bind(ready.server.client);
  let held = true;
  ready.server.client.token = async () => {
    if (!held) return inner();
    held = false;
    const answer = await inner();
    mark();
    await gate;
    return answer;
  };
  const inFlight = ready.provider.getAccessToken();
  await left;
  await ready.port.sendEmailCode('b@example.test');
  assert.equal((await ready.provider.signIn({ method: 'email', email: 'b@example.test', code: ready.server.codeFor('b@example.test') })).outcome, 'active');
  const after = ready.sessions.current();
  release();
  await inFlight;
  assert.notEqual(after?.accountId, before?.accountId);
  assert.equal(idTokenSubject((await ready.provider.getAccessToken()) ?? ''), after?.accountId);
  const credentials = await ready.provider.requestCredentials();
  assert.deepEqual([idTokenSubject(credentials?.accessToken ?? ''), credentials?.sessionId], [after?.accountId, after?.sessionId]);
});

test('a fresh sign-in into the same account swaps the session''')

edit('R9', 'red', AUTH + 'jotbunAccountClient.test.ts', None,
r'''import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthClient } from 'better-auth/client';

import { createBetterAuthPort } from './betterAuthPort.ts';
import type { ClientResult } from './betterAuthPort.ts';
import { jotbunAccountClient } from './jotbunAccountClient.ts';
import { NO_NATIVE_SIGN_IN } from './nativeSignIn.ts';
import { createFakeAuthServer } from './testing/fakeAuthServer.ts';

type Sent = { method: string; path: string; type: string | null; body: string | null };

/** Better Auth's own client with our plugin, over a fetch that records each request and answers 204 with no body (plan Task 4). */
function realClient() {
  const sent: Sent[] = [];
  const client = createAuthClient({
    baseURL: 'http://localhost:8092',
    fetchOptions: {
      customFetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input instanceof Request ? input.url : String(input), init);
        sent.push({ method: request.method, path: new URL(request.url).pathname, type: request.headers.get('content-type'), body: request.body === null ? null : await request.text() });
        return new Response(null, { status: 204 });
      },
    },
    plugins: [jotbunAccountClient()],
  });
  return { client, sent };
}

/** The same reading as `answered` in betterAuthClient.ts, which imports native modules and cannot load here. */
async function asRead(answer: Promise<{ data: unknown; error: { status: number } | null }>): Promise<ClientResult<unknown>> {
  const result = await answer;
  return result.error ? { data: null, error: { status: result.error.status } } : { data: result.data, error: null };
}

test('the jotbun sign-out routes are sent as JSON, with an empty object when there is nothing to send', async () => {
  const { client, sent } = realClient();
  await client.signOutDevice({ id: 'device-id' });
  await client.signOutOtherDevices();
  await client.signOutEverywhere();
  assert.deepEqual(sent, [
    { method: 'POST', path: '/api/auth/jotbun/devices/sign-out', type: 'application/json', body: '{"id":"device-id"}' },
    { method: 'POST', path: '/api/auth/jotbun/devices/sign-out-others', type: 'application/json', body: '{}' },
    { method: 'POST', path: '/api/auth/jotbun/sign-out-everywhere', type: 'application/json', body: '{}' },
  ]);
});

test("a 204 from a jotbun sign-out route, read by Better Auth's own client, is success at the port", async () => {
  const { client } = realClient();
  assert.deepEqual(await client.signOutDevice({ id: 'device-id' }), { data: null, error: null }, "Better Auth's client reads an empty 204 as null");
  const fake = createFakeAuthServer();
  const port = createBetterAuthPort({
    native: NO_NATIVE_SIGN_IN,
    client: {
      ...fake.client,
      signOutDevice: (id) => asRead(client.signOutDevice({ id })),
      signOutEverywhere: () => asRead(client.signOutEverywhere()),
    },
  });
  await assert.doesNotReject(() => port.signOutDevice('device-id'));
  await assert.doesNotReject(() => port.signOutEverywhere());
});
''')

# ---------------------------------------------------------------- GREEN: the fixes

edit('G1', 'green', AUTH + 'betterAuthPort.ts',
r'''function mapSensitive<T>(result: ClientResult<T>): T {
  if (result.error) {
    raise(result.error)
    if (result.error.status === 403 && result.error.code === 'REAUTH_REQUIRED') throw new AuthRefused('REAUTH_REQUIRED')
    if (result.error.status === 401) throw new AuthRefused('SIGNED_OUT')
    throw new AuthRefused('REFUSED')
  }
  if (result.data === null) throw new AuthUnavailable()
  return result.data
}
''',
r'''function refuseSensitive(error: Failure): never {
  raise(error)
  if (error.status === 403 && error.code === 'REAUTH_REQUIRED') throw new AuthRefused('REAUTH_REQUIRED')
  if (error.status === 401) throw new AuthRefused('SIGNED_OUT')
  throw new AuthRefused('REFUSED')
}

function mapSensitive<T>(result: ClientResult<T>): T {
  if (result.error) refuseSensitive(result.error)
  if (result.data === null) throw new AuthUnavailable()
  return result.data
}

/**
 * Signing out a device and signing out everywhere answer 204 with no body
 * (plan Task 4). Better Auth's client reads an empty body as
 * `{ data: null, error: null }`, which is success here.
 */
function mapNoContent(result: ClientResult<unknown>): void {
  if (result.error) refuseSensitive(result.error)
}
''')

edit('G2', 'green', AUTH + 'betterAuthPort.ts',
r'''/**
 * The app's Better Auth port. A sign-in the server accepted drops the cached
 * JWT, which named the session before it. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
 */
''',
r'''/**
 * The app's Better Auth port. A sign-in the server accepted, or a sign-out,
 * drops the cached JWT, which named the session before it, and a token call
 * that was in flight across one is never cached. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
 */
''')

edit('G3', 'green', AUTH + 'betterAuthPort.ts',
r'''  const now = () => deps.now?.() ?? Date.now()
  let cached: { token: string; exp: number } | null = null
''',
r'''  const now = () => deps.now?.() ?? Date.now()
  let cached: { token: string; exp: number } | null = null
  // Moves on every sign-in the server accepted (a first sign-in, an account
  // switch, a fresh sign-in) and on every sign-out. A token call caches its
  // answer only if this has not moved since the call began: an answer that
  // was in flight across the change names the session before it, so it goes
  // back only to the caller that asked under that session.
  let generation = 0
  const forgetToken = () => {
    generation += 1
    cached = null
  }
''')

edit('G4', 'green', AUTH + 'betterAuthPort.ts',
r'''    if (result.error) mapCode(result.error)
    cached = null
''',
r'''    if (result.error) mapCode(result.error)
    forgetToken()
''')

edit('G5', 'green', AUTH + 'betterAuthPort.ts',
r'''    if (result.error) mapIdToken(result.error)
    cached = null
''',
r'''    if (result.error) mapIdToken(result.error)
    forgetToken()
''')

edit('G6', 'green', AUTH + 'betterAuthPort.ts',
r'''      // The server's answer does not decide whether this device is signed out.
    }
    cached = null
''',
r'''      // The server's answer does not decide whether this device is signed out.
    }
    forgetToken()
''')

edit('G7', 'green', AUTH + 'betterAuthPort.ts',
r'''    async accessToken() {
      if (cached && cached.exp * 1000 - now() > 60_000) return cached.token
      const result = await call(() => deps.client.token())
''',
r'''    async accessToken() {
      if (cached && cached.exp * 1000 - now() > 60_000) return cached.token
      const asked = generation
      const result = await call(() => deps.client.token())
''')

edit('G8', 'green', AUTH + 'betterAuthPort.ts',
r'''      if (!token) return null
      cached = { token, exp: expiry(token) }
      return token
''',
r'''      if (!token) return null
      if (asked === generation) cached = { token, exp: expiry(token) }
      return token
''')

edit('G9', 'green', AUTH + 'betterAuthPort.ts',
r'''    async refresh() {
      const result = await call(() => deps.client.token())
''',
r'''    async refresh() {
      const asked = generation
      const result = await call(() => deps.client.token())
''')

edit('G10', 'green', AUTH + 'betterAuthPort.ts',
r'''      if (!token) return false
      cached = { token, exp: expiry(token) }
      return true
''',
r'''      if (!token) return false
      if (asked === generation) cached = { token, exp: expiry(token) }
      return true
''')

edit('G11', 'green', AUTH + 'betterAuthPort.ts',
r'''    async signOutDevice(id) {
      mapSensitive(await call(() => deps.client.signOutDevice(id)))
    },
''',
r'''    async signOutDevice(id) {
      mapNoContent(await call(() => deps.client.signOutDevice(id)))
    },
''')

edit('G12', 'green', AUTH + 'betterAuthPort.ts',
r'''    async signOutEverywhere() {
      mapSensitive(await call(() => deps.client.signOutEverywhere()))
    },
''',
r'''    async signOutEverywhere() {
      mapNoContent(await call(() => deps.client.signOutEverywhere()))
    },
''')

edit('G13', 'green', AUTH + 'jotbunAccountClient.ts',
r'''      signOutOtherDevices: () => $fetch<unknown>('/jotbun/devices/sign-out-others', { method: 'POST' }),
      signOutEverywhere: () => $fetch<unknown>('/jotbun/sign-out-everywhere', { method: 'POST' }),
''',
r'''      // An empty JSON object, as Better Auth's own /sign-out sends: the Worker refuses a POST body that is not JSON (415).
      signOutOtherDevices: () => $fetch<unknown>('/jotbun/devices/sign-out-others', { method: 'POST', body: {} }),
      signOutEverywhere: () => $fetch<unknown>('/jotbun/sign-out-everywhere', { method: 'POST', body: {} }),
''')

# ---------------------------------------------------------------- the receipt (1C section only)

edit('D1', 'receipt', RECEIPT,
r'''next to this task's changes), then this commit. Not pushed.''',
r'''next to this task's changes), then the task commit `7bc2fe1`, then the review round-2 commit on top of it. Not pushed.''')

edit('D2', 'receipt', RECEIPT,
r'''`npm ls` shows one line: 1.6.33, `better-call` 1.4.0, `@better-fetch/fetch` 1.3.1. `test:ops` (Linux bindings) passes.''',
r'''`npm ls` shows one line: 1.6.33, `better-call` 1.4.0, `@better-fetch/fetch` 1.3.1. `test:ops` (Linux bindings) passes. The same lockfile change also resyncs the root entry's stale `workspaces` (`["apps/*","packages/*"]`) to the manifest's `["apps/api","apps/app","packages/*"]`, and changes 52 dev flags: 36 entries (`vitest`, `vite`, `happy-dom` and their dependencies) move from `dev` to `devOptional` and 16 rolldown bindings drop `dev`, because `better-auth` lists `vitest` as an optional peer. No install in the repository uses `--omit=dev` (the API Dockerfile and `backend.yml` checked), so nothing installs differently. Every package that reads `zod` from the root asks for zod 4 (`better-auth`, both `@better-auth/core` copies, `@better-auth/expo`, `better-call`); `@expo/cli` keeps its own 3.25.76; nothing in `apps/api`, `apps/app`, `packages` or `scripts` imports `zod`; and the API image's release graph is unchanged (123 packages, no problems; checked by the review).''')

edit('D3', 'receipt', RECEIPT,
r'''- **Deviations:**
  1. The RED ran after the code existed''',
r'''- **Review round 2** (`controller/briefs/1C-T5-round2.md`, on `7bc2fe1`, no merge): the port's token cache moves a generation on every accepted sign-in and every sign-out, and `accessToken()` and `refresh()` cache an answer only if the generation has not moved since the call began (an answer in flight across a sign-in went back to the caller that asked, and was cached for the next session: after an account switch the provider handed out the previous account's JWT, and `requestCredentials()` paired it with the new session id). Signing out a device and signing out everywhere read Better Auth's `{ data: null, error: null }` for a 204 as success (the fake server now answers that way). `signOutOtherDevices` and `signOutEverywhere` send `{}` as JSON. New tests: `a token read in flight across a sign-in is never kept for the new account (email and Google)`, `a refresh in flight across a fresh sign-in is never kept for the new session`, `a token read in flight across a sign-out is not kept for after it`, `signing out a device or everywhere answers 204 with no body, which is success` (port); `after an account switch, a token read that began before it never reaches the new account`, `a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record` (provider); `the jotbun sign-out routes are sent as JSON, with an empty object when there is nothing to send` and `a 204 from a jotbun sign-out route, read by Better Auth's own client, is success at the port` (new `jotbunAccountClient.test.ts`, on Better Auth's real client). RED on `7bc2fe1` with only the tests and the fake changed: 88 tests, 80 passed, 8 failed, each on an assertion: the seven new tests that change behaviour, and `the device calls use the jotbun routes, and REAUTH_REQUIRED and SIGNED_OUT stay apart`, whose fake now answers the two sign-out routes as Better Auth's client reads a 204 (it failed on `AuthUnavailable`). The provider's save-race test passes on `7bc2fe1`: it pins what the code already did, and its RED is under R14 and R15 below. GREEN: 88 passed in the six files (`betterAuthPort`, `credentialProvider`, `jotbunAccountClient`, `client`, `sessionEpoch` and `sessionMachine` tests), and `typecheck:app` passes. Mutation check (`controller/briefs/1C-T5-round2-mutants.py`): 22 of 22 killed: round 1's M1 to M6 and M9 to M13 (M7 and M8 are replaced by N3 and N4, whose lines this round changed), N1 to N9 for this round's guards, and R14 and R15 (the review's two `freshFlow` survivors, now killed by the save-race test); every file restored, sha256 equal. Gate: `npm run typecheck:app` passes; `npm run test:app` 31 passed; `npm run test:unit` 774 passed; focused render (`RootLayout`, `SignInScreen`) 2 files, 23 passed; `git diff --check` clean. Not re-run, since nothing they cover changed: the full render suite (no exported interface changed), `export:web` and the iOS export (no route, config, entry or import changed), `test:ops` (no lockfile change).
- **Deviations:**
  1. The RED ran after the code existed''')

edit('D4', 'receipt', RECEIPT,
r'''  7. `refresh()` refused (401 or 403) keeps the cached JWT, so a locked session's sign-out can still tell the vault; a JSON `null` answer with no error reads as `AuthUnavailable` in the device and link calls (a 204 reads as an empty string and passes).''',
r'''  7. `refresh()` refused (401 or 403) keeps the cached JWT, so a locked session's sign-out can still tell the vault. Signing out a device and signing out everywhere answer 204 with no body (plan Task 4); Better Auth's client reads that as `{ data: null, error: null }` (its JSON parser answers `null` for an empty body), and the port takes it as success. The other device and link calls still read a `null` answer with no error as `AuthUnavailable`. (Corrected in review round 2: the first version said a 204 reads as an empty string, which is better-fetch's default parser, not Better Auth's.)''')

edit('D5', 'receipt', RECEIPT,
r'''  - Task 6: `requestCredentials()` answers null when the session changed during the read; after `freshSignIn` the port has no cached JWT, so the next token names the new session and its `auth_time`.''',
r'''  - Task 6: `requestCredentials()` answers null when the session changed during the read. After `freshSignIn` the next token read asks the server, so it names the new session and its `auth_time`: the port drops its cached JWT on every accepted sign-in and every sign-out, and a token or refresh call that was in flight across one is never cached (review round 2).''')

edit('D6', 'receipt', RECEIPT,
r'''  - Task 7: `createAppAuthPort()` passes `NO_NATIVE_SIGN_IN`; swap in `appNativeSignIn()`.''',
r'''  - Task 7: `createAppAuthPort()` passes `NO_NATIVE_SIGN_IN`; swap in `appNativeSignIn()`. Its install changes the shared root lockfile: `@better-auth/expo` declares a required peer `@better-auth/core: ^1.6.33`, pinned to 1.6.33 only in the lockfile (no manifest names it), so a later `npm install` may re-resolve it to 1.7.x as the first install here did. Afterwards check that every `better-auth`, `@better-auth/core` and `@better-auth/expo` entry is 1.6.33, `better-call` 1.4.0 and `@better-fetch/fetch` 1.3.1.
  - Task 4 (and Task 8's devices screen): a sign-out that lands while a fresh sign-in's server call is answering leaves the old session live at Better Auth and at the vault until it expires. Its cookie is already gone from the phone, so nothing can use it, but the devices list shows it until then; signing it out there, or signing out everywhere, ends it. The app does not sign it out in that case (left as a note in review round 2).''')
