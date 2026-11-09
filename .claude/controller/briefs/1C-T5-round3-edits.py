#!/usr/bin/env python3
"""The 1C-T5 round-3 edits (ruling R86), as data. The brief's Find/Replace blocks
are these, and `1C-T5-round3-apply.py` applies them, so the brief and the proof
cannot drift apart.

Each edit: (id, stage, path relative to the repo root, find, replace).
Stages: 'red' (the fake server and the tests), 'green' (the fixes), 'receipt'.
"""

AUTH = 'apps/app/src/auth/'
API = 'apps/app/src/api/'
RECEIPT = 'docs/implementation/premium-progress.md'

EDITS = []


def edit(eid, stage, path, find, replace):
    EDITS.append((eid, stage, path, find, replace))


# ---------------------------------------------------------------- RED: the fake server and the tests

edit('R1', 'red', AUTH + 'testing/fakeAuthServer.ts',
r'''  function mint(sub: string, email?: string): string {
    tokenSerial += 1;
    const exp = Math.floor(Date.now() / 1000) + state.tokenTtlSeconds;
    return `e30.${b64url(JSON.stringify({ sub, exp, email, n: tokenSerial }))}.x`;
  }
''',
r'''  /** A JWT-shaped token. `sub` names the account and `sid` the session, as 1C-T1's `/token` does (K4); a native ID token has no `sid`. */
  function mint(sub: string, email?: string, sid?: string): string {
    tokenSerial += 1;
    const exp = Math.floor(Date.now() / 1000) + state.tokenTtlSeconds;
    return `e30.${b64url(JSON.stringify({ sub, sid, exp, email, n: tokenSerial }))}.x`;
  }
''')

edit('R2', 'red', AUTH + 'testing/fakeAuthServer.ts',
r'''      return ok({ token: mint(user?.id ?? session.userId, user?.email) });
''',
r'''      return ok({ token: mint(user?.id ?? session.userId, user?.email, session.id) });
''')

edit('R3', 'red', AUTH + 'betterAuthPort.test.ts',
r'''test('refresh always renews', async () => {
''',
r'''test('a sign-in whose session read fails after the server accepted it drops that session (email and Google, R86)', async () => {
  for (const method of ['email', 'google'] as const) {
    const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
    const inner = server.client.session.bind(server.client);
    let failOnce = true;
    server.client.session = async () => {
      if (!failOnce) return inner();
      failOnce = false;
      return { data: null, error: { status: 503 } };
    };
    if (method === 'email') await port.sendEmailCode(EMAIL);
    const request = method === 'email' ? { method, email: EMAIL, code: server.codeFor(EMAIL) } : { method, signUp: true };
    await assert.rejects(() => port.signIn(request), AuthUnavailable, method);
    assert.equal(await port.hasSession(), false, `${method}: the accepted session's cookie is dropped`);
    assert.equal(server.calls.at(-1), 'signOut', method);
    assert.equal(await port.accessToken(), null, method);
  }
});

test('refresh always renews', async () => {
''')

