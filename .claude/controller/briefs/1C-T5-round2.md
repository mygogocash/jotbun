# Brief 1C-T5 round 2: the review's fixes to the app's Better Auth port

- **Implementer:** Haiku. Read `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md` first; it is binding.
- **What you fix:** the review of 1C Task 5 at `/Users/kunanonjarat/Developer/jotbun/.claude/controller/reviews/1C-T5.md` (majors 1 and 2, minors 1, 3 and 5), as the orchestrator scoped them. The spec is still `docs/superpowers/plans/2026-10-25-jotbun-p1c-better-auth.md`, `### Task 5` (line 611).
- **Worktree:** `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5`, branch `p1/1c-t5-app-auth`, at `7bc2fe1`. Called `WT` below. **No merge this round:** the orchestrator merges the integration head when it opens the pull request. Do not fetch, merge or rebase.
- **Your scratch folder:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-round2-impl` (create it with `mkdir -p`). Called `SCRATCH` below. Never put anything you need under `/private/tmp`.
- **Helpers** (next to this brief, in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/`):
  - `1C-T5-round2-apply.py` applies this brief's Find/Replace blocks, which it reads from `1C-T5-round2-edits.py`. It checks every block of a stage in memory first (each Find exactly once, never a second run) and writes nothing unless all pass.
  - `1C-T5-round2-mutants.py` is the mutation check.
  - The reviewer proved every step below on a copy of `7bc2fe1`. The resulting files and their hashes are in `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-round2/` (`final/` and `SHA256SUMS`).
- **Shell:** the directory resets between calls. Start every npm, node or python command with `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && ` (or `.../p1-1c-t5/apps/app && ` where a step says so). Run git as `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 <args>`, one git command per call. `WT` and `SCRATCH` are shorthand here: write the full paths. Never `git stash`, `git reset --hard`, `git clean`, `git checkout -- <path>`, rebase, amend, push, or delete a branch.
- **Edits:** apply them with the helper, one stage at a time, exactly as the steps say. The blocks in this brief are what the helper does, shown so you and the reviewer can read every change. If the helper prints `NOT APPLIED`, stop and report `STATUS: BLOCKED` with its output. Do not edit by hand, and do not change the helper or its data.
- **Network:** none. No `npm install`; nothing in a lockfile or manifest changes.

## What this round fixes, and why

1. **The JWT cache (major 1).** `betterAuthPort.ts` cleared its cached JWT when a sign-in was accepted. But `accessToken()` and `refresh()` wrote the cache whenever a `token()` call came back. So a call that left under the old session's cookie and came back after a sign-in put the old session's JWT back, and the next reads reused it for up to nine minutes.
   - After an account switch, the provider handed out the previous account's JWT under the new account's epoch, and `requestCredentials()` paired it with the new session id.
   - After a fresh sign-in, the old session's JWT (old `sid`, old `auth_time`) stayed cached.
   - The fix: a generation counter in the port that moves on every accepted sign-in (first sign-in, account switch, fresh sign-in, through `emailSignIn` and `socialSignIn`) and on every `signOut()`. `accessToken()` and `refresh()` note it before calling `token()` and cache the answer only if it has not moved.
   - An answer that was in flight across a change still goes back to the caller that asked. That caller asked under the old session, and the provider and the transport drop it by epoch. It is never cached, so every later read asks the server for the current session's token.
   - Returning `null` instead would be wrong: the provider reads a `null` token as "the session is denied" and locks the old session for a moment.
   - `credentialProvider.ts` does not change.
2. **204 from the two sign-out routes (major 2).** Plan Task 4 answers `POST /jotbun/devices/sign-out` and `POST /jotbun/sign-out-everywhere` with 204 and no body. Better Auth's client reads an empty body as `{ data: null, error: null }`, and `mapSensitive` turned that `null` into `AuthUnavailable`.
   - The two calls now use `mapNoContent`, which takes the refusals from `mapSensitive` (now `refuseSensitive`) and treats `null` data as success.
   - The other calls keep `mapSensitive`.
   - The fake server now answers those two routes the way Better Auth's client reads a 204, so the port tests see the real shape. A new test file drives Better Auth's own client over a fetch that answers 204.
