import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), navigate: vi.fn(), setParams: vi.fn(), canGoBack: vi.fn(() => true) },
  /** The screen's focus effect: calling it again is "the tab came back into view". */
  focus: { effect: null as null | (() => void) },
}));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => nav.router,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => {
      nav.focus.effect = effect;
      useEffect(() => { effect(); }, [effect]);
    },
  };
});
// The catalogue's screen sections set route params through expo-router's own context.
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { AccessibilityInfo, Animated } from 'react-native';

import type { HistoryPage, TransactionDto } from '@gogospend/contracts';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { INSIGHTS_SECTIONS } from '@mobile/dev/catalogue/insights/insightsSections';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { fullDateLabel, monthLabel, weekdayInitials } from '@mobile/ui/dateStep';
import { CASH, DIARY_REFERENCES, MATRIX, NOW, hiddenFromScreenReaders, leading, mountScreen, outboxCommand, pendingExpense, rgb } from '../HistoryTestHarness';
import { InsightsScreen } from './InsightsScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.focus.effect = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const [FOOD] = BUILTINS;
const TODAY_LABEL = 'Today, Tuesday 29 September 2026, Nothing logged';
const RENT_DAY = 'Sunday 27 September 2026, Money out ฿12,268.00';

/** A September (or any) expense from Cash. */
function spent(index: number, day: string, amountMinor: string): TransactionDto {
  return {
    id: `0000000d-0000-4000-8000-${String(index).padStart(12, '0')}`, type: 'expense', amount_minor: amountMinor, occurred_on: day,
    wallet_id: CASH, category_id: FOOD.id, note: null, merchant: null, deleted_at: null, version: 1,
  };
}

type Options = { records?: readonly TransactionDto[]; golden?: boolean; locale?: Locale; mode?: 'light' | 'dark'; wrap?: (resources: SpendV1Resources) => SpendV1Resources; diary?: ReturnType<typeof createFakeDiary> };

/** Insights on the golden diary (plus `records`), today pinned to 29 September 2026. Waits for the calendar. */
async function insights(options: Options = {}) {
  const fake = mount(options);
  await screen.findByTestId('insights-calendar');
  return fake;
}

function mount(options: Options = {}) {
  const seed = goldenSeed();
  const fake = createFakeResources({ wallets: seed.wallets, records: [...(options.golden === false ? [] : seed.records), ...(options.records ?? [])] });
  const resources = options.wrap ? options.wrap(fake.resources) : fake.resources;
  mountScreen(<InsightsScreen now={NOW} />, { resources, diary: options.diary?.diary ?? null, locale: options.locale, mode: options.mode });
  return fake;
}

/** Every day cell that can be opened. */
const dayButtons = () => within(screen.getByTestId('insights-calendar')).queryAllByRole('button');
const rhythmCard = () => screen.getByTestId('insights-rhythm');
const border = (node: HTMLElement) => node.style.borderTopColor || node.style.borderColor;
/** No colour at all: react-native-web writes `transparent` as a clear rgba. */
const CLEAR = /^(transparent|rgba\(0, 0, 0, 0(\.0+)?\))$/;

// ---------------------------------------------------------------------------
// Loading and problems

test('loading: the stage and its month show at once, with a loading indicator until the month is read', async () => {
  const fake = createFakeResources(goldenSeed());
  const release = fake.hold('history');
  mountScreen(<InsightsScreen now={NOW} />, { resources: fake.resources });
  expect(screen.getByTestId('insights-screen')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Insights' })).toBeTruthy();
  expect(screen.getByText('September 2026')).toBeTruthy();
  expect(await screen.findByLabelText('Loading your diary')).toBeTruthy();
  expect(screen.queryByTestId('insights-calendar')).toBeNull();
  expect(screen.queryByText('Nothing logged')).toBeNull();
  await act(async () => { release(); });
  expect(await screen.findByRole('button', { name: RENT_DAY })).toBeTruthy();
  expect(screen.queryByLabelText('Loading your diary')).toBeNull();
});

test('load problems: a failed load can be tried again; blocked ones say what to do', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('history', 'network');
  mountScreen(<InsightsScreen now={NOW} />, { resources: fake.resources });
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.queryByTestId('insights-calendar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: RENT_DAY })).toBeTruthy();
  cleanup();
  for (const [outcome, message] of [
    ['upgrade_required', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
    ['policy_required', 'Review and accept the updated terms to continue.'],
    ['signed_out', 'Sign in again to see your diary.'],
  ] as const) {
    const blocked = createFakeResources(goldenSeed());
    blocked.fail('history', outcome);
    mountScreen(<InsightsScreen now={NOW} />, { resources: blocked.resources });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    cleanup();
  }
});

test('offline: an offline banner and the problem, the ways on stay, and nothing pretends a day went unlogged', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('history', 'network');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [outboxCommand(pendingExpense({ occurred_on: '2026-09-29' }), 'unsent')] });
  mountScreen(<InsightsScreen now={NOW} />, { resources: fake.resources, diary: diary.diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.getByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.queryByTestId('insights-calendar')).toBeNull();
  expect(screen.queryByTestId('insights-rhythm')).toBeNull();
  expect(screen.queryByText(/Nothing logged/)).toBeNull();
  // Offline never blocks the whole screen: the reminder and the recap are still a tap away.
  expect(screen.getByRole('button', { name: 'Daily reminder' })).toBeTruthy();
  expect(screen.getByRole('button', { name: "This month's recap" })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: RENT_DAY })).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
});

