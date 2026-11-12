// Bun and AI settings in the Bun Wallet look (P3-T14, ai-settings): presence,
// Bun's AI help with today's uses left, the daily note's switch and haptics,
// at /settings/ai. Each case mounts through mountWallet, in Thai and by day
// unless it says otherwise, with the companion's fake AI resources.
//
// The plan's four cases come first, then the ones this task's rulings add:
// presence and haptics as the app's own settings, สิ่งที่ AI เห็น, a turn-off
// the server never took, the resting service, back, the note setting's own
// rules (a held, an unreadable and an unwritable store), the copy reader, the
// catalogue's three sections, and the size case every P3 suite has.
//
// Reanimated keeps a tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops numberOfLines from the DOM, so the props that
// reach the app's Text are recorded, as WalletsList.render.test.tsx does.
// Every lookup asserts, so a missing part fails as an AssertionError.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
// The catalogue's stage keys its fakes with the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const haptics = vi.hoisted(() => ({ playHaptic: vi.fn() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: haptics.playHaptic }));
const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  return { ...actual, Text };
});

import { AI_DAILY_LIMITS, AI_NOTICE_VERSION } from '@gogospend/contracts';
import type { AiPreferencesDto } from '@gogospend/contracts';
import { Text } from 'react-native';

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { HapticsProvider } from '@mobile/lib/HapticsProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { COMMON_COPY } from '../common/copy';
import { draftText } from '../copy/draftText';
import { installStoreBackend } from '../store/deviceWalletStore';
import type { StoreBackend } from '../store/walletStore';
import { AX5, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { useDailyNoteSetting } from './aiConsent';
import type { DailyNoteSetting } from './aiConsent';
import { BUNAI_DRAFTS } from './drafts';
import { bunAiText } from './useBunAiCopy';
import { WalletAiSettingsScreen } from './WalletAiSettingsScreen';

// The bun intensity and haptics keep their choice in the browser's storage here, as SettingsScreen.render.test.tsx's do.
beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  installStoreBackend(null);
  seen.props.length = 0;
  haptics.playHaptic.mockReset();
});

type Locale = 'th' | 'en';
const say = (key: string, locale: Locale = 'th', values?: Readonly<Record<string, string | number>>) => bunAiText(BUNAI_DRAFTS, key, locale, values);
const common = (key: string, locale: Locale = 'th') => draftText(COMMON_COPY, key, locale);

/** ai-settings' uses left today: 27 sentences, 9 slips, 19 questions. */
const BOARD: Partial<AiPreferencesDto> = { companion: true, notice_version: AI_NOTICE_VERSION, remaining: { ...AI_DAILY_LIMITS, parse: 27, slip: 9, ask: 19 } };
const NOTE_KEY = 'jotbun.wallet.daily-note';

