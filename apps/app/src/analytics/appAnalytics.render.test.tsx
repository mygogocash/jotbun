// The app's install (1D-T6) takes what was tracked before it (1D-T7, from
// 1D-T6's review m3): on a phone with a project key the install waits for
// PostHog's module, so onboarding's first step can come first. Its controller
// then holds that event like any other, and sends it only after a yes. The
// fix round (R119) runs the same path through AnalyticsUpkeep, which tells the
// controller who is signed in: on a first launch, no one yet. The second fix
// round (R120) adds a session whose account was never read, offline, that ends
// by a sign-out or by another session in its place: what it held is dropped,
// so the next account's yes never sends it.
import { cleanup, render, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

type Captured = { name: string; properties: Record<string, unknown> };
const posthog = vi.hoisted(() => ({ captured: [] as Captured[] }));
vi.mock('./posthogClient', () => ({
  createPostHogClient: () => ({
    capture: (name: string, properties?: Record<string, unknown>) => { posthog.captured.push({ name, properties: properties ?? {} }); },
    screen: () => undefined,
    identify: () => undefined,
    reset: () => undefined,
    startSessionRecording: () => undefined,
    stopSessionRecording: () => undefined,
  }),
}));
const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secure.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secure.values.set(key, value); },
  deleteItemAsync: async (key: string) => { secure.values.delete(key); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));
// The server answers yes for the signed-in account, and /v1/me names it. Offline, both fail.
const net = vi.hoisted(() => ({ online: true, account: '00000000-0000-4000-8000-0000000000aa', accountReads: 0 }));
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedAnalyticsServer: () => ({
    read: async () => {
      if (!net.online) throw new Error('offline');
      return { consent: 'yes', analyticsId: 'a'.repeat(64), weeksSinceSignup: 2 };
    },
    setConsent: async () => undefined,
  }),
  fetchAccountId: async () => {
    net.accountReads += 1;
    if (!net.online) throw new Error('offline');
    return net.account;
  },
  v1ClientVersion: () => null,
}));
vi.mock('expo-router', () => ({ useSegments: () => ['onboarding'] }));

import { setSession } from '@mobile/auth/session';
import { AnalyticsUpkeep } from './AnalyticsUpkeep';
import { installAppAnalytics } from './appAnalytics';
import { getAnalytics, setAnalytics, takeEarlyEvents } from './bus';
import { ANALYTICS_CONSENT_KEY } from './consentStorage';
import { trackOnboardingStepViewed, trackRecordSaved } from './events';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const ACCOUNT_B = '00000000-0000-4000-8000-0000000000bb';
const os = Platform.OS;

afterEach(() => {
  cleanup();
  setSession(null);
  vi.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.unstubAllEnvs();
  setAnalytics(null);
  posthog.captured.length = 0;
  secure.values.clear();
  net.online = true;
  net.account = ACCOUNT;
  net.accountReads = 0;
});

/** A phone with a project key, before the install; AppState's listener is a stand-in. */
function phoneWithKey() {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, _listener: (state: AppStateStatus) => void) => ({ remove: () => undefined })) as unknown as typeof AppState.addEventListener);
  setAnalytics(null);
  takeEarlyEvents();
}

const steps = () => posthog.captured.filter((event) => event.name === 'onboarding_step_viewed').map((event) => event.properties.step);

test("an event tracked before the app's controller installs is held by it, and sent only after a yes", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  setAnalytics(null);
  takeEarlyEvents();
  trackOnboardingStepViewed({ step: 'coffee' });
  const analytics = await installAppAnalytics();
  expect(getAnalytics()).toBe(analytics);
  expect(takeEarlyEvents()).toEqual([]);
  // No account yet: held, not sent.
  expect(posthog.captured).toEqual([]);
  await analytics.setAccount(ACCOUNT);
  expect(posthog.captured.map((event) => event.name)).toEqual(['onboarding_step_viewed']);
  expect(posthog.captured[0]?.properties).toMatchObject({ step: 'coffee', origin: 'app' });
});

