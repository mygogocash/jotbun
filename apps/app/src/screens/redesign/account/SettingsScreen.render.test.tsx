// R6 Settings (plan §6.4): appearance, language and the bun as radio groups,
// the area links, the account card and the two sign-outs behind their
// confirms. On the fakes in the catalogue's settings sections.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('@mobile/api/sharedV1', () => ({
  v1ClientVersion: () => null,
  getSharedV1Resources: () => { throw new Error('Settings never reads the real API in a test.'); },
}));

import type { ReactElement } from 'react';

import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { SETTINGS_SECTIONS, fakeAccount } from '@mobile/dev/catalogue/account/settingsSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { leading, mountScreen, outboxCommand, pendingExpense, rgb } from '../HistoryTestHarness';
import { SettingsScreen } from './SettingsScreen';
import type { SettingsScreenProps } from './SettingsScreen';

beforeAll(() => { installBrowserStorage(); });
const ENV = { redesign: process.env.EXPO_PUBLIC_REDESIGN, legacy: process.env.EXPO_PUBLIC_LEGACY_SPEND };
const setEnv = (name: 'EXPO_PUBLIC_REDESIGN' | 'EXPO_PUBLIC_LEGACY_SPEND', value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset().mockReturnValue(true);
  setEnv('EXPO_PUBLIC_REDESIGN', 'account');
  setEnv('EXPO_PUBLIC_LEGACY_SPEND', undefined);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  setEnv('EXPO_PUBLIC_REDESIGN', ENV.redesign);
  setEnv('EXPO_PUBLIC_LEGACY_SPEND', ENV.legacy);
});

type Mount = SettingsScreenProps & { diary?: ReturnType<typeof createFakeDiary>; locale?: Locale; mode?: 'light' | 'dark' };

/**
 * Settings in the app's providers. With `mode` the theme is forced (as the
 * catalogue does); without it the app's own stored preference shows and saves.
 */
function mountSettings({ diary, locale = 'en', mode, ...props }: Mount = {}) {
  const element: ReactElement = <SettingsScreen {...props} />;
  if (mode) return mountScreen(element, { resources: createFakeResources().resources, diary: diary?.diary ?? null, locale, mode });
  return mountInApp(<SpendDiaryProvider diary={diary?.diary ?? null}>{element}</SpendDiaryProvider>, locale);
}

const group = (name: string) => screen.getByRole('radiogroup', { name });
const radioNames = (name: string) => within(group(name)).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'));
const checkedIn = (name: string) => within(group(name)).getAllByRole('radio').filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.getAttribute('aria-label'));
const page = () => screen.getByTestId('settings-screen');
const linkNames = () => screen.queryAllByRole('link').map((link) => link.getAttribute('aria-label'));
const dialog = (name: string) => screen.getByRole('dialog', { name });

const SIGN_OUT_CONSEQUENCE = "Signing out erases this phone's copy of your diary. Entries not yet synced are lost. Everything already synced stays in your account.";
const EVERYWHERE_CONSEQUENCE = "Every phone signed in to your account is signed out. You'll sign in again first to confirm it's you. This phone's copy of your diary is erased, and entries not yet synced are lost.";

/** A diary whose fake erase writes into `log`, so the order of erase and sign-out shows. */
function loggingDiary(log: string[], view: Partial<DiaryView> = {}) {
  const fake = createFakeDiary(view);
  const erase = fake.diary.eraseForSignOut;
  fake.diary.eraseForSignOut = async () => {
    log.push('erase');
    await erase();
  };
  return fake;
}

// ---------------------------------------------------------------------------
// Appearance, language and the bun

test.each([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const)('appearance %s: the saved preference is the checked choice', (preference, label) => {
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  mountSettings();
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  expect(radioNames('Appearance')).toEqual(['System', 'Light', 'Dark']);
  expect(checkedIn('Appearance')).toEqual([label]);
  if (preference !== 'system') expect(page().style.backgroundColor).toEqual(rgb((preference === 'dark' ? bunDark : bunLight).background));
});

test('choosing Dark saves it through the theme preference and the screen turns dark', () => {
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'light');
  mountSettings();
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
  expect(checkedIn('Appearance')).toEqual(['Dark']);
  expect(page().style.backgroundColor).toEqual(rgb(bunDark.background));
});

test.each([['th', 'ไทย'], ['en', 'English'], ['vi', 'Tiếng Việt']] as const)('language %s: shown read-only, because Jotbun follows the phone', (locale, name) => {
  mountSettings({ locale });
  const label = translateCopy('Language', locale);
  expect(radioNames(label)).toEqual(['ไทย', 'English', 'Tiếng Việt']);
  expect(checkedIn(label)).toEqual([name]);
  for (const radio of within(group(label)).getAllByRole('radio')) expect(radio.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText(translateCopy("Jotbun follows your phone's language. Change it in your phone's settings.", locale))).toBeTruthy();
});

