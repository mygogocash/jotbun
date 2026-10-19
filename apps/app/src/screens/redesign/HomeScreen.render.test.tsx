// The redesigned Home (R3): every state, the golden month's exact figures,
// row navigation, device drafts, waiting money kept apart from confirmed
// money, the first-wallet form, and TH/EN/VI in light and dark.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. Nothing here draws images, so
// that one resolver is stubbed and the real SVG elements still render (as in
// the mascot and kit tests).

import type { BudgetDto, CreateWalletRequest, TransactionDto } from '@gogospend/contracts';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { hiddenFromScreenReaders, installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { DiaryView, SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
import { BUN_TEXT_PAIRS, bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { contrastRatio } from '@mobile/theme/contrast';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { NOW } from '../v1/renderHarness';
import { HomeScreen } from './HomeScreen';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), navigate: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  router.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Harness and fixtures

type Mode = 'light' | 'dark';
const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const PALETTES: Readonly<Record<Mode, BunColors>> = { light: bunLight, dark: bunDark };
const MATRIX = LOCALES.flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ locale, mode, colors: PALETTES[mode] })));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mountHome(resources: SpendV1Resources, options: { locale?: Locale; mode?: Mode; diary?: SpendDiary | null; intensity?: BunIntensity } = {}) {
  const { locale = 'en', mode = 'light', diary = null, intensity } = options;
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>
          <BunIntensityProvider>
            <SpendV1Provider resources={resources}>
              <SpendDiaryProvider diary={diary}>
                <HomeScreen now={NOW} />
              </SpendDiaryProvider>
            </SpendV1Provider>
          </BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

const seed = goldenSeed();
const [CASH, DAILY] = seed.wallets;
const [FOOD, , , , GIFT] = BUILTINS;
const RENT = '0000000b-0000-4000-8000-000000000003';
const LUNCH: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000011', type: 'expense', amount_minor: '12000', occurred_on: '2026-09-29', wallet_id: CASH.id, category_id: FOOD.id,
  note: null, merchant: 'Noodle shop', deleted_at: null, version: 1,
};
const GIFTED: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000012', type: 'income', amount_minor: '5000', occurred_on: '2026-09-29', wallet_id: DAILY.id, category_id: GIFT.id,
  note: null, merchant: null, deleted_at: null, version: 1,
};

/** The fake resources with this month's budget (the fake itself has none). */
function withBudget(fake: ReturnType<typeof createFakeResources>, limit: string): SpendV1Resources {
  const budget = async (month: string): Promise<BudgetDto> => ({ id: '0000000d-0000-4000-8000-000000000001', month, overall_limit_minor: limit, category_limits: [], version: 1 });
  return { ...fake.resources, budget: vi.fn(budget) };
}

const draftEntry = (overrides: Partial<PendingEntry> = {}): PendingEntry =>
  ({ id: crypto.randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null, ...overrides }) as PendingEntry;
const queued = (payload: PendingEntry, state: OutboxCommand['state'], createdAt = '2026-09-29T03:00:00.000Z'): OutboxCommand => ({
  commandId: crypto.randomUUID(), accountId: 'a0000000-0000-4000-8000-000000000001', schemaVersion: 1, kind: 'transaction.create', payload, state,
  firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt, ackedRevision: state === 'acknowledged' ? '99' : null,
});
const deviceDiary = (view: Partial<DiaryView> = {}) => createFakeDiary({ wallets: seed.wallets, categories: BUILTINS, ...view });

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const isLocked = (label: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  return input.disabled || input.readOnly;
};
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));
const leading = (role: Parameters<typeof bunText>[0], locale: Locale) => `${bunText(role, locale === 'th' ? 'thai' : 'latin').lineHeight}px`;

/** `#RRGGBB` for a CSS colour react-native-web wrote; null when transparent. */
function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Every piece of text on screen is drawn in a palette pair that BUN_TEXT_PAIRS
 * approves (so bunPalette.test.ts holds it to AA), and clears 4.5:1 against
 * the nearest ground behind it.
 */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let checked = 0;
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
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Loading and the golden month

