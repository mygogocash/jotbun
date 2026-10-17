import assert from 'node:assert/strict';
import { test } from 'node:test';

import { V1Error } from '../api/client.ts';
import type { V1Transport } from '../api/client.ts';
import type { SecureStorePort } from '../storage/keyStore.ts';
import { AuthCancelled, AuthUnavailable } from './auth0Port.ts';
import type { Auth0Port, PendingCredentials } from './auth0Port.ts';
import { createAuthApi } from './authApi.ts';
import { createCredentialProvider } from './credentialProvider.ts';
import type { AuthApi, BindingStore } from './credentialProvider.ts';
import { reauthenticate } from './reauthentication.ts';
import { INITIAL_SESSION, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';
import { createSecureBindingStore, createSecureEpochStore } from './sessionStore.ts';
import { ACCOUNT_A as A, ACCOUNT_B as B, BIND_A, BIND_A2, BIND_B, fakeDevice, tick } from './testing/fakeDevice.ts';

const run = (events: SessionEvent[], from: SessionSnapshot = INITIAL_SESSION) => events.reduce(reduceSession, from);

test('the epoch moves only when the identity (account or binding) changes, never on a token refresh', () => {
  const active = run([{ type: 'sign_in_start' }, { type: 'authenticated' }, { type: 'bootstrapped', accountId: A, binding: 'bind-a' }]);
  assert.deepEqual([active.state, active.accountId, active.binding], ['active', A, 'bind-a']);
  assert.ok(active.epoch > 0);
  assert.equal(reduceSession(active, { type: 'token_refreshed' }), active);
  const out = reduceSession(active, { type: 'signed_out' });
  assert.deepEqual([out.state, out.accountId, out.binding], ['signed_out', null, null]);
  assert.ok(out.epoch > active.epoch);
  const b = run([{ type: 'sign_in_start' }, { type: 'authenticated' }, { type: 'bootstrapped', accountId: B, binding: 'bind-b' }], out);
  assert.ok(b.epoch > out.epoch);
  // A switch is accepted beside an active session. The same account with a
  // new binding is a binding replacement: the epoch moves.
  const again = reduceSession(b, { type: 'bootstrapped', accountId: B, binding: 'bind-b2' });
  assert.deepEqual([again.state, again.accountId, again.binding], ['active', B, 'bind-b2']);
  assert.ok(again.epoch > b.epoch, 'a new binding is a new identity');
  // Losing the token locks the same identity without moving the epoch; a working refresh unlocks it.
  const locked = reduceSession(again, { type: 'auth_denied' });
  assert.deepEqual([locked.state, locked.accountId, locked.epoch], ['locked', B, again.epoch]);
  assert.deepEqual(reduceSession(locked, { type: 'token_refreshed' }), again);
  // The server ending the session keeps the identity and the epoch (drafts stay with it).
  const reauth = reduceSession(again, { type: 'reauth_required' });
  assert.deepEqual(reauth, { ...again, state: 'reauth_required' });
  assert.deepEqual(reduceSession(locked, { type: 'reauth_required' }), { ...again, state: 'reauth_required' });
});

test('sign-out always starts a new epoch, even while a sign-in is still establishing an identity', () => {
  const pending = run([{ type: 'sign_in_start' }, { type: 'authenticated' }]);
  const out = reduceSession(pending, { type: 'signed_out' });
  assert.equal(out.state, 'signed_out');
  assert.ok(out.epoch > pending.epoch, 'a late bootstrap response is dropped');
  assert.equal(reduceSession(out, { type: 'signed_out' }), out, 'signing out again changes nothing');
});

test('hydration never shows a previous account, and impossible events change nothing', () => {
  const hydrating = reduceSession(INITIAL_SESSION, { type: 'hydrate_start' });
  assert.deepEqual([hydrating.state, hydrating.accountId, hydrating.binding], ['hydrating', null, null]);
  const active: SessionSnapshot = { accountId: A, binding: 'x', epoch: 4, state: 'active' };
  assert.equal(reduceSession(active, { type: 'hydrate_start' }), active, 'an active session is not hydrated again (the epoch never moves for nothing)');
  assert.equal(reduceSession({ ...active, state: 'reauth_required' }, { type: 'hydrate_start' }).state, 'reauth_required');
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'bootstrapped', accountId: A, binding: 'b' }), INITIAL_SESSION);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'auth_denied' }), INITIAL_SESSION);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'locked', accountId: A, binding: 'b' }), INITIAL_SESSION, 'a lock comes only from hydration');
});