edit('R4', 'red', AUTH + 'credentialProvider.test.ts',
r'''async function signedIn(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } } = {}) {
  const ready = setup(identities);
  await ready.port.sendEmailCode(EMAIL);
  const result = await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  assert.equal(result.outcome, 'active');
  return ready;
}
''',
r'''async function signedIn(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } } = {}) {
  const ready = setup(identities);
  await ready.port.sendEmailCode(EMAIL);
  const result = await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  assert.equal(result.outcome, 'active');
  return ready;
}

const OTHER = 'b@example.test';

/** An unverified JWT claim, read as the provider reads `sid` (R86). */
function claimOf(token: string | null | undefined, name: 'sub' | 'sid'): unknown {
  const part = (token ?? '').split('.')[1] ?? '';
  try {
    const json: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (typeof json !== 'object' || json === null) return undefined;
    return Object.entries(json).find(([key]) => key === name)?.[1];
  } catch {
    return undefined;
  }
}

/** The next record save waits until `release()`: the server has accepted a sign-in, and the provider has not taken it on yet. */
function holdNextSave(sessions: SessionRecordStore) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const reached = new Promise<void>((resolve) => { mark = resolve; });
  const save = sessions.save.bind(sessions);
  let held = true;
  sessions.save = async (next) => {
    if (held) {
      held = false;
      mark();
      await gate;
    }
    return save(next);
  };
  return { release, reached };
}

/** The next session read (a sign-in's `get-session`, after the server accepted it) waits until `release()`. */
function holdNextSessionRead(server: ReturnType<typeof createFakeAuthServer>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const reached = new Promise<void>((resolve) => { mark = resolve; });
  const inner = server.client.session.bind(server.client);
  let held = true;
  server.client.session = async () => {
    if (held) {
      held = false;
      mark();
      await gate;
    }
    return inner();
  };
  return { release, reached };
}

/** The next session read answers 503 once, after the server accepted the sign-in. */
function failNextSessionRead(server: ReturnType<typeof createFakeAuthServer>) {
  const inner = server.client.session.bind(server.client);
  let pending = true;
  server.client.session = async () => {
    if (!pending) return inner();
    pending = false;
    return { data: null, error: { status: 503 } };
  };
}
''')

