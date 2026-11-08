import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SecureStorePort } from '../storage/keyStore.ts';
import { AuthUnavailable, createBetterAuthPort, unsupportedBetterAuthPort } from './betterAuthPort.ts';
import type { SignInMethod } from './betterAuthPort.ts';
import { createCredentialProvider } from './credentialProvider.ts';
import type { EpochStore, RequestCredentials } from './credentialProvider.ts';
import { idTokenSubject } from './nativeSignIn.ts';
import * as session from './session.ts';
import { createSecureSessionStore } from './sessionStore.ts';
import type { SessionRecordStore, StoredSession } from './sessionStore.ts';
import { createFakeAuthServer } from './testing/fakeAuthServer.ts';

const EMAIL = 'kan@example.test';
const ACCOUNT = '0a000000-0000-4000-8000-00000000000a';
const SESSION = '0b000000-0000-4000-8000-00000000000b';

function memorySessions(initial: StoredSession | null = null): SessionRecordStore & { current(): StoredSession | null } {
  let value = initial;
  return {
    current: () => value,
    async load() { return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

function memoryEpochs(initial = 0): EpochStore & { value(): number } {
  let value = initial;
  return {
    value: () => value,
    async load() { return value; },
    async save(epoch) { value = epoch; },
  };
}

function setup(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } } = {}) {
  const server = createFakeAuthServer();
  const sessions = memorySessions();
  const epochs = memoryEpochs();
  const order: string[] = [];
  const vaultLogouts: RequestCredentials[] = [];
  const port = createBetterAuthPort({ client: server.client, native: server.native(identities) });
  const provider = createCredentialProvider({
    port,
    sessions,
    epochs,
    logoutVault: async (credentials) => {
      order.push('logoutVault');
      vaultLogouts.push(credentials);
    },
  });
  return { server, sessions, epochs, order, vaultLogouts, port, provider };
}

async function signedIn(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } } = {}) {
  const ready = setup(identities);
  await ready.port.sendEmailCode(EMAIL);
  const result = await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  assert.equal(result.outcome, 'active');
  return ready;
}

