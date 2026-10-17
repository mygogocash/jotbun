import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AuthCancelled } from './auth0Client.ts';
import type { Auth0Port } from './auth0Client.ts';
import { webAuth0Port } from './auth0Client.web.ts';
import { createCredentialProvider } from './credentialProvider.ts';
import type { AuthApi, BindingStore } from './credentialProvider.ts';
import { reauthenticate } from './reauthentication.ts';
import { INITIAL_SESSION, reduceSession } from './sessionMachine.ts';
import type { SessionEvent, SessionSnapshot } from './sessionMachine.ts';

const A = '0a000000-0000-4000-8000-00000000000a';
const B = '0b000000-0000-4000-8000-00000000000b';
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
  // The same account with a new binding is a binding replacement: the epoch moves.
  const again = run([{ type: 'sign_in_start' }, { type: 'authenticated' }, { type: 'bootstrapped', accountId: B, binding: 'bind-b2' }], b);
  assert.ok(again.epoch > b.epoch);
  // Losing the token locks the same identity without moving the epoch.
  const locked = reduceSession(again, { type: 'auth_denied' });
  assert.deepEqual([locked.state, locked.accountId, locked.epoch], ['locked', B, again.epoch]);
});

test('hydration never shows a previous account, and impossible events change nothing', () => {
  const hydrating = reduceSession({ accountId: A, binding: 'x', epoch: 4, state: 'active' }, { type: 'hydrate_start' });
  assert.deepEqual([hydrating.state, hydrating.accountId, hydrating.binding], ['hydrating', null, null]);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'bootstrapped', accountId: A, binding: 'b' }), INITIAL_SESSION);
  assert.equal(reduceSession(INITIAL_SESSION, { type: 'auth_denied' }), INITIAL_SESSION);
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
    async authorize() {
      calls.push('authorize');
      if (auth0.cancelNext) throw new AuthCancelled();
    },
    async authorizeWithNonce(nonce, opts) {
      calls.push(`nonce:${nonce}:${opts?.maxAgeSeconds ?? '-'}`);
      if (auth0.cancelNext) throw new AuthCancelled();
      return `id-token-for-${nonce}`;
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
    async challenge(input) {
      calls.push(`challenge:${input.purpose}`);
      return { challenge_id: 'ch-1', nonce: 'nonce-1', expires_at: '2026-10-17T00:05:00Z' };
    },
    async bootstrap(input) {
      calls.push(`bootstrap:${input.challenge_id}:${input.id_token}`);
      return { account_id: A, binding: 'bind-a', session_generation: 0 };
    },
    async prove(input) {
      calls.push(`prove:${input.challenge_id}:${input.id_token}`);
      return { proof_id: 'proof-1', expires_at: '2026-10-17T00:05:00Z' };
    },
    async logout() {
      calls.push('logout');
    },
  };
  let n = 0;
  return { auth0, bindings, api, calls, newId: () => `id-${(n += 1)}`, release: () => release?.() };
}

test('sign-in: Universal Login, a bootstrap challenge, an ID token carrying its nonce, then the binding', async () => {
  const f = fakes();
  const provider = createCredentialProvider(f);
  assert.equal(await provider.signIn(), 'active');
  assert.deepEqual(f.calls.filter((c) => !c.startsWith('accessToken')), ['authorize', 'challenge:bootstrap', 'nonce:nonce-1:-', 'bootstrap:ch-1:id-token-for-nonce-1']);
  assert.deepEqual(f.bindings.value(), { accountId: A, binding: 'bind-a' });
  const snapshot = provider.getSessionSnapshot();
  assert.deepEqual([snapshot.state, snapshot.accountId, snapshot.binding], ['active', A, 'bind-a']);
  assert.equal(await provider.getAccessToken(), 'access-1');
});