edit('R5', 'red', AUTH + 'credentialProvider.test.ts',
r'''test('a fresh sign-in into the same account swaps the session, signs the old one out and moves the epoch', async () => {
''',
r'''test("requestCredentials never pairs the old session's token, read before a fresh sign-in, with the new session's id", async () => {
  const ready = await signedIn();
  const before = ready.sessions.current();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const minted = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.token.bind(ready.server.client);
  let gated = true;
  ready.server.client.token = async () => {
    if (!gated) return inner();
    gated = false;
    const answer = await inner();
    mark();
    await gate;
    return answer;
  };
  const pending = ready.provider.requestCredentials();
  await minted;
  await ready.port.sendEmailCode(EMAIL);
  assert.equal(await ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) }), 'fresh');
  release();
  assert.equal(await pending, null);
  assert.notEqual(ready.sessions.current()?.sessionId, before?.sessionId);
});

test("during an account switch, requestCredentials is not ready: never the new session's token with the old session id (R86)", async () => {
  const ready = await signedIn();
  const a = ready.sessions.current();
  const held = holdNextSave(ready.sessions);
  await ready.port.sendEmailCode(OTHER);
  const switching = ready.provider.signIn({ method: 'email', email: OTHER, code: ready.server.codeFor(OTHER) });
  await held.reached;
  assert.equal(await ready.provider.requestCredentials(), null);
  assert.deepEqual([ready.provider.getSessionSnapshot().state, ready.provider.getSessionSnapshot().binding], ['active', a?.sessionId], 'nothing locks');
  held.release();
  assert.equal((await switching).outcome, 'active');
  const b = ready.sessions.current();
  const credentials = await ready.provider.requestCredentials();
  assert.deepEqual([claimOf(credentials?.accessToken, 'sub'), claimOf(credentials?.accessToken, 'sid'), credentials?.sessionId], [b?.accountId, b?.sessionId, b?.sessionId]);
});

test("during a fresh sign-in, the new session's token never goes out with the old session id (R86)", async () => {
  const ready = await signedIn();
  const before = ready.sessions.current();
  const held = holdNextSave(ready.sessions);
  await ready.port.sendEmailCode(EMAIL);
  const fresh = ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  await held.reached;
  assert.equal(await ready.provider.requestCredentials(), null);
  assert.equal(await ready.provider.getAccessToken(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'active');
  held.release();
  assert.equal(await fresh, 'fresh');
  const after = ready.sessions.current();
  assert.notEqual(after?.sessionId, before?.sessionId);
  const credentials = await ready.provider.requestCredentials();
  assert.deepEqual([claimOf(credentials?.accessToken, 'sid'), credentials?.sessionId], [after?.sessionId, after?.sessionId]);
});

test("during an account switch, a token read under the old session never gets the new session's token, and nothing locks (R86)", async () => {
  const ready = await signedIn();
  const a = ready.provider.getSessionSnapshot();
  const held = holdNextSessionRead(ready.server);
  await ready.port.sendEmailCode(OTHER);
  const switching = ready.provider.signIn({ method: 'email', email: OTHER, code: ready.server.codeFor(OTHER) });
  await held.reached;
  assert.equal(await ready.provider.getAccessToken(), null);
  assert.deepEqual(ready.provider.getSessionSnapshot(), a, 'still the first session: same state, binding and epoch');
  held.release();
  assert.equal((await switching).outcome, 'active');
  const b = ready.provider.getSessionSnapshot();
  const token = await ready.provider.getAccessToken();
  assert.deepEqual([claimOf(token, 'sub'), claimOf(token, 'sid')], [b.accountId, b.binding]);
});

test('an account switch whose session read fails drops the new cookie: the first account locks, also after a relaunch (R86)', async () => {
  const ready = await signedIn();
  const a = ready.sessions.current();
  failNextSessionRead(ready.server);
  await ready.port.sendEmailCode(OTHER);
  assert.equal((await ready.provider.signIn({ method: 'email', email: OTHER, code: ready.server.codeFor(OTHER) })).outcome, 'unavailable');
  assert.equal(await ready.port.hasSession(), false, "the new session's cookie is gone");
  assert.equal(await ready.provider.requestCredentials(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'locked');
  assert.deepEqual(ready.sessions.current(), a, 'the account and its record stay (D37)');
  const port = createBetterAuthPort({ client: ready.server.client, native: ready.server.native({}) });
  const relaunched = createCredentialProvider({ port, sessions: ready.sessions, epochs: ready.epochs });
  await relaunched.hydrate();
  assert.deepEqual([relaunched.getSessionSnapshot().state, relaunched.getSessionSnapshot().accountId], ['locked', a?.accountId]);
  assert.equal(await relaunched.getAccessToken(), null);
});

test("a sign-in from a locked session whose session read fails leaves it locked, never unlocked on the other account's cookie (R86)", async () => {
  const ready = await signedIn();
  const a = ready.sessions.current();
  ready.server.deleteSession(a?.sessionId ?? '');
  assert.equal(await ready.provider.refreshAfterUnauthorized(), false);
  assert.equal(ready.provider.getSessionSnapshot().state, 'locked');
  failNextSessionRead(ready.server);
  await ready.port.sendEmailCode(OTHER);
  assert.equal((await ready.provider.signIn({ method: 'email', email: OTHER, code: ready.server.codeFor(OTHER) })).outcome, 'unavailable');
  await ready.provider.hydrate();
  assert.deepEqual([ready.provider.getSessionSnapshot().state, ready.provider.getSessionSnapshot().accountId], ['locked', a?.accountId]);
  assert.equal(await ready.port.hasSession(), false);
  assert.equal(await ready.provider.getAccessToken(), null);
  assert.deepEqual(ready.sessions.current(), a);
});

test('a token whose session cannot be read is never handed out, and nothing locks (R86)', async () => {
  const ready = await signedIn();
  const inner = ready.server.client.token.bind(ready.server.client);
  for (const unreadable of ['e30.e30.sig', 'not-a-jwt', `e30.${Buffer.from('{"sid":7}').toString('base64url')}.x`]) {
    ready.server.client.token = async () => ({ data: { token: unreadable }, error: null });
    assert.equal(await ready.provider.getAccessToken(), null, unreadable);
    assert.equal(await ready.provider.requestCredentials(), null, unreadable);
    assert.equal(ready.provider.getSessionSnapshot().state, 'active', unreadable);
  }
  ready.server.client.token = inner;
  assert.equal(claimOf(await ready.provider.getAccessToken(), 'sid'), ready.sessions.current()?.sessionId);
});

test("a sign-out during an account switch never gives the vault one session's token with another session's id (R86)", async () => {
  const ready = await signedIn();
  const held = holdNextSessionRead(ready.server);
  await ready.port.sendEmailCode(OTHER);
  const switching = ready.provider.signIn({ method: 'email', email: OTHER, code: ready.server.codeFor(OTHER) });
  await held.reached;
  await ready.provider.signOut();
  held.release();
  assert.equal((await switching).outcome, 'cancelled');
  assert.deepEqual(ready.vaultLogouts.filter((sent) => claimOf(sent.accessToken, 'sid') !== sent.sessionId), []);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(ready.sessions.current(), null);
  assert.equal(await ready.port.hasSession(), false);
});

test('a fresh sign-in into the same account swaps the session, signs the old one out and moves the epoch', async () => {
''')