test('sign-in by email code stores the session only after the server signed in, then moves the epoch', async () => {
  const ready = setup();
  await ready.port.sendEmailCode(EMAIL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const started = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.signInWithCode.bind(ready.server.client);
  ready.server.client.signInWithCode = async (email, code) => {
    mark();
    await gate;
    return inner(email, code);
  };
  const pending = ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  const which = await Promise.race([started.then(() => 'started' as const), pending.then(() => 'done' as const)]);
  assert.equal(which, 'started');
  assert.equal(ready.sessions.current(), null);
  const during = ready.provider.getSessionSnapshot().epoch;
  release();
  const result = await pending;
  assert.equal(result.outcome, 'active');
  assert.equal(result.created, true);
  assert.deepEqual(result.methods, []);
  const stored = ready.sessions.current();
  assert.equal(stored?.email, EMAIL);
  assert.equal(ready.provider.getSessionSnapshot().state, 'active');
  assert.equal(ready.provider.getSessionSnapshot().binding, stored?.sessionId);
  assert.equal(ready.provider.getSessionSnapshot().accountId, stored?.accountId);
  assert.ok(ready.provider.getSessionSnapshot().epoch > during);
});

test('a cancelled, refused or unreachable sign-in changes nothing stored and returns to where it was', async () => {
  const ready = await signedIn({ apple: { sub: 'apple-sub', email: 'a@example.test' } });
  const active = ready.provider.getSessionSnapshot();
  const stored = ready.sessions.current();
  ready.server.state.cancelNative = true;
  const cancelled = await ready.provider.signIn({ method: 'apple', signUp: true });
  assert.deepEqual(cancelled, { outcome: 'cancelled', methods: [], created: false });
  assert.deepEqual(ready.provider.getSessionSnapshot(), active);
  assert.deepEqual(ready.sessions.current(), stored);
  ready.server.state.cancelNative = false;
  ready.server.state.existsWith = ['email'];
  const refused = await ready.provider.signIn({ method: 'apple', signUp: true });
  assert.equal(refused.outcome, 'account_exists');
  assert.deepEqual([...refused.methods], ['email']);
  assert.equal(refused.created, false);
  assert.deepEqual(ready.provider.getSessionSnapshot(), active);
  ready.server.state.existsWith = null;
  ready.server.state.offline = true;
  const offline = await ready.provider.signIn({ method: 'apple', signUp: true });
  assert.deepEqual(offline, { outcome: 'unavailable', methods: [], created: false });
  assert.deepEqual(ready.provider.getSessionSnapshot(), active);
  assert.deepEqual(ready.sessions.current(), stored);
  ready.server.state.offline = false;
  const wrong = await ready.provider.signIn({ method: 'email', email: EMAIL, code: '000000' });
  assert.deepEqual(wrong, { outcome: 'wrong_code', methods: [], created: false });
  assert.deepEqual(ready.provider.getSessionSnapshot(), active);
  ready.server.state.codeLimit = true;
  const limited = await ready.provider.signIn({ method: 'email', email: EMAIL, code: '000000' });
  assert.deepEqual(limited, { outcome: 'rate_limited', methods: [], created: false });
  assert.deepEqual(ready.provider.getSessionSnapshot(), active);
});

test('an ACCOUNT_EXISTS sign-in returns the methods to use', async () => {
  const ready = setup({ google: { sub: 'google-sub', email: 'g@example.test' } });
  ready.server.state.existsWith = ['apple', 'email'];
  assert.deepEqual(await ready.provider.signIn({ method: 'google', signUp: true }), { outcome: 'account_exists', methods: ['apple', 'email'], created: false });
});

test('a sign-in result says whether it created the account', async () => {
  const ready = setup();
  await ready.port.sendEmailCode(EMAIL);
  const first = await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  assert.equal(first.outcome, 'active');
  assert.equal(first.created, true);
  await ready.provider.signOut();
  await ready.port.sendEmailCode(EMAIL);
  const second = await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  assert.equal(second.outcome, 'active');
  assert.equal(second.created, false);
  assert.equal(ready.sessions.current()?.accountId, ready.provider.getSessionSnapshot().accountId);
});

test('hydration: a stored session with its cookie is active; without the cookie it is locked; nothing stored is signed out', async () => {
  const empty = setup();
  await empty.provider.hydrate();
  assert.equal(empty.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(empty.provider.account(), null);
  const ready = await signedIn();
  const record = ready.sessions.current();
  assert.ok(record);
  const again = createCredentialProvider({ port: ready.port, sessions: ready.sessions, epochs: ready.epochs });
  await again.hydrate();
  assert.equal(again.getSessionSnapshot().state, 'active');
  assert.equal(again.getSessionSnapshot().accountId, record.accountId);
  assert.equal(again.getSessionSnapshot().binding, record.sessionId);
  assert.equal(again.account()?.email, EMAIL);
  await ready.port.signOut();
  const locked = createCredentialProvider({ port: ready.port, sessions: ready.sessions, epochs: ready.epochs });
  await locked.hydrate();
  assert.equal(locked.getSessionSnapshot().state, 'locked');
  assert.equal(locked.getSessionSnapshot().accountId, record.accountId);
  assert.equal(locked.account()?.sessionId, record.sessionId);
});

test('token reads and refreshes are serialized: one token call each, however many callers', async () => {
  const ready = await signedIn();
  const before = ready.server.calls.filter((call) => call === 'token').length;
  const tokens = await Promise.all([ready.provider.getAccessToken(), ready.provider.getAccessToken(), ready.provider.getAccessToken()]);
  assert.equal(tokens[0], tokens[1]);
  assert.equal(tokens[1], tokens[2]);
  assert.equal(typeof tokens[0], 'string');
  assert.equal(ready.server.calls.filter((call) => call === 'token').length, before + 1);
  const refreshed = await Promise.all([ready.provider.refreshAfterUnauthorized(), ready.provider.refreshAfterUnauthorized()]);
  assert.deepEqual(refreshed, [true, true]);
  assert.equal(ready.server.calls.filter((call) => call === 'token').length, before + 2);
});

test('a token read after a refresh never returns the pre-refresh token', async () => {
  const ready = await signedIn();
  const first = await ready.provider.getAccessToken();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const inner = ready.server.client.token.bind(ready.server.client);
  let hits = 0;
  ready.server.client.token = async () => {
    hits += 1;
    if (hits === 1) await gate;
    return inner();
  };
  const refreshing = ready.provider.refreshAfterUnauthorized();
  const during = ready.provider.getAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [ok, mid] = await Promise.all([refreshing, during]);
  assert.equal(ok, true);
  const after = await ready.provider.getAccessToken();
  assert.equal(mid, after);
  assert.notEqual(after, first);
});

test('offline is not a denial: the session stays active; a deleted session locks, and the lock lifts once a token works again', async () => {
  const ready = setup();
  ready.server.state.tokenTtlSeconds = 30;
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  const record = ready.sessions.current();
  ready.server.state.offline = true;
  await assert.rejects(() => ready.provider.getAccessToken(), (error: unknown) => error instanceof AuthUnavailable);
  assert.equal(ready.provider.getSessionSnapshot().state, 'active');
  ready.server.state.offline = false;
  ready.server.deleteSession(record!.sessionId);
  assert.equal(await ready.provider.getAccessToken(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'locked');
  assert.equal(ready.provider.endedReason(), 'signed_out_elsewhere');
  assert.deepEqual(ready.sessions.current(), record);
  const epoch = ready.provider.getSessionSnapshot().epoch;
  ready.server.client.token = async () => ({ data: { token: 'e30.e30.sig' }, error: null });
  assert.equal(await ready.provider.refreshAfterUnauthorized(), true);
  assert.equal(ready.provider.getSessionSnapshot().state, 'active');
  assert.equal(ready.provider.getSessionSnapshot().epoch, epoch);
  assert.equal(ready.provider.getSessionSnapshot().accountId, record?.accountId);
  assert.equal(ready.provider.endedReason(), null);
});

test('sign-out tells the vault first with the session\'s own token, then Better Auth, then clears the record and moves the epoch', async () => {
  const ready = await signedIn();
  const token = await ready.provider.getAccessToken();
  const record = ready.sessions.current();
  const epoch = ready.provider.getSessionSnapshot().epoch;
  const innerOut = ready.server.client.signOut.bind(ready.server.client);
  ready.server.client.signOut = async () => {
    ready.order.push('signOut');
    return innerOut();
  };
  const innerClear = ready.sessions.clear.bind(ready.sessions);
  ready.sessions.clear = async () => {
    ready.order.push('clear');
    return innerClear();
  };
  await ready.provider.signOut();
  assert.deepEqual(ready.order, ['logoutVault', 'signOut', 'clear']);
  assert.equal(typeof token, 'string');
  assert.deepEqual(ready.vaultLogouts, [{ accessToken: token, sessionId: record?.sessionId }]);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.ok(ready.provider.getSessionSnapshot().epoch > epoch);
  assert.equal(ready.sessions.current(), null);
  assert.equal(ready.provider.endedReason(), null);
  ready.server.client.token = async () => { throw new Error('unreadable'); };
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  await ready.provider.signOut();
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(ready.sessions.current(), null);
  assert.equal(ready.vaultLogouts.length, 1, 'no token, so the vault is not called');
});

test('sign-out during a sign-in wins: the late session is signed out at the server and never stored', async () => {
  const ready = setup();
  await ready.port.sendEmailCode(EMAIL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const started = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.signInWithCode.bind(ready.server.client);
  ready.server.client.signInWithCode = async (email, code) => {
    mark();
    await gate;
    return inner(email, code);
  };
  const pending = ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  const which = await Promise.race([started.then(() => 'started' as const), pending.then(() => 'done' as const)]);
  assert.equal(which, 'started');
  const signingOut = ready.provider.signOut();
  release();
  const result = await pending;
  await signingOut;
  assert.equal(result.outcome, 'cancelled');
  assert.equal(ready.sessions.current(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.ok(ready.server.calls.includes('signOut'));
});

test('sign-out during a fresh sign-in wins: the new session is signed out at the server and never stored', async () => {
  const ready = await signedIn();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const reached = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.signOutDevice.bind(ready.server.client);
  ready.server.client.signOutDevice = async (id) => {
    mark();
    await gate;
    return inner(id);
  };
  await ready.port.sendEmailCode(EMAIL);
  const fresh = ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) });
  await reached;
  await ready.provider.signOut();
  release();
  assert.equal(await fresh, 'cancelled');
  assert.equal(ready.sessions.current(), null);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(await ready.port.hasSession(), false);
});

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

test('the server ending the session keeps the account and says why', async () => {
  const ready = await signedIn();
  const record = ready.sessions.current();
  const active = ready.provider.getSessionSnapshot();
  ready.provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: active.epoch });
  assert.equal(ready.provider.getSessionSnapshot().state, 'reauth_required');
  assert.equal(ready.provider.endedReason(), 'signed_out_elsewhere');
  assert.deepEqual(ready.sessions.current(), record);
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  assert.equal(ready.provider.endedReason(), null);
  const again = ready.provider.getSessionSnapshot();
  ready.provider.sessionEnded({ code: 'REAUTH_REQUIRED', epoch: again.epoch });
  assert.equal(ready.provider.endedReason(), 'signed_out_elsewhere');
  assert.equal(ready.provider.getSessionSnapshot().state, 'reauth_required');
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  const third = ready.provider.getSessionSnapshot();
  ready.provider.sessionEnded({ code: 'ACCOUNT_UNAVAILABLE', epoch: third.epoch });
  assert.equal(ready.provider.getSessionSnapshot().state, 'reauth_required');
  assert.equal(ready.provider.endedReason(), 'account_unavailable');
  assert.equal(ready.sessions.current()?.accountId, third.accountId);
  const stale = third.epoch;
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  const current = ready.provider.getSessionSnapshot();
  ready.provider.sessionEnded({ code: 'ACCOUNT_UNAVAILABLE', epoch: stale });
  ready.provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: stale });
  assert.deepEqual(ready.provider.getSessionSnapshot(), current);
  assert.equal(ready.provider.endedReason(), null);
});