test('a signed-out first launch keeps the step tracked before the install, and sends it after the sign-in and a yes', async () => {
  phoneWithKey();
  setSession(null);
  // Onboarding's first step, while the install still waits for PostHog's module.
  trackOnboardingStepViewed({ step: 'coffee' });
  render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  await waitFor(() => expect(getAnalytics()?.status()).toBe('signed_out'));
  // The next steps, while no one is signed in.
  trackOnboardingStepViewed({ step: 'private' });
  trackOnboardingStepViewed({ step: 'first_coffee' });
  expect(posthog.captured).toEqual([]);
  // The story ends at sign-in, and the account's answer on the server is yes.
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  await waitFor(() => expect(getAnalytics()?.status()).toBe('yes'));
  expect(steps()).toEqual(['coffee', 'private', 'first_coffee']);
});

test('with a session already restored at launch, the step tracked before the install is sent after the yes', async () => {
  phoneWithKey();
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  trackOnboardingStepViewed({ step: 'coffee' });
  render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  await waitFor(() => expect(getAnalytics()?.status()).toBe('yes'));
  expect(steps()).toEqual(['coffee']);
});

// R120: A's session, offline, so A's account is never read. A said no on this phone earlier.
// A saves, signs out, and B signs in online; B's answer on the server is yes.
const saveOffline = () => trackRecordSaved({ kind: 'expense', source: 'typed', categoryKey: 'food', offline: true, secondsToSave: 12 });
const names = () => posthog.captured.map((event) => event.name);
const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

test("U1: A's session restored at launch, A's account unread offline; A saves and signs out, and B's yes does not send A's save", async () => {
  phoneWithKey();
  secure.values.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ accountId: ACCOUNT, answer: 'no', pendingServer: false }));
  net.online = false;
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  // AnalyticsUpkeep has seen A's session and tried to read A's account.
  await waitFor(() => expect(net.accountReads).toBe(1));
  await flush();
  expect(getAnalytics()?.status()).toBe('loading');
  saveOffline();
  setSession(null);
  await waitFor(() => expect(getAnalytics()?.status()).toBe('signed_out'));
  net.online = true;
  net.account = ACCOUNT_B;
  setSession({ access_token: 'token-b', userId: ACCOUNT_B, binding: 'session-b' });
  await waitFor(() => expect(getAnalytics()?.status()).toBe('yes'));
  expect(names()).toEqual([]);
});

test("U2: a signed-out launch, then A's session with A's account unread offline; A saves and signs out, and B's yes does not send A's save", async () => {
  phoneWithKey();
  secure.values.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ accountId: ACCOUNT, answer: 'no', pendingServer: false }));
  net.online = false;
  setSession(null);
  render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  await waitFor(() => expect(getAnalytics()?.status()).toBe('signed_out'));
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  await waitFor(() => expect(net.accountReads).toBe(1));
  await flush();
  expect(getAnalytics()?.status()).toBe('signed_out');
  saveOffline();
  setSession(null);
  await flush();
  net.online = true;
  net.account = ACCOUNT_B;
  setSession({ access_token: 'token-b', userId: ACCOUNT_B, binding: 'session-b' });
  await waitFor(() => expect(getAnalytics()?.status()).toBe('yes'));
  expect(names()).toEqual([]);
});

test("U3: A's session restored at launch, A's account unread offline; A saves, and B signs in in its place: B's yes does not send A's save", async () => {
  phoneWithKey();
  secure.values.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ accountId: ACCOUNT, answer: 'no', pendingServer: false }));
  net.online = false;
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  await waitFor(() => expect(net.accountReads).toBe(1));
  await flush();
  expect(getAnalytics()?.status()).toBe('loading');
  saveOffline();
  // A sign-in beside a session replaces it with no null between (sessionMachine's bootstrapped from active).
  net.online = true;
  net.account = ACCOUNT_B;
  setSession({ access_token: 'token-b', userId: ACCOUNT_B, binding: 'session-b' });
  await waitFor(() => expect(getAnalytics()?.status()).toBe('yes'));
  expect(names()).toEqual([]);
});