edit('R6', 'red', API + 'sessionEpoch.test.ts',
r'''async function emailSignIn(provider: CredentialProvider, server: ReturnType<typeof createFakeAuthServer>, port: ReturnType<typeof createBetterAuthPort>) {
  await port.sendEmailCode(EMAIL);
  const result = await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(result.outcome, 'active');
  return result;
}
''',
r'''async function emailSignIn(provider: CredentialProvider, server: ReturnType<typeof createFakeAuthServer>, port: ReturnType<typeof createBetterAuthPort>) {
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
''')

edit('R7', 'red', API + 'sessionEpoch.test.ts',
r'''test('offline token reads neither lock the session nor close the diary (S4 resolver)', async () => {
''',
r'''test("a request begun during an account switch sends nothing: never the next session's token under the first session (R86)", async () => {
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
''')

# ---------------------------------------------------------------- GREEN: R86 (a) in the port, (b) in the provider

edit('G1', 'green', AUTH + 'betterAuthPort.ts',
r'''    return { accountId: data.user.id, sessionId: data.session.id, email: data.user.email, method, created: createdOf(answer) }
  }

  async function emailSignIn(email: string, code: string): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithCode(email.trim().toLowerCase(), code))
    if (result.error) mapCode(result.error)
    forgetToken()
    return finish(result.data ?? { created: false }, 'email')
  }

  async function socialSignIn(method: 'apple' | 'google', requestSignUp: boolean, token: NativeIdToken): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithIdToken(method, token, requestSignUp))
    if (result.error) mapIdToken(result.error)
    forgetToken()
    return finish(result.data ?? { created: false }, method)
  }
''',
r'''    return { accountId: data.user.id, sessionId: data.session.id, email: data.user.email, method, created: createdOf(answer) }
  }

  // The server accepted the sign-in, so the phone already holds the new
  // session's cookie. If that session cannot be read, the provider never takes
  // it on: sign it out again before reporting the failure, so no token names a
  // session the provider does not hold (R86).
  async function accepted(answer: SignInAnswer, method: SignInMethod): Promise<ServerSession> {
    try {
      return await finish(answer, method)
    } catch (error) {
      await signOut()
      throw error
    }
  }

  async function emailSignIn(email: string, code: string): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithCode(email.trim().toLowerCase(), code))
    if (result.error) mapCode(result.error)
    forgetToken()
    return accepted(result.data ?? { created: false }, 'email')
  }

  async function socialSignIn(method: 'apple' | 'google', requestSignUp: boolean, token: NativeIdToken): Promise<ServerSession> {
    const result = await call(() => deps.client.signInWithIdToken(method, token, requestSignUp))
    if (result.error) mapIdToken(result.error)
    forgetToken()
    return accepted(result.data ?? { created: false }, method)
  }
''')

edit('G2', 'green', AUTH + 'betterAuthPort.ts',
r''' * The app's Better Auth port. A sign-in the server accepted, or a sign-out,
 * drops the cached JWT, which named the session before it, and a token call
 * that was in flight across one is never cached. The web build uses
 * {@link unsupportedBetterAuthPort} instead.
''',
r''' * The app's Better Auth port. A sign-in the server accepted, or a sign-out,
 * drops the cached JWT, which named the session before it, and a token call
 * that was in flight across one is never cached. A sign-in whose session
 * cannot be read after the server accepted it is signed out again (R86). The
 * web build uses {@link unsupportedBetterAuthPort} instead.
''')