test.each([['full', 'Full'], ['quiet', 'Quiet'], ['off', 'Off']] as const)('bun %s: the saved intensity is checked, and each choice says what it does in one line', (intensity, label) => {
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  mountSettings();
  expect(radioNames('Bun')).toEqual(['Full', 'Quiet', 'Off']);
  expect(checkedIn('Bun')).toEqual([label]);
  const bun = group('Bun');
  expect(within(bun).getByText('The bun, its peeks and its speech bubbles.')).toBeTruthy();
  expect(within(bun).getByText('No speech bubbles. The bun shows only on empty pages.')).toBeTruthy();
  expect(within(bun).getByText('No bun anywhere.')).toBeTruthy();
});

test('choosing Quiet saves the bun intensity for the whole app', () => {
  mountSettings();
  expect(checkedIn('Bun')).toEqual(['Full']);
  fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('quiet');
  expect(checkedIn('Bun')).toEqual(['Quiet']);
  fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('off');
});

// ---------------------------------------------------------------------------
// Links

test('planning rows only under the planning area, Reminders only under insights; Privacy and data always', () => {
  setEnv('EXPO_PUBLIC_REDESIGN', 'account,-planning,-insights');
  mountSettings();
  expect(linkNames()).toEqual(['Privacy and data']);
  cleanup();
  setEnv('EXPO_PUBLIC_REDESIGN', '-insights');
  mountSettings();
  expect(linkNames()).toEqual(['Wallets', 'Categories', 'Budget', 'Privacy and data']);
  cleanup();
  setEnv('EXPO_PUBLIC_REDESIGN', '-planning');
  mountSettings();
  expect(linkNames()).toEqual(['Reminders', 'Privacy and data']);
  cleanup();
  // The default since E2 checkpoints 2 and 3.
  setEnv('EXPO_PUBLIC_REDESIGN', undefined);
  mountSettings();
  expect(linkNames()).toEqual(['Wallets', 'Categories', 'Budget', 'Reminders', 'Privacy and data']);
});

test('each link opens its route', () => {
  mountSettings({ areas: { planning: true, insights: true } });
  const routes: [string, string][] = [['Wallets', '/spend/wallets'], ['Categories', '/spend/categories'], ['Budget', '/spend/budget'], ['Reminders', '/spend/reminders'], ['Privacy and data', '/settings/privacy']];
  for (const [name, href] of routes) {
    router.push.mockReset();
    fireEvent.click(screen.getByRole('link', { name }));
    expect(router.push).toHaveBeenCalledWith(href);
  }
});

test('Import stays hidden while its flag is off, and shows only with it', () => {
  mountSettings({ areas: { planning: true, insights: true } });
  expect(screen.queryByRole('link', { name: 'Import' })).toBeNull();
  cleanup();
  // The app's import route shows a screen only in the development legacy build.
  setEnv('EXPO_PUBLIC_LEGACY_SPEND', '1');
  mountSettings();
  fireEvent.click(screen.getByRole('link', { name: 'Import' }));
  expect(router.push).toHaveBeenCalledWith('/spend/import');
});

// ---------------------------------------------------------------------------
// The account card and signing out

test('the account card: "Signed in" when the session does not say how, the method when it does; no linking', () => {
  mountSettings({ services: fakeAccount().services });
  expect(screen.getByText('Signed in')).toBeTruthy();
  expect(screen.queryByText(/link/i)).toBeNull();
  cleanup();
  mountSettings({ services: fakeAccount({ signInMethod: 'google' }).services });
  expect(screen.getByText('Signed in with Google')).toBeTruthy();
});

test('Sign out asks first and says what is lost; Stay signed in keeps everything, and is the safe default', () => {
  const log: string[] = [];
  const diary = loggingDiary(log);
  const account = fakeAccount({ log });
  mountSettings({ diary, services: account.services });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const sheet = dialog('Sign out?');
  expect(within(sheet).getByText(SIGN_OUT_CONSEQUENCE)).toBeTruthy();
  const [stay, confirm] = within(sheet).getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Close');
  // The safe choice comes first with the ink fill; the destructive one is outlined.
  expect(stay.textContent).toBe('Stay signed in');
  expect(confirm.textContent).toBe('Sign out');
  expect(stay.style.backgroundColor).toEqual(rgb(bunLight.ink));
  expect(confirm.style.backgroundColor).not.toEqual(rgb(bunLight.ink));
  fireEvent.click(stay);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(log).toEqual([]);
  expect(diary.calls.eraseForSignOut).toBe(0);
});

test("confirming Sign out erases this phone's diary first, then signs out", async () => {
  const log: string[] = [];
  const diary = loggingDiary(log);
  const account = fakeAccount({ log });
  mountSettings({ diary, services: account.services });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  fireEvent.click(within(dialog('Sign out?')).getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(log).toEqual(['erase', 'signOut']));
});

test('a diary that cannot be erased keeps the person signed in, and says so', async () => {
  const log: string[] = [];
  const diary = createFakeDiary();
  diary.diary.eraseForSignOut = async () => { throw new Error('disk'); };
  mountSettings({ diary, services: fakeAccount({ log }).services });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  fireEvent.click(within(dialog('Sign out?')).getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText("Couldn't erase this phone's diary, so you're still signed in. Try again.")).toBeTruthy();
  expect(log).toEqual([]);
});

