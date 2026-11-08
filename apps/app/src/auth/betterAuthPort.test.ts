import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AuthCancelled, AuthRefused, AuthUnavailable, createdOf, createBetterAuthPort, unsupportedBetterAuthPort } from './betterAuthPort.ts';
import { idTokenSubject } from './nativeSignIn.ts';
import { createFakeAuthServer } from './testing/fakeAuthServer.ts';

const EMAIL = 'kan@example.test';

function portFor(identities: { apple?: { sub: string; email: string }; google?: { sub: string; email: string } } = {}) {
  const server = createFakeAuthServer();
  const port = createBetterAuthPort({ client: server.client, native: server.native(identities) });
  return { server, port };
}

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

test('email: a code is asked for sign-in only', async () => {
  const { server, port } = portFor();
  await port.sendEmailCode(EMAIL);
  assert.deepEqual(server.calls, [`sendSignInCode:${EMAIL}`]);
  assert.ok(server.calls.every((call) => !call.includes('sign-up') && !call.includes('forget-password') && !call.includes('email-verification')));
});

test('the right code signs in and names the account and the session', async () => {
  const { session } = await emailSession();
  assert.equal(session.email, EMAIL);
  assert.equal(session.method, 'email');
  assert.match(session.accountId, /^[0-9a-f-]{36}$/);
  assert.match(session.sessionId, /^[0-9a-f-]{36}$/);
  assert.notEqual(session.accountId, session.sessionId);
});

test('the first code for an address says it created the account; the next code does not', async () => {
  const { server, port } = portFor();
  await port.sendEmailCode(EMAIL);
  const first = await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(first.created, true);
  await port.sendEmailCode(EMAIL);
  const second = await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(second.created, false);
  assert.equal(second.accountId, first.accountId);
  assert.notEqual(second.sessionId, first.sessionId);
});

test('createdOf reads only a created that is exactly true', () => {
  assert.equal(createdOf({ created: 'yes' }), false);
  assert.equal(createdOf({ created: true }), true);
  assert.equal(createdOf({ created: false }), false);
  assert.equal(createdOf(null), false);
  assert.equal(createdOf(['created']), false);
});

test('a wrong code is WRONG_CODE, and nothing is stored', async () => {
  const { port } = portFor();
  await port.sendEmailCode(EMAIL);
  await assert.rejects(() => port.signIn({ method: 'email', email: EMAIL, code: '000000' }), (error: unknown) => error instanceof AuthRefused && error.code === 'WRONG_CODE');
  assert.equal(await port.hasSession(), false);
});

test("the server's cap is CODE_LIMIT", async () => {
  const { server, port } = portFor();
  server.state.codeLimit = true;
  await assert.rejects(() => port.sendEmailCode(EMAIL), (error: unknown) => error instanceof AuthRefused && error.code === 'CODE_LIMIT');
});

test('offline, a timeout or a 5xx is AuthUnavailable, never a refusal', async () => {
  const { server, port } = portFor();
  server.state.offline = true;
  await assert.rejects(() => port.sendEmailCode(EMAIL), (error: unknown) => error instanceof AuthUnavailable && !(error instanceof AuthRefused));
  server.state.offline = false;
  server.state.fail5xx = true;
  await assert.rejects(() => port.signIn({ method: 'email', email: EMAIL, code: '000000' }), (error: unknown) => error instanceof AuthUnavailable && !(error instanceof AuthRefused));
  server.state.offline = true;
  await assert.rejects(() => port.sendEmailCode(EMAIL), (error: unknown) => error instanceof AuthUnavailable && !(error instanceof AuthRefused));
});

test('a cancelled Apple sheet is AuthCancelled and the server is never called', async () => {
  const { server, port } = portFor({ apple: { sub: 'apple-sub', email: 'apple@example.test' } });
  server.state.cancelNative = true;
  await assert.rejects(() => port.signIn({ method: 'apple', signUp: true }), AuthCancelled);
  assert.equal(server.calls.some((call) => call.startsWith('signInWithIdToken')), false);
});