3. **`freshFlow`'s two untested guards (minor 1).** A new provider test signs out while a fresh sign-in is saving its record. It kills the review's two surviving mutants: the save outside `committing` (R14), and no superseded check after the save (R15).
4. **Body-less POSTs (minor 3).** `jotbunAccountClient.ts` sends `body: {}` (JSON) for sign-out-others and sign-out-everywhere, as Better Auth's own `/sign-out` does. The Worker answers 415 to a POST whose body is not JSON.
5. **The receipt (minor 5)**, inside the 1C section only:
   - correct deviation 7 and the Task 6 note;
   - record the lockfile's `workspaces` resync and the 52 dev-flag changes;
   - add this round's bullet;
   - add notes for Task 7 (the lockfile-only `@better-auth/core` pin) and Task 4 (the ghost old session, minor 2), which this round leaves alone.

Not in this round: minor 2's code, minor 4's manifest pin, and the review's nits.

## Files (7)

- Code: `apps/app/src/auth/betterAuthPort.ts`, `apps/app/src/auth/jotbunAccountClient.ts`
- Tests: `apps/app/src/auth/testing/fakeAuthServer.ts`, `apps/app/src/auth/betterAuthPort.test.ts`, `apps/app/src/auth/credentialProvider.test.ts`, and the new `apps/app/src/auth/jotbunAccountClient.test.ts`
- Receipt: `docs/implementation/premium-progress.md` (the `## 1C:` section only)

No exported type or signature changes. `credentialProvider.ts`, `sessionStore.ts`, `betterAuthClient.ts` and `_layout.tsx` stay as they are.

## Step 1: preflight

1. `/usr/bin/git -C WT rev-parse HEAD` prints `7bc2fe1faaa1c100feecaef9675b70eb3edfc326`, `/usr/bin/git -C WT branch --show-current` prints `p1/1c-t5-app-auth`, and `/usr/bin/git -C WT status --porcelain` prints nothing. Otherwise stop: `STATUS: BLOCKED`, quote the output.
2. `cd WT && node -p "require('./node_modules/better-auth/package.json').version"` prints `1.6.33`. If `node_modules` is missing, run `cd WT && npm ci --ignore-scripts --no-audit --no-fund` (it changes no file), then check again.
3. `mkdir -p SCRATCH`.

## Step 2: RED (the tests and the fake server first)