function fakes(options: { stored?: { accountId: string; binding: string } | null; credentials?: boolean } = {}) {
  const calls: string[] = [];
  let stored = options.stored ?? null;
  let token = 'access-1';
  let release: (() => void) | null = null;
  const auth0: Auth0Port & { cancelNext: boolean; refreshOk: boolean; gate: boolean } = {
    supported: true,
    cancelNext: false,
    refreshOk: true,
    gate: false,
    async authorize(): Promise<PendingCredentials> {
      calls.push('authorize');
      if (auth0.cancelNext) throw new AuthCancelled();
      return { accessToken: 'pending-access', idToken: 'id-login', credentials: { accessToken: 'access-1' } };
    },
    async authorizeWithNonce(nonce, opts) {
      calls.push(`nonce:${nonce}:${opts?.maxAgeSeconds ?? '-'}`);
      if (auth0.cancelNext) throw new AuthCancelled();
      return `id-token-for-${nonce}`;
    },
    async saveCredentials(pending) {
      calls.push(`save:${pending.accessToken}`);
    },
    async accessToken() {
      calls.push('accessToken');
      if (auth0.gate) await new Promise<void>((resolve) => (release = resolve));
      return token;
    },
    async refresh() {
      calls.push('refresh');
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (auth0.refreshOk) token = 'access-2';
      return auth0.refreshOk;
    },
    hasCredentials: async () => options.credentials ?? false,
    async clearSession() {
      calls.push('clearSession');
    },
  };
  const bindings: BindingStore & { value: () => typeof stored } = {
    load: async () => stored,
    save: async (value) => void (stored = value),
    clear: async () => void (stored = null),
    value: () => stored,
  };
  const api: AuthApi = {
    async challenge(input, auth) {
      calls.push(`challenge:${input.purpose}:${auth?.accessToken ?? 'session'}`);
      return { challenge_id: 'ch-1', nonce: 'nonce-1', expires_at: '2026-10-17T00:05:00Z' };
    },
    async bootstrap(input, auth) {
      calls.push(`bootstrap:${input.challenge_id}:${input.id_token}:${auth?.accessToken ?? 'session'}`);
      return { account_id: A, binding: 'bind-a', session_generation: 0 };
    },
    async prove(input) {
      calls.push(`prove:${input.challenge_id}:${input.id_token}`);
      return { proof_id: 'proof-1', expires_at: '2026-10-17T00:05:00Z' };
    },
    async logout(target) {
      calls.push(`logout:${target ? `${target.binding}:${target.accessToken}` : 'session'}`);
    },
  };
  let n = 0;
  return { auth0, bindings, api, calls, newId: () => `id-${(n += 1)}`, release: () => release?.() };
}

test('sign-in: Universal Login, a bootstrap challenge, a fresh (max_age=0) ID token carrying its nonce, then the binding', async () => {
  const f = fakes();
  const provider = createCredentialProvider(f);
  assert.equal(await provider.signIn(), 'active');
  assert.deepEqual(f.calls.filter((c) => !c.startsWith('accessToken')), [
    'authorize',
    'challenge:bootstrap:pending-access',
    'nonce:nonce-1:0',
    'bootstrap:ch-1:id-token-for-nonce-1:pending-access',
    'save:pending-access',
  ]);
  assert.deepEqual(f.bindings.value(), { accountId: A, binding: 'bind-a' });
  const snapshot = provider.getSessionSnapshot();
  assert.deepEqual([snapshot.state, snapshot.accountId, snapshot.binding], ['active', A, 'bind-a']);
  assert.equal(await provider.getAccessToken(), 'access-1');
});

test('a cancelled sign-in changes nothing stored and returns to where it was', async () => {
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: false });
  const provider = createCredentialProvider(f);
  await provider.hydrate();
  const locked = provider.getSessionSnapshot();
  assert.equal(locked.state, 'locked');
  f.auth0.cancelNext = true;
  assert.equal(await provider.signIn(), 'cancelled');
  assert.deepEqual(f.bindings.value(), { accountId: A, binding: 'bind-a' }, 'the stored binding and drafts are kept');
  assert.deepEqual(provider.getSessionSnapshot(), locked, 'the same state and epoch');
});

