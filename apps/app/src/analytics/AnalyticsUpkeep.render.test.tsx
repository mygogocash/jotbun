// AnalyticsUpkeep (plan 1D-T6): screens as route patterns, the account followed
// through the session, the answer read again at every foreground, and the
// language and the AI switch kept in every event's common properties.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { AppState, Text } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { createAnalytics } from '@mobile/analytics/controller';
import type { PostHogLike, ServerConsent, StoredConsent } from '@mobile/analytics/controller';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { setSession } from '@mobile/auth/session';
import { AiCompanionProvider, useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';

const route = vi.hoisted(() => ({ segments: [] as string[], pathname: '/' }));
vi.mock('expo-router', () => ({ useSegments: () => route.segments, usePathname: () => route.pathname }));
// The account /v1/me answers: a value, or a read the test holds and settles itself.
const me = vi.hoisted(() => ({ accountId: '', reads: 0, held: null as null | { resolve: (id: string) => void; reject: (error: Error) => void } }));
vi.mock('@mobile/api/sharedV1', () => ({
  fetchAccountId: () => {
    me.reads += 1;
    if (me.held === null) return Promise.resolve(me.accountId);
    return new Promise<string>((resolve, reject) => { me.held = { resolve, reject }; });
  },
  getSharedAnalyticsServer: () => { throw new Error('no server in this test'); },
  v1ClientVersion: () => null,
}));

import { AnalyticsUpkeep } from './AnalyticsUpkeep';

const ACCOUNT_A = '00000000-0000-4000-8000-0000000000aa';
const ACCOUNT_B = '00000000-0000-4000-8000-0000000000bb';
const signIn = (userId: string) => setSession({ access_token: `token-${userId}`, userId, binding: `session-of-${userId}` });

const foreground = vi.hoisted(() => ({ listeners: [] as Array<(state: AppStateStatus) => void> }));
const comeToForeground = () => { for (const listener of [...foreground.listeners]) listener('active'); };

let restore: () => void = () => undefined;
beforeEach(() => {
  route.segments = ['(tabs)', 'home'];
  route.pathname = '/home';
  me.accountId = ACCOUNT_A;
  me.reads = 0;
  me.held = null;
  foreground.listeners = [];
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: AppStateStatus) => void) => {
    foreground.listeners.push(listener);
    return { remove: () => { foreground.listeners = foreground.listeners.filter((item) => item !== listener); } };
  }) as unknown as typeof AppState.addEventListener);
  // Unless a case says otherwise, the session was restored before the app drew anything.
  signIn(ACCOUNT_A);
});
afterEach(() => {
  cleanup();
  restore();
  restore = () => undefined;
  setSession(null);
  vi.restoreAllMocks();
});

async function recorder() {
  const recording = await recordAnalytics();
  restore = recording.restore;
  return recording;
}

const upkeep = () => render(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);