Apply: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1C-T5-round2-apply.py . red`. Expected: nine lines, `R1` to `R8` `edited ...` and `R9: created apps/app/src/auth/jotbunAccountClient.test.ts`.

These are the blocks it applies:

**Edit R1** `apps/app/src/auth/testing/fakeAuthServer.ts`. Find:
````ts
  const ok = <T>(data: T): ClientResult<T> => ({ data, error: null });
````
Replace with:
````ts
  const ok = <T>(data: T): ClientResult<T> => ({ data, error: null });
  // 204 No Content, as Better Auth's client reads it: no data and no error (its JSON parser answers null for an empty body).
  const noContent = (): ClientResult<unknown> => ({ data: null, error: null });
````

**Edit R2** `apps/app/src/auth/testing/fakeAuthServer.ts`. Find:
````ts
      calls.push(`signOutDevice:${id}`);
      const session = current();
      if (!isSession(session)) return session;
      return ok({});
````
Replace with:
````ts
      calls.push(`signOutDevice:${id}`);
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
````

**Edit R3** `apps/app/src/auth/testing/fakeAuthServer.ts`. Find:
````ts
      calls.push('signOutEverywhere');
      const session = current();
      if (!isSession(session)) return session;
      return ok({});
````
Replace with:
````ts
      calls.push('signOutEverywhere');
      const session = current();
      if (!isSession(session)) return session;
      return noContent();
````

**Edit R4** `apps/app/src/auth/betterAuthPort.test.ts`. Find:
````ts
async function emailSession(email = EMAIL) {
  const ready = portFor();
  await ready.port.sendEmailCode(email);
  const session = await ready.port.signIn({ method: 'email', email, code: ready.server.codeFor(email) });
  return { ...ready, session };
}
````
Replace with:
````ts
async function emailSession(email = EMAIL) {
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
````

**Edit R5** `apps/app/src/auth/betterAuthPort.test.ts`. Find:
````ts
test('refresh always renews', async () => {
````
Replace with:
````ts
test('a token read in flight across a sign-in is never kept for the new account (email and Google)', async () => {
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
````

**Edit R6** `apps/app/src/auth/credentialProvider.test.ts`. Find:
````ts
import * as session from './session.ts';
````
Replace with:
````ts
import { idTokenSubject } from './nativeSignIn.ts';
import * as session from './session.ts';
````

**Edit R7** `apps/app/src/auth/credentialProvider.test.ts`. Find (no line break at its end: it stops mid-line):
````ts
test('the server ending the session keeps the account and says why'
````
Replace with:
````ts
test('a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record', async () => {
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

test('the server ending the session keeps the account and says why'
````

**Edit R8** `apps/app/src/auth/credentialProvider.test.ts`. Find (no line break at its end: it stops mid-line):
````ts
test('a fresh sign-in into the same account swaps the session
````
Replace with:
````ts
test('after an account switch, a token read that began before it never reaches the new account', async () => {
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

test('a fresh sign-in into the same account swaps the session
````

**Write R9** `apps/app/src/auth/jotbunAccountClient.test.ts` (a new file; it must not exist yet). The whole content:
````ts
import assert from 'node:assert/strict';
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
````

Then run:
1. `cd WT && npm run typecheck:app`. It passes: the new tests compile against the old code.
2. `cd WT && npm run test:unit -w gogospend-app -- src/auth/betterAuthPort.test.ts src/auth/credentialProvider.test.ts src/auth/jotbunAccountClient.test.ts src/api/client.test.ts src/api/sessionEpoch.test.ts src/auth/sessionMachine.test.ts > SCRATCH/red.log 2>&1` (full SCRATCH path). Expected: `ℹ tests 88`, `ℹ pass 80`, `ℹ fail 8`, each failure on an assertion. The failures and their reasons:
   - `a token read in flight across a sign-in is never kept for the new account (email and Google)`: the second `idTokenSubject` is the email account's id, not the Google account's.
   - `a refresh in flight across a fresh sign-in is never kept for the new session`: "the next read asks the server for the new session", 1 !== 2.
   - `a token read in flight across a sign-out is not kept for after it`: "signed out: no cookie, so no token", a JWT string instead of `null`.
   - `signing out a device or everywhere answers 204 with no body, which is success`: "Got unwanted rejection", `AuthUnavailable`.
   - `the device calls use the jotbun routes, and REAUTH_REQUIRED and SIGNED_OUT stay apart` (an existing test; its fake now answers the 204 shape): `AuthUnavailable`.
   - `after an account switch, a token read that began before it never reaches the new account`: the token's subject is the first account's id.
   - `the jotbun sign-out routes are sent as JSON, with an empty object when there is nothing to send`: the two body-less requests have `type: null, body: null`.
   - `a 204 from a jotbun sign-out route, read by Better Auth's own client, is success at the port`: "Got unwanted rejection", `AuthUnavailable`.

   `a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record` **passes** here. It pins what `freshFlow` already does; its RED is under mutants R14 and R15 in Step 5. If your counts or names differ, stop and report.
3. `/usr/bin/git -C WT status --porcelain` lists exactly `M apps/app/src/auth/betterAuthPort.test.ts`, `M apps/app/src/auth/credentialProvider.test.ts`, `M apps/app/src/auth/testing/fakeAuthServer.ts` and `?? apps/app/src/auth/jotbunAccountClient.test.ts`.

## Step 3: GREEN (the fixes)