/** Lets the preferences' read, the note's read and a change land. */
async function settle() {
  for (let tick = 0; tick < 6; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The first element with this role and name, which must be there. */
function named(role: string, name: string, inside?: HTMLElement): HTMLElement {
  const all = (inside ? within(inside) : screen).queryAllByRole(role, { name });
  expect(all.length, `a ${role} named ${name}`).toBeGreaterThan(0);
  return all[0];
}

/** The first element with this test id, which must be there. */
function found(testID: string, inside?: HTMLElement): HTMLElement {
  const all = (inside ? within(inside) : screen).queryAllByTestId(testID);
  expect(all.length, testID).toBeGreaterThan(0);
  return all[0];
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await settle();
}

const checked = (element: HTMLElement) => element.getAttribute('aria-checked');
const consentEvents = (sent: readonly Recorded[]) => sent.filter((each) => each.name === 'ai_consent_changed');

async function mountSettings(preferences: Partial<AiPreferencesDto> = BOARD, options: MountWalletOptions & { ai?: never; fake?: ReturnType<typeof fakeAiResources> } = {}) {
  const { fake, ...rest } = options;
  const ai = fake ?? fakeAiResources({}, preferences);
  const view = mountWallet(<HapticsProvider><WalletAiSettingsScreen /></HapticsProvider>, { ai: ai.resources, ...rest });
  await settle();
  return { ai, view };
}

// ---------------------------------------------------------------------------
// The plan's cases

test('the screen shows presence, AI help with uses left, the note switch and haptics', async () => {
  const forms = [['th', 'light'], ['th', 'dark'], ['en', 'light'], ['en', 'dark']] as const;
  for (const [locale, mode] of forms) {
    const at = `${locale} ${mode}`;
    await mountSettings(BOARD, { locale, mode });
    expect(found('ai-settings').style.backgroundColor, at).toBe(rgba((mode === 'dark' ? walletDark : walletLight).ground));
    expect(found('ai-settings-ai').style.backgroundColor, at).toBe(rgba((mode === 'dark' ? walletDark : walletLight).card));
    named('heading', say('bunai.settingsTitle', locale));
    // Presence: the app's bun intensity, full until changed.
    named('heading', say('bunai.bunHeading', locale));
    const presence = named('radiogroup', say('bunai.presence', locale));
    const radios = within(presence).queryAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-label')), at).toEqual([say('bunai.presenceFull', locale), say('bunai.presenceQuiet', locale), say('bunai.presenceOff', locale)]);
    expect(radios.map(checked), at).toEqual(['true', 'false', 'false']);
    expect(presence.textContent, at).toBe([
      say('bunai.presenceFull', locale), say('bunai.presenceFullLine', locale),
      say('bunai.presenceQuiet', locale), say('bunai.presenceQuietLine', locale),
      say('bunai.presenceOff', locale), say('bunai.presenceOffLine', locale),
    ].join(''));
    // Bun's AI help, on, with today's uses left.
    expect(checked(named('switch', say('bunai.consentTitle', locale))), at).toBe('true');
    expect(within(found('ai-settings-ai')).queryAllByText(say('bunai.aiLine', locale)).length, at).toBe(1);
    expect(within(found('ai-settings-uses')).queryAllByText(say('bunai.usesLeft', locale)).length, at).toBe(1);
    expect(found('ai-settings-uses-parse').textContent, at).toBe(`27 / 30${say('bunai.usesParse', locale)}`);
    expect(found('ai-settings-uses-slip').textContent, at).toBe(`9 / 10${say('bunai.usesSlip', locale)}`);
    expect(found('ai-settings-uses-ask').textContent, at).toBe(`19 / 20${say('bunai.usesAsk', locale)}`);
    named('button', say('bunai.whatAiSees', locale));
    // The daily note: on, as Q7's default.
    expect(checked(named('switch', say('bunai.note', locale))), at).toBe('true');
    expect(within(found('ai-settings-note')).queryAllByText(say('bunai.noteLine', locale)).length, at).toBe(1);
    // Haptics: the app's own, on until changed.
    named('heading', say('bunai.haptics', locale));
    const haptics = named('radiogroup', say('bunai.haptics', locale));
    const segments = within(haptics).queryAllByRole('radio');
    expect(segments.map((segment) => segment.getAttribute('aria-label')), at).toEqual([say('bunai.hapticsOn', locale), say('bunai.hapticsSubtle', locale), say('bunai.hapticsOff', locale)]);
    expect(segments.map(checked), at).toEqual(['true', 'false', 'false']);
    expect(within(found('ai-settings-haptics')).queryAllByText(say('bunai.hapticsLine', locale)).length, at).toBe(1);
    cleanup();
  }
});

test('turning AI off is immediate and sends one ai_consent_changed with ai_enabled false', async () => {
  const recorded = await recordAnalytics();
  try {
    const { ai } = await mountSettings();
    await press(named('switch', 'ตัวช่วย AI ของบัน'));
    expect(ai.resources.setPreferences).toHaveBeenCalledTimes(1);
    expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: false });
    // No consent on the way off.
    expect(screen.queryAllByRole('dialog')).toEqual([]);
    expect(consentEvents(recorded.sent)).toEqual([{ kind: 'capture', name: 'ai_consent_changed', properties: { ai_enabled: false, origin: 'app' } }]);
    expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('false');
    expect(screen.queryAllByTestId('ai-settings-uses')).toEqual([]);
    expect(haptics.playHaptic.mock.calls).toEqual([['saveLanded']]);
  } finally {
    recorded.restore();
  }
});

test('turning AI on opens the consent first', async () => {
  const recorded = await recordAnalytics();
  try {
    const { ai } = await mountSettings({});
    expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('false');
    expect(screen.queryAllByTestId('ai-settings-uses')).toEqual([]);
    await press(named('switch', 'ตัวช่วย AI ของบัน'));
    startAnimations();
    const dialog = named('dialog', 'ตัวช่วย AI ของบัน');
    expect(ai.resources.setPreferences).not.toHaveBeenCalled();
    expect(consentEvents(recorded.sent)).toEqual([]);
    await press(named('button', 'เปิดใช้', dialog));
    expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: true, notice_version: AI_NOTICE_VERSION });
    expect(consentEvents(recorded.sent).map((event) => event.properties)).toEqual([{ ai_enabled: true, origin: 'app' }]);
    expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('true');
    expect(found('ai-settings-uses-parse').textContent).toBe('30 / 30ประโยค');
  } finally {
    recorded.restore();
  }
});

