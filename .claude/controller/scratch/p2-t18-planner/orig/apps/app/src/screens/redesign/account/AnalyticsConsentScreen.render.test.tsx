// 1D-T8: D34's analytics question, drawn where the app draws it: the spend
// layout, in place of the screens while the `analytics` area is on and the
// account was never asked. One clear yes or no, not pre-ticked; a no is in
// force at once, a yes waits for the server. On 1D-T1's controller over a
// scripted server (`fakeConsent`), installed as the app's.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { Text } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { AccountChangedError } from '@mobile/analytics/controller';
import type { Analytics } from '@mobile/analytics/controller';
import { fakeConsent } from '@mobile/analytics/testing/fakeConsent';
import type { FakeConsentOptions } from '@mobile/analytics/testing/fakeConsent';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { useAnalyticsConsent } from '@mobile/analytics/useAnalyticsConsent';
import type { AnalyticsConsent } from '@mobile/analytics/useAnalyticsConsent';
import type { Locale } from '@mobile/i18n/locales';
import { bunLight } from '@mobile/theme/bunPalette';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import SpendLayout from '../../../../app/spend/_layout';

// The spend layout's own stand-ins, as SpendLayout.render.test.tsx has them: the screens are "current screen".
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text: NativeText } = await import('react-native');
  return {
    Slot: () => createElement(NativeText, null, 'current screen'),
    Redirect: ({ href }: { href: string }) => createElement(NativeText, null, `redirect to ${href}`),
    usePathname: () => '/spend',
    useRouter: () => ({ push: () => undefined, navigate: () => undefined, replace: () => undefined, back: () => undefined }),
  };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));
vi.mock('@mobile/auth/useAuthGuardSession', () => ({ useAuthGuardSession: () => ({ isAuthed: true, ready: true }) }));
vi.mock('@mobile/spend/v1/DeviceDiaryProvider', async () => {
  const { createElement } = await import('react');
  const { View } = await import('react-native');
  return { DeviceDiaryProvider: ({ children }: { children: unknown }) => createElement(View, { testID: 'device-diary' }, children as never) };
});
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedV1Resources: () => ({}),
  // The layout gives the screens Bun's AI help; here it never answers, so it stays off.
  getSharedAiResources: () => new Proxy({}, { get: () => () => new Promise(() => undefined) }),
}));

const YES = "Yes, I'll help";
const NO = 'No, thanks';
const NOT_SAVED = "Couldn't save your answer. Check your connection and try again.";

let restore: () => void = () => undefined;
beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'analytics');
});
afterEach(() => {
  cleanup();
  restore();
  restore = () => undefined;
  vi.unstubAllEnvs();
});

/** Installs `analytics` as the app's controller until the test ends. */
function install(analytics: Analytics | null) {
  const previous = getAnalytics();
  setAnalytics(analytics);
  restore = () => setAnalytics(previous);
}

/** A signed-in account its server answers for as `options` say, installed. */
async function consentOf(options: FakeConsentOptions = {}) {
  const fake = fakeConsent(options);
  await fake.signIn();
  install(fake.analytics);
  return fake;
}

function mount(ui: ReactElement, locale: Locale = 'en') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference="light">{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}

const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));
const question = () => screen.queryByRole('heading', { name: 'Help improve Jotbun' });
const button = (name: string) => screen.getByRole('button', { name });
/** Lets every promise step that is ready run. */
const flush = () => act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });

test('neither answer is chosen before the person taps', async () => {
  const fake = await consentOf();
  mount(<SpendLayout />);
  expect(question()).toBeTruthy();
  expect(screen.queryByText('current screen')).toBeNull();
  const [yes, no] = [button(YES), button(NO)];
  // Two outlines of the same weight and size: neither is the ink main button, neither is busy or marked.
  for (const answer of [yes, no]) {
    expect(answer.style.backgroundColor).not.toEqual(rgb(bunLight.ink));
    expect(answer.getAttribute('aria-busy')).toBe('false');
    expect(answer.getAttribute('aria-disabled')).not.toBe('true');
    expect(answer.getAttribute('aria-pressed')).toBeNull();
  }
  expect([yes.style.backgroundColor, yes.style.borderWidth, yes.style.minHeight]).toEqual([no.style.backgroundColor, no.style.borderWidth, no.style.minHeight]);
  // Nothing is answered for the person.
  await flush();
  expect(fake.answers).toEqual([]);
  expect(fake.analytics.status()).toBe('unanswered');
});

test('no applies at once and leaves the question', async () => {
  const fake = await consentOf({ send: 'held' });
  mount(<SpendLayout />);
  fireEvent.click(button(NO));
  // In force at the call: the screens are back while the server has not answered.
  expect(screen.getByText('current screen')).toBeTruthy();
  expect(question()).toBeNull();
  expect(fake.analytics.status()).toBe('no');
  await waitFor(() => expect(fake.answers).toEqual([false]));
  act(() => { fake.settle('lands'); });
  await flush();
  expect(fake.server.consent).toBe('no');
  // The step tracked while the question showed was held, and the no dropped it.
  expect(fake.captured).toEqual([]);
});