Apply: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1C-T5-round2-apply.py . green`. Expected: thirteen lines, `G1` to `G13`.

These are the blocks it applies:

**Edit G1** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
function mapSensitive<T>(result: ClientResult<T>): T {
  if (result.error) {
    raise(result.error)
    if (result.error.status === 403 && result.error.code === 'REAUTH_REQUIRED') throw new AuthRefused('REAUTH_REQUIRED')
    if (result.error.status === 401) throw new AuthRefused('SIGNED_OUT')
    throw new AuthRefused('REFUSED')
  }
  if (result.data === null) throw new AuthUnavailable()
  return result.data
}
````
Replace with:
````ts
function refuseSensitive(error: Failure): never {
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
````

**Edit G2** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
/**
 * The app's Better Auth port. A sign-in the server accepted drops the cached
 * JWT, which named the session before it. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
 */
````
Replace with:
````ts
/**
 * The app's Better Auth port. A sign-in the server accepted, or a sign-out,
 * drops the cached JWT, which named the session before it, and a token call
 * that was in flight across one is never cached. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
 */
````

**Edit G3** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
  const now = () => deps.now?.() ?? Date.now()
  let cached: { token: string; exp: number } | null = null
````
Replace with:
````ts
  const now = () => deps.now?.() ?? Date.now()
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
````

**Edit G4** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    if (result.error) mapCode(result.error)
    cached = null
````
Replace with:
````ts
    if (result.error) mapCode(result.error)
    forgetToken()
````

**Edit G5** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    if (result.error) mapIdToken(result.error)
    cached = null
````
Replace with:
````ts
    if (result.error) mapIdToken(result.error)
    forgetToken()
````

**Edit G6** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
      // The server's answer does not decide whether this device is signed out.
    }
    cached = null
````
Replace with:
````ts
      // The server's answer does not decide whether this device is signed out.
    }
    forgetToken()
````

**Edit G7** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    async accessToken() {
      if (cached && cached.exp * 1000 - now() > 60_000) return cached.token
      const result = await call(() => deps.client.token())
````
Replace with:
````ts
    async accessToken() {
      if (cached && cached.exp * 1000 - now() > 60_000) return cached.token
      const asked = generation
      const result = await call(() => deps.client.token())
````

**Edit G8** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
      if (!token) return null
      cached = { token, exp: expiry(token) }
      return token
````
Replace with:
````ts
      if (!token) return null
      if (asked === generation) cached = { token, exp: expiry(token) }
      return token
````

**Edit G9** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    async refresh() {
      const result = await call(() => deps.client.token())
````
Replace with:
````ts
    async refresh() {
      const asked = generation
      const result = await call(() => deps.client.token())
````

**Edit G10** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
      if (!token) return false
      cached = { token, exp: expiry(token) }
      return true
````
Replace with:
````ts
      if (!token) return false
      if (asked === generation) cached = { token, exp: expiry(token) }
      return true
````

**Edit G11** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    async signOutDevice(id) {
      mapSensitive(await call(() => deps.client.signOutDevice(id)))
    },
````
Replace with:
````ts
    async signOutDevice(id) {
      mapNoContent(await call(() => deps.client.signOutDevice(id)))
    },
````

**Edit G12** `apps/app/src/auth/betterAuthPort.ts`. Find:
````ts
    async signOutEverywhere() {
      mapSensitive(await call(() => deps.client.signOutEverywhere()))
    },
````
Replace with:
````ts
    async signOutEverywhere() {
      mapNoContent(await call(() => deps.client.signOutEverywhere()))
    },
````

**Edit G13** `apps/app/src/auth/jotbunAccountClient.ts`. Find:
````ts
      signOutOtherDevices: () => $fetch<unknown>('/jotbun/devices/sign-out-others', { method: 'POST' }),
      signOutEverywhere: () => $fetch<unknown>('/jotbun/sign-out-everywhere', { method: 'POST' }),
````
Replace with:
````ts
      // An empty JSON object, as Better Auth's own /sign-out sends: the Worker refuses a POST body that is not JSON (415).
      signOutOtherDevices: () => $fetch<unknown>('/jotbun/devices/sign-out-others', { method: 'POST', body: {} }),
      signOutEverywhere: () => $fetch<unknown>('/jotbun/sign-out-everywhere', { method: 'POST', body: {} }),
````

Then:
1. `cd WT && npm run typecheck:app` passes.
2. The Step 2 unit command again, into `SCRATCH/green.log`. Expected: `ℹ tests 88`, `ℹ pass 88`, `ℹ fail 0`.

## Step 4: mutation check

`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/app && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1C-T5-round2-mutants.py > /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-round2-impl/mutants.log 2>&1; echo "exit $?"`

It applies each mutant (exact text, found exactly once), runs the five focused unit files (the RootLayout render file for M13), records the failures, restores each file from a copy kept in `SCRATCH/mutant-backup`, and compares sha256 values. Expected: exit 0, 22 lines that each say `killed`, and five lines `restored ...: OK` (`app/_layout.tsx`, `src/auth/betterAuthPort.ts`, `src/auth/credentialProvider.ts`, `src/auth/jotbunAccountClient.ts`, `src/auth/sessionStore.ts`). The reviewer's failure counts:

- **Round 1's mutants:** M1 1, M2 1, M3 2, M4 3, M5 3, M6 2, M9 1, M10 1, M11 1, M12 2, M13 1.
- **This round's guards:**
  - N1 `accessToken` caches an answer that was in flight across a change: 3.
  - N2 `refresh` does the same: 1.
  - N3 an email sign-in does not move the generation: 3.
  - N4 an Apple or Google sign-in does not move it: 1.
  - N5 a sign-out does not move it: 1.
  - N6 signing out a device reads a 204 as an outage: 3.
  - N7 signing out everywhere does the same: 3.
  - N8 sign-out-others is sent without a body: 1.
  - N9 sign-out-everywhere is sent without a body: 1.
- **The review's `freshFlow` survivors:** R14 1 and R15 1, both failing `a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record`.

M7 and M8 are retired. They matched the line `cached = null` after a sign-in, which this round replaces with `forgetToken()`; N3 and N4 cover the same lines.

A survivor, `LOAD ERROR` or `PATTERN FOUND`: stop and report. Do not change the script. Afterwards `/usr/bin/git -C WT status --porcelain` lists the four Step 2 paths plus `M apps/app/src/auth/betterAuthPort.ts` and `M apps/app/src/auth/jotbunAccountClient.ts`, and nothing else.

## Step 5: the gate

From `WT`, in this order; record each result with its counts:
1. `npm run typecheck:app`: passes.
2. `npm run test:app`: 31 passed.
3. `npm run test:unit`: 774 passed. That is round 1's 766 plus the eight new tests.
4. `npm run test:render -w gogospend-app -- src/screens/redesign/RootLayout.render.test.tsx src/screens/redesign/account/SignInScreen.render.test.tsx`: 2 files, 23 passed.
5. `/usr/bin/git -C WT diff --check` prints nothing.

Not needed this round, because nothing they cover changed:
- the full render suite: no exported interface changes;
- `export:web` and the iOS export: no route, config, entry or import changes;
- `test:ops`: no lockfile change;
- the edge, API and database suites.

`test:ops` would also fail one test on any branch since 8 November: `scripts/ops/readiness-receipts.test.mjs`'s CLI fixture expires on 2026-11-15. That is not this task's; do not touch it.

## Step 6: the receipt

Apply: `cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && python3 -I /Users/kunanonjarat/Developer/jotbun/.claude/controller/briefs/1C-T5-round2-apply.py . receipt`. Expected: six lines, `D1` to `D6`. Every edit is inside `## 1C: Better Auth and the sign-in port` (between that heading and `## 1D: live pokes, the pending choice and PostHog`). The text already carries the counts the reviewer measured, which are the ones Steps 2 to 5 expect. If any count you saw differs, stop and report instead of committing.