test('requestCredentials reads one token and the session id together, and is null unless active', async () => {
  const ready = await signedIn();
  const before = ready.server.calls.filter((call) => call === 'token').length;
  const [first, second] = await Promise.all([ready.provider.requestCredentials(), ready.provider.requestCredentials()]);
  assert.equal(first?.accessToken, second?.accessToken);
  assert.equal(first?.sessionId, ready.sessions.current()?.sessionId);
  assert.equal(ready.server.calls.filter((call) => call === 'token').length, before + 1);
  ready.provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: ready.provider.getSessionSnapshot().epoch });
  assert.equal(await ready.provider.requestCredentials(), null);
  const signedOut = setup();
  assert.equal(await signedOut.provider.requestCredentials(), null);
});

test('requestCredentials never pairs a token with the id of a session that replaced it', async () => {
  const ready = await signedIn();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mark!: () => void;
  const reached = new Promise<void>((resolve) => { mark = resolve; });
  const inner = ready.server.client.token.bind(ready.server.client);
  let gated = true;
  ready.server.client.token = async () => {
    if (gated) {
      gated = false;
      mark();
      await gate;
    }
    return inner();
  };
  const pending = ready.provider.requestCredentials();
  await reached;
  await ready.port.sendEmailCode(EMAIL);
  assert.equal(await ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) }), 'fresh');
  release();
  assert.equal(await pending, null);
});

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