test('hydration: a stored binding with credentials is active; without credentials it is locked; nothing stored is signed out', async () => {
  const active = createCredentialProvider(fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true }));
  const seen: string[] = [];
  active.subscribe(() => seen.push(`${active.getSessionSnapshot().state}:${active.getSessionSnapshot().accountId}`));
  await active.hydrate();
  assert.deepEqual(seen, ['hydrating:null', `active:${A}`]);
  const empty = createCredentialProvider(fakes());
  await empty.hydrate();
  assert.equal(empty.getSessionSnapshot().state, 'signed_out');
});

test('token reads and refreshes are serialized: one SDK call each, however many callers', async () => {
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true });
  const provider = createCredentialProvider(f);
  await provider.hydrate();
  f.auth0.gate = true;
  const tokens = Promise.all([provider.getAccessToken(), provider.getAccessToken(), provider.getAccessToken()]);
  await new Promise((resolve) => setTimeout(resolve, 1));
  f.release();
  assert.deepEqual(await tokens, ['access-1', 'access-1', 'access-1']);
  assert.equal(f.calls.filter((c) => c === 'accessToken').length, 1);
  f.auth0.gate = false;
  const epoch = provider.getSessionSnapshot().epoch;
  assert.deepEqual(await Promise.all([provider.refreshAfterUnauthorized(), provider.refreshAfterUnauthorized()]), [true, true]);
  assert.equal(f.calls.filter((c) => c === 'refresh').length, 1);
  assert.equal(provider.getSessionSnapshot().epoch, epoch, 'a refresh is not an identity change');
  f.auth0.refreshOk = false;
  assert.equal(await provider.refreshAfterUnauthorized(), false);
  assert.deepEqual([provider.getSessionSnapshot().state, provider.getSessionSnapshot().accountId], ['locked', A]);
  assert.deepEqual(f.bindings.value(), { accountId: A, binding: 'bind-a' }, 'denial locks; it never erases');
  assert.equal(await provider.getAccessToken(), null, 'no token while locked');
});

test('sign-out revokes this device, then clears the SDK and binding, and moves the epoch', async () => {
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true });
  const provider = createCredentialProvider(f);
  await provider.hydrate();
  const epoch = provider.getSessionSnapshot().epoch;
  await provider.signOut();
  const revoke = f.calls.indexOf('logout:bind-a:access-1');
  assert.ok(revoke >= 0, 'the binding is revoked with its own token');
  assert.ok(revoke < f.calls.indexOf('clearSession'), 'before the SDK forgets the token');
  assert.equal(f.bindings.value(), null);
  assert.deepEqual([provider.getSessionSnapshot().state, provider.getSessionSnapshot().accountId], ['signed_out', null]);
  assert.ok(provider.getSessionSnapshot().epoch > epoch);
});

test('a purpose proof asks for a fresh login with the challenge nonce; cancelling yields no proof; bootstrap is never a purpose', async () => {
  const f = fakes();
  const proof = await reauthenticate('export', f);
  assert.deepEqual(proof, { proofId: 'proof-1', commandId: 'id-2', expiresAt: '2026-10-17T00:05:00Z' });
  assert.deepEqual(f.calls, ['challenge:export:session', 'nonce:nonce-1:0', 'prove:ch-1:id-token-for-nonce-1']);
  f.auth0.cancelNext = true;
  assert.equal(await reauthenticate('global_logout', f), null);
  const g = fakes();
  await assert.rejects(reauthenticate('bootstrap' as never, g), RangeError);
  assert.deepEqual(g.calls, [], 'refused before any challenge or login');
});

test('the native and web adapters are interchangeable platform modules; the web reports real sign-in unsupported', async () => {
  const native = await import('./auth0Client.ts');
  const web = await import('./auth0Client.web.ts');
  assert.deepEqual(Object.keys(web).sort(), Object.keys(native).sort());
  const port = web.createAuth0Port(null, 'https://api.gogospend.test');
  assert.equal(port.supported, false);
  assert.equal(await port.accessToken(), null);
  await assert.rejects(port.authorize());
  assert.equal(native.createAuth0Port(null, 'https://api.gogospend.test').supported, false, 'no SDK installed: no real sign-in');
});