test('a cancelled sign-in changes nothing stored and returns to where it was', async () => {
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: false });
  const provider = createCredentialProvider(f);
  await provider.hydrate();
  assert.equal(provider.getSessionSnapshot().state, 'locked');
  f.auth0.cancelNext = true;
  assert.equal(await provider.signIn(), 'cancelled');
  assert.deepEqual(f.bindings.value(), { accountId: A, binding: 'bind-a' }, 'the stored binding and drafts are kept');
  assert.deepEqual([provider.getSessionSnapshot().state, provider.getSessionSnapshot().accountId], ['locked', A]);
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

test('sign-out revokes this device, clears the SDK and binding, and moves the epoch', async () => {
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true });
  const provider = createCredentialProvider(f);
  await provider.hydrate();
  const epoch = provider.getSessionSnapshot().epoch;
  await provider.signOut();
  assert.ok(f.calls.includes('logout') && f.calls.includes('clearSession'));
  assert.equal(f.bindings.value(), null);
  assert.deepEqual([provider.getSessionSnapshot().state, provider.getSessionSnapshot().accountId], ['signed_out', null]);
  assert.ok(provider.getSessionSnapshot().epoch > epoch);
});

test('a purpose proof asks for a fresh login with the challenge nonce; cancelling yields no proof', async () => {
  const f = fakes();
  const proof = await reauthenticate('export', f);
  assert.deepEqual(proof, { proofId: 'proof-1', commandId: 'id-2', expiresAt: '2026-10-17T00:05:00Z' });
  assert.deepEqual(f.calls, ['challenge:export', 'nonce:nonce-1:0', 'prove:ch-1:id-token-for-nonce-1']);
  f.auth0.cancelNext = true;
  assert.equal(await reauthenticate('global_logout', f), null);
});

test('the web reports real sign-in unsupported', async () => {
  const port = webAuth0Port();
  assert.equal(port.supported, false);
  assert.equal(await port.accessToken(), null);
  await assert.rejects(port.authorize());
});

test('the SDK adapter maps cancel, forced refresh and nonce logins onto the port', async () => {
  const { createAuth0Port } = await import('./auth0Client.ts');
  const calls: unknown[] = [];
  let cancel = false;
  const port = createAuth0Port({
    webAuth: {
      async authorize(parameters) {
        calls.push(['authorize', parameters]);
        if (cancel) throw Object.assign(new Error('x'), { code: 'a0.session.user_cancelled' });
        return { idToken: 'id-token' };
      },
      clearSession: async () => void calls.push('clearSession'),
    },
    credentialsManager: {
      getCredentials: async (...args) => (calls.push(['getCredentials', args]), { accessToken: 'at' }),
      saveCredentials: async () => void calls.push('save'),
      hasValidCredentials: async () => true,
      clearCredentials: async () => void calls.push('clearCredentials'),
    },
  }, 'https://api.gogospend.test');
  assert.equal(await port.authorizeWithNonce('n-1', { maxAgeSeconds: 0 }), 'id-token');
  assert.deepEqual(calls[0], ['authorize', { scope: 'openid profile email offline_access', audience: 'https://api.gogospend.test', nonce: 'n-1', maxAge: 0 }]);
  assert.equal(await port.refresh(), true);
  assert.deepEqual(calls.at(-1), ['getCredentials', [undefined, 0, {}, true]]);
  cancel = true;
  await assert.rejects(port.authorize(), AuthCancelled);
});

test('an installed provider drives the shared session seam (token, binding, epoch)', async () => {
  const session = await import('./session.ts');
  const f = fakes({ stored: { accountId: A, binding: 'bind-a' }, credentials: true });
  const provider = createCredentialProvider(f);
  session.installCredentialProvider(provider);
  try {
    assert.deepEqual(session.getV1SessionSnapshot().binding, null, 'no binding until active');
    await provider.hydrate();
    assert.equal(session.getV1SessionSnapshot().binding, 'bind-a');
    assert.equal(session.getV1SessionSnapshot().epoch, provider.getSessionSnapshot().epoch);
    assert.equal(await session.getV1AccessToken(), 'access-1');
  } finally {
    session.installCredentialProvider(null);
  }
});
