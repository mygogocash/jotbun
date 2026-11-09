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

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PHONE, mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { SETTINGS_SECTIONS, fakeAccount } from '@mobile/dev/catalogue/account/settingsSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { LanguageProvider } from '@mobile/i18n/LanguageProvider';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '@mobile/i18n/languagePreferenceStorage';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { leading, mountScreen, outboxCommand, pendingExpense, rgb } from '../HistoryTestHarness';
import { SettingsScreen } from './SettingsScreen';
import { appAccountServices } from './accountServices';
import type { AccountServices } from './SettingsParts';
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

type Mount = Partial<SettingsScreenProps> & { diary?: ReturnType<typeof createFakeDiary>; locale?: Locale; mode?: 'light' | 'dark' };

/**
 * Settings in the app's providers. With `mode` the theme is forced (as the
 * catalogue does); without it the app's own stored preference shows and saves.
 */
function mountSettings({ diary, locale = 'en', mode, services = fakeAccount().services, ...props }: Mount = {}) {
  const element: ReactElement = <SettingsScreen services={services} {...props} />;
  if (mode) return mountScreen(element, { resources: createFakeResources().resources, diary: diary?.diary ?? null, locale, mode });
  return mountInApp(<SpendDiaryProvider diary={diary?.diary ?? null}>{element}</SpendDiaryProvider>, locale);
}

/** Settings under the app's own language choice on a phone in `phone`, with no locale pinned: as the root layout mounts it. */
function mountLive({ phone = 'en', services = fakeAccount().services }: { phone?: Locale; services?: AccountServices } = {}) {
  return render(
    <LanguageProvider device={phone}>
      <BunIntensityProvider>
        <SafeAreaProvider initialMetrics={PHONE}>
          <ThemeProvider>
            <SpendDiaryProvider diary={null}>
              <SettingsScreen services={services} />
            </SpendDiaryProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </BunIntensityProvider>
    </LanguageProvider>,
  );
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

test('language: System, ไทย and English, each language named in itself; System until a choice is made; no Vietnamese', () => {
  mountLive();
  expect(radioNames('Language')).toEqual(['System', 'ไทย', 'English']);
  expect(checkedIn('Language')).toEqual(['System']);
  for (const radio of within(group('Language')).getAllByRole('radio')) expect(radio.getAttribute('aria-disabled')).not.toBe('true');
  expect(screen.queryByRole('radio', { name: 'Tiếng Việt' })).toBeNull();
  expect(screen.queryByText("Jotbun follows your phone's language. Change it in your phone's settings.")).toBeNull();
});

test('choosing ไทย saves it under its own key and the screen reads in Thai at once; System goes back to the phone', () => {
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
  mountLive();
  fireEvent.click(screen.getByRole('radio', { name: 'ไทย' }));
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('th');
  const title = screen.getByRole('heading', { name: translateCopy('Settings', 'th') });
  expect(title.style.lineHeight).toBe(leading('title', 'th'));
  expect(checkedIn(translateCopy('Language', 'th'))).toEqual(['ไทย']);
  expect(screen.getByRole('button', { name: translateCopy('Sign out', 'th') })).toBeTruthy();
  // Appearance has a System too: this one is the language's.
  fireEvent.click(within(group(translateCopy('Language', 'th'))).getByRole('radio', { name: translateCopy('System', 'th') }));
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('system');
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  expect(checkedIn('Language')).toEqual(['System']);
  // Its own key: the theme preference is as it was.
  expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
});

test.each([['th', 'ไทย'], ['en', 'English']] as const)('language %s saved: the checked choice, whatever the phone speaks', (saved, name) => {
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, saved);
  mountLive({ phone: saved === 'th' ? 'en' : 'th' });
  const label = translateCopy('Language', saved);
  expect(checkedIn(label)).toEqual([name]);
  expect(screen.getByRole('heading', { name: translateCopy('Settings', saved) })).toBeTruthy();
});

test('a phone in Vietnamese: System is checked, and Vietnamese is still not offered', () => {
  mountLive({ phone: 'vi' });
  expect(checkedIn(translateCopy('Language', 'vi'))).toEqual([translateCopy('System', 'vi')]);
  expect(screen.queryByRole('radio', { name: 'Tiếng Việt' })).toBeNull();
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
  fireEvent.click(within(group('Bun')).getByRole('radio', { name: 'Quiet' }));
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('quiet');
  expect(checkedIn('Bun')).toEqual(['Quiet']);
  // Haptics also offers Off, so the choice is made in the Bun group.
  fireEvent.click(within(group('Bun')).getByRole('radio', { name: 'Off' }));
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('off');
});