test('the SDK adapter: logins are never stored until saved, fresh logins ask max_age=0 and prompt=login, network failures are not denials', async () => {
  const { createAuth0Port } = await import('./auth0Client.ts');
  const calls: unknown[] = [];
  const saved: unknown[] = [];
  let cancel = false;
  let failure: unknown = null;
  const port = createAuth0Port({
    webAuth: {
      async authorize(parameters) {
        calls.push(['authorize', parameters]);
        if (cancel) throw Object.assign(new Error('x'), { code: 'a0.session.user_cancelled' });
        return { idToken: 'id-token', accessToken: 'at-new' };
      },
      clearSession: async () => void calls.push('clearSession'),
    },
    credentialsManager: {
      async getCredentials(...args) {
        calls.push(['getCredentials', args]);
        if (failure) throw failure;
        return { accessToken: 'at' };
      },
      saveCredentials: async (credentials) => void saved.push(credentials),
      hasValidCredentials: async () => true,
      clearCredentials: async () => void calls.push('clearCredentials'),
    },
  }, 'https://api.gogospend.test');
  const pending = await port.authorize();
  assert.equal(pending.accessToken, 'at-new');
  assert.deepEqual(saved, [], 'a login is not stored until the server accepts it');
  await port.saveCredentials(pending);
  assert.deepEqual(saved, [{ idToken: 'id-token', accessToken: 'at-new' }]);
  assert.equal(await port.authorizeWithNonce('n-1', { maxAgeSeconds: 0 }), 'id-token');
  assert.deepEqual(calls.at(-1), ['authorize', { scope: 'openid profile email offline_access', audience: 'https://api.gogospend.test', nonce: 'n-1', additionalParameters: { max_age: '0', prompt: 'login' } }]);
  assert.equal(saved.length, 1, 'a nonce login is never stored');
  assert.equal(await port.refresh(), true);
  assert.deepEqual(calls.at(-1), ['getCredentials', [undefined, 0, {}, true]]);
  for (const offline of [
    Object.assign(new Error('Network request failed'), { code: 'NETWORK_ERROR' }),
    Object.assign(new Error('The Internet connection appears to be offline.'), { code: 'a0.credential_manager.renew_failed' }),
    Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
  ]) {
    failure = offline;
    await assert.rejects(port.accessToken(), AuthUnavailable);
    await assert.rejects(port.refresh(), AuthUnavailable);
  }
  for (const denied of [
    Object.assign(new Error('Unknown or invalid refresh token.'), { code: 'invalid_grant' }),
    Object.assign(new Error('No credentials were found'), { code: 'a0.credential_manager.no_credentials' }),
  ]) {
    failure = denied;
    assert.equal(await port.accessToken(), null);
    assert.equal(await port.refresh(), false);
  }
  cancel = true;
  await assert.rejects(port.authorize(), AuthCancelled);
});

test('an installed provider drives the shared session seam (token, binding, epoch); a replaced one no longer does', async () => {
  const session = await import('./session.ts');
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true });
  const provider = createCredentialProvider(f);
  session.installCredentialProvider(provider);
  let notified = 0;
  const unsubscribe = session.subscribeSession(() => void (notified += 1));
  try {
    assert.deepEqual(session.getV1SessionSnapshot().binding, null, 'no binding until active');
    await provider.hydrate();
    assert.equal(session.getV1SessionSnapshot().binding, 'bind-a');
    assert.equal(session.getV1SessionSnapshot().epoch, provider.getSessionSnapshot().epoch);
    assert.equal(await session.getV1AccessToken(), 'access-1');
    f.auth0.refreshOk = false;
    assert.equal(await provider.refreshAfterUnauthorized(), false);
    assert.equal(provider.getSessionSnapshot().state, 'locked');
    assert.equal(session.getV1SessionSnapshot().binding, null, 'no binding while locked');
    session.installCredentialProvider(createCredentialProvider(fakes()));
    notified = 0;
    await provider.signOut();
    assert.equal(notified, 0, 'the replaced provider is unsubscribed');
  } finally {
    unsubscribe();
    session.installCredentialProvider(null);
  }
});

// ---- the provider on a fake device (the real SDK adapter) ----