test('the note switch is kept on this phone', async () => {
  const first = await mountSettings();
  const note = () => named('switch', 'โน้ตประจำวันจากบัน');
  expect(checked(note())).toBe('true');
  expect(first.view.stored.has(NOTE_KEY)).toBe(false);
  await press(note());
  expect(checked(note())).toBe('false');
  expect(first.view.stored.get(NOTE_KEY)).toBe('off');
  await press(note());
  expect(checked(note())).toBe('true');
  expect(first.view.stored.get(NOTE_KEY)).toBe('on');
  cleanup();
  // What this phone kept is what the switch reads next time.
  await mountSettings(BOARD, { device: { 'daily-note': 'off' } });
  expect(checked(note())).toBe('false');
  cleanup();
  await mountSettings(BOARD, { device: { 'daily-note': 'on' } });
  expect(checked(note())).toBe('true');
});

// ---------------------------------------------------------------------------
// The rulings' cases

test("presence is the app's bun intensity, and haptics the app's haptics setting", async () => {
  await mountSettings();
  await press(named('radio', 'เงียบ'));
  expect(within(named('radiogroup', 'บันโผล่มาแค่ไหน')).queryAllByRole('radio').map(checked)).toEqual(['false', 'true', 'false']);
  // Kept as the app's own bun intensity; the one already chosen changes nothing.
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBe('quiet');
  const writes = vi.spyOn(window.localStorage, 'setItem');
  await press(named('radio', 'เงียบ'));
  expect(writes).not.toHaveBeenCalled();
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  await press(named('radio', 'เบา'));
  expect(within(named('radiogroup', 'การสั่น')).queryAllByRole('radio').map(checked)).toEqual(['false', 'true', 'false']);
  // The new setting answers with a tap; the one already chosen does nothing.
  expect(haptics.playHaptic.mock.calls).toEqual([['saveLanded']]);
  await press(named('radio', 'เบา'));
  expect(haptics.playHaptic.mock.calls).toEqual([['saveLanded']]);
});

test('สิ่งที่ AI เห็น opens the consent read-only', async () => {
  const { ai } = await mountSettings();
  await press(named('button', 'สิ่งที่ AI เห็น'));
  startAnimations();
  const dialog = named('dialog', 'สิ่งที่ AI เห็น');
  expect(within(dialog).queryAllByRole('button', { name: 'เปิดใช้' })).toEqual([]);
  expect(found('ai-consent-what', dialog).textContent).toBe(say('bunai.consentWhat') + say('bunai.consentWhatLine'));
  expect(ai.resources.setPreferences).not.toHaveBeenCalled();
});

test('a turn-off the server never took leaves AI help on and says so', async () => {
  const recorded = await recordAnalytics();
  try {
    const fake = fakeAiResources({}, BOARD);
    fake.resources.setPreferences = vi.fn(async () => { throw new Error('offline'); });
    await mountSettings(BOARD, { fake });
    await press(named('switch', 'ตัวช่วย AI ของบัน'));
    const alert = found('ai-settings-problem');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(translateCopy("This couldn't be changed right now. Try again when you're online.", 'th'));
    expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('true');
    expect(consentEvents(recorded.sent)).toEqual([]);
    expect(haptics.playHaptic.mock.calls).toEqual([['saveFailed']]);
  } finally {
    recorded.restore();
  }
});

test('while turning off waits for the server, the switch says so and takes no second press', async () => {
  let release: (() => void) | null = null;
  const fake = fakeAiResources({}, BOARD);
  const answer = fake.resources.setPreferences;
  fake.resources.setPreferences = vi.fn((update) => new Promise<AiPreferencesDto>((resolve) => { release = () => resolve(answer(update)); }));
  await mountSettings(BOARD, { fake });
  await press(named('switch', 'ตัวช่วย AI ของบัน'));
  expect(named('switch', 'ตัวช่วย AI ของบัน').getAttribute('aria-busy')).toBe('true');
  await press(named('switch', 'ตัวช่วย AI ของบัน'));
  expect(fake.resources.setPreferences).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByRole('dialog')).toEqual([]);
  expect(release).not.toBeNull();
  await act(async () => { release?.(); });
  await settle();
  expect(named('switch', 'ตัวช่วย AI ของบัน').getAttribute('aria-busy')).toBe('false');
  expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('false');
});

