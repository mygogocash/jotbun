// R5 Reminders (plan §6.3): every state of the screen, on the real reminder
// service over a fake notifications port (or a held one for saving), in TH and
// EN, light and dark, with the bun at each intensity. Also: the catalogue's
// reminders sections each reach their state.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// The catalogue's stand-ins: a recorded router (with its route params context)
// and an iPhone's safe-area insets. The real packages need a native runtime.
vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { REMINDERS_SECTIONS } from '@mobile/dev/catalogue/insights/remindersSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { hiddenFromScreenReaders, installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { DAILY_REMINDER_ID, EVERY_DAY, WEEKLY_REMINDER_IDS, createLocalReminderService } from '@mobile/notifications/reminders';
import type { LocalReminderService, PermissionOutcome, ReminderPort, ReminderPreferenceInput, StoredReminderPreference, Weekday } from '@mobile/notifications/reminders';
import { BUN_TEXT_PAIRS, bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { contrastRatio } from '@mobile/theme/contrast';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { RemindersScreen } from './RemindersScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => { router.back.mockClear(); router.replace.mockClear(); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Harness

type Mode = 'light' | 'dark';
const PALETTES: Readonly<Record<Mode, BunColors>> = { light: bunLight, dark: bunDark };
const t = (english: string, locale: Locale = 'en', values?: Record<string, string | number>) => translateCopy(english, locale, values);

/** The real service over a fake notifications port and an in-memory store. */
function harness({ stored = null, permission = 'granted', answer = 'granted', supported = true }: {
  stored?: StoredReminderPreference | null;
  permission?: 'granted' | 'denied' | 'undetermined';
  answer?: 'granted' | 'denied';
  supported?: boolean;
} = {}) {
  const scheduled = new Map<string, { hour: number; minute: number; weekday?: Weekday; title: string }>();
  let requests = 0;
  let current = permission;
  let saved = stored;
  const port: ReminderPort = {
    supported,
    permission: async () => current,
    requestPermission: async () => {
      requests += 1;
      current = answer;
      return answer;
    },
    cancel: async (id) => void scheduled.delete(id),
    scheduleWeekly: async (id, weekday, hour, minute, content) => void scheduled.set(id, { weekday, hour, minute, title: content.title }),
  };
  const service = createLocalReminderService(
    port,
    { load: async () => saved, save: async (next) => void (saved = next), loadScheduledFor: async () => null, saveScheduledFor: async () => undefined },
    () => ({ title: "Log today's spending", body: 'Add what you spent today in Jotbun.' }),
  );
  return { service, scheduled, requests: () => requests, stored: () => saved };
}

/** A service whose saves wait until the test lets them through. */
function heldService(base: LocalReminderService) {
  const held: { release: (outcome: PermissionOutcome) => void; fail: (error: Error) => void }[] = [];
  const asked: ReminderPreferenceInput[] = [];
  const service: LocalReminderService = {
    ...base,
    supported: base.supported,
    getPreference: () => base.getPreference(),
    setPreference: (preference) => {
      asked.push(preference);
      return new Promise<PermissionOutcome>((release, fail) => { held.push({ release, fail }); });
    },
  };
  return { service, held, asked };
}

/** A Tuesday evening: every day chosen, the preview shows Tuesday's reminder. */
const TUESDAY = new Date(2026, 9, 27, 18, 0);

function mount(service: LocalReminderService | undefined, { locale = 'en', mode = 'light', intensity }: { locale?: Locale; mode?: Mode; intensity?: BunIntensity } = {}) {
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>
          <BunIntensityProvider>
            <RemindersScreen service={service} now={TUESDAY} />
          </BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

const ON: StoredReminderPreference = { enabled: true, localTime: '20:00' };
const WEEK_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEK_TH = ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์', 'วันอาทิตย์'];

const switchOf = (locale: Locale = 'en') => screen.findByRole('switch', { name: t('Remind me to log', locale) });
const checked = (element: HTMLElement) => element.getAttribute('aria-checked') === 'true';
const days = () => screen.getAllByRole('checkbox');
const saveButton = (locale: Locale = 'en') => within(screen.getByTestId('reminders-footer')).getByRole('button', { name: t('Save', locale) });
const timeChip = (time: string, locale: Locale = 'en') => screen.getByRole('button', { name: `${t('Reminder time', locale)}, ${time}` });
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));

