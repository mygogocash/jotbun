import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AuthRefused, AuthUnavailable, createBetterAuthPort } from './betterAuthPort.ts';
import type { RefusalCode } from './betterAuthPort.ts';
import { createCredentialProvider } from './credentialProvider.ts';
import type { FreshOutcome } from './credentialProvider.ts';
import { FRESH_SIGN_IN_FAILED, requestGlobalLogout, submitGlobalLogout } from './globalLogout.ts';
import type { GlobalLogoutResources } from './globalLogout.ts';
import type { SessionRecordStore, StoredSession } from './sessionStore.ts';
import { createFakeAuthServer } from './testing/fakeAuthServer.ts';

const EMAIL = 'kan@example.test';
const PENDING = { kind: 'sign_out_everywhere' } as const;

type Answer = 'ok' | 'unavailable' | RefusalCode;

/** The port's sign-out everywhere as a script: one answer per call (the last repeats), each call logged. */
function scripted(answers: readonly Answer[], log: string[] = []) {
  let calls = 0;
  const resources: GlobalLogoutResources = {
    async signOutEverywhere() {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      log.push('signOutEverywhere');
      if (answer === 'unavailable') throw new AuthUnavailable();
      if (answer !== 'ok') throw new AuthRefused(answer);
    },
  };
  return { resources, log, calls: () => calls };
}

/** A fresh sign-in that answers `outcome` and logs that it was asked. */
const fresh = (outcome: FreshOutcome, log: string[]) => async (): Promise<FreshOutcome> => {
  log.push('freshSignIn');
  return outcome;
};

function memorySessions(): SessionRecordStore {
  let value: StoredSession | null = null;
  return {
    async load() { return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

test('accepted: one fresh sign-in, then one sign-out-everywhere call; every session is now gone', async () => {
  const server = createFakeAuthServer();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const provider = createCredentialProvider({ port, sessions: memorySessions() });
  await port.sendEmailCode(EMAIL);
  assert.equal((await provider.signIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) })).outcome, 'active');
  const before = provider.getSessionSnapshot().binding;
  server.calls.length = 0;
  const state = await requestGlobalLogout({
    resources: { signOutEverywhere: () => port.signOutEverywhere() },
    freshSignIn: () => provider.freshSignIn({ method: 'email', email: EMAIL, code: server.codeFor(EMAIL) }),
  });
  assert.deepEqual(state, { state: 'signed_out' });
  // The fresh sign-in (its new session, the old one signed out), then exactly one request, sent on the new session.
  assert.deepEqual(server.calls.filter((call) => call !== 'token'), [`signInWithCode:${EMAIL}`, `signOutDevice:${before}`, 'signOutEverywhere']);
  assert.notEqual(provider.getSessionSnapshot().binding, before);
});

test('the person cancels the fresh sign-in: nothing is sent', async () => {
  const fake = scripted(['ok']);
  assert.deepEqual(await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh('cancelled', fake.log) }), { state: 'cancelled' });
  assert.deepEqual(fake.log, ['freshSignIn']);
});

test('a fresh sign-in that fails sends nothing', async () => {
  assert.equal(FRESH_SIGN_IN_FAILED, 'FRESH_SIGN_IN_FAILED');
  for (const outcome of ['failed', 'unavailable', 'not_configured', 'other_account', 'wrong_code', 'rate_limited'] as const) {
    const fake = scripted(['ok']);
    assert.deepEqual(await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh(outcome, fake.log) }), { state: 'refused', code: FRESH_SIGN_IN_FAILED }, outcome);
    assert.deepEqual(fake.log, ['freshSignIn'], outcome);
  }
});

test('a lost answer resent meets SIGNED_OUT because the first one landed: that is signed out', async () => {
  const fake = scripted(['unavailable', 'SIGNED_OUT']);
  const first = await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh('fresh', fake.log) });
  assert.deepEqual(first, { state: 'unconfirmed', request: PENDING });
  if (first.state !== 'unconfirmed') return;
  assert.deepEqual(await submitGlobalLogout(first.request, { resources: fake.resources }), { state: 'signed_out' });
  assert.deepEqual(fake.log, ['freshSignIn', 'signOutEverywhere', 'signOutEverywhere']);
});

test('Jotbun cannot be reached: still signed in here, and Try again resends with no new sign-in', async () => {
  const fake = scripted(['unavailable', 'RATE_LIMITED', 'ok']);
  const first = await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh('fresh', fake.log) });
  assert.deepEqual(first, { state: 'unconfirmed', request: PENDING });
  if (first.state !== 'unconfirmed') return;
  // A rate limit is not an answer either: the same request stays to resend.
  assert.deepEqual(await submitGlobalLogout(first.request, { resources: fake.resources }), { state: 'unconfirmed', request: PENDING });
  assert.deepEqual(await submitGlobalLogout(first.request, { resources: fake.resources }), { state: 'signed_out' });
  assert.deepEqual(fake.log, ['freshSignIn', 'signOutEverywhere', 'signOutEverywhere', 'signOutEverywhere']);
});

test('a stale sign-in is reauth_required and changes nothing', async () => {
  const fake = scripted(['REAUTH_REQUIRED']);
  assert.deepEqual(await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh('fresh', fake.log) }), { state: 'reauth_required' });
  assert.equal(fake.calls(), 1);
});

test('any other refusal changes nothing and says which', async () => {
  for (const code of ['REFUSED', 'ACCOUNT_UNAVAILABLE', 'CODE_LIMIT'] as const) {
    const fake = scripted([code]);
    assert.deepEqual(await requestGlobalLogout({ resources: fake.resources, freshSignIn: fresh('fresh', fake.log) }), { state: 'refused', code }, code);
  }
  // Anything that is not the port's answer is not swallowed.
  const broken: GlobalLogoutResources = { signOutEverywhere: async () => { throw new TypeError('not the port'); } };
  await assert.rejects(submitGlobalLogout(PENDING, { resources: broken }), TypeError);
});