test("a turn-on that failed is not still said when the consent opens again", async () => {
  const fake = fakeAiResources({}, {});
  fake.resources.setPreferences = vi.fn(async () => { throw new Error('offline'); });
  await mountSettings({}, { fake });
  await press(named('switch', 'ตัวช่วย AI ของบัน'));
  startAnimations();
  await press(named('button', 'เปิดใช้'));
  expect(found('ai-consent-problem').textContent).toBe('เปิดตัวช่วย AI ไม่ได้ตอนนี้ ลองอีกครั้งเมื่อต่อเน็ต');
  await press(named('button', 'ไม่ใช่ตอนนี้'));
  // The tray has gone (its exit, then the Modal hides).
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toEqual([]));
  await press(named('switch', 'ตัวช่วย AI ของบัน'));
  startAnimations();
  named('dialog', 'ตัวช่วย AI ของบัน');
  expect(screen.queryAllByTestId('ai-consent-problem')).toEqual([]);
});

test("while Bun's AI help rests, the switch keeps the answer and says so, with no uses", async () => {
  await mountSettings({ ...BOARD, available: false });
  expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('true');
  expect(found('ai-settings-resting').textContent).toBe(translateCopy("Bun's AI help is resting right now. Everything else works as usual.", 'th'));
  expect(screen.queryAllByTestId('ai-settings-uses')).toEqual([]);
  cleanup();
  await mountSettings(BOARD);
  expect(screen.queryAllByTestId('ai-settings-resting')).toEqual([]);
});

test('back goes to the screen below, or to Settings when there is none', async () => {
  await mountSettings();
  await press(named('button', common('common.back')));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  router.canGoBack.mockReturnValue(false);
  await press(named('button', common('common.back')));
  expect(router.replace).toHaveBeenCalledWith('/settings');
  expect(router.back).toHaveBeenCalledTimes(1);
});

/** The note setting as the probe last read it, so a case can call its set() and await it. */
let probed: DailyNoteSetting | null = null;

/** Reads the note setting the way a screen does, and says what it read. */
function NoteProbe() {
  const note = useDailyNoteSetting();
  probed = note;
  return <Text testID="note-probe">{`${note.on ? 'on' : 'off'} ${note.ready ? 'ready' : 'reading'}`}</Text>;
}

/** Turns the note off through the probe's setting; the change must settle without throwing. */
async function turnNoteOff() {
  const note = probed;
  expect(note, 'the probe has read the setting').not.toBeNull();
  await act(async () => { await expect(note?.set(false)).resolves.toBeUndefined(); });
  await settle();
}

const backend = (overrides: Partial<StoreBackend>): StoreBackend => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
  getAllKeys: async () => [],
  multiRemove: async () => undefined,
  ...overrides,
});

test("the note setting: a choice made before the stored one is read wins, and a store that can't be read or written keeps going", async () => {
  // Held: the stored 'on' arrives after the person turned the note off.
  let answer: ((value: string | null) => void) | null = null;
  const writes: string[] = [];
  installStoreBackend(backend({
    getItem: () => new Promise((resolve) => { answer = resolve; }),
    setItem: async (key, value) => { writes.push(`${key}=${value}`); },
  }));
  render(<NoteProbe />);
  await settle();
  expect(found('note-probe').textContent).toBe('on reading');
  await turnNoteOff();
  expect(found('note-probe').textContent).toBe('off ready');
  expect(writes).toEqual([`${NOTE_KEY}=off`]);
  expect(answer).not.toBeNull();
  await act(async () => { answer?.('on'); });
  await settle();
  expect(found('note-probe').textContent).toBe('off ready');
  cleanup();
  // Unreadable: the default, and ready.
  installStoreBackend(backend({ getItem: async () => { throw new Error('locked'); } }));
  render(<NoteProbe />);
  await settle();
  expect(found('note-probe').textContent).toBe('on ready');
  cleanup();
  // Unwritable: the choice still applies, and nothing throws.
  installStoreBackend(backend({ setItem: async () => { throw new Error('full'); } }));
  render(<NoteProbe />);
  await settle();
  await turnNoteOff();
  expect(found('note-probe').textContent).toBe('off ready');
});