test('a fresh sign-in into the same account swaps the session, signs the old one out and moves the epoch', async () => {
  const ready = await signedIn();
  const first = ready.sessions.current();
  assert.ok(first);
  const epoch = ready.provider.getSessionSnapshot().epoch;
  await ready.port.sendEmailCode(EMAIL);
  assert.equal(await ready.provider.freshSignIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) }), 'fresh');
  const next = ready.sessions.current();
  assert.equal(next?.accountId, first.accountId);
  assert.notEqual(next?.sessionId, first.sessionId);
  assert.equal(ready.provider.getSessionSnapshot().binding, next?.sessionId);
  assert.equal(ready.provider.getSessionSnapshot().state, 'active');
  assert.ok(ready.provider.getSessionSnapshot().epoch > epoch);
  assert.ok(ready.server.calls.includes(`signOutDevice:${first.sessionId}`));
});

test('an OTHER_ACCOUNT fresh sign-in changes nothing', async () => {
  const ready = await signedIn();
  const before = ready.provider.getSessionSnapshot();
  const stored = ready.sessions.current();
  const calls = ready.server.calls.length;
  assert.equal(await ready.provider.freshSignIn({ method: 'email', email: 'other@example.test', code: '000000' }), 'other_account');
  assert.deepEqual(ready.provider.getSessionSnapshot(), before);
  assert.deepEqual(ready.sessions.current(), stored);
  assert.equal(ready.server.calls.length, calls);
});