test('the sign-in screen asks to sign up; a fresh sign-in never does', async () => {
  const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
  const session = await port.signIn({ method: 'google', signUp: true });
  assert.ok(server.calls.includes('signInWithIdToken:google:true'));
  await port.freshSignIn({ method: 'google', signUp: false }, { accountId: session.accountId, email: session.email });
  assert.ok(server.calls.includes('signInWithIdToken:google:false'));
});

test('ACCOUNT_EXISTS carries the methods the server named', async () => {
  const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
  server.state.existsWith = ['apple', 'email'];
  await assert.rejects(() => port.signIn({ method: 'google', signUp: true }), (error: unknown) => {
    assert.ok(error instanceof AuthRefused);
    assert.equal(error.code, 'ACCOUNT_EXISTS');
    assert.deepEqual(error.methods, ['apple', 'email']);
    return true;
  });
});

test('AuthRefused keeps its code and methods as fields', () => {
  const error = new AuthRefused('REFUSED');
  assert.equal(error.name, 'AuthRefused');
  assert.equal(error.code, 'REFUSED');
  assert.deepEqual([...error.methods], []);
});

test("a fresh sign-in by email uses only the account's own address", async () => {
  const { server, port, session } = await emailSession();
  const before = server.calls.length;
  await assert.rejects(
    () => port.freshSignIn({ method: 'email', email: 'other@example.test', code: '000000' }, { accountId: session.accountId, email: session.email }),
    (error: unknown) => error instanceof AuthRefused && error.code === 'OTHER_ACCOUNT',
  );
  assert.deepEqual(server.calls.slice(before), []);
  await port.sendEmailCode(`  ${EMAIL.toUpperCase()}  `);
  const again = await port.freshSignIn(
    { method: 'email', email: `  ${EMAIL.toUpperCase()}  `, code: server.codeFor(EMAIL) },
    { accountId: session.accountId, email: session.email },
  );
  assert.equal(again.accountId, session.accountId);
});

test('a fresh sign-in by Google checks the token\'s subject against the linked account first; another subject is OTHER_ACCOUNT and nothing is sent', async () => {
  const { server, port, session } = await emailSession();
  const native = server.native({ google: { sub: 'someone-else', email: 'else@example.test' } });
  const checking = createBetterAuthPort({ client: server.client, native });
  const before = server.calls.length;
  await assert.rejects(
    () => checking.freshSignIn({ method: 'google', signUp: false }, { accountId: session.accountId, email: session.email }),
    (error: unknown) => error instanceof AuthRefused && error.code === 'OTHER_ACCOUNT',
  );
  assert.equal(server.calls.slice(before).some((call) => call.startsWith('signInWithIdToken')), false);
});

test('a fresh sign-in that still lands in another account signs that session out and is OTHER_ACCOUNT', async () => {
  const google = { sub: 'google-sub', email: 'g@example.test' };
  const { server, port } = portFor({ google });
  const first = await port.signIn({ method: 'google', signUp: true });
  await port.signOut();
  await port.sendEmailCode(EMAIL);
  const current = await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  await port.linkMethod('google');
  await assert.rejects(
    () => port.freshSignIn({ method: 'google', signUp: false }, { accountId: current.accountId, email: current.email }),
    (error: unknown) => error instanceof AuthRefused && error.code === 'OTHER_ACCOUNT',
  );
  assert.equal(first.accountId === current.accountId, false);
  assert.ok(server.calls.includes('signOut'));
  assert.equal(await port.hasSession(), false);
});

test('the JWT is reused until a minute before it expires, then renewed', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  try {
    const { server, port } = portFor();
    server.state.tokenTtlSeconds = 300;
    await port.sendEmailCode(EMAIL);
    await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
    const first = await port.accessToken();
    const second = await port.accessToken();
    assert.equal(first, second);
    assert.equal(server.calls.filter((call) => call === 'token').length, 1);
    t.mock.timers.tick(250_000);
    const third = await port.accessToken();
    assert.equal(typeof third, 'string');
    assert.equal(server.calls.filter((call) => call === 'token').length, 2);
  } finally {
    t.mock.timers.reset();
  }
});