// ---------------------------------------------------------------------------
// A normal month

test("a normal month: the month's money out on the stage, and every day up to today says its exact money out", async () => {
  const fake = await insights();
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  const calendar = screen.getByTestId('insights-calendar');
  expect(within(calendar).getByRole('heading', { name: 'Money out by day' })).toBeTruthy();
  for (const name of [
    RENT_DAY,
    'Saturday 26 September 2026, Money out ฿182.00',
    // Logged, with no money out: income and a move are entries too.
    'Friday 25 September 2026, Money out ฿0.00',
    'Monday 28 September 2026, Money out ฿0.00',
    'Thursday 24 September 2026, Nothing logged',
    'Tuesday 1 September 2026, Nothing logged',
    TODAY_LABEL,
  ]) expect(within(calendar).getByRole('button', { name })).toBeTruthy();
  // 1 to 29 September: today, and nothing after it.
  expect(dayButtons()).toHaveLength(29);
  for (const button of dayButtons()) {
    expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(button.style.minWidth)).toBeGreaterThanOrEqual(44);
  }
  expect(fake.callsOf('history')[0].args[0]).toEqual({ from: '2026-09-01', through: '2026-09-30', sort: 'date_desc' });
});

test('heat: logged days carry a decorative swatch in steps of the accent; a quiet day carries none', async () => {
  await insights();
  const swatch = (date: string) => screen.getByTestId(`insights-heat-${date}`);
  // The rent is the month's busiest day; lunch is a small share of it.
  expect(swatch('2026-09-27').style.backgroundColor).toEqual(rgb(bunLight.accent));
  expect(swatch('2026-09-27').style.opacity).toBe('1');
  expect(swatch('2026-09-26').style.backgroundColor).toEqual(rgb(bunLight.accent));
  expect(Number.parseFloat(swatch('2026-09-26').style.opacity)).toBeLessThan(0.5);
  // Logged with no money out: a hollow swatch, outlined in the accent.
  expect(swatch('2026-09-25').style.backgroundColor).toMatch(CLEAR);
  expect(border(swatch('2026-09-25'))).toEqual(rgb(bunLight.accent));
  expect(screen.queryByTestId('insights-heat-2026-09-24')).toBeNull();
  for (const date of ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']) expect(hiddenFromScreenReaders(swatch(date))).toBe(true);
  // The weekday heads are art too: each day's name is in its label.
  expect(hiddenFromScreenReaders(screen.getByTestId('insights-weekdays'))).toBe(true);
});

test('today is marked in ink and in words; days after today are inert', async () => {
  await insights();
  const today = screen.getByRole('button', { name: TODAY_LABEL });
  expect(border(today)).toEqual(rgb(bunLight.ink));
  expect(border(screen.getByRole('button', { name: RENT_DAY }))).toMatch(CLEAR);
  expect(dayButtons().filter((button) => button.getAttribute('aria-label')?.startsWith('Today'))).toHaveLength(1);
  // 30 September is still to come: drawn, but not a button and not read out.
  expect(screen.queryByRole('button', { name: /30 September 2026/ })).toBeNull();
  const future = screen.getByTestId('insights-future-2026-09-30');
  expect(future.textContent).toBe('30');
  expect(hiddenFromScreenReaders(future)).toBe(true);
  fireEvent.click(future);
  expect(nav.router.push).not.toHaveBeenCalled();
});

test('tapping a day opens History on that month', async () => {
  await insights();
  fireEvent.click(screen.getByRole('button', { name: RENT_DAY }));
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/all', params: { month: '2026-09' } });
  fireEvent.click(screen.getByRole('button', { name: TODAY_LABEL }));
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/all', params: { month: '2026-09' } });
});

test('every page of the month is read: a busy day counts every entry', async () => {
  // 250 more lunches on 10 September: more than one page of 200.
  const busy = Array.from({ length: 250 }, (_, index) => spent(index, '2026-09-10', String(100 + index)));
  const fake = await insights({ records: busy });
  expect(screen.getByRole('button', { name: 'Thursday 10 September 2026, Money out ฿561.25' })).toBeTruthy();
  const reads = fake.callsOf('history').filter((call) => (call.args[0] as { from: string }).from === '2026-09-01');
  expect(reads.map((call) => call.args[1])).toEqual([undefined, 'c200']);
  expect(reads.every((call) => call.args[2] === 200)).toBe(true);
  expect(screen.getByText('Logged 5 days this month')).toBeTruthy();
});

test("the rhythm: days logged this month and the past week's dots, with no money in it", async () => {
  await insights();
  const card = rhythmCard();
  expect(within(card).getByRole('heading', { name: 'Your logging rhythm' })).toBeTruthy();
  expect(within(card).getByText('Logged 4 days this month')).toBeTruthy();
  expect(within(card).getByText('Logged on 4 days in the past week')).toBeTruthy();
  expect(card.textContent).not.toMatch(/฿/);
  // Seven dots, oldest first: 23 to 29 September.
  const dots = ['23', '24', '25', '26', '27', '28', '29'].map((date) => screen.getByTestId(`insights-dot-2026-09-${date}`));
  for (const dot of dots) expect(hiddenFromScreenReaders(dot)).toBe(true);
  const filled = dots.map((dot) => !CLEAR.test(dot.style.backgroundColor));
  expect(filled).toEqual([false, false, true, true, true, true, false]);
  expect(dots[2].style.backgroundColor).toEqual(rgb(bunLight.accent));
  // An open day is a soft outline, never a warning colour.
  expect(border(dots[0])).toEqual(rgb(bunLight.rule));
  expect(border(dots[0])).not.toEqual(rgb(bunLight.over));
});

test('a month with gaps: skipped days never break the rhythm, and nothing scolds', async () => {
  // Logged on the 23rd, then a skipped 24th, then the golden 25th to 28th; today still open.
  await insights({ records: [spent(1, '2026-09-23', '4500'), spent(2, '2026-09-03', '1200')] });
  const card = rhythmCard();
  expect(within(card).getByText('Logged 6 days this month')).toBeTruthy();
  expect(within(card).getByText('Logged on 5 days in the past week')).toBeTruthy();
  expect(card.textContent).not.toMatch(/miss|broke|lost|fail|streak|again/i);
  expect(screen.getByRole('button', { name: 'Thursday 24 September 2026, Nothing logged' })).toBeTruthy();
  expect(screen.getByTestId('insights-dot-2026-09-24').style.backgroundColor).toMatch(CLEAR);
});

test('the bun cheers a good week at full intensity; Quiet and Off keep it away', async () => {
  const goodWeek = [spent(1, '2026-09-23', '4500'), spent(2, '2026-09-24', '1200')];
  await insights({ records: goodWeek });
  const bun = screen.getByTestId('insights-bun-cheer');
  expect(bun.querySelector('svg')).toBeTruthy();
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  cleanup();
  for (const intensity of ['quiet', 'off']) {
    window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
    await insights({ records: goodWeek });
    expect(screen.getByText('Logged on 6 days in the past week')).toBeTruthy();
    expect(screen.queryByTestId('insights-bun-cheer')).toBeNull();
    cleanup();
  }
  // Four days is a fine week too, just not one the bun cheers.
  window.localStorage.clear();
  await insights();
  expect(screen.queryByTestId('insights-bun-cheer')).toBeNull();
});

test('under reduced motion the cheering bun simply appears, with no spring', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const spring = vi.spyOn(Animated, 'spring');
  await insights({ records: [spent(1, '2026-09-23', '4500'), spent(2, '2026-09-24', '1200')] });
  expect(screen.getByTestId('insights-bun-cheer')).toBeTruthy();
  await act(async () => { await Promise.resolve(); });
  expect(spring).not.toHaveBeenCalled();
});