test('the bootstrap login is fresh (max_age=0), and REAUTH_REQUIRED from bootstrap is its own outcome that stores nothing', async () => {
  const d = fakeDevice();
  d.state.bootstrapError = new V1Error('signed_out', 401, 'REAUTH_REQUIRED');
  const provider = createCredentialProvider(d.deps);
  assert.equal(await provider.signIn(), 'reauth_required');
  assert.ok(d.calls.includes('login:nonce:0'), 'the nonce login asks max_age=0');
  assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(d.stored(), null);
  assert.equal(d.sdkUser(), null, 'the login was never stored');
});

test('a failed account switch keeps the active account, its epoch and its credentials; a cold start resumes the same account', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const before = provider.getSessionSnapshot();
  assert.equal(before.state, 'active');
  d.state.nextUser = 'B';
  d.state.bootstrapError = new V1Error('unavailable', 503, 'SERVICE_UNAVAILABLE');
  assert.equal(await provider.signIn(), 'failed');
  assert.deepEqual(provider.getSessionSnapshot(), before);
  assert.deepEqual(d.stored(), { accountId: A, binding: BIND_A });
  assert.equal(d.sdkUser(), 'A', "B's login was never stored over A's credentials");
  assert.equal(await provider.getAccessToken(), 'at-A');
  const cold = createCredentialProvider(d.deps);
  await cold.hydrate();
  const s = cold.getSessionSnapshot();
  assert.deepEqual([s.state, s.accountId, s.binding], ['active', A, BIND_A]);
  assert.equal(await cold.getAccessToken(), 'at-A', "A's binding goes out with A's token");
});

test('a cancelled account switch returns to the active account with the same epoch and a usable token', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const before = provider.getSessionSnapshot();
  d.state.cancel = true;
  assert.equal(await provider.signIn(), 'cancelled');
  assert.deepEqual(provider.getSessionSnapshot(), before);
  assert.equal(await provider.getAccessToken(), 'at-A');
});

test('a successful switch stores the new login only after the server accepted it, then moves the epoch', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const before = provider.getSessionSnapshot();
  d.state.nextUser = 'B';
  assert.equal(await provider.signIn(), 'active');
  const after = provider.getSessionSnapshot();
  assert.deepEqual([after.state, after.accountId, after.binding], ['active', B, BIND_B]);
  assert.ok(after.epoch > before.epoch);
  assert.deepEqual(d.stored(), { accountId: B, binding: BIND_B });
  assert.equal(await provider.getAccessToken(), 'at-B');
  const bootstrap = d.calls.findIndex((c) => c.startsWith('bootstrap:'));
  assert.ok(d.calls[bootstrap].endsWith(':at-B'), "challenge and bootstrap carry the new login's own token");
  assert.ok(d.calls.indexOf('sdk:save:B') > bootstrap, 'saved after the server accepted it');
});

test('signIn during hydrate waits for it: the binding store and the session agree', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  const release = d.gateLoad();
  const hydrating = provider.hydrate();
  await tick();
  d.state.nextUser = 'B';
  const signing = provider.signIn();
  await tick();
  release();
  await hydrating;
  assert.equal(await signing, 'active');
  const s = provider.getSessionSnapshot();
  assert.deepEqual(d.stored(), { accountId: B, binding: BIND_B });
  assert.deepEqual([s.state, s.accountId, s.binding], ['active', B, BIND_B]);
});

test('a second signIn while one runs joins it (one login)', async () => {
  const d = fakeDevice();
  const release = d.gateBootstrap();
  const provider = createCredentialProvider(d.deps);
  const one = provider.signIn();
  const two = provider.signIn();
  await tick(2);
  release();
  assert.deepEqual(await Promise.all([one, two]), ['active', 'active']);
  assert.equal(d.calls.filter((c) => c.startsWith('login:plain')).length, 1);
});

