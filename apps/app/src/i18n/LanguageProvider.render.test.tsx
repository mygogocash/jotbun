// The app's language choice (redesign R6, Settings): System follows the phone
// (Vietnamese included), ไทย or English wins over it, and a new choice applies
// at once through the IntlProvider the provider holds. Stored like the theme
// preference: browser storage on web, the secure store on native, under its
// own key; a store that refuses never surfaces as an unhandled rejection.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Platform, Pressable, Text } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  refuse: false,
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => store);

import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import type { LanguagePreference } from './languagePreference';
import type { Locale } from './locales';
import { LANGUAGE_READ_TIMEOUT_MS, LanguagePreferenceOverride, LanguageProvider, useLanguage } from './LanguageProvider';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from './languagePreferenceStorage';
import { useActiveLocale, useCopy } from './useCopy';

const os = Platform.OS;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

/** The phone's language, as the root layout reads it at launch. */
const phone = { locale: 'en' as Locale };

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  phone.locale = 'en';
  store.values.clear();
  store.refuse = false;
  store.getItemAsync.mockReset().mockImplementation(async (key: string) => {
    if (store.refuse) throw new Error('keychain locked');
    return store.values.get(key) ?? null;
  });
  store.setItemAsync.mockReset().mockImplementation(async (key: string, value: string) => {
    if (store.refuse) throw new Error('keychain locked');
    store.values.set(key, value);
  });
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  process.off('unhandledRejection', onUnhandled);
});

const native = () => Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

/** What the tree under the provider renders in, its choice, and buttons that choose. */
function Probe() {
  const { preference, ready, setPreference } = useLanguage();
  const tc = useCopy();
  const locale = useActiveLocale();
  const choose = (next: LanguagePreference) => (
    <Pressable key={next} accessibilityRole="button" accessibilityLabel={`choose ${next}`} onPress={() => setPreference(next)}>
      <Text>{next}</Text>
    </Pressable>
  );
  return (
    <>
      <Text testID="locale">{locale}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="ready">{String(ready)}</Text>
      <Text testID="words">{tc('Settings')}</Text>
      {(['system', 'th', 'en'] as const).map(choose)}
    </>
  );
}

const shown = (id: string) => screen.getByTestId(id).textContent;
const choose = (next: LanguagePreference) => fireEvent.click(screen.getByRole('button', { name: `choose ${next}` }));

test('System by default: the app speaks the phone\'s language', () => {
  phone.locale = 'th';
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect([shown('preference'), shown('locale'), shown('ready')]).toEqual(['system', 'th', 'true']);
});

test('a phone in Vietnamese keeps Vietnamese under System, as before there was a choice', () => {
  phone.locale = 'vi';
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect([shown('preference'), shown('locale')]).toEqual(['system', 'vi']);
});

test('choosing a language applies at once, everywhere under the provider, and is saved under its own key', () => {
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect(shown('words')).toBe('Settings');
  choose('th');
  expect([shown('preference'), shown('locale')]).toEqual(['th', 'th']);
  expect(shown('words')).not.toBe('Settings');
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('th');
  choose('en');
  expect([shown('locale'), shown('words')]).toEqual(['en', 'Settings']);
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
  // Back to the phone's language.
  choose('system');
  expect([shown('preference'), shown('locale')]).toEqual(['system', 'en']);
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('system');
  // Only its own key: the theme preference is untouched.
  expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBeNull();
});

test('on the web a saved choice is read before the first paint; anything else saved there is ignored', () => {
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect([shown('preference'), shown('locale')]).toEqual(['th', 'th']);
  cleanup();
  phone.locale = 'th';
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'vi');
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect([shown('preference'), shown('locale')]).toEqual(['system', 'th']);
});

test('on native the saved choice comes from the secure store, and nothing is ready until it has', async () => {
  native();
  store.values.set(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  expect(shown('ready')).toBe('false');
  await settle();
  expect([shown('ready'), shown('preference'), shown('locale')]).toEqual(['true', 'th', 'th']);
  choose('en');
  await settle();
  expect(store.setItemAsync).toHaveBeenCalledWith(LANGUAGE_PREFERENCE_STORAGE_KEY, 'en');
  expect(shown('locale')).toBe('en');
});

test('on native a choice made before the store answers wins over the stored one', async () => {
  native();
  store.values.set(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  choose('en');
  await settle();
  expect([shown('preference'), shown('locale')]).toEqual(['en', 'en']);
});

test('a secure store that refuses keeps the phone\'s language, still lets a choice apply for the session, and never leaves an unhandled rejection', async () => {
  native();
  store.refuse = true;
  phone.locale = 'th';
  render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
  await settle();
  expect([shown('ready'), shown('preference'), shown('locale')]).toEqual(['true', 'system', 'th']);
  choose('en');
  await settle();
  expect(shown('locale')).toBe('en');
  await settle();
  expect(unhandled).toEqual([]);
});

/** A secure-store read that answers only when the test says so (or never). */
function heldRead() {
  let answer: (value: string | null) => void = () => undefined;
  store.getItemAsync.mockImplementation(() => new Promise<string | null>((resolve) => { answer = resolve; }));
  return { answer: (value: string | null) => act(async () => { answer(value); await Promise.resolve(); }) };
}

test('a secure store that never answers holds the app only briefly: it goes on in the phone\'s language', async () => {
  vi.useFakeTimers();
  try {
    native();
    phone.locale = 'th';
    heldRead();
    render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(LANGUAGE_READ_TIMEOUT_MS - 1); });
    expect(shown('ready')).toBe('false');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect([shown('ready'), shown('preference'), shown('locale')]).toEqual(['true', 'system', 'th']);
    expect(LANGUAGE_READ_TIMEOUT_MS).toBeLessThanOrEqual(2_000);
  } finally {
    vi.useRealTimers();
  }
});

test('a saved choice read after that wait still applies, unless the person has chosen since (System included)', async () => {
  vi.useFakeTimers();
  try {
    native();
    // Nothing chosen meanwhile: the saved choice is still theirs.
    let read = heldRead();
    render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(LANGUAGE_READ_TIMEOUT_MS); });
    expect([shown('ready'), shown('locale')]).toEqual(['true', 'en']);
    await read.answer('th');
    expect([shown('ready'), shown('preference'), shown('locale')]).toEqual(['true', 'th', 'th']);
    cleanup();
    // Chosen meanwhile, even the very System the app had fallen back to: the late read is older than that choice.
    for (const choice of ['en', 'system'] as const) {
      read = heldRead();
      render(<LanguageProvider device={phone.locale}><Probe /></LanguageProvider>);
      await act(async () => { await vi.advanceTimersByTimeAsync(LANGUAGE_READ_TIMEOUT_MS); });
      choose(choice);
      await read.answer('th');
      expect([shown('preference'), shown('locale')]).toEqual([choice, 'en']);
      cleanup();
    }
  } finally {
    vi.useRealTimers();
  }
});

test('an override shows its own choice to the subtree without saving it; choosing there is still the app\'s choice', () => {
  render(
    <LanguageProvider device={phone.locale}>
      <LanguagePreferenceOverride preference="th">
        <Probe />
      </LanguagePreferenceOverride>
    </LanguageProvider>,
  );
  // The words follow the subtree's own IntlProvider (here the app's): the override changes only what is shown chosen.
  expect([shown('preference'), shown('locale')]).toEqual(['th', 'en']);
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
  choose('en');
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
});

test('outside a provider, reading the choice is a wiring mistake and says so', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Probe />)).toThrow(/LanguageProvider/);
  vi.restoreAllMocks();
});
