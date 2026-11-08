// R6 Sign-in (plan §6.4): the bun banner, three equal providers, one line,
// the explicit terms box and three promises; the providers locked until the
// box is ticked, saying why; a provider going through today's session seam,
// which is "not configured", shown calmly with no pretend sign-in; Thai, dark
// mode, the bun intensities, accessibility and the catalogue's sections.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), navigate: vi.fn(), setParams: vi.fn(), canGoBack: vi.fn(() => true) },
}));
vi.mock('expo-router', () => ({ useRouter: () => nav.router, useLocalSearchParams: () => ({}) }));
// The catalogue's screen sections set route params through expo-router's own context.
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { getSession, installCredentialProvider } from '@mobile/auth/session';
import type { CredentialProvider, SignInResult } from '@mobile/auth/credentialProvider';
import { INITIAL_SESSION } from '@mobile/auth/sessionMachine';
import { FIRST_RUN_SECTIONS } from '@mobile/dev/catalogue/account/firstRunSections';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { hiddenFromScreenReaders, installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SignInAttempt, SignInMethod } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BUN_TOUCH } from '@mobile/ui/layout';
import { SignInScreen, signInThroughSession } from './SignInScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back, nav.router.navigate]) fn.mockReset();
});
afterEach(() => {
  cleanup();
  installCredentialProvider(null);
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Harness

const COPY = {
  title: 'Sign in',
  private: 'Your diary stays private',
  line: "If you already have an account, we'll sign you in",
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  email: 'Continue with email',
  terms: 'I agree to the Terms of Service and the Privacy Policy',
  why: 'Tick the box to agree to the terms first.',
  promises: ['No bank connection. You add what you spend.', 'Your diary is never sold.', 'No ads.'],
  // Today's login screen, word for word.
  notConfigured: 'Sign-in is not configured for this local installation. A verified account session is required to view or change spending records.',
  back: 'Back to Jotbun',
  busy: 'Signing in…',
  failed: "Sign-in didn't finish. Try again.",
} as const;
const PROVIDERS = [COPY.apple, COPY.google, COPY.email] as const;

type Mode = 'light' | 'dark';
type Options = { locale?: Locale; mode?: Mode; intensity?: BunIntensity };

function mount(element: ReactElement, { locale = 'en', mode = 'light', intensity }: Options = {}) {
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>
          <BunIntensityProvider>{element}</BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

/** A sign-in that answers only when told. */
function heldSignIn() {
  let answer: (attempt: SignInAttempt) => void = () => undefined;
  const signIn = vi.fn((_method: SignInMethod) => new Promise<SignInAttempt>((resolve) => { answer = resolve; }));
  return { signIn, answer: (attempt: SignInAttempt) => act(async () => { answer(attempt); await Promise.resolve(); }) };
}

const button = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.click(button(name));
const checkbox = () => screen.getByRole('checkbox');
const isChecked = (box: HTMLElement) => box.getAttribute('aria-checked') === 'true';
const isDisabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true';
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));
const borderOf = (element: HTMLElement) => element.style.borderTopColor || element.style.borderColor;
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const inOrder = (...elements: Element[]) => elements.slice(1).every((element, index) => before(elements[index], element));
/** The label inside a pill (the text node the button draws). */
const labelOf = (name: string) => within(button(name)).getByText(name);

// ---------------------------------------------------------------------------
// The screen

test('the bun banner, one line, the three promises, the terms box and three providers', () => {
  mount(<SignInScreen />, { intensity: 'full' });
  expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
  expect(screen.getByRole('heading', { name: COPY.title })).toBeTruthy();
  expect(screen.getByText(COPY.private)).toBeTruthy();
  expect(screen.getByTestId('sign-in-bun')).toBeTruthy();
  expect(screen.getByText(COPY.line)).toBeTruthy();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent?.replace('✓', ''))).toEqual(COPY.promises);
  const box = checkbox();
  expect(box.getAttribute('aria-label')).toBe(COPY.terms);
  expect(isChecked(box)).toBe(false);
  for (const name of PROVIDERS) expect(button(name)).toBeTruthy();
});

test('Apple, Google and email are equals: same size, same weight, no favourite', () => {
  mount(<SignInScreen />);
  fireEvent.click(checkbox());
  const looks = PROVIDERS.map((name) => {
    const pill = button(name);
    const label = labelOf(name);
    return {
      background: pill.style.backgroundColor,
      border: borderOf(pill),
      borderWidth: pill.style.borderTopWidth || pill.style.borderWidth,
      minHeight: pill.style.minHeight,
      fontWeight: label.style.fontWeight,
      fontSize: label.style.fontSize,
      color: label.style.color,
      parentWidth: (pill.parentElement as HTMLElement).style.alignSelf,
    };
  });
  expect(looks[1]).toEqual(looks[0]);
  expect(looks[2]).toEqual(looks[0]);
  // None is the ink-filled primary.
  for (const name of PROVIDERS) expect(button(name).style.backgroundColor).not.toEqual(rgb(bunLight.ink));
});