test('yes waits for the server and stays with a calm line when it fails', async () => {
  const fake = await consentOf({ send: 'held' });
  mount(<SpendLayout />);
  // Two presses before the screen draws again send one yes.
  act(() => {
    fireEvent.click(button(YES));
    fireEvent.click(button(YES));
  });
  await waitFor(() => expect(fake.answers).toEqual([true]));
  await flush();
  // Waiting: still the question, Yes busy, No still open.
  expect(question()).toBeTruthy();
  expect(button(YES).getAttribute('aria-busy')).toBe('true');
  expect(button(NO).getAttribute('aria-disabled')).not.toBe('true');
  expect(screen.queryByText(NOT_SAVED)).toBeNull();
  act(() => { fake.settle('fails'); });
  // A calm line and both buttons; nothing changed and nothing was sent.
  expect(await screen.findByText(NOT_SAVED)).toBeTruthy();
  expect(button(YES).getAttribute('aria-busy')).toBe('false');
  expect(button(NO).getAttribute('aria-disabled')).not.toBe('true');
  expect(fake.analytics.status()).toBe('unanswered');
  expect(fake.captured).toEqual([]);
  // Yes again, and the server takes it: the layout leaves, and the step held since the question showed is sent, once.
  fake.server.send = 'lands';
  fireEvent.click(button(YES));
  await waitFor(() => expect(screen.getByText('current screen')).toBeTruthy());
  expect(fake.answers).toEqual([true, true]);
  expect(fake.analytics.status()).toBe('yes');
  expect(fake.captured.map(({ name, properties }) => [name, properties.step])).toEqual([['onboarding_step_viewed', 'analytics_consent']]);
});

test('every refusal is caught: a yes refused because the account changed asks again, with no line', async () => {
  const fake = await consentOf();
  const asked: string[] = [];
  // The controller's refusals (1D-T6): a yes once another account has signed in, and a no this phone could not store.
  install({
    ...fake.analytics,
    answer: async (value) => {
      asked.push(value);
      throw value === 'yes' ? new AccountChangedError() : new Error('The store is unavailable');
    },
  });
  mount(<SpendLayout />);
  fireEvent.click(button(YES));
  await waitFor(() => expect(asked).toEqual(['yes']));
  await flush();
  expect(question()).toBeTruthy();
  expect(screen.queryByText(NOT_SAVED)).toBeNull();
  expect(button(YES).getAttribute('aria-busy')).toBe('false');
  // A refused no is caught as well: the controller keeps it in force.
  fireEvent.click(button(NO));
  await waitFor(() => expect(asked).toEqual(['yes', 'no']));
  await flush();
  expect(screen.queryByText(NOT_SAVED)).toBeNull();
});

test('the screen names what is never sent', async () => {
  await consentOf();
  mount(<SpendLayout />);
  expect(screen.getByText('We never send amounts, shop or wallet names, notes, your email or slip photos.')).toBeTruthy();
  expect(screen.getByText('This includes screen recordings with every word and picture hidden, and an occasional short survey.')).toBeTruthy();
  cleanup();
  mount(<SpendLayout />, 'th');
  expect(screen.getByRole('heading', { name: 'ช่วยพัฒนา Jotbun' })).toBeTruthy();
  expect(screen.getByText('เราไม่เคยส่งยอดเงิน ชื่อร้าน ชื่อกระเป๋า โน้ต อีเมล หรือรูปสลิป')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ได้ ช่วยเลย' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ไม่ ขอบคุณ' })).toBeTruthy();
});

let latest: AnalyticsConsent | null = null;
function Probe() {
  latest = useAnalyticsConsent();
  return <Text testID="consent">{`${latest.status} ${String(latest.installed)}`}</Text>;
}

test('useAnalyticsConsent says whether analytics is installed', async () => {
  install(null);
  const view = mount(<Probe />);
  expect(screen.getByTestId('consent').textContent).toBe('signed_out false');
  await expect(latest?.answer('yes')).rejects.toThrow();
  const recorded = await recordAnalytics({ consent: 'unasked' });
  const previous = restore;
  restore = () => { recorded.restore(); previous(); };
  // Read at each render: the next one sees the controller.
  view.rerender(<IntlProvider locale="en"><ThemeProvider><ThemePreferenceOverride preference="light"><Probe /></ThemePreferenceOverride></ThemeProvider></IntlProvider>);
  expect(screen.getByTestId('consent').textContent).toBe('unanswered true');
  // Then it follows the controller's answer.
  await act(async () => { await latest?.answer('yes'); });
  expect(screen.getByTestId('consent').textContent).toBe('yes true');
  expect(recorded.analytics.status()).toBe('yes');
});