test('Haptics offers On, Subtle and Off, each saying what it plays', () => {
  mountSettings();
  expect(radioNames('Haptics')).toEqual(['On', 'Subtle', 'Off']);
  expect(checkedIn('Haptics')).toEqual(['On']);
  const haptics = group('Haptics');
  expect(within(haptics).getByText('A light tap when you type, choose and save.')).toBeTruthy();
  expect(within(haptics).getByText('Only when something is saved, needs a look or goes wrong.')).toBeTruthy();
  expect(within(haptics).getByText('No vibration from Jotbun.')).toBeTruthy();
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

// Sign out everywhere: a confirm, a fresh sign-in for `global_logout`, then
// POST /v1/me/global-logout with that proof, then this phone's erase and the
// sign-out here. Re-authentication is the fake's; the app build has none yet.

/** Opens Sign out everywhere and confirms it. */
function confirmEverywhere() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  fireEvent.click(within(dialog('Sign out everywhere?')).getByRole('button', { name: 'Sign out everywhere' }));
}

const STILL_SIGNED_IN = "Couldn't reach Jotbun. You're still signed in on this phone. Try again to send the same request.";

test('Sign out everywhere: a confirm; Stay signed in changes nothing; confirming signs in again, sends the request with that proof, then erases this phone and signs out here', async () => {
  const log: string[] = [];
  const diary = loggingDiary(log);
  const account = fakeAccount({ log });
  mountSettings({ diary, services: account.services });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  const sheet = dialog('Sign out everywhere?');
  expect(within(sheet).getByText(EVERYWHERE_CONSEQUENCE)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Stay signed in' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(log).toEqual([]);
  confirmEverywhere();
  await waitFor(() => expect(log).toEqual(['reauth', 'globalLogout', 'erase', 'signOut']));
  expect(account.calls.reauth).toEqual(['global_logout']);
  // The request carries the fresh proof, and its command is the proof's.
  expect(account.calls.globalLogouts).toHaveLength(1);
  expect(account.calls.globalLogouts[0].proofId).toMatch(/^0000000a-/);
  expect(account.calls.globalLogouts[0].commandId).toMatch(/^0000000c-/);
  // The sheet stays up, busy, through the whole request, and closes on the render after it.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('cancelling the fresh sign-in: nothing is sent or erased, and the person stays signed in', async () => {
  const log: string[] = [];
  const account = fakeAccount({ log, reauth: 'cancel' });
  mountSettings({ diary: loggingDiary(log), services: account.services });
  confirmEverywhere();
  expect(await screen.findByText('Nothing changed.')).toBeTruthy();
  expect(log).toEqual(['reauth']);
  // The sheet stays up, busy, through the whole request, and closes on the render after it.
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('a sign-in that fails: nothing is sent or erased, still signed in, and saying so', async () => {
  const log: string[] = [];
  mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, reauth: 'unreachable' }).services });
  confirmEverywhere();
  expect(await screen.findByText("Couldn't reach the sign-in service. Nothing changed. Try again.")).toBeTruthy();
  expect(log).toEqual(['reauth']);
});

test('Jotbun refuses the fresh sign-in (a used or stale proof): nothing changed, still signed in', async () => {
  const log: string[] = [];
  mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, globalLogouts: ['reauth'] }).services });
  confirmEverywhere();
  expect(await screen.findByText('Your sign-in check expired. Nothing changed.')).toBeTruthy();
  expect(log).toEqual(['reauth', 'globalLogout']);
});

test('a resend after a lost answer meets 401 SESSION_REQUIRED: the first one landed, so this phone is signed out too', async () => {
  const log: string[] = [];
  mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, globalLogouts: ['signed_out'] }).services });
  confirmEverywhere();
  await waitFor(() => expect(log).toEqual(['reauth', 'globalLogout', 'erase', 'signOut']));
});

test('Jotbun cannot be reached: still signed in, and saying so; Try again resends the same request with no new sign-in, and its 401 SESSION_REQUIRED signs out here', async () => {
  const log: string[] = [];
  const account = fakeAccount({ log, globalLogouts: ['lost', 'signed_out'] });
  mountSettings({ diary: loggingDiary(log), services: account.services });
  confirmEverywhere();
  expect(await screen.findByText(STILL_SIGNED_IN)).toBeTruthy();
  expect(log).toEqual(['reauth', 'globalLogout']);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(log).toEqual(['reauth', 'globalLogout', 'globalLogout', 'erase', 'signOut']));
  expect(account.calls.reauth).toHaveLength(1);
  expect(account.calls.globalLogouts[1]).toEqual(account.calls.globalLogouts[0]);
});

test('Jotbun cannot be reached on Try again either: still signed in, and Try again stays', async () => {
  const log: string[] = [];
  const account = fakeAccount({ log, globalLogouts: ['lost'] });
  mountSettings({ diary: loggingDiary(log), services: account.services });
  confirmEverywhere();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(log).toEqual(['reauth', 'globalLogout', 'globalLogout']));
  expect(await screen.findByText(STILL_SIGNED_IN)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('refused for another reason: nothing changed, try later', async () => {
  const log: string[] = [];
  mountSettings({ diary: loggingDiary(log), services: fakeAccount({ log, globalLogouts: ['refused'] }).services });
  confirmEverywhere();
  expect(await screen.findByText("Jotbun couldn't take your request right now. Try again later.")).toBeTruthy();
  expect(log).toEqual(['reauth', 'globalLogout']);
});

test("signed out everywhere, but this phone's diary can't be erased: it says so, and this phone stays signed in to try again", async () => {
  const log: string[] = [];
  const diary = createFakeDiary();
  diary.diary.eraseForSignOut = async () => { throw new Error('disk'); };
  mountSettings({ diary, services: fakeAccount({ log }).services });
  confirmEverywhere();
  expect(await screen.findByText("You're signed out everywhere else, but this phone's diary couldn't be erased. Sign out to try again.")).toBeTruthy();
  expect(log).toEqual(['reauth', 'globalLogout']);
});

test("the app's own wiring has no fresh sign-in yet: Sign out everywhere shows, disabled, says why, and can't be started", () => {
  const log: string[] = [];
  const services = appAccountServices();
  expect(services.reauthenticate).toBeNull();
  mountSettings({ diary: loggingDiary(log), services });
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

test.each([['en', 'English'], ['th', 'ไทย'], ['vi', translateCopy('System', 'vi')]] as const)("catalogue in %s: the language card shows the catalogue's language as chosen (Vietnamese, offered only through the phone, as System)", async (locale, chosen) => {
  const main = SETTINGS_SECTIONS.find((section) => section.id === 'settings-main');
  mountInApp(<>{main?.render()}</>, locale);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(checkedIn(translateCopy('Language', locale))).toEqual([chosen]);
  // Shown, not saved: the app's own choice is untouched.
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
}, 20_000);

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