test('before the terms are ticked: the providers are disabled, say why, and do nothing', () => {
  const signIn = vi.fn(async (_method: SignInMethod): Promise<SignInAttempt> => 'not_configured');
  mount(<SignInScreen signIn={signIn} />);
  expect(isChecked(checkbox())).toBe(false);
  expect(screen.getByText(COPY.why)).toBeTruthy();
  for (const name of PROVIDERS) {
    expect(isDisabled(button(name))).toBe(true);
    press(name);
  }
  expect(signIn).not.toHaveBeenCalled();
  expect(screen.queryByText(COPY.notConfigured)).toBeNull();
});

test('after ticking the terms: the box says so and the providers work; unticking locks them again', async () => {
  const signIn = vi.fn(async (_method: SignInMethod): Promise<SignInAttempt> => 'cancelled');
  mount(<SignInScreen signIn={signIn} />);
  fireEvent.click(checkbox());
  expect(isChecked(checkbox())).toBe(true);
  expect(screen.queryByText(COPY.why)).toBeNull();
  for (const name of PROVIDERS) expect(isDisabled(button(name))).toBe(false);
  fireEvent.click(checkbox());
  expect(isChecked(checkbox())).toBe(false);
  expect(screen.getByText(COPY.why)).toBeTruthy();
  for (const name of PROVIDERS) expect(isDisabled(button(name))).toBe(true);
  fireEvent.click(checkbox());
  press(COPY.email);
  await waitFor(() => expect(signIn).toHaveBeenCalledWith('email'));
  expect(signIn).toHaveBeenCalledTimes(1);
});