test('if the new session cannot be stored, it is signed out at the server and the device ends signed out', async () => {
  const ready = setup({ google: { sub: 'google-sub', email: 'g@example.test' } });
  let saves = 0;
  const saved = ready.sessions.save.bind(ready.sessions);
  ready.sessions.save = async (value) => {
    saves += 1;
    if (saves > 1) throw new Error('disk');
    await saved(value);
  };
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  const previous = ready.sessions.current();
  assert.ok(previous);
  const result = await ready.provider.signIn({ method: 'google', signUp: true });
  assert.deepEqual(result, { outcome: 'failed', methods: [], created: false });
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(ready.sessions.current(), null);
  assert.notEqual(ready.provider.account()?.accountId, previous.accountId);
  assert.equal(await ready.port.hasSession(), false);
  assert.ok(ready.server.calls.includes('signOut'));
});

test('a method this build cannot offer is not_configured and calls nothing', async () => {
  const ready = setup();
  const before = ready.server.calls.length;
  assert.deepEqual(await ready.provider.signIn({ method: 'apple', signUp: true }), { outcome: 'not_configured', methods: [], created: false });
  assert.equal(ready.server.calls.length, before);
  const unsupported = createCredentialProvider({ port: unsupportedBetterAuthPort('x'), sessions: memorySessions() });
  assert.deepEqual(await unsupported.signIn({ method: 'email', email: EMAIL, code: '1' }), { outcome: 'not_configured', methods: [], created: false });
  assert.equal(await unsupported.freshSignIn({ method: 'email', email: EMAIL, code: '1' }), 'not_configured');
  assert.equal(await unsupported.sendEmailCode(EMAIL), 'not_configured');
});

test('the installation epoch never goes backwards across launches', async () => {
  const ready = setup();
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  await ready.provider.signOut();
  await ready.port.sendEmailCode(EMAIL);
  assert.equal((await ready.provider.signIn({ method: 'email', email: EMAIL, code: ready.server.codeFor(EMAIL) })).outcome, 'active');
  const high = ready.provider.getSessionSnapshot().epoch;
  assert.ok(high > 0);
  assert.ok(ready.epochs.value() >= high);
  const second = createCredentialProvider({ port: ready.port, sessions: ready.sessions, epochs: ready.epochs });
  await second.hydrate();
  assert.ok(second.getSessionSnapshot().epoch >= high);
  const third = createCredentialProvider({ port: ready.port, sessions: memorySessions(), epochs: ready.epochs });
  await third.hydrate();
  assert.ok(third.getSessionSnapshot().epoch >= high);
  assert.equal(third.getSessionSnapshot().state, 'signed_out');
});