edit('G3', 'green', AUTH + 'credentialProvider.ts',
r'''  /** null: no usable session (or the credentials were denied, which locks). Rejects when the sign-in service can't be reached right now. */
''',
r'''  /** null: no usable session (or the credentials were denied, which locks), or not ready (the token names another session, R86; nothing locks). Rejects when the sign-in service can't be reached right now. */
''')

edit('G4', 'green', AUTH + 'credentialProvider.ts',
r'''  /** One token and the session id, read together; null unless the session is active. */
''',
r'''  /** One token and the session id, read together, the token naming that session (R86); null unless the session is active. */
''')

edit('G5', 'green', AUTH + 'credentialProvider.ts',
r'''  return 'failed';
}

/**
 * The app's credential provider: Better Auth's session, the SecureStore
''',
r'''  return 'failed';
}

/** The unverified `sid` claim of a JWT: the session it was issued for (R86). null when it cannot be read. */
function sessionOf(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
    if (typeof json !== 'object' || json === null || !('sid' in json) || typeof json.sid !== 'string') return null;
    return json.sid;
  } catch {
    return null;
  }
}

/**
 * The app's credential provider: Better Auth's session, the SecureStore
''')

edit('G6', 'green', AUTH + 'credentialProvider.ts',
r''' * never stored. Every new session moves the epoch.
 */
''',
r''' * never stored. Every new session moves the epoch. A token goes out only with
 * the session it names (its `sid`, R86): while the phone's cookie is ahead of
 * the provider (mid sign-in), reads are not ready (null) and nothing locks.
 */
''')

edit('G7', 'green', AUTH + 'credentialProvider.ts',
r'''      const epoch = snapshot.epoch;
      if (tokenRead && tokenRead.epoch === epoch && tokenRead.generation === tokenGeneration) return tokenRead.promise;
      const promise = deps.port.accessToken().then((token) => {
        // null: the session is gone or denied - lock, keep everything. A rejection (offline) changes nothing.
        if (token === null && snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });
        return token;
      });
''',
r'''      const epoch = snapshot.epoch;
      const binding = snapshot.binding;
      if (tokenRead && tokenRead.epoch === epoch && tokenRead.generation === tokenGeneration) return tokenRead.promise;
      const promise = deps.port.accessToken().then((token) => {
        // null: the session is gone or denied - lock, keep everything. A rejection (offline) changes nothing.
        if (token === null) {
          if (snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });
          return null;
        }
        // R86: a token for another session than this read's (the cookie moved
        // to a session the provider does not hold yet, mid sign-in), or one
        // whose session cannot be read, is not ready: null, as while signing
        // in. Never a denial, so nothing locks.
        const sid = sessionOf(token);
        return sid !== null && sid === binding ? token : null;
      });
''')

edit('G8', 'green', AUTH + 'credentialProvider.ts',
r'''    if (token && sessionId) await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);
''',
r'''    // R86: the vault hears only the session's own token; a token for a session the provider never held (a sign-out mid sign-in) is not sent.
    if (token && sessionId && sessionOf(token) === sessionId) await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);
''')

# ---------------------------------------------------------------- RECEIPT (inside "## 1C: Better Auth and the sign-in port")

def receipt(eid, find, replace):
    edit(eid, 'receipt', RECEIPT, find, replace)


receipt('D1',
r'''then the task commit `7bc2fe1`, then the review round-2 commit on top of it. Not pushed.''',
r'''then the task commit `7bc2fe1`, then the review round-2 commit `8deea1d`, then the review round-3 commit (ruling R86) on top of it. Not pushed.''')

receipt('D2',
r'''36 entries (`vitest`, `vite`, `happy-dom` and their dependencies) move from `dev` to `devOptional` and 16 rolldown bindings drop `dev`,''',
r'''36 entries (`vitest`, `vite`, `happy-dom` and their dependencies) move from `dev` to `devOptional` and 16 entries drop `dev` (15 `@rolldown/binding-*` packages and `fsevents`; corrected in round 3),''')