test('a provider pressed while sign-in is not configured: today\'s message, calmly, and Back to Jotbun', async () => {
  // No sign-in passed: the screen goes through the session seam, which has no credential provider today.
  mount(<SignInScreen />);
  fireEvent.click(checkbox());
  press(COPY.google);
  const message = await screen.findByText(COPY.notConfigured);
  // Calm: a polite status in ink, not an alert in red.
  expect(message.closest('[aria-live="polite"]')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(message.style.color).toEqual(rgb(bunLight.ink));
  // Nothing pretends to sign in: no session, no way into the diary, no second try.
  expect(getSession()).toBeNull();
  expect(nav.router.replace).not.toHaveBeenCalled();
  expect(nav.router.push).not.toHaveBeenCalled();
  for (const name of PROVIDERS) expect(screen.queryByRole('button', { name })).toBeNull();
  press(COPY.back);
  expect(nav.router.replace).toHaveBeenCalledWith('/');
});

test('a provider goes through the session seam: an installed credential provider is the one that signs in', async () => {
  expect(await signInThroughSession('apple')).toBe('not_configured');
  const signIn = vi.fn(async (): Promise<SignInResult> => ({ outcome: 'cancelled', methods: [], created: false }));
  const provider = { getSessionSnapshot: () => INITIAL_SESSION, subscribe: () => () => undefined, signIn } as unknown as CredentialProvider;
  installCredentialProvider(provider);
  expect(await signInThroughSession('email')).toBe('not_configured');
  expect(signIn).not.toHaveBeenCalled();
  expect(await signInThroughSession('apple')).toBe('cancelled');
  expect(signIn).toHaveBeenCalledWith({ method: 'apple', signUp: true });
  mount(<SignInScreen />);
  fireEvent.click(checkbox());
  press(COPY.apple);
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
  // Cancelled: back where it was, with no message and nowhere to go.
  await waitFor(() => expect(isDisabled(button(COPY.apple))).toBe(false));
  expect(screen.queryByText(COPY.notConfigured)).toBeNull();
  expect(screen.queryByText(COPY.failed)).toBeNull();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

test('signing in: the chosen provider is busy and the others wait; active opens the diary, failed says so calmly', async () => {
  const held = heldSignIn();
  mount(<SignInScreen signIn={held.signIn} />);
  fireEvent.click(checkbox());
  press(COPY.apple);
  expect(held.signIn).toHaveBeenCalledWith('apple');
  expect(button(COPY.busy).getAttribute('aria-busy')).toBe('true');
  expect(isDisabled(button(COPY.google))).toBe(true);
  expect(isDisabled(button(COPY.email))).toBe(true);
  await held.answer('failed');
  const failed = screen.getByText(COPY.failed);
  expect(failed.closest('[aria-live="polite"]')).toBeTruthy();
  expect(nav.router.replace).not.toHaveBeenCalled();
  press(COPY.google);
  await held.answer('active');
  expect(nav.router.replace).toHaveBeenCalledWith('/spend');
});

// ---------------------------------------------------------------------------
// Thai, dark mode and the bun

test('Thai: Thai leading, and the core\'s and R6\'s own copy in Thai', () => {
  const th = (english: string) => translateCopy(english, 'th');
  const leading = (role: Parameters<typeof bunText>[0]) => `${bunText(role, 'thai').lineHeight}px`;
  mount(<SignInScreen />, { locale: 'th' });
  const title = screen.getByRole('heading', { name: th(COPY.title) });
  expect(title.textContent).toBe('เข้าสู่ระบบ');
  expect(title.style.lineHeight).toBe(leading('title'));
  // R6's own copy is in the catalogs too (pending E2 checkpoint 4): Thai, in Thai type, never blank and never a key.
  expect(th(COPY.line)).not.toBe(COPY.line);
  expect(screen.getByText(th(COPY.line)).style.lineHeight).toBe(leading('body'));
  expect(screen.getByText(th(COPY.private))).toBeTruthy();
  expect(button(th(COPY.apple))).toBeTruthy();
  expect(checkbox().getAttribute('aria-label')).toBe(th(COPY.terms));
  expect(screen.getByText(th(COPY.why)).style.lineHeight).toBe(leading('caption'));
  expect(document.body.textContent).not.toMatch(/\{\w+\}/);
});

test('dark mode: the lavender night palette, an ink box and outlined providers', () => {
  mount(<SignInScreen />, { mode: 'dark' });
  expect(screen.getByTestId('sign-in-screen').style.backgroundColor).toEqual(rgb(bunDark.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(bunDark.stage));
  expect(screen.getByText(COPY.line).style.color).toEqual(rgb(bunDark.ink));
  expect(borderOf(screen.getByTestId('sign-in-terms-box'))).toEqual(rgb(bunDark.ink));
  fireEvent.click(checkbox());
  expect(screen.getByTestId('sign-in-terms-box').style.backgroundColor).toEqual(rgb(bunDark.ink));
  for (const name of PROVIDERS) expect(borderOf(button(name))).toEqual(rgb(bunDark.ink));
});

test('bun Full shows the banner bun; Quiet and Off leave the stage plain, and nothing else changes', () => {
  mount(<SignInScreen />, { intensity: 'full' });
  expect(hiddenFromScreenReaders(screen.getByTestId('sign-in-bun'))).toBe(true);
  for (const intensity of ['quiet', 'off'] as const) {
    cleanup();
    window.localStorage.clear();
    mount(<SignInScreen />, { intensity });
    expect(screen.queryByTestId('sign-in-bun')).toBeNull();
    expect(screen.getByRole('heading', { name: COPY.title })).toBeTruthy();
    expect(checkbox()).toBeTruthy();
    for (const name of PROVIDERS) expect(button(name)).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// Accessibility

test('a real checkbox with its state, 44 pt targets, decorative art hidden, and focus from the top down', () => {
  mount(<SignInScreen />, { intensity: 'full' });
  const box = checkbox();
  expect(box.getAttribute('role')).toBe('checkbox');
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(parseFloat(box.style.minHeight)).toBeGreaterThanOrEqual(BUN_TOUCH);
  expect(hiddenFromScreenReaders(screen.getByTestId('sign-in-terms-box'))).toBe(true);
  for (const name of PROVIDERS) expect(parseFloat(button(name).style.minHeight)).toBeGreaterThanOrEqual(BUN_TOUCH);
  expect(hiddenFromScreenReaders(screen.getByTestId('sign-in-bun'))).toBe(true);
  // Heading, the line, the promises, the box, why the providers wait, then the providers in order.
  expect(inOrder(
    screen.getByRole('heading', { name: COPY.title }), screen.getByText(COPY.line), screen.getByRole('list'), box, screen.getByText(COPY.why),
    button(COPY.apple), button(COPY.google), button(COPY.email),
  )).toBe(true);
  fireEvent.click(box);
  press(COPY.email);
  return waitFor(() => expect(parseFloat(button(COPY.back).style.minHeight)).toBeGreaterThanOrEqual(BUN_TOUCH));
});

// ---------------------------------------------------------------------------
// The catalogue's sign-in sections (registered later, at E2)

const SIGN_IN_SECTIONS = FIRST_RUN_SECTIONS.filter((section) => section.id.startsWith('sign-in-'));
const SHOWS: Readonly<Record<string, string>> = {
  'sign-in-terms-unticked': COPY.why,
  'sign-in-terms-ticked': COPY.email,
  'sign-in-signing-in': COPY.busy,
  'sign-in-not-configured': COPY.notConfigured,
  'sign-in-failed': COPY.failed,
};

test('the catalogue has one sign-in section per state, with sign-in- ids and Sign-in: titles', () => {
  expect(SIGN_IN_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SHOWS));
  for (const section of SIGN_IN_SECTIONS) {
    expect(section.title).toMatch(/^Sign-in: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(SIGN_IN_SECTIONS.map((section) => section.title)).size).toBe(SIGN_IN_SECTIONS.length);
  // Every section is an onboarding or a sign-in state.
  expect(FIRST_RUN_SECTIONS.every((section) => /^(onboarding|sign-in)-/.test(section.id))).toBe(true);
});

test.each(SIGN_IN_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? null).toBeNull();
  expect(screen.getByTestId('catalogue-screen-ready')).toBeTruthy();
  expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
  expect(screen.getByText(SHOWS[id])).toBeTruthy();
  if (id === 'sign-in-terms-ticked') expect(isChecked(checkbox())).toBe(true);
  expect(nav.router.replace).not.toHaveBeenCalled();
  expect(getSession()).toBeNull();
  expect(network).not.toHaveBeenCalled();
}, 20_000);