test("drafts on this device: today counts as logged and its waiting money is said apart from confirmed money", async () => {
  const draft = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29' }), 'unsent');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [draft] });
  const fake = await insights({ diary });
  expect(screen.getByRole('button', { name: 'Today, Tuesday 29 September 2026, Money out ฿0.00, Waiting to sync: money out ฿65.00' })).toBeTruthy();
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  expect(screen.getByText('Logged 5 days this month')).toBeTruthy();
  // The draft resolves: Insights reads the month again, in place.
  const before = fake.callsOf('history').length;
  act(() => diary.set({ outbox: [] }));
  await waitFor(() => expect(fake.callsOf('history').length).toBeGreaterThan(before));
  expect(screen.getByTestId('insights-calendar')).toBeTruthy();
});

test('coming back to Insights refreshes it in place', async () => {
  const fake = await insights();
  const before = fake.callsOf('history').length;
  fake.records.set('0000000d-0000-4000-8000-000000000099', spent(99, '2026-09-29', '6500'));
  act(() => nav.focus.effect?.());
  expect(await screen.findByRole('button', { name: 'Today, Tuesday 29 September 2026, Money out ฿65.00' })).toBeTruthy();
  expect(fake.callsOf('history').length).toBeGreaterThan(before);
  expect(screen.queryByLabelText('Loading your diary')).toBeNull();
});