test('sign-out during a bootstrap wins: the epoch moves at once, the late binding is revoked and never stored', async () => {
  const d = fakeDevice();
  const release = d.gateBootstrap();
  const provider = createCredentialProvider(d.deps);
  const signing = provider.signIn();
  await tick(2);
  assert.equal(provider.getSessionSnapshot().state, 'bootstrap_pending');
  const epochBefore = provider.getSessionSnapshot().epoch;
  const out = provider.signOut();
  assert.equal(provider.getSessionSnapshot().state, 'signed_out', 'sign-out wins at once');
  assert.ok(provider.getSessionSnapshot().epoch > epochBefore, 'anything started under the sign-in is dropped');
  release();
  await out;
  assert.equal(await signing, 'cancelled');
  assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(d.stored(), null, 'the late binding is not stored');
  assert.equal(d.sdkUser(), null, 'nor is the late login');
  assert.ok(d.calls.includes(`logout:${BIND_A}:at-A`), 'the late binding is revoked with its own login');
  const cold = createCredentialProvider(d.deps);
  await cold.hydrate();
  assert.equal(cold.getSessionSnapshot().state, 'signed_out');
});

test('refused transitions change nothing and do nothing', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const active = provider.getSessionSnapshot();
  let notified = 0;
  provider.subscribe(() => void (notified += 1));
  const loads = d.loads();
  await provider.hydrate();
  assert.equal(provider.getSessionSnapshot(), active, 'hydrate while active is refused');
  assert.equal(d.loads(), loads, 'and reads nothing');
  assert.equal(notified, 0);
  provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: active.epoch });
  const reauth = provider.getSessionSnapshot();
  assert.deepEqual(reauth, { ...active, state: 'reauth_required' });
  await provider.hydrate();
  assert.equal(provider.getSessionSnapshot(), reauth, 'hydrate cannot undo a server-ended session');
  assert.equal(d.loads(), loads);
});

test('offline is not a denial: the session stays active; a real denial locks, and the lock lifts once credentials work again', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const active = provider.getSessionSnapshot();
  d.state.offline = true;
  await assert.rejects(provider.getAccessToken(), AuthUnavailable);
  await assert.rejects(provider.refreshAfterUnauthorized(), AuthUnavailable);
  assert.equal(provider.getSessionSnapshot(), active, 'offline keeps the session (no lock)');
  d.state.offline = false;
  assert.equal(await provider.getAccessToken(), 'at-A');
  d.state.revoked = true;
  assert.equal(await provider.refreshAfterUnauthorized(), false);
  assert.deepEqual(provider.getSessionSnapshot(), { ...active, state: 'locked' });
  await provider.hydrate();
  assert.equal(provider.getSessionSnapshot().state, 'locked', 'still denied');
  d.state.revoked = false;
  d.state.offline = true;
  await provider.hydrate();
  assert.equal(provider.getSessionSnapshot().state, 'locked', 'offline: nothing to check against yet');
  d.state.offline = false;
  await provider.hydrate();
  assert.deepEqual(provider.getSessionSnapshot(), active, 'recovered as the same identity and epoch');
  d.state.revoked = true;
  await provider.refreshAfterUnauthorized();
  d.state.revoked = false;
  assert.equal(await provider.refreshAfterUnauthorized(), true);
  assert.deepEqual(provider.getSessionSnapshot(), active, 'a working refresh also lifts the lock');
});

test("a purpose-proof login never replaces the active session's credentials", async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  d.state.nextUser = 'B';
  d.state.proveError = new V1Error('signed_out', 401, 'PROOF_INVALID');
  await assert.rejects(reauthenticate('export', d.deps));
  d.state.proveError = null;
  assert.ok(await reauthenticate('export', d.deps));
  assert.equal(d.sdkUser(), 'A');
  assert.equal(await provider.getAccessToken(), 'at-A');
});

test('a token read after a refresh never returns the pre-refresh token', async () => {
  let sdkToken = 'old';
  let release: (() => void) | null = null;
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const port: Auth0Port = {
    ...d.deps.auth0,
    async accessToken() {
      const value = sdkToken;
      if (release === null) await new Promise<void>((resolve) => (release = resolve));
      return value;
    },
    async refresh() {
      sdkToken = 'new';
      return true;
    },
  };
  const provider = createCredentialProvider({ ...d.deps, auth0: port });
  await provider.hydrate();
  const slowRead = provider.getAccessToken();
  assert.equal(await provider.refreshAfterUnauthorized(), true);
  const afterRefresh = provider.getAccessToken();
  release!();
  assert.equal(await slowRead, 'old');
  assert.equal(await afterRefresh, 'new');
});

