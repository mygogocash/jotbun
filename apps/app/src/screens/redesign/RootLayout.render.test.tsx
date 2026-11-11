// The root stack (redesign R8, reduced motion): moving between screens slides,
// except when the person has asked for less motion, when it cross-fades
// instead, as Apple's guidance says. The stack keeps its header hidden.
//
// The app's language (R6): the choice from Settings, else the phone's,
// applied to every screen at once through the root's IntlProvider, with the
// UI font and the local reminders following it.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import RootLayout from '../../../app/_layout';
import { installAppAuth } from '@mobile/auth/appAuth';
import { getCredentialProvider } from '@mobile/auth/session';
import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';

vi.mock('expo-router', async () => {
  const { Fragment, createElement } = await import('react');
  const { Pressable, Text } = await import('react-native');
  const { useActiveLocale } = await import('@mobile/i18n/useCopy');
  const { useLanguage } = await import('@mobile/i18n/LanguageProvider');
  // A screen in the stack: the language it renders in, and a way to choose another (as Settings does).
  function Screen() {
    const { setPreference } = useLanguage();
    return createElement(Fragment, null,
      createElement(Text, { testID: 'screen-locale' }, useActiveLocale()),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'choose en', onPress: () => setPreference('en') }));
  }
  return {
    // AnalyticsUpkeep sends the route pattern (1D-T6).
    useSegments: () => [],
    Stack: ({ screenOptions }: { screenOptions: unknown }) => createElement(Fragment, null, createElement(Text, { testID: 'stack' }, JSON.stringify(screenOptions)), createElement(Screen)),
  };
});
vi.mock('expo-font', () => ({ useFonts: () => [true, null] }));
vi.mock('@mobile/theme/appFonts', () => ({ spendRuntimeFonts: {} }));
const phone = vi.hoisted(() => ({ locale: 'en' as 'en' | 'th' | 'vi' }));
vi.mock('@mobile/i18n/deviceLocale', () => ({ deviceLocale: () => phone.locale }));
const upkeep = vi.hoisted(() => ({ locales: [] as string[] }));
vi.mock('@mobile/notifications/useReminderUpkeep', () => ({ useReminderUpkeep: (locale: string) => { upkeep.locales.push(locale); } }));
const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secure.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secure.values.set(key, value); },
  deleteItemAsync: async (key: string) => { secure.values.delete(key); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));
vi.mock('react-native-safe-area-context', async () => {
  const { Fragment, createElement } = await import('react');
  return { SafeAreaProvider: ({ children }: { children: unknown }) => createElement(Fragment, null, children as never) };
});
// The real wallet root, marked so a test can see what it wraps (P2-T2).
vi.mock('@mobile/wallet/WalletRoot', async (importOriginal) => {
  const real = await importOriginal<typeof import('@mobile/wallet/WalletRoot')>();
  const { createElement } = await import('react');
  const { View } = await import('react-native');
  return { WalletRoot: ({ children }: { children: unknown }) => createElement(View, { testID: 'wallet-root' }, createElement(real.WalletRoot, null, children as never)) };
});

import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '@mobile/i18n/languagePreferenceStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY, getUiFontFamily, syncUiFontFamily } from '@mobile/theme/uiFontFamily';

beforeAll(() => { installBrowserStorage(); });
const os = Platform.OS;
beforeEach(() => {
  phone.locale = 'en';
  upkeep.locales = [];
  secure.values.clear();
});
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
  window.localStorage.clear();
  syncUiFontFamily('en');
});

const options = () => JSON.parse(screen.getByTestId('stack').textContent ?? '{}') as Record<string, unknown>;

test('screens slide in by default, with no header', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<RootLayout />);
  await waitFor(() => expect(options()).toEqual({ headerShown: false, animation: 'default' }));
});

test('under reduced motion, screens cross-fade instead of sliding', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  render(<RootLayout />);
  await waitFor(() => expect(options()).toEqual({ headerShown: false, animation: 'fade' }));
});

test('with no choice the app speaks the phone\'s language, Vietnamese included', async () => {
  phone.locale = 'vi';
  render(<RootLayout />);
  expect(await screen.findByText('vi')).toBeTruthy();
  expect(screen.getByTestId('screen-locale').textContent).toBe('vi');
  expect(upkeep.locales.at(-1)).toBe('vi');
});

test('the saved choice wins over the phone, and a new one applies to the open screens, the font and the reminders at once', async () => {
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  render(<RootLayout />);
  await waitFor(() => expect(screen.getByTestId('screen-locale').textContent).toBe('th'));
  expect(upkeep.locales).not.toContain('en');
  await waitFor(() => expect(getUiFontFamily()).toBe(THAI_UI_FONT_FAMILY));
  expect(upkeep.locales.at(-1)).toBe('th');
  fireEvent.click(screen.getByRole('button', { name: 'choose en' }));
  await waitFor(() => expect(screen.getByTestId('screen-locale').textContent).toBe('en'));
  await waitFor(() => expect(getUiFontFamily()).toBe(LATIN_UI_FONT_FAMILY));
  expect(upkeep.locales.at(-1)).toBe('en');
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
});

test("on native nothing starts before the saved language is read: no screen and no reminder in the phone's language first", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  secure.values.set(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  render(<RootLayout />);
  expect(screen.getByLabelText('Loading Jotbun')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('screen-locale').textContent).toBe('th'));
  expect(new Set(upkeep.locales)).toEqual(new Set(['th']));
});

test("the root installs the app's sign-in once, before any screen reads the session", () => {
  const provider = getCredentialProvider();
  expect(provider).not.toBeNull();
  expect(installAppAuth()).toBe(provider);
});

test('the wallet root wraps the stack, so every screen shares its gestures and its one reduced-motion answer', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<RootLayout />);
  const stack = await screen.findByTestId('stack');
  expect(screen.getByTestId('wallet-root').contains(stack)).toBe(true);
});

// PostHog is loaded only on iOS and Android with a project key (1D-T6). The shared
// transport is not loaded here, as in the other render tests; no session is signed in.
vi.mock('@mobile/api/sharedV1', () => ({
  fetchAccountId: async () => { throw new Error('no account in this test'); },
  getSharedAnalyticsServer: () => ({
    read: async () => { throw new Error('no server in this test'); },
    setConsent: async () => { throw new Error('no server in this test'); },
  }),
  v1ClientVersion: () => null,
}));
const posthog = vi.hoisted(() => ({ created: 0 }));
vi.mock('@mobile/analytics/posthogClient', () => ({
  createPostHogClient: () => {
    posthog.created += 1;
    throw new Error('PostHog must not start on the web');
  },
}));

test('the web build installs analytics with no PostHog client, even with a project key', async () => {
  setAnalytics(null);
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
  try {
    render(<RootLayout />);
    await waitFor(() => expect(getAnalytics()).not.toBeNull());
    expect(posthog.created).toBe(0);
    expect(getAnalytics()?.allowsAnalytics()).toBe(false);
  } finally {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    setAnalytics(null);
  }
});
