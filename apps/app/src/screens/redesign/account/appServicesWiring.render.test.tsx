// The app's own wiring of Settings' and Privacy's services (accountServices.ts,
// privacyServices.ts), on a real credential provider over 1C-T5's fake server,
// whose Google native sign-in stands in for 1C-T7's. Nothing else builds them
// for real: AccountRoutes mocks both. Carried from 1C-T6's review (m1), whose
// five mutants each fail here: Privacy skipping the fresh sign-in, reading the
// token and the session id apart, one fixed id for every request, sign out
// everywhere answering without a provider, and signing out the other devices
// instead of every device.
import { afterEach, expect, test, vi } from 'vitest';

// The same stubs as SettingsScreen.render.test.tsx: SettingsParts loads the router and safe areas,
// and the real shared client loads native modules a render test cannot.
vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('@mobile/api/sharedV1', () => ({ v1ClientVersion: () => null }));

import { isUuid } from '@gogospend/contracts';

import { AuthUnavailable, createBetterAuthPort } from '@mobile/auth/betterAuthPort';
import { createCredentialProvider } from '@mobile/auth/credentialProvider';
import { installCredentialProvider } from '@mobile/auth/session';
import type { SessionRecordStore, StoredSession } from '@mobile/auth/sessionStore';
import { createFakeAuthServer } from '@mobile/auth/testing/fakeAuthServer';
import { appAccountServices } from './accountServices';
import { appPrivacyServices } from './privacyServices';

afterEach(() => {
  installCredentialProvider(null);
});

function memorySessions(): SessionRecordStore {
  let value: StoredSession | null = null;
  return {
    async load() { return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

/** A Google account on a build with Google's native sign-in, installed as the app's provider. */
async function googleAccount() {
  const server = createFakeAuthServer();
  const port = createBetterAuthPort({ client: server.client, native: server.native({ google: { sub: 'g-kan', email: 'kan@example.test' } }) });
  const provider = createCredentialProvider({ port, sessions: memorySessions() });
  expect((await provider.signIn({ method: 'google', signUp: true })).outcome).toBe('active');
  installCredentialProvider(provider);
  return { server, provider };
}

const sidOf = (token: string): unknown => JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).sid;

test('with no provider, Privacy offers no fresh sign-in and reads no credentials, and sign out everywhere is unreachable', async () => {
  const privacy = appPrivacyServices();
  expect(privacy.freshSignIn).toBeNull();
  expect(await privacy.credentials()).toBeNull();
  await expect(appAccountServices().sessions.signOutEverywhere()).rejects.toBeInstanceOf(AuthUnavailable);
});

test("Privacy's wiring runs the account's own fresh sign-in, then reads the new session's token and id together, and draws a new id each time", async () => {
  const { server, provider } = await googleAccount();
  const privacy = appPrivacyServices();
  const before = provider.getSessionSnapshot().binding;
  server.calls.length = 0;
  expect(await privacy.freshSignIn?.()).toBe('fresh');
  expect(server.calls).toContain('signInWithIdToken:google:false');
  const after = provider.getSessionSnapshot().binding;
  expect(after).not.toBe(before);
  const read = vi.spyOn(provider, 'requestCredentials');
  const credentials = await privacy.credentials();
  expect(read).toHaveBeenCalledTimes(1);
  expect(credentials?.sessionId).toBe(after);
  expect(sidOf(credentials?.accessToken ?? '')).toBe(after);
  const ids = [privacy.newId(), privacy.newId()];
  expect(ids.every((id) => isUuid(id))).toBe(true);
  expect(ids[0]).not.toBe(ids[1]);
});

test("Settings' wiring signs out everywhere through the provider's port, nothing else", async () => {
  const { server } = await googleAccount();
  server.calls.length = 0;
  await appAccountServices().sessions.signOutEverywhere();
  expect(server.calls).toEqual(['signOutEverywhere']);
});