/** `#RRGGBB` for a CSS colour react-native-web wrote; null when transparent. */
function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Every piece of text is in a palette pair BUN_TEXT_PAIRS approves, clearing 4.5:1 on the ground behind it. */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let count = 0;
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
    if (!ownText || !element.style.color || hiddenFromScreenReaders(element)) continue;
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    expect(fg, element.textContent ?? '').not.toBeNull();
    expect(ground, element.textContent ?? '').not.toBeNull();
    const pairOk = BUN_TEXT_PAIRS.some(([text, on]) => tokens(fg as string).includes(text) && tokens(ground as string).includes(on));
    expect(pairOk, `${element.textContent}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg as string, ground as string), element.textContent ?? '').toBeGreaterThanOrEqual(4.5);
    count += 1;
  }
  expect(count).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Off

test('off: the switch is off and says so; Save keeps reminders off and asks nothing', async () => {
  const h = harness();
  mount(h.service);
  expect(screen.getByLabelText('Loading your reminder')).toBeTruthy();
  const toggle = await switchOf();
  expect(checked(toggle)).toBe(false);
  expect(screen.getByRole('heading', { name: 'Reminders' })).toBeTruthy();
  expect(screen.getByText("Jotbun won't remind you.")).toBeTruthy();
  expect(screen.queryByTestId('reminders-preview')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Reminder time/ })).toBeNull();
  expect(screen.queryAllByRole('checkbox')).toEqual([]);

  // Save is pinned under the scrolling page, not inside it.
  expect(screen.getByTestId('reminders-scroll').contains(screen.getByTestId('reminders-footer'))).toBe(false);
  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Reminders are off.')).toBeTruthy();
  expect(h.stored()).toEqual({ enabled: false, localTime: '20:00', weekdays: EVERY_DAY });
  expect(h.requests()).toBe(0);
  expect(h.scheduled.size).toBe(0);

  // The whole height, with a way back.
  expect(screen.getByTestId('reminders-screen').style.flexGrow).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  // Reminders opens from Insights: with nothing to go back to, Back goes there.
  router.canGoBack.mockReturnValue(false);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.replace).toHaveBeenLastCalledWith('/spend/insights');
  } finally {
    router.canGoBack.mockReturnValue(true);
  }
});

// ---------------------------------------------------------------------------
// On with every day

test('on with every day: the time, seven chosen days Monday first, and the live preview; Save keeps one daily reminder', async () => {
  // S4 stored no days: that reads as every day.
  const h = harness({ stored: ON });
  mount(h.service);
  const toggle = await switchOf();
  expect(checked(toggle)).toBe(true);
  expect(timeChip('20:00').textContent).toBe('20:00');
  expect(days().map((day) => day.getAttribute('aria-label'))).toEqual(WEEK_EN);
  expect(days().every(checked)).toBe(true);
  expect(within(screen.getByRole('group', { name: 'Days' })).getAllByRole('checkbox')).toHaveLength(7);

  const preview = screen.getByTestId('reminders-preview');
  expect(within(preview).getByText('Bun saved you a fresh page')).toBeTruthy();
  expect(within(preview).getByText('Add what you spent today in Jotbun.')).toBeTruthy();
  expect(within(preview).getByText('Jotbun')).toBeTruthy();
  expect(within(preview).getByText('20:00')).toBeTruthy();
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Every day at 20:00');

  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  expect([...h.scheduled.keys()].sort()).toEqual(Object.values(WEEKLY_REMINDER_IDS).sort());
  expect(h.scheduled.get(WEEKLY_REMINDER_IDS[2])).toEqual({ weekday: 2, hour: 20, minute: 0, title: "Log today's spending" });
  expect(h.scheduled.has(DAILY_REMINDER_ID)).toBe(false);
  expect(h.stored()).toEqual({ enabled: true, localTime: '20:00', weekdays: EVERY_DAY });
});

test('turning the switch on shows the time, the days and the preview; nothing is saved until Save', async () => {
  const h = harness({ permission: 'undetermined' });
  mount(h.service);
  fireEvent.click(await switchOf());
  expect(checked(await switchOf())).toBe(true);
  expect(screen.getByTestId('reminders-preview')).toBeTruthy();
  expect(timeChip('20:00')).toBeTruthy();
  expect(h.requests()).toBe(0);
  expect(h.stored()).toBeNull();
  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  expect(h.requests()).toBe(1);
});

// ---------------------------------------------------------------------------
// On with weekdays only

test('on with weekdays only: Saturday and Sunday off, the preview says weekdays, and Save schedules five weekly reminders', async () => {
  const h = harness({ stored: ON });
  mount(h.service);
  await switchOf();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
  expect(days().map(checked)).toEqual([true, true, true, true, true, false, false]);
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Weekdays at 20:00');
  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  expect([...h.scheduled.keys()].sort()).toEqual(([1, 2, 3, 4, 5] as const).map((day) => WEEKLY_REMINDER_IDS[day]).sort());
  expect(h.scheduled.has(DAILY_REMINDER_ID)).toBe(false);
  expect(h.stored()).toEqual({ enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5] });
});

test('a saved set of days loads as it was saved, and other days read as short names in order', async () => {
  const h = harness({ stored: { enabled: true, localTime: '06:45', weekdays: [5, 1, 3] } });
  mount(h.service);
  await switchOf();
  expect(days().map(checked)).toEqual([true, false, true, false, true, false, false]);
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Mon, Wed, Fri at 06:45');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Mon, Fri, Sat, Sun at 06:45');
});

// ---------------------------------------------------------------------------
// Changing the time

test('changing the time: a sheet of hours and 5-minute steps, no keyboard, and the preview follows', async () => {
  const h = harness({ stored: { enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5] } });
  mount(h.service);
  await switchOf();
  fireEvent.click(timeChip('20:00'));
  const sheet = await screen.findByRole('dialog', { name: 'Reminder time' });
  // No system keyboard: nothing to type into.
  expect(sheet.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0);
  const hours = within(within(sheet).getByRole('radiogroup', { name: 'Hour' })).getAllByRole('radio');
  const minutes = within(within(sheet).getByRole('radiogroup', { name: 'Minute' })).getAllByRole('radio');
  expect(hours.map((radio) => radio.textContent)).toEqual(Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')));
  expect(minutes.map((radio) => radio.textContent)).toEqual(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
  expect(hours.filter(checked).map((radio) => radio.textContent)).toEqual(['20']);
  expect(minutes.filter(checked).map((radio) => radio.textContent)).toEqual(['00']);

  fireEvent.click(within(sheet).getByRole('radio', { name: '07' }));
  fireEvent.click(within(sheet).getByRole('radio', { name: '30' }));
  expect(within(sheet).getByTestId('reminders-time-shown').textContent).toBe('07:30');
  // Live: the preview behind the sheet has already moved.
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Weekdays at 07:30');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(timeChip('07:30').textContent).toBe('07:30');
  expect(within(screen.getByTestId('reminders-preview')).getByText('07:30')).toBeTruthy();

  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  expect([...h.scheduled.values()].every((reminder) => reminder.hour === 7 && reminder.minute === 30)).toBe(true);
  expect(h.scheduled.size).toBe(5);
});

// ---------------------------------------------------------------------------
// Permission denied

test('permission denied: asked once, then the way to Settings in words, and the switch settles off', async () => {
  const h = harness({ permission: 'undetermined', answer: 'denied' });
  mount(h.service);
  fireEvent.click(await switchOf());
  fireEvent.click(saveButton());
  const notice = await screen.findByText("Jotbun can't send notifications. Turn on notifications for Jotbun in Settings.");
  expect(notice.closest('[role="alert"]')).toBeTruthy();
  expect(checked(await switchOf())).toBe(false);
  expect(h.requests()).toBe(1);
  expect(h.scheduled.size).toBe(0);
  expect(h.stored()).toEqual({ enabled: false, localTime: '20:00', weekdays: EVERY_DAY });
  // Trying again asks no second time: the denial is settled.
  fireEvent.click(await switchOf());
  fireEvent.click(saveButton());
  await waitFor(() => expect(checked(screen.getByRole('switch'))).toBe(false));
  expect(h.requests()).toBe(1);
});

// ---------------------------------------------------------------------------
// Unsupported (web)

test('unsupported: says reminders need the phone app, and offers nothing that cannot work', async () => {
  const h = harness({ supported: false });
  mount(h.service);
  const toggle = await switchOf();
  expect(screen.getByTestId('reminders-unsupported').textContent).toBe('Reminders work in the Jotbun app on your phone, not on the web.');
  expect(toggle.getAttribute('aria-disabled')).toBe('true');
  expect(checked(toggle)).toBe(false);
  fireEvent.click(toggle);
  expect(checked(screen.getByRole('switch'))).toBe(false);
  expect(screen.queryByTestId('reminders-preview')).toBeNull();
  expect(saveButton().getAttribute('aria-disabled')).toBe('true');
});

test("with no service given, the screen uses the app's own: on the web, unsupported", async () => {
  mount(undefined);
  await switchOf();
  expect(screen.getByTestId('reminders-unsupported')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// At least one day

test('at least one day must stay chosen: the last day stays on, and the screen says why', async () => {
  const h = harness({ stored: { enabled: true, localTime: '20:00', weekdays: [3] } });
  mount(h.service);
  await switchOf();
  expect(screen.queryByTestId('reminders-day-note')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
  expect(checked(screen.getByRole('checkbox', { name: 'Wednesday' }))).toBe(true);
  const note = screen.getByTestId('reminders-day-note');
  expect(note.textContent).toBe('Keep at least one day. To stop reminders, turn them off.');
  expect(note.getAttribute('aria-live')).toBe('polite');
  // Choosing another day clears the note; Wednesday can then go.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }));
  expect(screen.queryByTestId('reminders-day-note')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
  expect(days().map(checked)).toEqual([false, false, false, true, false, false, false]);
  expect(screen.getByTestId('reminders-schedule').textContent).toBe('Thu at 20:00');
});

// ---------------------------------------------------------------------------
// Saving

test('saving: Save is busy and every control waits; then the outcome, or a failure kept in words', async () => {
  const h = harness({ stored: ON });
  const held = heldService(h.service);
  mount(held.service);
  await switchOf();
  fireEvent.click(saveButton());
  const busy = within(screen.getByTestId('reminders-footer')).getByRole('button', { name: 'Saving…' });
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true');
  expect(timeChip('20:00').getAttribute('aria-disabled')).toBe('true');
  expect(days().every((day) => day.getAttribute('aria-disabled') === 'true')).toBe(true);
  // A second press while busy sends nothing more.
  fireEvent.click(busy);
  expect(held.asked).toEqual([{ enabled: true, localTime: '20:00', weekdays: EVERY_DAY }]);
  await act(async () => { held.held[0].release('scheduled'); });
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  expect(saveButton().getAttribute('aria-busy')).toBe('false');

  fireEvent.click(saveButton());
  await act(async () => { held.held[1].fail(new Error('storage full')); });
  const failed = await screen.findByText('Could not save that. Try again.');
  expect(failed.closest('[role="alert"]')).toBeTruthy();
  expect(checked(screen.getByRole('switch'))).toBe(true);
});

test('a change after saving clears the outcome, since it no longer describes the screen', async () => {
  const h = harness({ stored: ON });
  mount(h.service);
  await switchOf();
  fireEvent.click(saveButton());
  expect(await screen.findByText('Saved. Your reminder is on.')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
  expect(screen.queryByText('Saved. Your reminder is on.')).toBeNull();
});

// ---------------------------------------------------------------------------
// Thai

test('Thai: Thai leading, the weekday names from Thai Intl data Monday first, and the reminder in Thai', async () => {
  const h = harness({ stored: { enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5] } });
  mount(h.service, { locale: 'th' });
  await switchOf('th');
  const title = screen.getByRole('heading', { name: t('Reminders', 'th') });
  expect(title.style.lineHeight).toBe(`${bunText('title', 'thai').lineHeight}px`);
  expect(days().map((day) => day.getAttribute('aria-label'))).toEqual(WEEK_TH);
  expect(days().map((day) => day.textContent)).toEqual(['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']);
  const monday = screen.getByText('จ');
  expect(monday.style.lineHeight).toBe(`${bunText('label', 'thai').lineHeight}px`);
  const preview = screen.getByTestId('reminders-preview');
  // A Tuesday: Tuesday's reminder, in Thai (its body is the old daily line's).
  expect(within(preview).getByText('บันเปิดหน้าใหม่รอไว้แล้ว')).toBeTruthy();
  expect(within(preview).getByText('เพิ่มรายจ่ายของวันนี้ใน Jotbun')).toBeTruthy();
  expect(screen.getByTestId('reminders-schedule').textContent).toBe(t('{days} at {time}', 'th', { days: t('Weekdays', 'th'), time: '20:00' }));
  expect(saveButton('th')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'วันพุธ' }));
  expect(screen.getByTestId('reminders-schedule').textContent).toBe(t('{days} at {time}', 'th', { days: 'จันทร์, อังคาร, พฤหัส, ศุกร์', time: '20:00' }));
});

// ---------------------------------------------------------------------------
// Dark mode

test.each(['light', 'dark'] as const)('%s: the stage, the preview, the days, the sheet and the outcome use approved text pairs', async (mode) => {
  const colors = PALETTES[mode];
  const h = harness({ stored: { enabled: true, localTime: '20:00', weekdays: [1, 2, 3, 4, 5] }, permission: 'undetermined', answer: 'denied' });
  mount(h.service, { mode });
  await switchOf();
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByTestId('reminders-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByRole('heading', { name: 'Reminders' }).style.color).toEqual(rgb(colors.ink));
  // A chosen day is filled with ink, with its letter in onInk; an unchosen one is not.
  expect(screen.getByRole('checkbox', { name: 'Monday' }).style.backgroundColor).toEqual(rgb(colors.ink));
  expect(screen.getByRole('checkbox', { name: 'Sunday' }).style.backgroundColor).not.toEqual(rgb(colors.ink));
  expectApprovedTextPairs(document.body, colors);
  fireEvent.click(timeChip('20:00'));
  await screen.findByRole('dialog', { name: 'Reminder time' });
  expectApprovedTextPairs(document.body, colors);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(saveButton());
  await screen.findByText("Jotbun can't send notifications. Turn on notifications for Jotbun in Settings.");
  expectApprovedTextPairs(document.body, colors);
});

// ---------------------------------------------------------------------------
// The bun

test.each([
  ['full', true],
  ['quiet', false],
  ['off', false],
] as const)('bun %s: the bun peeks over the preview only at full intensity', async (intensity, shows) => {
  const h = harness({ stored: ON });
  mount(h.service, { intensity });
  await switchOf();
  const preview = screen.getByTestId('reminders-preview');
  expect(within(preview).getByText('Bun saved you a fresh page')).toBeTruthy();
  const bun = screen.queryByTestId('reminders-bun');
  expect(Boolean(bun)).toBe(shows);
  if (bun) {
    // It peeks over the preview card's own top edge, as decoration.
    expect(preview.contains(bun)).toBe(true);
    expect(bun.style.position).toBe('absolute');
    expect(Number.parseFloat(bun.style.top)).toBeLessThan(0);
    expect(hiddenFromScreenReaders(bun.querySelector('svg'))).toBe(true);
  } else {
    expect(document.querySelectorAll('svg[viewBox]:not([viewBox="0 0 24 24"])')).toHaveLength(0);
  }
});

// ---------------------------------------------------------------------------
// The catalogue's sections

test('the catalogue has one reminders section per state, each reaching its state on a fake service', async () => {
  expect(REMINDERS_SECTIONS.map((section) => section.id)).toEqual([
    'reminders-off', 'reminders-every-day', 'reminders-weekdays', 'reminders-time', 'reminders-denied', 'reminders-unsupported',
    'reminders-one-day', 'reminders-saving', 'reminders-thai', 'reminders-dark',
  ]);
  expect(new Set(REMINDERS_SECTIONS.map((section) => section.title)).size).toBe(REMINDERS_SECTIONS.length);
  for (const section of REMINDERS_SECTIONS) {
    expect(section.id).toMatch(/^reminders(-[a-z0-9]+)+$/);
    expect(section.title).toMatch(/^Reminders: /);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  /** What each state shows: its text, test id or label. */
  const SHOWS: Readonly<Record<string, string>> = {
    'reminders-off': "Jotbun won't remind you.",
    'reminders-every-day': 'Every day at 20:00',
    'reminders-weekdays': 'Weekdays at 07:30',
    'reminders-time': 'Every day at 07:30',
    'reminders-denied': "Jotbun can't send notifications. Turn on notifications for Jotbun in Settings.",
    'reminders-unsupported': 'Reminders work in the Jotbun app on your phone, not on the web.',
    'reminders-one-day': 'Keep at least one day. To stop reminders, turn them off.',
    'reminders-saving': 'Saving…',
    'reminders-thai': 'บันเปิดหน้าใหม่รอไว้แล้ว',
    'reminders-dark': 'Weekdays at 07:30',
  };
  for (const section of REMINDERS_SECTIONS) {
    render(
      <IntlProvider locale="en">
        <ThemeProvider>
          <ThemePreferenceOverride preference="light">
            <BunIntensityProvider>{section.render()}</BunIntensityProvider>
          </ThemePreferenceOverride>
        </ThemeProvider>
      </IntlProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 5000 });
    expect(screen.queryByTestId('catalogue-screen-stopped'), section.id).toBeNull();
    expect(screen.queryAllByText(SHOWS[section.id]).length + screen.queryAllByLabelText(SHOWS[section.id]).length, `${section.id} shows ${SHOWS[section.id]}`).toBeGreaterThan(0);
    if (section.id === 'reminders-every-day') expect(screen.getByTestId('reminders-bun')).toBeTruthy();
    if (section.id === 'reminders-time') expect(screen.getByRole('dialog', { name: 'Reminder time' })).toBeTruthy();
    if (section.id === 'reminders-saving') expect(screen.getByRole('button', { name: 'Saving…' }).getAttribute('aria-busy')).toBe('true');
    if (section.id === 'reminders-thai') expect(screen.getAllByRole('checkbox').map((day) => day.getAttribute('aria-label'))).toEqual(WEEK_TH);
    if (section.id === 'reminders-dark') expect(screen.getByTestId('reminders-screen').style.backgroundColor).toEqual(rgb(bunDark.background));
    cleanup();
  }
}, 30000);