test('offline with entries waiting: the banner says so, and Sign out counts what would be lost', () => {
  const diary = createFakeDiary({
    outbox: [outboxCommand(pendingExpense(), 'unsent'), outboxCommand(pendingExpense(), 'uncertain')],
    outcome: { status: 'waiting', progress: { sent: 0, total: 2 }, nextAttemptAt: null, uncertain: 1, needsReview: 0 },
  });
  mountSettings({ diary, services: fakeAccount().services });
  expect(screen.getByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(within(dialog('Sign out?')).getByText(`${SIGN_OUT_CONSEQUENCE} 2 entries on this phone haven't synced yet.`)).toBeTruthy();
});

test('Sign out everywhere: a confirm, then the fresh sign-in and the global sign-out, then the erase and the local sign-out', async () => {
  const log: string[] = [];
  const diary = loggingDiary(log);
  const account = fakeAccount({ log, everywhere: 'done' });
  mountSettings({ diary, services: account.services });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  const sheet = dialog('Sign out everywhere?');
  expect(within(sheet).getByText(EVERYWHERE_CONSEQUENCE)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Stay signed in' }));
  expect(log).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  fireEvent.click(within(dialog('Sign out everywhere?')).getByRole('button', { name: 'Sign out everywhere' }));
  await waitFor(() => expect(log).toEqual(['signOutEverywhere', 'erase', 'signOut']));
});

test('Sign out everywhere cancelled at the sign-in, or not reaching Jotbun: nothing is erased and nobody is signed out', async () => {
  for (const [result, message] of [['cancelled', 'Nothing changed.'], ['failed', "Couldn't reach Jotbun. Nothing changed. Try again."]] as const) {
    const log: string[] = [];
    mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, everywhere: result }).services });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    fireEvent.click(within(dialog('Sign out everywhere?')).getByRole('button', { name: 'Sign out everywhere' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(log).toEqual(['signOutEverywhere']);
    cleanup();
  }
});

test("Sign out everywhere without a fresh sign-in in this build: it says so plainly and can't be started", () => {
  const log: string[] = [];
  mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, everywhere: null }).services });
  const button = screen.getByRole('button', { name: 'Sign out everywhere' });
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText("Signing out everywhere needs a fresh sign-in, which this build can't do yet.")).toBeTruthy();
  fireEvent.click(button);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(log).toEqual([]);
});

// ---------------------------------------------------------------------------
// Back, Thai, dark, touch targets

test('Back returns to the screen below, or Home when there is none', () => {
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

test('Thai: the screen reads in Thai with Thai leading', () => {
  mountSettings({ locale: 'th', mode: 'light' });
  const title = screen.getByRole('heading', { name: translateCopy('Settings', 'th') });
  expect(title.style.lineHeight).toBe(leading('title', 'th'));
  expect(screen.getByText(translateCopy('Signed in', 'th')).style.lineHeight).toBe(leading('body', 'th'));
  expect(screen.getByRole('radio', { name: translateCopy('Dark', 'th') })).toBeTruthy();
});

test('dark mode: the night ground, with the checked choice in ink', () => {
  mountSettings({ mode: 'dark' });
  expect(page().style.backgroundColor).toEqual(rgb(bunDark.background));
  const dark = screen.getByRole('radio', { name: 'Dark' });
  expect(dark.getAttribute('aria-checked')).toBe('true');
});

test('every control is at least 44 pt tall', () => {
  mountSettings({ areas: { planning: true, insights: true, imports: true }, services: fakeAccount().services });
  const controls = [...screen.getAllByRole('radio'), ...screen.getAllByRole('link'), ...screen.getAllByRole('button')];
  expect(controls.length).toBeGreaterThan(15);
  for (const control of controls) expect(Number.parseFloat(control.style.minHeight)).toBeGreaterThanOrEqual(44);
});

// ---------------------------------------------------------------------------
// The catalogue's sections (registered at E2 checkpoint 4)

test('the catalogue has one section per state, with settings- / privacy- ids and Settings: / Privacy: titles', () => {
  expect(SETTINGS_SECTIONS.length).toBeGreaterThan(15);
  for (const section of SETTINGS_SECTIONS) {
    expect(section.id).toMatch(/^(settings|privacy)-[a-z0-9-]+$/);
    expect(section.title).toMatch(section.id.startsWith('settings-') ? /^Settings: \S/ : /^Privacy: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(SETTINGS_SECTIONS.map((section) => section.id)).size).toBe(SETTINGS_SECTIONS.length);
  expect(new Set(SETTINGS_SECTIONS.map((section) => section.title)).size).toBe(SETTINGS_SECTIONS.length);
});

test.each(SETTINGS_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? null).toBeNull();
  expect(screen.getByTestId('catalogue-screen-ready')).toBeTruthy();
  expect(screen.getByTestId(id.startsWith('settings-') ? 'settings-screen' : 'privacy-screen')).toBeTruthy();
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
}, 20_000);
