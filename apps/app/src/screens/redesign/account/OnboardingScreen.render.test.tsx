// R6 Onboarding (plan §6.4): the three story steps with Next, Skip and the
// dots; the coins (and reduced motion); the reminder explained before the
// phone asks, with each answer the reminder service can give; where the first
// run goes next; Thai, dark mode, the bun intensities, accessibility and the
// catalogue's sections.
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

import { AccessibilityInfo, Animated } from 'react-native';

import { setSession } from '@mobile/auth/session';
import { FIRST_RUN_SECTIONS } from '@mobile/dev/catalogue/account/firstRunSections';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { hiddenFromScreenReaders, installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { PermissionOutcome, ReminderPreference } from '@mobile/notifications/reminders';
import { formatIntroBaht, SPEND_INTRO_YEARLY_BAHT } from '@mobile/spend/spendIntro';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BUN_TOUCH } from '@mobile/ui/layout';
import { OnboardingScreen } from './OnboardingScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back, nav.router.navigate]) fn.mockReset();
});
afterEach(() => {
  cleanup();
  setSession(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Harness

/** The English copy, as the screen passes it to `tc`. */
const COPY = {
  sneaking: 'Your money has been sneaking off',
  coffee: 'One ฿60 coffee, every day',
  aYear: 'a year',
  catchIt: "Let's catch it. Seconds a day, and it stops getting away with it.",
  private: 'Your diary stays private',
  promises: ['No bank connection. You add what you spend.', 'Your diary is never sold.', 'No ads.'],
  first: 'Log your first coffee',
  firstBody: 'Adding an entry takes a few seconds. Start with your next coffee.',
  reminder: 'Daily reminder',
  explain: 'One reminder each evening at {time}, to log what you spent.',
  ask: 'If you turn it on, your phone asks you to allow notifications. You can change or stop it in Settings.',
  previewTitle: "Log today's spending",
  previewBody: 'Add what you spent today in Jotbun.',
  on: 'Reminder on: every day at {time}.',
  denied: "Reminders stay off. You can allow notifications for Jotbun in your phone's settings at any time.",
  unsupported: 'Reminders work in the Jotbun app on iOS and Android.',
  failed: "The reminder couldn't be set. You can turn it on later in Settings.",
  next: 'Next',
  skip: 'Skip',
  start: "Let's start!",
  turnOn: 'Turn on',
  notNow: 'Not now',
  continue: 'Continue',
  step: 'Step {step} of {total}',
} as const;
const AT_EIGHT = { time: '20:00' };

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

/** A reminder service that answers `answer` (or throws it). */
function reminders(answer: PermissionOutcome | Error) {
  return {
    setPreference: vi.fn(async (_preference: ReminderPreference): Promise<PermissionOutcome> => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

/** A reminder service that answers only when told, like a phone showing its permission prompt. */
function heldReminders() {
  let answer: (outcome: PermissionOutcome) => void = () => undefined;
  const service = { setPreference: vi.fn((_preference: ReminderPreference) => new Promise<PermissionOutcome>((resolve) => { answer = resolve; })) };
  return { service, answer: (outcome: PermissionOutcome) => act(async () => { answer(outcome); await Promise.resolve(); }) };
}

const button = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.click(button(name));
const heading = (name: string) => screen.getByRole('heading', { name });
const progress = () => screen.queryByRole('progressbar');
const coins = () => screen.getAllByTestId(/^onboarding-coin-\d+$/);
/** Lets the OS answers the screen asks for on mount (reduced motion) settle. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function toReminder(options: Options = {}, element: ReactElement = <OnboardingScreen reminders={reminders('scheduled')} />) {
  const view = mount(element, options);
  await settle();
  const t = (english: string) => translateCopy(english, options.locale ?? 'en');
  fireEvent.click(button(t(COPY.next)));
  fireEvent.click(button(t(COPY.next)));
  fireEvent.click(button(t(COPY.start)));
  return view;
}

/** How react-native-web writes a palette colour. */
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));
const borderOf = (element: HTMLElement) => element.style.borderTopColor || element.style.borderColor;

/** `a` comes before `b` in the document, so a screen reader and the keyboard reach it first. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const inOrder = (...elements: Element[]) => elements.slice(1).every((element, index) => before(elements[index], element));

// ---------------------------------------------------------------------------
// The story

test('step 1: the coffee maths, ฿60 a day is ฿21,900 a year, with Skip, Next and the first of three dots', async () => {
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  await settle();
  expect(screen.getByTestId('onboarding-screen')).toBeTruthy();
  expect(heading(COPY.sneaking)).toBeTruthy();
  expect(screen.getByText(COPY.coffee)).toBeTruthy();
  expect(screen.getByText(COPY.aYear)).toBeTruthy();
  expect(screen.getByText(COPY.catchIt)).toBeTruthy();
  // Today's intro maths, not a second copy of it: 60 × 365, grouped.
  expect(formatIntroBaht(SPEND_INTRO_YEARLY_BAHT)).toBe('฿21,900');
  expect(screen.getByTestId('onboarding-yearly').textContent).toBe('฿21,900');
  // The coins pile up beside the sum: ten of them, decoration only.
  expect(coins()).toHaveLength(10);
  expect(hiddenFromScreenReaders(screen.getByTestId('onboarding-coins'))).toBe(true);
  const dots = progress();
  expect(dots?.getAttribute('aria-label')).toBe('Step 1 of 3');
  expect(dots?.getAttribute('aria-valuenow')).toBe('1');
  expect(dots?.getAttribute('aria-valuemax')).toBe('3');
  expect(button(COPY.skip)).toBeTruthy();
  expect(button(COPY.next)).toBeTruthy();
});

test('step 2: your diary stays private, as three plain promises', async () => {
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  press(COPY.next);
  expect(heading(COPY.private)).toBeTruthy();
  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem').map((item) => item.textContent?.replace('✓', ''))).toEqual(COPY.promises);
  expect(progress()?.getAttribute('aria-label')).toBe('Step 2 of 3');
  expect(screen.queryByTestId('onboarding-coins')).toBeNull();
});

test('step 3: log your first coffee, a tiny commitment that asks nothing yet', async () => {
  const service = reminders('scheduled');
  mount(<OnboardingScreen reminders={service} />);
  press(COPY.next);
  press(COPY.next);
  expect(heading(COPY.first)).toBeTruthy();
  expect(screen.getByText(COPY.firstBody)).toBeTruthy();
  expect(progress()?.getAttribute('aria-label')).toBe('Step 3 of 3');
  // The commitment is the button: "Let's start!" instead of Next.
  expect(screen.queryByRole('button', { name: COPY.next })).toBeNull();
  expect(button(COPY.start)).toBeTruthy();
  expect(service.setPreference).not.toHaveBeenCalled();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

test('Skip leaves the story for the reminder question, and asks the phone nothing', async () => {
  const service = reminders('scheduled');
  mount(<OnboardingScreen reminders={service} />);
  press(COPY.skip);
  expect(heading(COPY.reminder)).toBeTruthy();
  expect(progress()).toBeNull();
  expect(screen.queryByRole('button', { name: COPY.skip })).toBeNull();
  expect(button(COPY.turnOn)).toBeTruthy();
  expect(button(COPY.notNow)).toBeTruthy();
  await settle();
  expect(service.setPreference).not.toHaveBeenCalled();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// The reminder: explained first, asked only on Turn on

test('the reminder is explained before the phone asks, never on top of the prompt', async () => {
  const held = heldReminders();
  let explainedFirst = false;
  held.service.setPreference.mockImplementation((_preference) => {
    // At the moment the phone would show its prompt, the explanation is already on screen.
    explainedFirst = Boolean(screen.queryByText(translateCopy(COPY.ask, 'en')));
    return new Promise<PermissionOutcome>(() => undefined);
  });
  await toReminder({}, <OnboardingScreen reminders={held.service} />);
  expect(heading(COPY.reminder)).toBeTruthy();
  expect(screen.getByText(translateCopy(COPY.explain, 'en', AT_EIGHT))).toBeTruthy();
  expect(screen.getByText(COPY.ask)).toBeTruthy();
  // The preview is the reminder's own words.
  const preview = screen.getByTestId('onboarding-reminder-preview');
  expect(within(preview).getByText(COPY.previewTitle)).toBeTruthy();
  expect(within(preview).getByText(COPY.previewBody)).toBeTruthy();
  // Reaching the question asks nothing: the phone's prompt never shows over the explanation.
  await settle();
  expect(held.service.setPreference).not.toHaveBeenCalled();

  press(COPY.turnOn);
  expect(held.service.setPreference).toHaveBeenCalledTimes(1);
  expect(held.service.setPreference.mock.calls[0][0]).toStrictEqual({ enabled: true, localTime: '20:00' });
  expect(explainedFirst).toBe(true);
  // While the phone asks, Turn on is busy and Not now waits.
  expect(button(COPY.turnOn).getAttribute('aria-busy')).toBe('true');
  expect(button(COPY.notNow).getAttribute('aria-disabled')).toBe('true');
});

test('turn on, scheduled: says when, then goes on to sign in', async () => {
  const held = heldReminders();
  await toReminder({}, <OnboardingScreen reminders={held.service} />);
  press(COPY.turnOn);
  await held.answer('scheduled');
  const status = screen.getByText(translateCopy(COPY.on, 'en', AT_EIGHT));
  expect(status.closest('[aria-live="polite"]')).toBeTruthy();
  expect(screen.queryByRole('button', { name: COPY.turnOn })).toBeNull();
  expect(screen.queryByRole('button', { name: COPY.notNow })).toBeNull();
  press(COPY.continue);
  expect(nav.router.replace).toHaveBeenCalledWith('/login');
  expect(held.service.setPreference).toHaveBeenCalledTimes(1);
});

test('denied: says so in words, asks nothing again, and goes on', async () => {
  const service = reminders('denied');
  await toReminder({}, <OnboardingScreen reminders={service} />);
  press(COPY.turnOn);
  expect(await screen.findByText(COPY.denied)).toBeTruthy();
  // No nagging: no second ask, no "try again", no way back to the prompt.
  expect(screen.queryByRole('button', { name: COPY.turnOn })).toBeNull();
  expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  expect(screen.queryByText(translateCopy(COPY.on, 'en', AT_EIGHT))).toBeNull();
  await settle();
  expect(service.setPreference).toHaveBeenCalledTimes(1);
  press(COPY.continue);
  expect(nav.router.replace).toHaveBeenCalledWith('/login');
});

test('unsupported (web): this device\'s own reminder service says so, and the first run goes on', async () => {
  // No service passed: the screen uses the device's, which on the web has no local reminders.
  await toReminder({}, <OnboardingScreen />);
  press(COPY.turnOn);
  expect(await screen.findByText(COPY.unsupported)).toBeTruthy();
  expect(screen.queryByRole('button', { name: COPY.turnOn })).toBeNull();
  press(COPY.continue);
  expect(nav.router.replace).toHaveBeenCalledWith('/login');
});

test('a reminder service that fails says so calmly and still goes on', async () => {
  await toReminder({}, <OnboardingScreen reminders={reminders(new Error('keychain locked'))} />);
  press(COPY.turnOn);
  expect(await screen.findByText(COPY.failed)).toBeTruthy();
  press(COPY.continue);
  expect(nav.router.replace).toHaveBeenCalledWith('/login');
});

test('not now: asks the phone nothing and goes straight on to sign in', async () => {
  const service = reminders('scheduled');
  await toReminder({}, <OnboardingScreen reminders={service} />);
  press(COPY.notNow);
  expect(nav.router.replace).toHaveBeenCalledWith('/login');
  await settle();
  expect(service.setPreference).not.toHaveBeenCalled();
});

test('with a session, the first run ends on Quick add to log that coffee', async () => {
  setSession({ access_token: 'session-token', userId: 'user-1' });
  await toReminder({}, <OnboardingScreen reminders={reminders('scheduled')} />);
  press(COPY.notNow);
  expect(nav.router.replace).toHaveBeenCalledWith('/spend/add');
  expect(nav.router.replace).not.toHaveBeenCalledWith('/login');
  cleanup();
  nav.router.replace.mockReset();
  await toReminder({}, <OnboardingScreen reminders={reminders('scheduled')} />);
  press(COPY.turnOn);
  fireEvent.click(await screen.findByRole('button', { name: COPY.continue }));
  expect(nav.router.replace).toHaveBeenCalledWith('/spend/add');
});

// ---------------------------------------------------------------------------
// The signin area (1C-T8, K16, C15): the welcome link, and the story ends at
// sign-in; the reminder question follows sign-in (R55), so it never shows here.

const SIGN_IN_LINK = 'Already have an account? Sign in';

test('the first story step offers the sign-in link', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'signin');
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  await settle();
  press(SIGN_IN_LINK);
  expect(nav.router.replace).toHaveBeenCalledTimes(1);
  expect(nav.router.replace).toHaveBeenCalledWith('/login?from=onboarding');
  // Only on the first step.
  press(COPY.next);
  expect(heading(COPY.private)).toBeTruthy();
  expect(screen.queryByRole('button', { name: SIGN_IN_LINK })).toBeNull();
});

test('the story ends at sign-in with from=onboarding', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'signin');
  const service = reminders('scheduled');
  const first = mount(<OnboardingScreen reminders={service} />);
  await settle();
  press(COPY.next);
  press(COPY.next);
  press(COPY.start);
  expect(nav.router.replace).toHaveBeenLastCalledWith('/login?from=onboarding');
  expect(screen.queryByRole('heading', { name: COPY.reminder })).toBeNull();
  first.unmount();
  // Skip leaves the story for sign-in too.
  nav.router.replace.mockReset();
  const skipped = mount(<OnboardingScreen reminders={service} />);
  await settle();
  press(COPY.skip);
  expect(nav.router.replace).toHaveBeenCalledWith('/login?from=onboarding');
  expect(screen.queryByRole('heading', { name: COPY.reminder })).toBeNull();
  skipped.unmount();
  // With a session already, the story ends at the reminder question, which now follows sign-in.
  nav.router.replace.mockReset();
  setSession({ access_token: 'session-token', userId: 'user-1' });
  mount(<OnboardingScreen reminders={service} />);
  await settle();
  press(COPY.skip);
  expect(nav.router.replace).toHaveBeenCalledWith('/onboarding/reminder');
  expect(service.setPreference).not.toHaveBeenCalled();
});

test("with 'signin' off the order is today's", async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', '');
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  await settle();
  expect(screen.queryByRole('button', { name: SIGN_IN_LINK })).toBeNull();
  press(COPY.next);
  press(COPY.next);
  press(COPY.start);
  expect(heading(COPY.reminder)).toBeTruthy();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Motion

test('the coins pile up one by one', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const stagger = vi.spyOn(Animated, 'stagger');
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  // Before the OS has said whether motion is reduced, no coin shows and nothing moves.
  expect(coins().every((coin) => coin.style.opacity === '0')).toBe(true);
  await settle();
  expect(stagger).toHaveBeenCalledTimes(1);
  expect(stagger.mock.calls[0][1]).toHaveLength(10);
});

test('reduced motion: the coins simply appear, with no animation at all', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const timing = vi.spyOn(Animated, 'timing');
  const spring = vi.spyOn(Animated, 'spring');
  const stagger = vi.spyOn(Animated, 'stagger');
  mount(<OnboardingScreen reminders={reminders('scheduled')} />);
  await settle();
  expect(stagger).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  expect(spring).not.toHaveBeenCalled();
  for (const coin of coins()) {
    expect(coin.style.opacity).toBe('1');
    expect(coin.style.transform).toMatch(/translateY\(0px\)/);
  }
});

// ---------------------------------------------------------------------------
// Thai, dark mode and the bun

test('Thai: Thai leading, and the core\'s and R6\'s own copy in Thai', async () => {
  const th = (english: string, values?: Record<string, string>) => translateCopy(english, 'th', values);
  const leading = (role: Parameters<typeof bunText>[0]) => `${bunText(role, 'thai').lineHeight}px`;
  mount(<OnboardingScreen reminders={reminders('scheduled')} />, { locale: 'th' });
  await settle();
  // Today's intro copy is already translated.
  expect(th(COPY.sneaking)).not.toBe(COPY.sneaking);
  const title = heading(th(COPY.sneaking));
  expect(title.style.lineHeight).toBe(leading('title'));
  expect(screen.getByText(th(COPY.coffee)).style.lineHeight).toBe(leading('body'));
  expect(screen.getByTestId('onboarding-yearly').textContent).toBe('฿21,900');
  expect(button(th(COPY.next))).toBeTruthy();
  expect(button(th(COPY.skip))).toBeTruthy();
  expect(progress()?.getAttribute('aria-label')).toBe(th(COPY.step, { step: '1', total: '3' }));
  // R6's own copy is in the catalogs too (pending E2 checkpoint 4): Thai, in Thai type, never a blank or a key.
  expect(th(COPY.first)).not.toBe(COPY.first);
  fireEvent.click(button(th(COPY.next)));
  fireEvent.click(button(th(COPY.next)));
  const first = heading(th(COPY.first));
  expect(first.textContent).toBe(translateCopy(COPY.first, 'th'));
  expect(first.style.lineHeight).toBe(leading('title'));
  expect(screen.getByText(th(COPY.firstBody)).style.lineHeight).toBe(leading('body'));
  fireEvent.click(button(th(COPY.start)));
  expect(heading(th(COPY.reminder)).textContent).toBe('การแจ้งเตือนรายวัน');
  expect(document.body.textContent).not.toMatch(/\{\w+\}/);
});

test('dark mode: the lavender night palette, ink text and outlined controls', async () => {
  mount(<OnboardingScreen reminders={reminders('scheduled')} />, { mode: 'dark' });
  await settle();
  expect(screen.getByTestId('onboarding-screen').style.backgroundColor).toEqual(rgb(bunDark.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(bunDark.stage));
  expect(heading(COPY.sneaking).style.color).toEqual(rgb(bunDark.ink));
  expect(screen.getByTestId('onboarding-yearly').style.color).toEqual(rgb(bunDark.ink));
  expect(screen.getByTestId('onboarding-coffee').style.backgroundColor).toEqual(rgb(bunDark.card));
  expect(button(COPY.next).style.backgroundColor).toEqual(rgb(bunDark.ink));
  expect(borderOf(button(COPY.skip))).toEqual(rgb(bunDark.ink));
  expect(screen.getByTestId('onboarding-footer').style.backgroundColor).toEqual(rgb(bunDark.background));
  cleanup();
  mount(<OnboardingScreen reminders={reminders('scheduled')} />, { mode: 'light' });
  expect(screen.getByTestId('onboarding-screen').style.backgroundColor).toEqual(rgb(bunLight.background));
  expect(screen.getByTestId('onboarding-coffee').style.backgroundColor).toEqual(rgb(bunLight.card));
});

test('bun Full: a pose on each step; Quiet and Off: no bun on the stage, everything else the same', async () => {
  await toReminder({ intensity: 'full' });
  expect(hiddenFromScreenReaders(screen.getByTestId('onboarding-bun-sleepy'))).toBe(true);
  cleanup();
  mount(<OnboardingScreen reminders={reminders('scheduled')} />, { intensity: 'full' });
  expect(hiddenFromScreenReaders(screen.getByTestId('onboarding-bun-hello'))).toBe(true);
  press(COPY.next);
  expect(screen.getByTestId('onboarding-bun-lock')).toBeTruthy();
  press(COPY.next);
  expect(screen.getByTestId('onboarding-bun-holding-receipt')).toBeTruthy();
  for (const intensity of ['quiet', 'off'] as const) {
    cleanup();
    window.localStorage.clear();
    mount(<OnboardingScreen reminders={reminders('scheduled')} />, { intensity });
    expect(screen.queryByTestId(/^onboarding-bun-/)).toBeNull();
    expect(heading(COPY.sneaking)).toBeTruthy();
    expect(screen.getByTestId('onboarding-yearly').textContent).toBe('฿21,900');
    expect(coins()).toHaveLength(10);
    expect(button(COPY.next)).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// Accessibility

test('44 pt targets, decorative art hidden, and focus from the top down', async () => {
  mount(<OnboardingScreen reminders={reminders('scheduled')} />, { intensity: 'full' });
  await settle();
  for (const name of [COPY.skip, COPY.next]) expect(parseFloat(button(name).style.minHeight)).toBeGreaterThanOrEqual(BUN_TOUCH);
  expect(hiddenFromScreenReaders(screen.getByTestId('onboarding-bun-hello'))).toBe(true);
  expect(hiddenFromScreenReaders(screen.getByTestId('onboarding-coins'))).toBe(true);
  // The dots are drawn for the eye; the progress bar says the step in words.
  const dots = progress()!;
  expect(hiddenFromScreenReaders(dots)).toBe(false);
  expect(dots.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  expect(inOrder(heading(COPY.sneaking), screen.getByText(COPY.coffee), screen.getByTestId('onboarding-yearly'), screen.getByText(COPY.catchIt), dots, button(COPY.skip), button(COPY.next))).toBe(true);
  // On the reminder question: the explanation, then Not now, then Turn on.
  press(COPY.skip);
  for (const name of [COPY.notNow, COPY.turnOn]) expect(parseFloat(button(name).style.minHeight)).toBeGreaterThanOrEqual(BUN_TOUCH);
  expect(inOrder(heading(COPY.reminder), screen.getByText(translateCopy(COPY.explain, 'en', AT_EIGHT)), screen.getByText(COPY.ask), button(COPY.notNow), button(COPY.turnOn))).toBe(true);
});

// ---------------------------------------------------------------------------
// The catalogue's onboarding sections (registered later, at E2)

const ONBOARDING_SECTIONS = FIRST_RUN_SECTIONS.filter((section) => section.id.startsWith('onboarding-'));
/** What each section must show once its script has run. */
const SHOWS: Readonly<Record<string, string>> = {
  'onboarding-coffee': COPY.sneaking,
  'onboarding-private': COPY.private,
  'onboarding-first-coffee': COPY.first,
  'onboarding-skipped': COPY.ask,
  'onboarding-reminder-on': translateCopy(COPY.on, 'en', AT_EIGHT),
  'onboarding-reminder-denied': COPY.denied,
  'onboarding-reminder-unsupported': COPY.unsupported,
  'onboarding-reminder-failed': COPY.failed,
};

test('the catalogue has one onboarding section per state, with onboarding- ids and Onboarding: titles', () => {
  expect(ONBOARDING_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SHOWS));
  for (const section of ONBOARDING_SECTIONS) {
    expect(section.title).toMatch(/^Onboarding: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(ONBOARDING_SECTIONS.map((section) => section.title)).size).toBe(ONBOARDING_SECTIONS.length);
});

test.each(ONBOARDING_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? null).toBeNull();
  expect(screen.getByTestId('catalogue-screen-ready')).toBeTruthy();
  expect(screen.getByTestId('onboarding-screen')).toBeTruthy();
  expect(screen.getByText(SHOWS[id])).toBeTruthy();
  // A section never leaves the catalogue or reaches the network.
  expect(nav.router.replace).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
}, 20_000);