test('screens are sent as route patterns', async () => {
  const { sent } = await recorder();
  route.segments = ['spend', 'record', '[id]'];
  route.pathname = '/spend/record/0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11';
  const view = upkeep();
  await waitFor(() => expect(me.reads).toBe(1));
  await waitFor(() => expect(sent.filter((item) => item.kind === 'screen').map((item) => item.name)).toEqual(['/spend/record/[id]']));
  expect(sent[0]?.properties).toMatchObject({ language: 'th', origin: 'app' });
  // The same route drawn again is not a new screen; a group segment is dropped.
  view.rerender(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  route.segments = ['(tabs)', 'home'];
  view.rerender(<IntlProvider locale="th" messages={{}}><AnalyticsUpkeep /></IntlProvider>);
  await waitFor(() => expect(sent.filter((item) => item.kind === 'screen').map((item) => item.name)).toEqual(['/spend/record/[id]', '/home']));
  // The set at start found the account already signed in, so nothing else was sent.
  expect(sent.map((item) => item.kind)).toEqual(['screen', 'screen']);
});

test('a sign-out resets identity', async () => {
  const { analytics, sent } = await recorder();
  upkeep();
  await waitFor(() => expect(me.reads).toBe(1));
  const mark = sent.length;
  act(() => { setSession(null); });
  await waitFor(() => expect(analytics.status()).toBe('signed_out'));
  expect(sent.slice(mark).filter((item) => item.kind !== 'screen').map((item) => item.kind)).toEqual(['reset']);
});

test('a session already restored at start sets the account', async () => {
  const { analytics, sent } = await recorder();
  me.accountId = ACCOUNT_B;
  upkeep();
  await waitFor(() => expect(sent.filter((item) => item.kind !== 'screen').map((item) => item.kind)).toEqual(['reset', 'identify']));
  expect(me.reads).toBe(1);
  expect(analytics.status()).toBe('yes');
});

test('another session clears the account at once, before the new account is read', async () => {
  const { analytics, sent } = await recorder();
  upkeep();
  await waitFor(() => expect(me.reads).toBe(1));
  expect(analytics.status()).toBe('yes');
  const mark = sent.length;
  me.held = { resolve: () => undefined, reject: () => undefined };
  me.accountId = ACCOUNT_B;
  // A sign-in from the open session: the binding never goes away, the epoch moves.
  act(() => { signIn(ACCOUNT_B); });
  await waitFor(() => expect(me.reads).toBe(2));
  expect(analytics.status()).toBe('signed_out');
  expect(analytics.allowsAnalytics()).toBe(false);
  expect(sent.slice(mark).filter((item) => item.kind !== 'screen').map((item) => item.kind)).toEqual(['reset']);
  await act(async () => { me.held?.resolve(ACCOUNT_B); });
  await waitFor(() => expect(analytics.status()).toBe('yes'));
  expect(sent.slice(mark).filter((item) => item.kind !== 'screen').map((item) => item.kind)).toEqual(['reset', 'reset', 'identify']);
});

test('a failed account read is tried again at the next foreground', async () => {
  const { analytics } = await recorder();
  upkeep();
  await waitFor(() => expect(me.reads).toBe(1));
  me.held = { resolve: () => undefined, reject: () => undefined };
  act(() => { signIn(ACCOUNT_B); });
  await waitFor(() => expect(me.reads).toBe(2));
  await act(async () => { me.held?.reject(new Error('offline')); });
  expect(analytics.status()).toBe('signed_out');
  me.held = null;
  me.accountId = ACCOUNT_B;
  act(() => { comeToForeground(); });
  await waitFor(() => expect(me.reads).toBe(3));
  await waitFor(() => expect(analytics.status()).toBe('yes'));
});

test('coming to the foreground reads the answer again', async () => {
  // In place of recordAnalytics(): a server whose answer another phone can change.
  let remote: ServerConsent = 'yes';
  let stored: StoredConsent | null = null;
  const sent: string[] = [];
  const client: PostHogLike = {
    capture(event) { sent.push(`capture:${event}`); },
    screen(name) { sent.push(`screen:${name}`); },
    identify() { sent.push('identify'); },
    reset() { sent.push('reset'); },
    startSessionRecording() { sent.push('start'); },
    stopSessionRecording() { sent.push('stop'); },
    updateFlags() {},
    getFeatureFlag: () => undefined,
  };
  const analytics = createAnalytics({
    client,
    replay: true,
    store: {
      read: async () => (stored === null ? null : { ...stored }),
      write: async (value) => { stored = { ...value }; },
      erase: async () => { stored = null; },
    },
    server: {
      read: async () => ({ consent: remote, analyticsId: 'a'.repeat(64), weeksSinceSignup: null }),
      setConsent: async (on) => { remote = on ? 'yes' : 'no'; },
    },
  });
  await analytics.setAccount(ACCOUNT_A);
  const previous = getAnalytics();
  setAnalytics(analytics);
  restore = () => setAnalytics(previous);
  sent.length = 0;
  upkeep();
  await waitFor(() => expect(me.reads).toBe(1));
  expect(analytics.status()).toBe('yes');
  remote = 'no';
  act(() => { comeToForeground(); });
  await waitFor(() => expect(analytics.status()).toBe('no'));
  expect(sent.filter((item) => item === 'reset')).toEqual(['reset']);
  analytics.track('trip_started');
  expect(sent.filter((item) => item.startsWith('capture:'))).toEqual([]);
});

function AiSwitch() {
  return <Text testID="ai">{useAiCompanion().enabled ? 'on' : 'off'}</Text>;
}

test('the language and the AI switch reach every event', async () => {
  const { analytics, sent } = await recorder();
  const { resources } = fakeAiResources({}, { companion: true, available: true });
  render(<IntlProvider locale="th" messages={{}}><AiCompanionProvider resources={resources}><AiSwitch /><AnalyticsUpkeep /></AiCompanionProvider></IntlProvider>);
  await waitFor(() => expect(screen.getByTestId('ai').textContent).toBe('on'));
  await waitFor(() => expect(me.reads).toBe(1));
  analytics.track('trip_started');
  expect(sent.filter((item) => item.kind === 'capture').map((item) => item.properties)).toEqual([expect.objectContaining({ language: 'th', ai_enabled: true, origin: 'app' })]);
});
