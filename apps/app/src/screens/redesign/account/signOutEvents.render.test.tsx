// The account events at the account screens' sign-outs (1D-T14, R125): the
// real credential provider on 1C's fake server, the app's own
// signOutOfThisDevice, 1D-T1's recorder answering yes, and the real
// AnalyticsUpkeep following the session, as the root layout mounts it.
// Settings' Sign out sends signed_out under the account signing out. Settings'
// sign out everywhere and Privacy's Done after an accepted deletion send none,
// and the next account's yes then sends only its own sign-up: nothing was held
// for it.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', async () => ({ ...(await import('@mobile/dev/catalogue/routerTestStub')), useSegments: () => ['settings'] }));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
// GET /v1/me names the provider's account, as the server does. The recorder's controller is installed first, so the app's analytics server is never made.
const me = vi.hoisted(() => ({ account: (): string | null => null }));
vi.mock('@mobile/api/sharedV1', () => ({
  v1ClientVersion: () => null,
  getSharedV1Resources: () => { throw new Error('These screens never read the real API in a test.'); },
  getSharedAnalyticsServer: () => { throw new Error('The recorder answers for the analytics server here.'); },
  fetchAccountId: async () => {
    const account = me.account();
    if (account === null) throw new Error('no session');
    return account;
  },
}));

import { AnalyticsUpkeep } from '@mobile/analytics/AnalyticsUpkeep';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { createBetterAuthPort } from '@mobile/auth/betterAuthPort';
import { createCredentialProvider } from '@mobile/auth/credentialProvider';
import type { CredentialProvider, SignInResult } from '@mobile/auth/credentialProvider';
import { installCredentialProvider } from '@mobile/auth/session';
import type { SessionRecordStore, StoredSession } from '@mobile/auth/sessionStore';
import { createFakeAuthServer } from '@mobile/auth/testing/fakeAuthServer';
import { fakeAccount, fakePrivacy } from '@mobile/dev/catalogue/account/settingsSections';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { NOW, mountScreen } from '../HistoryTestHarness';
import { PrivacyScreen } from './PrivacyScreen';
import { signOutOfThisDevice } from './SettingsParts';
import { SettingsScreen } from './SettingsScreen';

const A = 'kan@example.test';
const B = 'b@example.test';
// AnalyticsUpkeep keeps the language in every event's common properties.
const SIGNED_UP = ['signed_up', { method: 'email', language: 'en', origin: 'app' }];

let end: () => void = () => undefined;
beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  end();
  end = () => undefined;
  vi.unstubAllEnvs();
});

function memorySessions(): SessionRecordStore {
  let value: StoredSession | null = null;
  return {
    async load() { return value; },
    async save(next) { value = next; },
    async clear() { value = null; },
  };
}

/** What reached the recorder's client, in order: a capture as its name and properties, anything else as its kind. */
const trail = (sent: readonly Recorded[]) => sent.map((item) => (item.kind === 'capture' ? [item.name, item.properties] : item.kind));
const captures = (sent: readonly Recorded[]) => trail(sent).filter((item) => Array.isArray(item));
const kinds = (sent: readonly Recorded[]) => sent.map((item) => item.kind);

type Run = { recorder: Awaited<ReturnType<typeof recordAnalytics>>; provider: CredentialProvider; signIn(email: string): Promise<SignInResult> };

/** A, signed in by email on 1C's fake server, in the app's installed provider, with 1D-T1's recorder answering yes. */
async function signedIn(): Promise<Run> {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'account');
  const recorder = await recordAnalytics({ consent: 'yes' });
  const server = createFakeAuthServer();
  const port = createBetterAuthPort({ client: server.client, native: server.native({}) });
  const provider = createCredentialProvider({ port, sessions: memorySessions() });
  installCredentialProvider(provider);
  me.account = () => provider.getSessionSnapshot().accountId;
  end = () => {
    installCredentialProvider(null);
    me.account = () => null;
    recorder.restore();
  };
  const signIn = async (email: string) => {
    await port.sendEmailCode(email);
    return provider.signIn({ method: 'email', email, code: server.codeFor(email) });
  };
  expect((await signIn(A)).outcome).toBe('active');
  return { recorder, provider, signIn };
}

/** The screen with AnalyticsUpkeep beside it; resolves once the follower has named A and A's yes is in force, with `sent` emptied. */
async function mount(run: Run, element: ReactElement) {
  await act(async () => {
    mountScreen(<><AnalyticsUpkeep />{element}</>, { resources: createFakeResources().resources, diary: null, locale: 'en', mode: 'light' });
  });
  await waitFor(() => expect(kinds(run.recorder.sent)).toContain('identify'));
  run.recorder.sent.length = 0;
}

/** B signs in after the sign-out; resolves once the follower has named B and B's yes is in force. */
async function nextAccount(run: Run) {
  await act(async () => { expect((await run.signIn(B)).outcome).toBe('active'); });
  await waitFor(() => expect(kinds(run.recorder.sent)).toContain('identify'));
}

test("Settings' Sign out sends signed_out under the account signing out, before the identity is reset", async () => {
  const run = await signedIn();
  await mount(run, <SettingsScreen services={{ ...fakeAccount().services, signOut: signOutOfThisDevice }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Sign out?' })).getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(run.provider.getSessionSnapshot().state).toBe('signed_out'));
  expect(trail(run.recorder.sent)).toEqual([['signed_out', { method: 'email', language: 'en', origin: 'app' }], 'reset']);
});

test("Settings' sign out everywhere sends no signed_out, and the next account's yes sends only its own sign-up (R125)", async () => {
  const run = await signedIn();
  const account = fakeAccount();
  await mount(run, <SettingsScreen services={{ ...account.services, signOut: signOutOfThisDevice }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Sign out everywhere?' })).getByRole('button', { name: 'Sign out everywhere' }));
  await waitFor(() => expect(run.provider.getSessionSnapshot().state).toBe('signed_out'));
  expect(account.calls.globalLogouts).toBe(1);
  await nextAccount(run);
  expect(captures(run.recorder.sent)).toEqual([SIGNED_UP]);
});

test("Privacy's Done after an accepted deletion sends no signed_out, and the next account's yes sends only its own sign-up (R125)", async () => {
  const run = await signedIn();
  const privacy = fakePrivacy();
  await mount(run, <PrivacyScreen services={{ ...privacy.services, signOut: signOutOfThisDevice }} now={NOW} analyticsArea={false} />);
  const card = screen.getByTestId('privacy-delete');
  fireEvent.click(within(card).getByRole('button', { name: 'Delete my account' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete your account?' })).getByRole('button', { name: 'Delete my account' }));
  expect(await within(card).findByText('Your account is being deleted')).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(run.provider.getSessionSnapshot().state).toBe('signed_out'));
  await nextAccount(run);
  expect(captures(run.recorder.sent)).toEqual([SIGNED_UP]);
});