test('a token read while a forced refresh runs waits for it', async () => {
  let sdkToken = 'old';
  let finish!: () => void;
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const port: Auth0Port = {
    ...d.deps.auth0,
    accessToken: async () => sdkToken,
    async refresh() {
      await new Promise<void>((resolve) => (finish = resolve));
      sdkToken = 'new';
      return true;
    },
  };
  const provider = createCredentialProvider({ ...d.deps, auth0: port });
  await provider.hydrate();
  const refreshing = provider.refreshAfterUnauthorized();
  const during = provider.getAccessToken();
  await tick();
  finish();
  assert.equal(await refreshing, true);
  assert.equal(await during, 'new');
});

test('if the new login cannot be stored, the previous binding is put back and the new binding revoked', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const before = provider.getSessionSnapshot();
  d.state.nextUser = 'B';
  d.state.saveError = new Error('keychain unavailable');
  assert.equal(await provider.signIn(), 'failed');
  assert.deepEqual(provider.getSessionSnapshot(), before);
  assert.deepEqual(d.stored(), { accountId: A, binding: BIND_A }, "the store names A again, matching the SDK's credentials");
  assert.equal(d.sdkUser(), 'A');
  assert.ok(d.calls.includes(`logout:${BIND_B}:at-B`));
  const fresh = fakeDevice();
  fresh.state.saveError = new Error('keychain unavailable');
  const first = createCredentialProvider(fresh.deps);
  assert.equal(await first.signIn(), 'failed');
  assert.equal(first.getSessionSnapshot().state, 'signed_out');
  assert.equal(fresh.stored(), null, 'nothing left behind');
});

test('sign-out from a locked session still revokes the stored binding', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  d.state.revoked = true;
  await provider.refreshAfterUnauthorized();
  assert.equal(provider.getSessionSnapshot().state, 'locked');
  await provider.signOut();
  assert.ok(d.calls.includes(`logout:${BIND_A}:at-A`));
  assert.equal(d.stored(), null);
});

test('sign-out waits for an in-flight forced refresh, and revokes before it clears the SDK', async () => {
  const order: string[] = [];
  let finish!: () => void;
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const port: Auth0Port = {
    ...d.deps.auth0,
    async refresh() {
      order.push('refresh:start');
      await new Promise<void>((resolve) => (finish = resolve));
      order.push('refresh:end');
      return true;
    },
    async clearSession() {
      order.push('clear');
    },
  };
  const api: AuthApi = { ...d.deps.api, logout: async (target) => void order.push(`logout:${target?.binding ?? 'session'}`) };
  const provider = createCredentialProvider({ ...d.deps, auth0: port, api });
  await provider.hydrate();
  const refreshing = provider.refreshAfterUnauthorized();
  const out = provider.signOut();
  await tick();
  finish();
  await out;
  await refreshing;
  assert.deepEqual(order, ['refresh:start', 'refresh:end', `logout:${BIND_A}`, 'clear']);
});

test('sign-out ends the session even when the binding store cannot be cleared, then reports it', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  d.state.clearError = new Error('keychain unavailable');
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  await assert.rejects(provider.signOut(), /keychain unavailable/);
  assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(d.sdkUser(), null);
});

test('the server ending the session: SESSION_REQUIRED and REAUTH_REQUIRED need a new sign-in, ACCOUNT_UNAVAILABLE signs out, stale reports change nothing', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const provider = createCredentialProvider(d.deps);
  await provider.hydrate();
  const active = provider.getSessionSnapshot();
  provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: active.epoch - 1 });
  assert.equal(provider.getSessionSnapshot(), active, 'a report from an earlier session is ignored');
  provider.sessionEnded({ code: 'REAUTH_REQUIRED', epoch: active.epoch });
  assert.deepEqual(provider.getSessionSnapshot(), { ...active, state: 'reauth_required' });
  assert.equal(await provider.getAccessToken(), null);
  assert.deepEqual(d.stored(), { accountId: A, binding: BIND_A }, 'the account and its drafts are kept');
  d.state.bindingFor.A = BIND_A2;
  assert.equal(await provider.signIn(), 'active');
  const renewed = provider.getSessionSnapshot();
  assert.deepEqual([renewed.state, renewed.accountId, renewed.binding], ['active', A, BIND_A2]);
  assert.ok(renewed.epoch > active.epoch);
  provider.sessionEnded({ code: 'ACCOUNT_UNAVAILABLE', epoch: renewed.epoch });
  assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  assert.ok(provider.getSessionSnapshot().epoch > renewed.epoch);
  await provider.hydrate();
  assert.equal(d.stored(), null, 'nothing to resume');
  assert.equal(d.sdkUser(), null);
  assert.equal(provider.getSessionSnapshot().state, 'signed_out');
  assert.ok(!d.calls.includes(`logout:${BIND_A2}:at-A`), 'a binding the server already refuses is not revoked again');
});