test('the secure session store keeps the record on this device only, refuses malformed values, and removes the old Auth0 binding item', async () => {
  const items = new Map<string, { value: string; accessible: number }>();
  const secure: SecureStorePort = {
    async getItemAsync(key, options) {
      const hit = items.get(key);
      return hit !== undefined && hit.accessible === options.keychainAccessible ? hit.value : null;
    },
    async setItemAsync(key, value, options) {
      items.set(key, { value, accessible: options.keychainAccessible });
    },
    async deleteItemAsync(key, options) {
      const hit = items.get(key);
      if (hit !== undefined && hit.accessible === options.keychainAccessible) items.delete(key);
    },
  };
  items.set('gogospend.v1.session-binding', { value: 'old-auth0', accessible: 7 });
  const store = createSecureSessionStore(secure, 7);
  const good: StoredSession = { accountId: ACCOUNT, sessionId: SESSION, email: 'a@b.c', method: 'email' };
  await store.save(good);
  assert.equal(items.get('jotbun.v1.session')?.accessible, 7);
  assert.deepEqual(await store.load(), good);
  assert.equal(items.has('gogospend.v1.session-binding'), false);
  await assert.rejects(() => store.save({ ...good, accountId: 'NOPE' }));
  await assert.rejects(() => store.save({ ...good, sessionId: ACCOUNT.toUpperCase() }));
  await assert.rejects(() => store.save({ ...good, email: '' }));
  await assert.rejects(() => store.save({ ...good, email: 'x'.repeat(321) }));
  await store.save({ ...good, email: 'y'.repeat(320) });
  await assert.rejects(() => store.save({ ...good, method: 'sms' as SignInMethod }));
  await assert.rejects(() => store.save({ ...good, extra: true } as StoredSession));
  items.set('jotbun.v1.session', { value: '{"accountId":"nope"}', accessible: 7 });
  assert.equal(await store.load(), null);
  items.set('jotbun.v1.session', { value: 'not-json', accessible: 7 });
  assert.equal(await store.load(), null);
});

test('the secure session store removes the old Auth0 binding item on its first load only', async () => {
  const deleted: string[] = [];
  const secure: SecureStorePort = {
    async getItemAsync() { return null; },
    async setItemAsync() {},
    async deleteItemAsync(key) { deleted.push(key); },
  };
  const store = createSecureSessionStore(secure, 7);
  await store.load();
  await store.load();
  assert.deepEqual(deleted, ['gogospend.v1.session-binding']);
});

test('sign-in during hydrate waits for it: the session record and the session agree', async () => {
  const ready = await signedIn();
  const before = ready.sessions.current();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const load = ready.sessions.load.bind(ready.sessions);
  ready.sessions.load = async () => {
    await gate;
    return load();
  };
  const launched = createCredentialProvider({ port: ready.port, sessions: ready.sessions, epochs: ready.epochs });
  const hydrating = launched.hydrate();
  await ready.port.sendEmailCode('b@example.test');
  const signing = launched.signIn({ method: 'email', email: 'b@example.test', code: ready.server.codeFor('b@example.test') });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await hydrating;
  assert.equal((await signing).outcome, 'active');
  const stored = ready.sessions.current();
  const snapshot = launched.getSessionSnapshot();
  assert.notEqual(stored?.accountId, before?.accountId);
  assert.deepEqual([snapshot.state, snapshot.accountId, snapshot.binding], ['active', stored?.accountId, stored?.sessionId]);
});