receipt('D3',
r'''- **Deviations:**
  1. The RED ran after the code existed''',
r'''- **Review round 3** (`controller/briefs/1C-T5-round3.md`, on `8deea1d`, no merge; ruling R86 of 8 November, which amends the plan's "`getAccessToken` ... exactly as today" for this case): the confirming review (`controller/reviews/1C-T5-confirm.md`) found that a token for a new session still reached requests made under the old one, because the phone's cookie moves when the server accepts a sign-in and the provider moves only at `bootstrapped`. (a) The port signs a session out again when reading it fails after the server accepted the sign-in (`accepted()` around `finish()`), so a failed account switch or fresh sign-in no longer leaves the provider on one account while every token names another (that state used to survive a relaunch, and from `locked` a refresh unlocked the first account on the second account's cookie). (b) The provider hands out a token only when its unverified `sid` is the session id it holds for the read (`sessionOf()`): `getAccessToken` answers null for a token of another session or an unreadable one, and `requestCredentials` reads through it. That is the answer callers already get while signing in, and the transport refuses such a request before sending (`signed_out`, status 0, `SESSION_REQUIRED`), so there is no new error kind. A mismatch never locks. Sign-out tells the vault only with a token whose `sid` is the session it signs out. The fake server's tokens now carry `sub` and `sid` (K4). New tests: `a sign-in whose session read fails after the server accepted it drops that session (email and Google, R86)` (port); `during an account switch, requestCredentials is not ready: never the new session's token with the old session id (R86)`, `during a fresh sign-in, the new session's token never goes out with the old session id (R86)`, `during an account switch, a token read under the old session never gets the new session's token, and nothing locks (R86)`, `an account switch whose session read fails drops the new cookie: the first account locks, also after a relaunch (R86)`, `a sign-in from a locked session whose session read fails leaves it locked, never unlocked on the other account's cookie (R86)`, `a token whose session cannot be read is never handed out, and nothing locks (R86)`, `a sign-out during an account switch never gives the vault one session's token with another session's id (R86)` and `requestCredentials never pairs the old session's token, read before a fresh sign-in, with the new session's id` (provider); `a request begun during an account switch sends nothing: never the next session's token under the first session (R86)` (`sessionEpoch.test.ts`, through the shared transport). RED on `8deea1d` with only the fake and the tests changed: 98 tests, 89 passed, 9 failed, each on an assertion: the nine R86 tests. The tenth new test passes there: it pins `requestCredentials`' epoch check (mutant M10) for a token minted under the old session, because R86's own check now also stops the case the round-2 test covers. GREEN: 98 passed in the six files (`betterAuthPort`, `credentialProvider`, `jotbunAccountClient`, `client`, `sessionEpoch` and `sessionMachine` tests), and `typecheck:app` passes. Mutation check (`controller/briefs/1C-T5-round3-mutants.py`): 28 of 28 killed: round 2's 22 rerun (M3's pattern now carries the `sid` check on the same line; M1 and M4 now also fail R86 tests), and N10 to N15 for R86 (N10 no sign-out after a failed session read, 3 failed; N11 no `sid` check, 5; N12 an unreadable token passes, 1; N13 a token of another session locks, 5; N14 a refused token no longer locks, 2; N15 sign-out's vault call unchecked, 1); every file restored, sha256 equal. Gate: `npm run typecheck:app` passes; `npm run test:app` 32 passed (31 and the transport test); `npm run test:unit` 784 passed (774 and the ten new tests); focused render (`RootLayout`, `SignInScreen`) 2 files, 23 passed; `git diff --check` clean. Not re-run, since nothing they cover changed: the full render suite (no exported interface changed), `export:web` and the iOS export (no route, config, entry or import changed), `test:ops` (no lockfile change). Also corrected in this round: the 16 entries that drop `dev` (above), and the wording of deviation 7 and of the Task 6 note.
- **Deviations:**
  1. The RED ran after the code existed''')

receipt('D4',
r'''The other device and link calls still read a `null` answer with no error as `AuthUnavailable`.''',
r'''The port still reads a `null` answer with no error as `AuthUnavailable` in the other device and link calls; through `betterAuthClient.ts` only `link` and `unlink` can give one, because `devices()` maps an empty answer to `[]` and `signOutOtherDevices()` to `0` (wording corrected in round 3).''')