These are the blocks it applies:

**Edit D1** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
next to this task's changes), then this commit. Not pushed.
````
Replace with:
````text
next to this task's changes), then the task commit `7bc2fe1`, then the review round-2 commit on top of it. Not pushed.
````

**Edit D2** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
`npm ls` shows one line: 1.6.33, `better-call` 1.4.0, `@better-fetch/fetch` 1.3.1. `test:ops` (Linux bindings) passes.
````
Replace with:
````text
`npm ls` shows one line: 1.6.33, `better-call` 1.4.0, `@better-fetch/fetch` 1.3.1. `test:ops` (Linux bindings) passes. The same lockfile change also resyncs the root entry's stale `workspaces` (`["apps/*","packages/*"]`) to the manifest's `["apps/api","apps/app","packages/*"]`, and changes 52 dev flags: 36 entries (`vitest`, `vite`, `happy-dom` and their dependencies) move from `dev` to `devOptional` and 16 rolldown bindings drop `dev`, because `better-auth` lists `vitest` as an optional peer. No install in the repository uses `--omit=dev` (the API Dockerfile and `backend.yml` checked), so nothing installs differently. Every package that reads `zod` from the root asks for zod 4 (`better-auth`, both `@better-auth/core` copies, `@better-auth/expo`, `better-call`); `@expo/cli` keeps its own 3.25.76; nothing in `apps/api`, `apps/app`, `packages` or `scripts` imports `zod`; and the API image's release graph is unchanged (123 packages, no problems; checked by the review).
````