test('the installation epoch never goes backwards across launches', async () => {
  const d = fakeDevice({ stored: { accountId: A, binding: BIND_A }, sdkUser: 'A' });
  const first = createCredentialProvider(d.deps);
  await first.hydrate();
  // More identity changes than one reserved block of epochs.
  for (let i = 0; i < 70; i += 1) {
    d.state.nextUser = i % 2 === 0 ? 'B' : 'A';
    assert.equal(await first.signIn(), 'active');
  }
  await first.signOut();
  const last = first.getSessionSnapshot().epoch;
  assert.ok(last > 70);
  const second = createCredentialProvider(d.deps);
  await second.hydrate();
  assert.ok(second.getSessionSnapshot().epoch > last, `launch 2 starts above ${last}`);
});

test('the secure session store keeps the binding on this device only, refuses malformed values, and keeps the epoch', async () => {
  const items = new Map<string, string>();
  const accessible: number[] = [];
  const secure: SecureStorePort = {
    async getItemAsync(key, options) {
      accessible.push(options.keychainAccessible);
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value, options) {
      accessible.push(options.keychainAccessible);
      items.set(key, value);
    },
    async deleteItemAsync(key, options) {
      accessible.push(options.keychainAccessible);
      items.delete(key);
    },
  };
  const THIS_DEVICE_ONLY = 7;
  const store = createSecureBindingStore(secure, THIS_DEVICE_ONLY);
  assert.equal(await store.load(), null);
  await store.save({ accountId: A, binding: BIND_A });
  assert.deepEqual(await store.load(), { accountId: A, binding: BIND_A });
  assert.equal(items.size, 1);
  const [key] = items.keys();
  for (const bad of ['{', JSON.stringify({ accountId: 'x', binding: BIND_A }), JSON.stringify({ accountId: A, binding: 'short' }), JSON.stringify({ accountId: A, binding: BIND_A, extra: 1 })]) {
    items.set(key, bad);
    assert.equal(await store.load(), null, bad);
  }
  await assert.rejects(store.save({ accountId: A, binding: 'not-a-binding' }), RangeError);
  await store.clear();
  assert.equal(items.size, 0);
  const epochs = createSecureEpochStore(secure, THIS_DEVICE_ONLY);
  assert.equal(await epochs.load(), 0);
  await epochs.save(65);
  assert.equal(await epochs.load(), 65);
  items.set([...items.keys()][0], 'nope');
  assert.equal(await epochs.load(), 0);
  assert.ok(accessible.length > 0 && accessible.every((value) => value === THIS_DEVICE_ONLY));
});

test("the auth API accepts exactly the server's 43-character binding and sends a sign-in's own credentials", async () => {
  let payload: unknown = null;
  const options: unknown[] = [];
  const transport: V1Transport = {
    async request(_method, _path, request) {
      options.push(request);
      if (!request.validate(payload)) throw new V1Error('invalid_response', 200, 'INVALID_RESPONSE');
      return payload as never;
    },
  };
  const api = createAuthApi(transport);
  for (const [binding, accepted] of [[BIND_A, true], ['a'.repeat(42), false], ['a'.repeat(44), false], ['a'.repeat(32), false], [`${'a'.repeat(42)}=`, false]] as const) {
    payload = { account_id: A, binding, session_generation: 0 };
    const result = await api.bootstrap({ challenge_id: 'c', id_token: 'i' }, { accessToken: 'pending' }).then(() => true, () => false);
    assert.equal(result, accepted, binding);
  }
  assert.deepEqual((options[0] as { credentials?: unknown }).credentials, { accessToken: 'pending' });
  payload = null;
  await api.logout({ binding: BIND_B, accessToken: 'at-B' });
  assert.deepEqual((options.at(-1) as { credentials?: unknown }).credentials, { accessToken: 'at-B', binding: BIND_B });
});