receipt('D5',
r'''  8. The restored `getAccessToken` body is the base's; its comment takes the brief's wording ("the session is gone or denied"), where the base says "the credentials are gone or denied". The code is unchanged.
''',
r'''  8. The restored `getAccessToken` body is the base's; its comment takes the brief's wording ("the session is gone or denied"), where the base says "the credentials are gone or denied". The code is unchanged.
  9. Ruling R86 (round 3) amends the plan's "`getAccessToken` and `refreshAfterUnauthorized` behave exactly as today": `getAccessToken` now also answers null (not ready, never a lock) for a token whose `sid` is not the session id it holds, and sign-out's vault call checks the same. `refreshAfterUnauthorized` is unchanged: it reports whether a token came back, and the next read is checked.
''')

receipt('D6',
r'''After `freshSignIn` the next token read asks the server, so it names the new session and its `auth_time`: the port drops its cached JWT on every accepted sign-in and every sign-out, and a token or refresh call that was in flight across one is never cached (review round 2).''',
r'''After `freshSignIn` the next token read names the new session and its `auth_time`: the port drops its cached JWT on every accepted sign-in and every sign-out, a token or refresh call that was in flight across one is never cached (review round 2), and a token cached after the sign-in was accepted was read with the new session's cookie, so the read may reuse it without asking the server. Until `freshSignIn` resolves, `getAccessToken` and `requestCredentials` answer null rather than the new session's token with the old id (R86, round 3). A fresh sign-in whose session read fails signs the new session out (R86), and the old session's cookie was already replaced, so the account locks at the next token read: treat `unavailable` from a fresh sign-in as "sign in again".''')

receipt('D7',
r'''  - 1D-T5's live channel: `getSharedLiveTarget()` reads its token through `v1SessionCredentials.getAccessToken()`, which is now the Better Auth provider's `getAccessToken` (today's body, unchanged); the socket sends no session header either.''',
r'''  - 1D-T5's live channel: `getSharedLiveTarget()` reads its token through `v1SessionCredentials.getAccessToken()`, which is now the Better Auth provider's `getAccessToken` (today's body plus R86's `sid` check, so it reads null, not ready, during a sign-in from an existing session); the socket sends no session header either.
  - Task 8 (the session-ended and sign-in screens): a sign-in from an existing session (`active`, `locked` or `reauth_required`) whose session read fails after the server accepted it answers `unavailable` and now leaves no cookie (R86): from `active` the account locks at the next token read, and a `locked` one stays locked; the account and its record stay (D37). If a token and the provider's session ever disagreed with no sign-in running, reads would stay not ready (null) without locking until the next sign-in or sign-out; the one known way into that state, a failed session read, is closed by R86.''')

receipt('D8',
r'''  - P2-T2: `app/_layout.tsx` has one import and one module-level `installAppAuth()` after the imports; keep both when wrapping the tree (the RootLayout render test checks the install).
''',
r'''  - P2-T2: `app/_layout.tsx` has one import and one module-level `installAppAuth()` after the imports; keep both when wrapping the tree (the RootLayout render test checks the install).
  - Task 12: locally `authUrl` defaults to the v1 URL, `http://localhost:8091` (the PostgreSQL API, `scripts/dev-v1.mjs`), while 1C-T1's Worker serves `/api/auth` at `http://localhost:8092`; set `EXPO_PUBLIC_AUTH_URL` until one Worker serves both (first review, nit 4).
  - Left open from the first review, as notes (R86): two physical copies of `@better-auth/core` 1.6.33 (and `@better-auth/utils` 0.4.2), under `node_modules/better-auth/` and `apps/app/node_modules/`, are one version, and the Expo client imports only the stateless `@better-auth/core/utils/json` from its copy (nit 1); `sessionEnded` sets `reason` after `dispatch` has notified, so a synchronous subscriber calling `endedReason()` sees the previous value, while `auth_denied` sets it inside `dispatch` (nit 2); putting back the WIP's `getAccessToken` that answered null when the epoch moved fails no test (mutant R16; informational, nit 3).
''')