test("a sign-in drops the cached JWT: the next token is the new account's", async () => {
  const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
  await port.sendEmailCode(EMAIL);
  const byEmail = await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(idTokenSubject((await port.accessToken()) ?? ''), byEmail.accountId);
  const byGoogle = await port.signIn({ method: 'google', signUp: true });
  assert.notEqual(byGoogle.accountId, byEmail.accountId);
  assert.equal(idTokenSubject((await port.accessToken()) ?? ''), byGoogle.accountId);
  await port.sendEmailCode(EMAIL);
  await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.equal(idTokenSubject((await port.accessToken()) ?? ''), byEmail.accountId);
});

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
  const { server, port } = await emailSession().then(({ server, port }) => ({ server, port }));
  await port.accessToken();
  await port.accessToken();
  assert.equal(server.calls.filter((call) => call === 'token').length, 1);
  assert.equal(await port.refresh(), true);
  assert.equal(await port.refresh(), true);
  assert.equal(server.calls.filter((call) => call === 'token').length, 3);
});

test('a session the server deleted reads as no token, not as an outage', async () => {
  const { server, port, session } = await emailSession();
  server.state.tokenTtlSeconds = 30;
  assert.equal(typeof await port.accessToken(), 'string');
  server.deleteSession(session.sessionId);
  assert.equal(await port.accessToken(), null);
  assert.equal(await port.refresh(), false);
});

test('linking from a stale sign-in is REAUTH_REQUIRED', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  try {
    const { port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
    await port.signIn({ method: 'google', signUp: true });
    t.mock.timers.tick(6 * 60 * 1000);
    await assert.rejects(() => port.linkMethod('google'), (error: unknown) => error instanceof AuthRefused && error.code === 'REAUTH_REQUIRED');
  } finally {
    t.mock.timers.reset();
  }
});

test('unlinking calls unlink with the provider', async () => {
  const { server, port } = portFor({ google: { sub: 'google-sub', email: 'g@example.test' } });
  await port.signIn({ method: 'google', signUp: true });
  await port.unlinkMethod('google');
  assert.ok(server.calls.includes('unlink:google'));
});

test('the device calls use the jotbun routes, and REAUTH_REQUIRED and SIGNED_OUT stay apart', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  try {
    const { server, port, session } = await emailSession();
    const devices = await port.devices();
    assert.equal(devices[0]?.id, session.sessionId);
    await port.signOutDevice(session.sessionId);
    const signedOut = await port.signOutOtherDevices();
    assert.equal(typeof signedOut, 'number');
    await port.signOutEverywhere();
    assert.ok(server.calls.includes('devices'));
    assert.ok(server.calls.includes(`signOutDevice:${session.sessionId}`));
    assert.ok(server.calls.includes('signOutOtherDevices'));
    assert.ok(server.calls.includes('signOutEverywhere'));
    server.deleteSession(session.sessionId);
    await assert.rejects(() => port.devices(), (error: unknown) => error instanceof AuthRefused && error.code === 'SIGNED_OUT');
    const again = await emailSession();
    t.mock.timers.tick(6 * 60 * 1000);
    await assert.rejects(() => again.port.devices(), (error: unknown) => error instanceof AuthRefused && error.code === 'REAUTH_REQUIRED');
  } finally {
    t.mock.timers.reset();
  }
});

test('linked methods are Apple and Google when the account has them, then always email', async () => {
  const { server, port } = portFor({ apple: { sub: 'apple-sub', email: 'a@example.test' }, google: { sub: 'google-sub', email: 'g@example.test' } });
  await port.sendEmailCode(EMAIL);
  await port.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) });
  assert.deepEqual(await port.linkedMethods(), ['email']);
  await port.linkMethod('apple');
  await port.linkMethod('google');
  assert.deepEqual(await port.linkedMethods(), ['apple', 'google', 'email']);
});

test('the web build reports sign-in unsupported', async () => {
  const port = unsupportedBetterAuthPort('x');
  assert.equal(port.supported, false);
  assert.deepEqual([...port.methods], []);
  assert.equal(await port.accessToken(), null);
  await assert.rejects(() => port.signIn({ method: 'email', email: EMAIL, code: '1' }));
});