**Edit D3** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
- **Deviations:**
  1. The RED ran after the code existed
````
Replace with:
````text
- **Review round 2** (`controller/briefs/1C-T5-round2.md`, on `7bc2fe1`, no merge): the port's token cache moves a generation on every accepted sign-in and every sign-out, and `accessToken()` and `refresh()` cache an answer only if the generation has not moved since the call began (an answer in flight across a sign-in went back to the caller that asked, and was cached for the next session: after an account switch the provider handed out the previous account's JWT, and `requestCredentials()` paired it with the new session id). Signing out a device and signing out everywhere read Better Auth's `{ data: null, error: null }` for a 204 as success (the fake server now answers that way). `signOutOtherDevices` and `signOutEverywhere` send `{}` as JSON. New tests: `a token read in flight across a sign-in is never kept for the new account (email and Google)`, `a refresh in flight across a fresh sign-in is never kept for the new session`, `a token read in flight across a sign-out is not kept for after it`, `signing out a device or everywhere answers 204 with no body, which is success` (port); `after an account switch, a token read that began before it never reaches the new account`, `a sign-out while a fresh sign-in saves its record waits for the save, then leaves no record` (provider); `the jotbun sign-out routes are sent as JSON, with an empty object when there is nothing to send` and `a 204 from a jotbun sign-out route, read by Better Auth's own client, is success at the port` (new `jotbunAccountClient.test.ts`, on Better Auth's real client). RED on `7bc2fe1` with only the tests and the fake changed: 88 tests, 80 passed, 8 failed, each on an assertion: the seven new tests that change behaviour, and `the device calls use the jotbun routes, and REAUTH_REQUIRED and SIGNED_OUT stay apart`, whose fake now answers the two sign-out routes as Better Auth's client reads a 204 (it failed on `AuthUnavailable`). The provider's save-race test passes on `7bc2fe1`: it pins what the code already did, and its RED is under R14 and R15 below. GREEN: 88 passed in the six files (`betterAuthPort`, `credentialProvider`, `jotbunAccountClient`, `client`, `sessionEpoch` and `sessionMachine` tests), and `typecheck:app` passes. Mutation check (`controller/briefs/1C-T5-round2-mutants.py`): 22 of 22 killed: round 1's M1 to M6 and M9 to M13 (M7 and M8 are replaced by N3 and N4, whose lines this round changed), N1 to N9 for this round's guards, and R14 and R15 (the review's two `freshFlow` survivors, now killed by the save-race test); every file restored, sha256 equal. Gate: `npm run typecheck:app` passes; `npm run test:app` 31 passed; `npm run test:unit` 774 passed; focused render (`RootLayout`, `SignInScreen`) 2 files, 23 passed; `git diff --check` clean. Not re-run, since nothing they cover changed: the full render suite (no exported interface changed), `export:web` and the iOS export (no route, config, entry or import changed), `test:ops` (no lockfile change).
- **Deviations:**
  1. The RED ran after the code existed
````

**Edit D4** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
  7. `refresh()` refused (401 or 403) keeps the cached JWT, so a locked session's sign-out can still tell the vault; a JSON `null` answer with no error reads as `AuthUnavailable` in the device and link calls (a 204 reads as an empty string and passes).
````
Replace with:
````text
  7. `refresh()` refused (401 or 403) keeps the cached JWT, so a locked session's sign-out can still tell the vault. Signing out a device and signing out everywhere answer 204 with no body (plan Task 4); Better Auth's client reads that as `{ data: null, error: null }` (its JSON parser answers `null` for an empty body), and the port takes it as success. The other device and link calls still read a `null` answer with no error as `AuthUnavailable`. (Corrected in review round 2: the first version said a 204 reads as an empty string, which is better-fetch's default parser, not Better Auth's.)
````

**Edit D5** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
  - Task 6: `requestCredentials()` answers null when the session changed during the read; after `freshSignIn` the port has no cached JWT, so the next token names the new session and its `auth_time`.
````
Replace with:
````text
  - Task 6: `requestCredentials()` answers null when the session changed during the read. After `freshSignIn` the next token read asks the server, so it names the new session and its `auth_time`: the port drops its cached JWT on every accepted sign-in and every sign-out, and a token or refresh call that was in flight across one is never cached (review round 2).
````

**Edit D6** `docs/implementation/premium-progress.md`. Find (no line break at its end: it stops mid-line):
````text
  - Task 7: `createAppAuthPort()` passes `NO_NATIVE_SIGN_IN`; swap in `appNativeSignIn()`.
````
Replace with:
````text
  - Task 7: `createAppAuthPort()` passes `NO_NATIVE_SIGN_IN`; swap in `appNativeSignIn()`. Its install changes the shared root lockfile: `@better-auth/expo` declares a required peer `@better-auth/core: ^1.6.33`, pinned to 1.6.33 only in the lockfile (no manifest names it), so a later `npm install` may re-resolve it to 1.7.x as the first install here did. Afterwards check that every `better-auth`, `@better-auth/core` and `@better-auth/expo` entry is 1.6.33, `better-call` 1.4.0 and `@better-fetch/fetch` 1.3.1.
  - Task 4 (and Task 8's devices screen): a sign-out that lands while a fresh sign-in's server call is answering leaves the old session live at Better Auth and at the vault until it expires. Its cookie is already gone from the phone, so nothing can use it, but the devices list shows it until then; signing it out there, or signing out everywhere, ends it. The app does not sign it out in that case (left as a note in review round 2).
````

Then check every file against the reviewer's proven copy:

`cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 && shasum -a 256 -c /Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-round2/SHA256SUMS`

Expected: seven lines ending `: OK`. Any `FAILED`: stop, `STATUS: BLOCKED`, quote it.

## Step 7: commit

1. `/usr/bin/git -C WT status --porcelain` lists exactly these seven paths (six `M`, one `??`), nothing else: `apps/app/src/auth/betterAuthPort.ts`, `apps/app/src/auth/jotbunAccountClient.ts`, `apps/app/src/auth/testing/fakeAuthServer.ts`, `apps/app/src/auth/betterAuthPort.test.ts`, `apps/app/src/auth/credentialProvider.test.ts`, `apps/app/src/auth/jotbunAccountClient.test.ts`, `docs/implementation/premium-progress.md`. Anything else (a log, a `.bak`): stop and report; do not delete files you did not create.
2. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 add -- apps/app/src/auth/betterAuthPort.ts apps/app/src/auth/jotbunAccountClient.ts apps/app/src/auth/testing/fakeAuthServer.ts apps/app/src/auth/betterAuthPort.test.ts apps/app/src/auth/credentialProvider.test.ts apps/app/src/auth/jotbunAccountClient.test.ts docs/implementation/premium-progress.md`
3. `/usr/bin/git -C /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5 commit -m "Never cache a token fetched across a sign-in; read 204 as success" -m "Review round 2 of 1C Task 5. The port moves a generation on every accepted sign-in and every sign-out, and caches a token or refresh answer only if it has not moved since the call began, so a read in flight across an account switch or a fresh sign-in no longer leaves the previous session's JWT for the next one. Signing out a device and signing out everywhere read Better Auth's null answer to a 204 as success, and the two body-less jotbun POSTs send {} as JSON. New tests on the fake server and on Better Auth's own client; the receipt corrects deviation 7 and the Task 6 note." -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"`
4. `/usr/bin/git -C WT status --porcelain` prints nothing. `/usr/bin/git -C WT log --oneline -2` shows your commit on top of `7bc2fe1`. `/usr/bin/git -C WT diff --check 7bc2fe1 HEAD` prints nothing. `/usr/bin/git -C WT diff --stat 7bc2fe1 HEAD` lists the seven paths.

## Your final message (protocol)

1. `STATUS: DONE` or `STATUS: BLOCKED: <exact blocker>` on the first line.
2. The new commit SHA on `p1/1c-t5-app-auth` and the seven files.
3. The Step 2 RED counts and failing names, the Step 3 GREEN count, the 22 mutant lines with their counts and the five restore lines.
4. Each gate command with its result and counts, the `shasum -c` result, and anything SKIPPED with the reason.
5. Anything that differed from this brief.