test('bunAiText reads Thai for th and English for en and vi, filling tokens in one pass', () => {
  const table = { 'bunai.sample': { th: 'เหลือ {left} จาก {limit}', en: '{left} of {limit} left' } } as const;
  expect(bunAiText(table, 'bunai.sample', 'th', { left: 3, limit: 10 })).toBe('เหลือ 3 จาก 10');
  expect(bunAiText(table, 'bunai.sample', 'en', { left: 3, limit: 10 })).toBe('3 of 10 left');
  expect(bunAiText(table, 'bunai.sample', 'vi', { left: 3, limit: 10 })).toBe('3 of 10 left');
  // One pass: a value that looks like a token is inserted, not filled again; an unsupplied token stays.
  expect(bunAiText(table, 'bunai.sample', 'en', { left: '{limit}' })).toBe('{limit} of {limit} left');
  expect(bunAiText(table, 'bunai.unknown', 'th')).toBe('bunai.unknown');
  expect(bunAiText(BUNAI_DRAFTS, 'bunai.usesOf', 'th', { left: 27, limit: 30 })).toBe('27 / 30');
});

test("the catalogue lists bw-ai-consent, bw-ai-settings and bw-ai-settings-off after the lock's, and each reaches its state", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-ai-consent');
  expect(at, 'bw-ai-consent').toBeGreaterThan(ids.indexOf('bw-lock-cover'));
  expect(ids.slice(at, at + 3)).toEqual(['bw-ai-consent', 'bw-ai-settings', 'bw-ai-settings-off']);
  const sections = WALLET_SECTIONS.slice(at, at + 3);
  expect(sections.map((section) => [section.title, section.group, section.layout])).toEqual([
    ['Bun Wallet: AI consent', 'Screens', 'screen'],
    ['Bun Wallet: Bun and AI settings', 'Screens', 'screen'],
    ['Bun Wallet: Bun and AI settings, AI off', 'Screens', 'screen'],
  ]);
  const open = async (index: number) => {
    mountWallet(<>{sections[index]?.render()}</>);
    await waitFor(() => found('catalogue-screen-ready'), { timeout: 10_000 });
    startAnimations();
  };
  await open(0);
  named('dialog', 'ตัวช่วย AI ของบัน');
  expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('false');
  cleanup();
  await open(1);
  expect(found('ai-settings-uses-parse').textContent).toBe('27 / 30ประโยค');
  expect(screen.queryAllByRole('dialog')).toEqual([]);
  cleanup();
  await open(2);
  expect(checked(named('switch', 'ตัวช่วย AI ของบัน'))).toBe('false');
  expect(screen.queryAllByTestId('ai-settings-uses')).toEqual([]);
}, 30_000);

test('controls are 44 pt, and AX5 truncates nothing', async () => {
  const atLeast = (element: HTMLElement, what: string) => {
    const height = Number.parseFloat(element.style.minHeight || element.style.height);
    expect(height, `${what} height`).toBeGreaterThanOrEqual(44);
    if (element.style.width || element.style.minWidth) expect(Number.parseFloat(element.style.minWidth || element.style.width), `${what} width`).toBeGreaterThanOrEqual(44);
  };
  for (const fontScale of [1, AX5]) {
    const large = fontScale === AX5;
    await mountSettings(BOARD, { fontScale });
    const controls = ['button', 'radio', 'switch'].flatMap((role) => screen.queryAllByRole(role));
    expect(controls.map((control) => control.getAttribute('aria-label')), `${fontScale}`).toEqual([
      common('common.back'), 'สิ่งที่ AI เห็น', 'เต็ม', 'เงียบ', 'ปิด', 'เปิด', 'เบา', 'ปิด', 'ตัวช่วย AI ของบัน', 'โน้ตประจำวันจากบัน',
    ]);
    for (const control of controls) atLeast(control, `${fontScale} ${control.getAttribute('aria-label')}`);
    // At the largest sizes the choice cards, the uses and the segments stack, so no word is cut.
    expect(named('radiogroup', 'บันโผล่มาแค่ไหน').style.flexDirection, `${fontScale}`).toBe(large ? 'column' : 'row');
    expect(found('ai-settings-uses-parse').parentElement?.style.flexDirection, `${fontScale}`).toBe(large ? 'column' : 'row');
    expect(named('radiogroup', 'การสั่น').style.flexDirection, `${fontScale}`).toBe(large ? 'column' : 'row');
    expect(seen.props.filter((props) => props.numberOfLines !== undefined), `${fontScale}`).toEqual([]);
    cleanup();
    seen.props.length = 0;
  }
});