test('entries that changed while the month was read: says so, and Refresh reads it again', async () => {
  let changed = true;
  const fake = await insights({
    wrap: (resources) => ({ ...resources, history: async (...args) => ({ ...(await resources.history(...args)), refresh_suggested: changed }) as HistoryPage }),
  });
  expect(screen.getByText('Entries changed since you opened this list.')).toBeTruthy();
  const before = fake.callsOf('history').length;
  changed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.queryByText('Entries changed since you opened this list.')).toBeNull());
  expect(fake.callsOf('history').length).toBeGreaterThan(before);
});

// ---------------------------------------------------------------------------
// An empty month and a past month

test('an empty month: a kind empty state with the thinking bun, and no count of zero days', async () => {
  mount({ golden: false });
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  expect(screen.getByText('Entries you add for this month show up here.')).toBeTruthy();
  const bun = screen.getByTestId('insights-empty-bun');
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  expect(screen.queryByTestId('insights-calendar')).toBeNull();
  expect(screen.queryByText(/Logged 0/)).toBeNull();
  expect(within(rhythmCard()).getByText('Your diary is here whenever you are.')).toBeTruthy();
  expect(screen.getByLabelText('Money out ฿0.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
  expect(nav.router.push).toHaveBeenLastCalledWith('/spend/add');
  cleanup();
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'off');
  mount({ golden: false });
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  expect(screen.queryByTestId('insights-empty-bun')).toBeNull();
});

test('a past month: no today, every day opens History on that month, its own recap, and the same past week', async () => {
  const fake = await insights({ records: [spent(1, '2026-08-15', '5000')] });
  expect(screen.getByRole('button', { name: 'Next month' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('August 2026')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Saturday 15 August 2026, Money out ฿50.00' })).toBeTruthy();
  expect(dayButtons()).toHaveLength(31);
  expect(dayButtons().some((button) => button.getAttribute('aria-label')?.startsWith('Today'))).toBe(false);
  expect(screen.getByLabelText('Money out ฿50.00')).toBeTruthy();
  expect(within(rhythmCard()).getByText('Logged 1 day in August 2026')).toBeTruthy();
  // The past week is still the one up to today, read on its own.
  expect(within(rhythmCard()).getByText('Logged on 4 days in the past week')).toBeTruthy();
  expect(fake.callsOf('history').some((call) => (call.args[0] as { from: string }).from === '2026-09-23')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Tuesday 4 August 2026, Nothing logged' }));
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/all', params: { month: '2026-08' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recap for August 2026' }));
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/recap/[month]', params: { month: '2026-08' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(await screen.findByRole('button', { name: RENT_DAY })).toBeTruthy();
  expect(screen.getByText('September 2026')).toBeTruthy();
});

test("links: this month's recap and the daily reminder, each a 44 pt target", async () => {
  await insights();
  const recap = screen.getByRole('button', { name: "This month's recap" });
  const reminder = screen.getByRole('button', { name: 'Daily reminder' });
  for (const link of [recap, reminder]) expect(Number.parseFloat(link.style.minHeight)).toBeGreaterThanOrEqual(44);
  fireEvent.click(recap);
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/recap/[month]', params: { month: '2026-09' } });
  fireEvent.click(reminder);
  expect(nav.router.push).toHaveBeenLastCalledWith('/spend/reminders');
});

// ---------------------------------------------------------------------------
// Thai, dark mode and every locale

test('Thai: Buddhist-era dates, the Thai week and Thai leading', async () => {
  await insights({ locale: 'th' });
  const tc = (english: string, values?: Record<string, string | number>) => translateCopy(english, 'th', values);
  expect(screen.getByText('กันยายน 2569')).toBeTruthy();
  expect(screen.getByRole('button', { name: `${fullDateLabel('2026-09-27', 'th')}, ${tc('Money out')} ฿12,268.00` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `${tc('Today')}, ${fullDateLabel('2026-09-29', 'th')}, ${tc('Nothing logged')}` })).toBeTruthy();
  expect(fullDateLabel('2026-09-27', 'th')).toBe('วันอาทิตย์ที่ 27 กันยายน 2569');
  expect(screen.getByTestId('insights-weekdays').textContent).toBe(weekdayInitials('th').join(''));
  const title = screen.getByRole('heading', { name: tc('Insights') });
  expect(title.style.lineHeight).toBe(leading('title', 'th'));
  expect(within(rhythmCard()).getByText(tc('Logged {count} days this month', { count: 4 })).style.lineHeight).toBe(leading('body', 'th'));
});

test('dark mode: the lavender night ground, ink text and the dark accent', async () => {
  await insights({ mode: 'dark', records: [spent(1, '2026-09-23', '4500'), spent(2, '2026-09-24', '1200')] });
  expect(screen.getByTestId('insights-screen').style.backgroundColor).toEqual(rgb(bunDark.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(bunDark.stage));
  expect(screen.getByRole('heading', { name: 'Insights' }).style.color).toEqual(rgb(bunDark.ink));
  expect(screen.getByTestId('insights-heat-2026-09-27').style.backgroundColor).toEqual(rgb(bunDark.accent));
  expect(border(screen.getByRole('button', { name: TODAY_LABEL }))).toEqual(rgb(bunDark.ink));
  expect(screen.getByTestId('insights-dot-2026-09-23').style.backgroundColor).toEqual(rgb(bunDark.accent));
  expect(screen.getByTestId('insights-bun-cheer')).toBeTruthy();
});

test.each(MATRIX)('reads in $locale, $mode: the palette ground, the stage, the Buddhist-era month and ink amounts', async ({ locale, mode, colors }) => {
  await insights({ locale, mode });
  expect(screen.getByTestId('insights-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByText(monthLabel('2026-09', locale))).toBeTruthy();
  const out = screen.getByLabelText(`${translateCopy('Money out', locale)} ฿12,450.00`);
  expect(out.style.color).toEqual(rgb(colors.ink));
  expect(screen.getByRole('button', { name: `${fullDateLabel('2026-09-27', locale)}, ${translateCopy('Money out', locale)} ฿12,268.00` })).toBeTruthy();
  expect(screen.getByTestId('insights-heat-2026-09-27').style.backgroundColor).toEqual(rgb(colors.accent));
});

// ---------------------------------------------------------------------------
// The catalogue's Insights sections (registered later, at E2)

test('the catalogue has one Insights section per state, with insights- ids and Insights: titles', () => {
  const ids = INSIGHTS_SECTIONS.map((section) => section.id);
  expect(ids).toEqual([
    'insights-month', 'insights-loading', 'insights-problem', 'insights-offline', 'insights-empty', 'insights-past-month', 'insights-gaps',
    'insights-good-week', 'insights-drafts',
  ]);
  for (const section of INSIGHTS_SECTIONS) {
    expect(section.title).toMatch(/^Insights: \S/);
    expect(section.group).toBe('Screens');
  }
  expect(new Set(INSIGHTS_SECTIONS.map((section) => section.title)).size).toBe(ids.length);
});

test.each(INSIGHTS_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state', async (_id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? null).toBeNull();
  expect(screen.getByTestId('catalogue-screen-ready')).toBeTruthy();
  expect(screen.getByTestId('insights-screen')).toBeTruthy();
  expect(network).not.toHaveBeenCalled();
}, 20_000);