test('loading, then the golden month: exact figures, an empty today receipt and earlier days', async () => {
  const fake = createFakeResources(goldenSeed());
  mountHome(fake.resources);
  expect(screen.getByLabelText('Loading your diary')).toBeTruthy();
  expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy();
  expect(screen.getByTestId('home-total').textContent).toBe('฿12,450.00 spent this month');

  // No budget: the pace is left out, with one quiet line and no budget action.
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText("Set a monthly budget to see what's left each day")).toBeTruthy();
  expect(screen.queryByRole('button', { name: /budget/i })).toBeNull();

  const receipt = screen.getByTestId('receipt-slip');
  expect(within(receipt).getByRole('heading', { name: "Today's receipt" })).toBeTruthy();
  expect(within(receipt).getByText('Nothing logged today yet')).toBeTruthy();

  // Earlier days, newest first, each with its confirmed money in and out kept apart.
  const days = screen.getAllByRole('heading').map((heading) => heading.getAttribute('aria-label') ?? heading.textContent ?? '').filter((name) => /^(Yesterday, )?\w+day \d+ September 2026/.test(name));
  expect(days).toEqual([
    'Yesterday, Monday 28 September 2026',
    'Sunday 27 September 2026, Money out ฿12,268.00',
    'Saturday 26 September 2026, Money out ฿182.00',
    'Friday 25 September 2026, Money in ฿28,000.00',
  ]);
  expect(screen.getByRole('button', { name: 'Transfer, Transfer ฿1,500.00, Cash → Daily account' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bills, Expense ฿12,268.00, Daily account' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Food, Expense ฿182.00, Cash' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Salary, Income ฿28,000.00, Daily account' })).toBeTruthy();

  // Exact wallet balances.
  expect(screen.getByLabelText('Total balance ฿21,050.00')).toBeTruthy();
  expect(screen.getByLabelText('Cash ฿2,350.00')).toBeTruthy();
  expect(screen.getByLabelText('Daily account ฿18,700.00')).toBeTruthy();

  expect(fake.callsOf('summary')[0].args).toEqual(['2026-09']);
  expect(fake.callsOf('budget')[0].args).toEqual(['2026-09']);
  const filters = fake.callsOf('history').map((call) => call.args[0]);
  expect(filters).toContainEqual(expect.objectContaining({ from: '2026-09-29', through: '2026-09-29' }));
  expect(filters).toContainEqual(expect.objectContaining({ through: '2026-09-28', sort: 'date_desc' }));
});

// Review m3: the month's confirmed money in and out, as v1 Home showed them, quietly on the stage.
test("the stage says the month's confirmed money in and out", async () => {
  const { diary } = draftsDiary();
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  const header = await screen.findByTestId('stage-header');
  const line = within(header).getByLabelText('Money in ฿28,000.00, Money out ฿12,450.00');
  expect(line.textContent).toBe('Money in ฿28,000.00 · Money out ฿12,450.00');
  // Waiting drafts are never added into it.
  expect(within(header).getByText('Waiting to sync: money out ฿70.00')).toBeTruthy();
});

// Review m6: several sync banners are one polite live region, said once, not one announcement each.
test('the sync banners share one live region', async () => {
  const { diary } = draftsDiary();
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  const saving = await screen.findByText('Saving 1 entry…');
  const region = saving.closest('[aria-live="polite"]') as HTMLElement;
  expect(region).not.toBeNull();
  for (const line of ['Checking 1 entry with Jotbun before sending it again', 'Entries that need your review: 1', 'Update Jotbun to send the entries saved on this device']) {
    expect(screen.getByText(line).closest('[aria-live="polite"]')).toBe(region);
  }
  // No banner is a live region of its own inside it.
  expect(region.querySelectorAll('[aria-live]')).toHaveLength(0);
});

test("today's records sit on a receipt with the day's confirmed totals; rows open the record", async () => {
  const fake = createFakeResources({ ...seed, records: [...seed.records, LUNCH, GIFTED] });
  mountHome(fake.resources);
  const receipt = await screen.findByTestId('receipt-slip');
  expect(screen.getByTestId('home-total').textContent).toBe('฿12,570.00 spent this month');
  expect(within(receipt).queryByText('Nothing logged today yet')).toBeNull();
  expect(within(receipt).getByLabelText('Money out, Expense ฿120.00')).toBeTruthy();
  expect(within(receipt).getByLabelText('Money in, Income ฿50.00')).toBeTruthy();
  // One minus sign everywhere: the lunch row and the day's money-out total both read −฿120.00.
  expect(within(receipt).getAllByText('−฿120.00')).toHaveLength(2);
  expect(within(within(receipt).getByRole('button', { name: 'Food, Expense ฿120.00, Cash' })).getByText('−฿120.00')).toBeTruthy();
  expect(within(receipt).queryByText('-฿120.00')).toBeNull();

  fireEvent.click(within(receipt).getByRole('button', { name: 'Food, Expense ฿120.00, Cash' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/record/[id]', params: { id: LUNCH.id } });
  fireEvent.click(within(receipt).getByRole('button', { name: 'Gift, Income ฿50.00, Daily account' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/record/[id]', params: { id: GIFTED.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Bills, Expense ฿12,268.00, Daily account' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/record/[id]', params: { id: RENT } });

  fireEvent.click(screen.getByRole('button', { name: 'See all entries' }));
  expect(router.push).toHaveBeenLastCalledWith('/spend/all');
});

const expense = (index: number, day: string, amount: string): TransactionDto => ({
  id: `0000000e-0000-4000-8000-${String(index).padStart(12, '0')}`, type: 'expense', amount_minor: amount, occurred_on: day, wallet_id: CASH.id, category_id: FOOD.id,
  note: null, merchant: null, deleted_at: null, version: 1,
});

test("today's total is exact even when today's records take more than one page", async () => {
  const many = Array.from({ length: 201 }, (_, index) => expense(index + 1, '2026-09-29', '101'));
  const fake = createFakeResources({ wallets: seed.wallets, records: many });
  mountHome(fake.resources);
  const receipt = await screen.findByTestId('receipt-slip', {}, { timeout: 5000 });
  expect(within(receipt).getByLabelText('Money out, Expense ฿203.01')).toBeTruthy();
  const todayCalls = fake.callsOf('history').filter((call) => (call.args[0] as { from: string }).from === '2026-09-29');
  expect(todayCalls.map((call) => call.args[1])).toEqual([undefined, 'c200']);
});

test('an earlier day the page may have split is left out rather than shown with a partial total', async () => {
  const yesterday = Array.from({ length: 30 }, (_, index) => expense(index + 1, '2026-09-28', '100'));
  const before = Array.from({ length: 30 }, (_, index) => expense(index + 101, '2026-09-27', '100'));
  mountHome(createFakeResources({ wallets: seed.wallets, records: [...yesterday, ...before] }).resources);
  expect(await screen.findByRole('heading', { name: 'Yesterday, Monday 28 September 2026, Money out ฿30.00' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /27 September 2026/ })).toBeNull();
});

test('an empty today offers to add an entry', async () => {
  mountHome(createFakeResources(goldenSeed()).resources);
  const receipt = await screen.findByTestId('receipt-slip');
  fireEvent.click(within(receipt).getByRole('button', { name: 'Add an entry' }));
  expect(router.push).toHaveBeenCalledWith('/spend/add');
});

// ---------------------------------------------------------------------------
// Budget, the bun and its intensity

test('a budget: the confirmed month against the limit, and the pace ring in words', async () => {
  const fake = createFakeResources(goldenSeed());
  mountHome(withBudget(fake, '1800000'));
  expect(await screen.findByText('฿12,450.00 of ฿18,000.00')).toBeTruthy();
  const ring = screen.getByRole('progressbar', { name: 'Budget' });
  expect(ring.getAttribute('aria-valuetext')).toBe('฿2,775.00 a day left, On track, ฿5,550.00 left, 2 days to go');
  expect(ring.getAttribute('aria-valuenow')).toBe('69');
  expect(screen.getByText('On track · ฿5,550.00 left · 2 days to go')).toBeTruthy();
  const peek = screen.getByTestId('home-bun-peek');
  expect(hiddenFromScreenReaders(peek.querySelector('svg'))).toBe(true);
  expect(screen.queryByTestId('home-bun-oops-kind')).toBeNull();
});

test.each(['light', 'dark'] as const)('over budget (%s): the kind bun and plain facts, never colour alone', async (mode) => {
  const colors = PALETTES[mode];
  mountHome(withBudget(createFakeResources(goldenSeed()), '1000000'), { mode });
  expect(await screen.findByText('฿12,450.00 of ฿10,000.00')).toBeTruthy();
  expect(screen.getByText('It happens. ฿12,450.00 of ฿10,000.00 spent.')).toBeTruthy();
  expect(screen.getByText('2 days to go')).toBeTruthy();
  const figure = screen.getByText('฿2,450.00');
  expect(figure.style.color).toEqual(rgb(colors.over));
  expect(screen.getByText('over')).toBeTruthy();
  const bun = screen.getByTestId('home-bun-oops-kind');
  expect(hiddenFromScreenReaders(bun.querySelector('svg'))).toBe(true);
  expect(screen.queryByTestId('home-bun-peek')).toBeNull();
});

test('the bun respects its intensity: quiet keeps only the first-run bun, off shows none', async () => {
  mountHome(withBudget(createFakeResources(goldenSeed()), '1000000'), { intensity: 'quiet' });
  expect(await screen.findByText('It happens. ฿12,450.00 of ฿10,000.00 spent.')).toBeTruthy();
  expect(screen.queryByTestId('home-bun-oops-kind')).toBeNull();
  expect(screen.queryByTestId('home-bun-peek')).toBeNull();
  cleanup();
  mountHome(createFakeResources().resources, { intensity: 'quiet' });
  expect(await screen.findByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
  expect(screen.getByTestId('home-bun-hello')).toBeTruthy();
  cleanup();
  window.localStorage.clear();
  mountHome(createFakeResources().resources, { intensity: 'off' });
  expect(await screen.findByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
  expect(screen.queryByTestId('home-bun-hello')).toBeNull();
  // No bun drawing at all: the only vectors left are the form's 24-unit kit glyphs (the date chip's chevrons).
  const art = [...document.querySelectorAll('svg')].filter((svg) => svg.getAttribute('viewBox') !== '0 0 24 24');
  expect(art).toEqual([]);
  // And the art space collapses with it.
  expect(screen.queryByTestId('empty-state-art')).toBeNull();
});

// ---------------------------------------------------------------------------
// Device drafts, waiting money and the sync banner

function draftsDiary() {
  const unsent = queued(draftEntry(), 'unsent', '2026-09-29T05:00:00.000Z');
  const review = queued(draftEntry({ amount_minor: '1200' }), 'needs_review', '2026-09-29T04:00:00.000Z');
  const checking = queued(draftEntry({ amount_minor: '900' }), 'uncertain', '2026-09-29T03:00:00.000Z');
  const paused = queued(draftEntry({ amount_minor: '500', occurred_on: '2026-09-28' }), 'paused_upgrade');
  return { unsent, review, checking, paused, diary: deviceDiary({ outbox: [unsent, review, checking, paused] }) };
}

test('drafts show their state; an unsent one can be removed and one that needs review discarded', async () => {
  const { unsent, review, diary } = draftsDiary();
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  const receipt = await screen.findByTestId('receipt-slip');
  expect(within(receipt).getByLabelText('Food, Expense ฿65.00, saving, Cash')).toBeTruthy();
  expect(within(receipt).getByLabelText('Food, Expense ฿12.00, needs a look, Cash')).toBeTruthy();
  expect(within(receipt).getByLabelText('Food, Expense ฿9.00, checking, Cash')).toBeTruthy();
  // A draft waiting for an app update says so in its own row (RecordRow's update-to-send state), not "saving".
  const paused = screen.getByLabelText('Food, Expense ฿5.00, Update Jotbun to send, Cash');
  expect(within(paused).getByText('Update Jotbun to send')).toBeTruthy();
  expect(screen.getByText('Update Jotbun to send')).toBeTruthy();
  expect(screen.getAllByText('saving…')).toHaveLength(1);
  // A draft is not a record yet: it does not open the record screen.
  expect(screen.queryByRole('button', { name: /^Food, Expense ฿(65|12|9|5)\.00/ })).toBeNull();

  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: /^Discard / })).toHaveLength(1);
  const remove = screen.getByRole('button', { name: 'Remove Food ฿65.00' });
  expect(remove.style.minHeight).toBe('44px');
  fireEvent.click(remove);
  await waitFor(() => expect(diary.calls.removed).toEqual([unsent.commandId]));
  await waitFor(() => expect(screen.queryByLabelText('Food, Expense ฿65.00, saving, Cash')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Discard Food ฿12.00' }));
  await waitFor(() => expect(diary.calls.discarded).toEqual([review.commandId]));
});

test('waiting and checking money stay apart from confirmed money', async () => {
  const { diary } = draftsDiary();
  mountHome(withBudget(createFakeResources(goldenSeed()), '1800000'), { diary: diary.diary });
  const total = await screen.findByTestId('home-total');
  expect(total.textContent).toBe('฿12,450.00 of ฿18,000.00');
  const header = screen.getByTestId('stage-header');
  expect(within(header).getByText('Waiting to sync: money out ฿70.00')).toBeTruthy();
  expect(within(header).getByText('Checking with Jotbun: money out ฿9.00')).toBeTruthy();
  // The pace includes money waiting on the device, and says so; money being checked is never added.
  expect(screen.getByRole('progressbar', { name: 'Budget' }).getAttribute('aria-valuetext')).toBe('฿2,740.00 a day left, On track, ฿5,480.00 left, 2 days to go');
  expect(screen.getByText('Includes ฿70.00 saving on this device')).toBeTruthy();
  expect(screen.getByText('฿9.00 more is being checked with Jotbun')).toBeTruthy();
  // Today's receipt: no confirmed money yet, drafts' money on its own lines.
  const receipt = screen.getByTestId('receipt-slip');
  expect(within(receipt).getByLabelText('Money out, ฿0.00')).toBeTruthy();
  expect(within(receipt).getByText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  expect(within(receipt).getByText('Checking with Jotbun: money out ฿9.00')).toBeTruthy();
});

test('the sync banner says saving, checking, needs review and update, and the review sheet discards', async () => {
  const { review, diary } = draftsDiary();
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  expect(await screen.findByText('Saving 1 entry…')).toBeTruthy();
  expect(screen.getByText('Checking 1 entry with Jotbun before sending it again')).toBeTruthy();
  expect(screen.getByText('Update Jotbun to send the entries saved on this device')).toBeTruthy();
  const reviewLine = screen.getByText('Entries that need your review: 1');
  expect(reviewLine.closest('[aria-live="polite"]')).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  const sheet = await screen.findByRole('dialog', { name: 'Needs a look' });
  expect(within(sheet).getByLabelText('Food, Expense ฿12.00, needs a look, Cash')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Discard Food ฿12.00' }));
  await waitFor(() => expect(diary.calls.discarded).toEqual([review.commandId]));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Needs a look' })).toBeNull());
  expect(screen.queryByText('Entries that need your review: 1')).toBeNull();
});

// Review (banner counts): a draft that is sending may already be committed, so the banner counts it as checking, as its row says.
test('a sending draft is counted as checking in the banner, never as saving', async () => {
  const unsent = queued(draftEntry(), 'unsent', '2026-09-29T05:00:00.000Z');
  const sending = queued(draftEntry({ amount_minor: '900' }), 'sending', '2026-09-29T04:00:00.000Z');
  mountHome(createFakeResources(goldenSeed()).resources, { diary: deviceDiary({ outbox: [unsent, sending] }).diary });
  expect(await screen.findByText('Saving 1 entry…')).toBeTruthy();
  expect(screen.getByText('Checking 1 entry with Jotbun before sending it again')).toBeTruthy();
  expect(within(await screen.findByTestId('receipt-slip')).getByLabelText('Food, Expense ฿9.00, checking, Cash')).toBeTruthy();
});

// Review M3 (probe Home-1): Home shows five earlier days, but drafts can be older.
test('drafts older than the days on Home can still be reviewed, discarded and removed', async () => {
  // One record a day from 15 to 28 September, so Home's five earlier days are 24 to 28 September.
  const records = Array.from({ length: 14 }, (_, i) => expense(i + 1, `2026-09-${String(15 + i).padStart(2, '0')}`, '1000'));
  const review = queued(draftEntry({ occurred_on: '2026-09-16', amount_minor: '4200' }), 'needs_review');
  const unsent = queued(draftEntry({ occurred_on: '2026-09-17', amount_minor: '3100' }), 'unsent');
  const diary = deviceDiary({ outbox: [review, unsent] });
  mountHome(createFakeResources({ wallets: seed.wallets, records }).resources, { diary: diary.diary });
  expect(await screen.findByText('Entries that need your review: 1')).toBeTruthy();
  // Neither draft is in the days shown.
  expect(screen.queryByLabelText(/^Food, Expense ฿(42|31)\.00/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  const sheet = await screen.findByRole('dialog', { name: 'Needs a look' });
  expect(within(sheet).getByLabelText('Food, Expense ฿42.00, needs a look, Cash')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Discard Food ฿42.00' }));
  await waitFor(() => expect(diary.calls.discarded).toEqual([review.commandId]));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Needs a look' })).toBeNull());
  // The saving banner leads to every draft waiting on this device, older ones included, with Remove.
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  const waiting = await screen.findByRole('dialog', { name: 'Waiting to sync' });
  expect(within(waiting).getByLabelText('Food, Expense ฿31.00, saving, Cash')).toBeTruthy();
  fireEvent.click(within(waiting).getByRole('button', { name: 'Remove Food ฿31.00' }));
  await waitFor(() => expect(diary.calls.removed).toEqual([unsent.commandId]));
});

// Review m1 (probe Home-2): the earlier page may cut a day; a draft on that day must not bring it back without its confirmed money.
test('a draft on a day the earlier page cut does not bring that day back without its confirmed money', async () => {
  // 49 records yesterday and 3 on 27 September (฿10.00 each): the 50-record page ends inside 27 September.
  const records = [
    ...Array.from({ length: 49 }, (_, i) => expense(100 + i, '2026-09-28', '100')),
    expense(200, '2026-09-27', '1000'), expense(201, '2026-09-27', '1000'), expense(202, '2026-09-27', '1000'),
  ];
  const diary = deviceDiary({ outbox: [queued(draftEntry({ occurred_on: '2026-09-27', amount_minor: '6500' }), 'unsent')] });
  mountHome(createFakeResources({ wallets: seed.wallets, records }).resources, { diary: diary.diary });
  await screen.findByText('Earlier days');
  const sept27 = screen.getAllByRole('heading').map((node) => node.getAttribute('aria-label') ?? node.textContent ?? '').find((label) => label.includes('27 September'));
  if (sept27) expect(sept27).toContain('Money out ฿30.00');
  // The draft is still reachable: the saving banner lists every waiting draft.
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(within(await screen.findByRole('dialog', { name: 'Waiting to sync' })).getByLabelText('Food, Expense ฿65.00, saving, Cash')).toBeTruthy();
});

// Probe Home-3: a sending draft whose record Jotbun already confirmed counts once.
test('a sending draft whose record is already confirmed is not counted twice in the pace', async () => {
  const lunch = expense(300, '2026-09-29', '12000');
  const sending = queued({ id: lunch.id, type: 'expense', amount_minor: '12000', occurred_on: '2026-09-29', wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null } as PendingEntry, 'sending');
  mountHome(withBudget(createFakeResources({ wallets: seed.wallets, records: [lunch] }), '1000000'), { diary: deviceDiary({ outbox: [sending] }).diary });
  const ring = await screen.findByRole('progressbar', { name: 'Budget' });
  expect(screen.getAllByRole('button', { name: /Expense ฿120\.00/ })).toHaveLength(1);
  expect(ring.getAttribute('aria-valuetext')).toContain('฿9,880.00 left');
});

test('a paused sync reads as offline and can be retried; other sync news is said in words', async () => {
  const outcome = { status: 'paused' as const, progress: { sent: 0, total: 1 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };
  const diary = deviceDiary({ outbox: [queued(draftEntry(), 'unsent')], outcome });
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.getByText('Sync is paused after repeated failures.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(diary.calls.retry).toBe(1);

  act(() => diary.set({ outcome: { ...outcome, status: 'policy_required' }, progress: { sent: 1, total: 3 } }));
  expect(await screen.findByText('Review and accept the updated terms to send the entries saved on this device')).toBeTruthy();
  expect(screen.getByText('Syncing 1 of 3')).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});

// ---------------------------------------------------------------------------
// Offline, load problems and a locked diary

test('offline with device data: the problem, the drafts by day, waiting money and Add', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('summary', 'network');
  const diary = deviceDiary({ outbox: [queued(draftEntry(), 'unsent')] });
  mountHome(fake.resources, { diary: diary.diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.getByTestId('home-problem-load_failed')).toBeTruthy();
  expect(screen.getByText("We couldn't load your diary.")).toBeTruthy();
  const receipt = screen.getByTestId('receipt-slip');
  expect(within(receipt).getByLabelText('Food, Expense ฿65.00, saving, Cash')).toBeTruthy();
  expect(within(receipt).getByText('Saved on this device')).toBeTruthy();
  expect(screen.getAllByText('Waiting to sync: money out ฿65.00').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Remove Food ฿65.00' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
  expect(router.push).toHaveBeenCalledWith('/spend/add');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
  expect(screen.queryByTestId('home-problem-load_failed')).toBeNull();
});

test('offline without wallets on the device offers no Add; without a diary there is no offline claim', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  mountHome(fake.resources, { diary: deviceDiary({ wallets: [] }).diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
  cleanup();
  const web = createFakeResources(goldenSeed());
  web.fail('wallets', 'network');
  mountHome(web.resources);
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Total balance ฿21,050.00')).toBeTruthy();
});

test.each([
  ['upgrade_required', 'upgrade_required', 'Update Jotbun', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
  ['policy_required', 'terms_required', 'Updated terms', 'Review and accept the updated terms to continue.'],
  ['signed_out', 'signed_out', 'Signed out', 'Sign in again to see your diary.'],
  ['session_changed', 'signed_out', 'Signed out', 'Sign in again to see your diary.'],
  ['unsupported_platform', 'unsupported_platform', 'Use the Jotbun app', 'Your diary is available in the Jotbun app on iOS and Android.'],
] as const)('%s has its own presentation, not a generic error', async (outcome, kind, heading, message) => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('ensureBuiltinCategories', outcome);
  mountHome(fake.resources);
  const card = await screen.findByTestId(`home-problem-${kind}`);
  expect(within(card).getByRole('heading', { name: heading })).toBeTruthy();
  expect(within(card).getByText(message)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
});

test('a locked diary says why, hides its drafts, and starts over only after confirming', async () => {
  const diary = deviceDiary({ phase: 'locked', lockReason: 'key_missing', wallets: [], categories: [] });
  mountHome(createFakeResources(goldenSeed()).resources, { diary: diary.diary });
  expect(await screen.findByText('Your diary is locked on this phone. Entries saved here are kept.')).toBeTruthy();
  expect(screen.getByText("This device's diary can't be unlocked. Entries that weren't synced can't be read.")).toBeTruthy();
  expect(screen.getByTestId('home-total').textContent).toBe('฿12,450.00 spent this month');

  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  let sheet = await screen.findByRole('dialog', { name: 'Start over?' });
  expect(within(sheet).getByText('Starting over deletes the unreadable entries on this device. Everything already synced comes back from Jotbun.')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep it' }));
  expect(diary.calls.discardDiary).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  sheet = await screen.findByRole('dialog', { name: 'Start over?' });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Delete and start over' }));
  await waitFor(() => expect(diary.calls.discardDiary).toBe(1));
});

test('a diary that cannot open right now is never offered a start over; a locked diary offline shows no device data', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  const diary = deviceDiary({ phase: 'locked', lockReason: 'key_unavailable', outbox: [], wallets: [], categories: [] });
  mountHome(fake.resources, { diary: diary.diary });
  expect(await screen.findByText("This device's diary can't be opened right now. Try again later.")).toBeTruthy();
  expect(screen.getByText('Your diary is locked on this phone. Entries saved here are kept.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
  expect(screen.getByTestId('home-problem-load_failed')).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
  expect(screen.queryByTestId('receipt-slip')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
});

// ---------------------------------------------------------------------------
// First run: an explicit first wallet

/**
 * First run is one step now that EmptyState's action is optional: the empty
 * state names the space (with the hello bun), and the form follows at once.
 * The view still has exactly one primary action, Create wallet.
 */
async function openFirstWallet(colors: BunColors = bunLight) {
  expect(await screen.findByRole('heading', { name: 'Add your first wallet' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { name: 'Add your first wallet' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Add a wallet' })).toBeNull();
  expect(await screen.findByLabelText('Wallet name')).toBeTruthy();
  const primaries = screen.getAllByRole('button').filter((button) => hexOf(button.style.backgroundColor) === colors.ink.toUpperCase());
  expect(primaries.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Create wallet']);
}

test('first run: the hello bun, then a first wallet with an exact opening balance and a tracking start', async () => {
  const fake = createFakeResources();
  const diary = deviceDiary({ wallets: [] });
  mountHome(fake.resources, { diary: diary.diary });
  expect(await screen.findByText('A wallet is where money sits, like cash or a bank account. Its opening balance is not income.')).toBeTruthy();
  expect(hiddenFromScreenReaders(screen.getByTestId('home-bun-hello'))).toBe(true);
  await openFirstWallet();

  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Enter a wallet name')).toBeTruthy();
  type('Opening balance', '1.234');
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Use at most two decimal places')).toBeTruthy();
  type('Opening balance', 'abc');
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Enter an amount like 65 or 65.50')).toBeTruthy();
  expect(fake.callsOf('createWallet')).toHaveLength(0);

  type('Wallet name', ' Cash ');
  type('Opening balance', '0');
  expect(screen.getByLabelText('Opening balance ฿0.00')).toBeTruthy();
  expect((screen.getByLabelText('Wallet name') as HTMLElement).style.minHeight).toBe('44px');
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByLabelText('Cash ฿0.00')).toBeTruthy();
  const [input, key] = fake.callsOf('createWallet')[0].args as [CreateWalletRequest, string];
  expect(input).toMatchObject({ name: 'Cash', opening_minor: '0', tracking_start: '2026-09-28' });
  expect(input.id).toMatch(UUID);
  expect(key).toMatch(UUID);
  await waitFor(() => expect(diary.calls.retry).toBeGreaterThan(0));
});

test('an unconfirmed first wallet is frozen and resent as the same command', async () => {
  const fake = createFakeResources();
  fake.loseResponse('createWallet');
  mountHome(fake.resources);
  await openFirstWallet();
  type('Wallet name', 'Cash');
  type('Opening balance', '1,000');
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  expect(isLocked('Wallet name')).toBe(true);
  expect(isLocked('Opening balance')).toBe(true);
  expect(screen.getByRole('button', { name: 'Previous day' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Cash ฿1,000.00')).toBeTruthy();
  const [first, second] = fake.callsOf('createWallet');
  expect(second.args).toEqual(first.args);
  expect(fake.wallets.size).toBe(1);
});

// Review B1, applied to the first wallet too: a retry refused before processing keeps the unconfirmed wallet frozen.
test('an unconfirmed first wallet stays frozen with its key when the retry is refused before processing', async () => {
  const fake = createFakeResources();
  fake.loseResponse('createWallet');
  mountHome(fake.resources);
  await openFirstWallet();
  type('Wallet name', 'Cash');
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  fake.fail('createWallet', 'signed_out', { status: 401 });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Sign in again to save.')).toBeTruthy();
  expect(isLocked('Wallet name')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Cash ฿0.00')).toBeTruthy();
  const calls = fake.callsOf('createWallet').map((call) => call.args);
  expect(calls).toHaveLength(3);
  for (const call of calls) expect(call).toEqual(calls[0]);
  expect(fake.wallets.size).toBe(1);
});

test('server field problems land on their fields, and a wallet that already committed counts as created', async () => {
  const fake = createFakeResources();
  fake.fail('createWallet', 'invalid', { status: 422, code: 'DATE_IN_FUTURE', fields: { tracking_start: 'x' } });
  fake.fail('createWallet', 'invalid', { status: 422, code: 'NAME_TAKEN', fields: { name: 'x' } });
  mountHome(fake.resources);
  await openFirstWallet();
  type('Wallet name', 'Cash');
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('This date is in the future.')).toBeTruthy();
  expect(screen.getByText('Check the highlighted fields.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Check this and try again.')).toBeTruthy();

  // An earlier attempt of this same wallet had in fact committed.
  const [input] = fake.callsOf('createWallet')[0].args as [CreateWalletRequest, string];
  fake.wallets.set(input.id, { ...input, currency: 'THB', archived: false, version: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByLabelText('Cash ฿0.00')).toBeTruthy();
  const keys = fake.callsOf('createWallet').map((call) => call.args[1]);
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(3);
  expect(fake.wallets.size).toBe(1);
  expect(screen.queryByText('This entry could not be saved.')).toBeNull();
});

test('Thai digits are understood in the first-wallet form', async () => {
  const fake = createFakeResources();
  mountHome(fake.resources, { locale: 'th' });
  expect(await screen.findByRole('heading', { name: 'เพิ่มกระเป๋าเงินใบแรก' })).toBeTruthy();
  // One step: the form is already there under the empty state.
  expect(screen.queryByRole('button', { name: translateCopy('Add a wallet', 'th') })).toBeNull();
  type('ชื่อกระเป๋าเงิน', 'เงินสด');
  type('ยอดเริ่มต้น', '๑,๐๐๐');
  fireEvent.click(screen.getByRole('button', { name: 'สร้างกระเป๋าเงิน' }));
  expect(await screen.findByLabelText('เงินสด ฿1,000.00')).toBeTruthy();
  expect((fake.callsOf('createWallet')[0].args[0] as CreateWalletRequest).opening_minor).toBe('100000');
});

// ---------------------------------------------------------------------------
// TH, EN and VI in light and dark

const MONTHS: Readonly<Record<Locale, string>> = { en: 'September 2026', th: 'กันยายน 2569', vi: 'Tháng 9 năm 2026' };
const YESTERDAY: Readonly<Record<Locale, string>> = { en: 'Yesterday', th: 'เมื่อวาน', vi: 'Hôm qua' };

test.each(MATRIX)('$locale $mode: the stage, the receipt and the days read in the language, on approved colours', async ({ locale, mode, colors }) => {
  const fake = createFakeResources({ ...seed, records: [...seed.records, LUNCH] });
  const diary = deviceDiary({ outbox: [queued(draftEntry(), 'unsent')] });
  mountHome(withBudget(fake, '1800000'), { locale, mode, diary: diary.diary });
  const title = await screen.findByRole('heading', { name: MONTHS[locale] });
  expect(title.style.color).toEqual(rgb(colors.ink));
  expect(title.style.lineHeight).toBe(leading('title', locale));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByTestId('home-total').textContent).toBe(translateCopy('{spent} of {limit}', locale, { spent: '฿12,570.00', limit: '฿18,000.00' }));
  expect(screen.getByText(YESTERDAY[locale])).toBeTruthy();
  const receipt = screen.getByTestId('receipt-slip');
  const out = translateCopy('{label}, {value}', locale, { label: translateCopy('Money out', locale), value: translateCopy('Expense {amount}', locale, { amount: '฿120.00' }) });
  expect(within(receipt).getByLabelText(out)).toBeTruthy();
  expect(within(receipt).getByText(translateCopy('Waiting to sync: money out {amount}', locale, { amount: '฿65.00' }))).toBeTruthy();
  // The golden ฿21,050.00 less today's ฿120.00 lunch from Cash.
  expect(screen.getByLabelText(`${translateCopy('Total balance', locale)} ฿20,930.00`)).toBeTruthy();
  expectApprovedTextPairs(document.body, colors);
});

test.each(['light', 'dark'] as const)('%s: first run, problems, offline, over budget and the sheets use approved text pairs only', async (mode) => {
  const colors = PALETTES[mode];
  mountHome(createFakeResources().resources, { mode });
  await openFirstWallet(colors);
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  await screen.findByText('Enter a wallet name');
  expectApprovedTextPairs(document.body, colors);
  cleanup();

  const offline = createFakeResources(goldenSeed());
  offline.fail('summary', 'network');
  mountHome(offline.resources, { mode, diary: draftsDiary().diary.diary });
  await screen.findByText('Offline. New entries are saved on this phone.');
  expectApprovedTextPairs(document.body, colors);
  cleanup();

  const upgrade = createFakeResources(goldenSeed());
  upgrade.fail('wallets', 'upgrade_required');
  mountHome(upgrade.resources, { mode, diary: deviceDiary({ phase: 'locked', lockReason: 'key_rejected', wallets: [], categories: [] }).diary });
  await screen.findByTestId('home-problem-upgrade_required');
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  await screen.findByRole('dialog', { name: 'Start over?' });
  expectApprovedTextPairs(document.body, colors);
  cleanup();

  mountHome(withBudget(createFakeResources(goldenSeed()), '1000000'), { mode, diary: draftsDiary().diary.diary });
  await screen.findByText('It happens. ฿12,520.00 of ฿10,000.00 spent.');
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  await screen.findByRole('dialog', { name: 'Needs a look' });
  expectApprovedTextPairs(document.body, colors);
});

// R4 (behind the `planning` area until E2 checkpoint 2): Home is the way into
// Budget, and its wallets lead to Wallets. With the area off, nothing changes.
test('with Planning on, Home opens Budget and Wallets', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'planning');
  try {
    mountHome(createFakeResources(goldenSeed()).resources);
    fireEvent.click(await screen.findByRole('button', { name: 'Set a budget' }));
    expect(router.push).toHaveBeenLastCalledWith('/spend/budget');
    fireEvent.click(screen.getByRole('button', { name: 'Manage wallets' }));
    expect(router.push).toHaveBeenLastCalledWith('/spend/wallets');
    cleanup();
    const budget = { id: '0000000d-0000-4000-8000-000000000001', month: '2026-09', overall_limit_minor: '1800000', category_limits: [], version: 1 };
    mountHome(createFakeResources({ ...goldenSeed(), budgets: [budget] }).resources);
    fireEvent.click(await screen.findByRole('button', { name: 'See budget' }));
    expect(router.push).toHaveBeenLastCalledWith('/spend/budget');
  } finally {
    vi.unstubAllEnvs();
  }
});