test('a second sign-in while one runs joins it (one server sign-in)', async () => {
  const ready = setup();
  await ready.port.sendEmailCode(EMAIL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const inner = ready.server.client.signInWithCode.bind(ready.server.client);
  ready.server.client.signInWithCode = async (email, code) => {
    await gate;
    return inner(email, code);
  };
  const code = ready.server.codeFor(EMAIL);
  const one = ready.provider.signIn({ method: 'email', email: EMAIL, code });
  const two = ready.provider.signIn({ method: 'email', email: EMAIL, code });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [first, second] = await Promise.all([one, two]);
  assert.equal(first.outcome, 'active');
  assert.equal(second, first);
  assert.equal(ready.server.calls.filter((call) => call.startsWith('signInWithCode:')).length, 1);
});

test('refused transitions change nothing and do nothing', async () => {
  const ready = await signedIn();
  const active = ready.provider.getSessionSnapshot();
  let loads = 0;
  const load = ready.sessions.load.bind(ready.sessions);
  ready.sessions.load = async () => {
    loads += 1;
    return load();
  };
  let notified = 0;
  ready.provider.subscribe(() => void (notified += 1));
  await ready.provider.hydrate();
  assert.equal(ready.provider.getSessionSnapshot(), active, 'hydrate while active is refused');
  assert.equal(loads, 0, 'and reads nothing');
  assert.equal(notified, 0);
  ready.provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: active.epoch });
  const ended = ready.provider.getSessionSnapshot();
  assert.deepEqual(ended, { ...active, state: 'reauth_required' });
  await ready.provider.hydrate();
  assert.equal(ready.provider.getSessionSnapshot(), ended, 'hydrate cannot undo a server-ended session');
  assert.equal(loads, 0);
});

test('a token read while a forced refresh runs waits for it', async () => {
  const ready = await signedIn();
  const before = await ready.provider.getAccessToken();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const inner = ready.server.client.token.bind(ready.server.client);
  ready.server.client.token = async () => {
    await gate;
    return inner();
  };
  const refreshing = ready.provider.refreshAfterUnauthorized();
  const during = ready.provider.getAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  assert.equal(await refreshing, true);
  const token = await during;
  assert.notEqual(token, before);
  assert.equal(token, await ready.port.accessToken());
});

test('sign-out waits for an in-flight forced refresh, and tells the vault before Better Auth', async () => {
  const ready = await signedIn();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const innerToken = ready.server.client.token.bind(ready.server.client);
  let gated = true;
  ready.server.client.token = async () => {
    if (gated) {
      gated = false;
      ready.order.push('refresh:start');
      await gate;
      ready.order.push('refresh:end');
    }
    return innerToken();
  };
  const innerOut = ready.server.client.signOut.bind(ready.server.client);
  ready.server.client.signOut = async () => {
    ready.order.push('signOut');
    return innerOut();
  };
  const refreshing = ready.provider.refreshAfterUnauthorized();
  const out = ready.provider.signOut();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await out;
  await refreshing;
  assert.deepEqual(ready.order, ['refresh:start', 'refresh:end', 'logoutVault', 'signOut']);
});

test('sign-out ends the session even when the record cannot be cleared, then reports it', async () => {
  const ready = await signedIn();
  ready.sessions.clear = async () => {
    throw new Error('keychain unavailable');
  };
  await assert.rejects(ready.provider.signOut(), /keychain unavailable/);
  assert.equal(ready.provider.getSessionSnapshot().state, 'signed_out');
  assert.equal(await ready.port.hasSession(), false);
});

test('an installed provider drives the shared session seam: the token, the session id as the binding, and the epoch', async () => {
  const ready = await signedIn();
  session.installCredentialProvider(ready.provider);
  try {
    const snap = session.getV1SessionSnapshot();
    assert.equal(snap.binding, ready.sessions.current()?.sessionId);
    assert.equal(snap.epoch, ready.provider.getSessionSnapshot().epoch);
    assert.equal(await session.getV1AccessToken(), await ready.provider.getAccessToken());
    ready.provider.sessionEnded({ code: 'SESSION_REQUIRED', epoch: snap.epoch });
    assert.equal(session.getV1SessionSnapshot().binding, null, 'a session that needs signing in again is not usable');
    await ready.provider.signOut();
    assert.equal(session.getV1SessionSnapshot().binding, null);
    assert.ok(session.getV1SessionSnapshot().epoch > snap.epoch);
  } finally {
    session.installCredentialProvider(null);
  }
});
