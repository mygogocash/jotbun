// The month recap (R5, plan §6.3): the printed receipt with exact amounts,
// the cheer bun and its intensity, the compare bars as the month picker, the
// plain-text share, and every state in TH/EN, light and dark. The catalogue's
// recap sections are checked here too, since they are not registered yet.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { AccessibilityInfo, Share } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// The catalogue's stand-ins for expo-router and the safe area: the same mocks serve the screen and its sections.
vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { hiddenFromScreenReaders, installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUN_TEXT_PAIRS, bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { contrastRatio } from '@mobile/theme/contrast';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { mountInApp, settle } from '../../../dev/catalogue/catalogueTestHarness';
import { RECAP_SECTIONS, recapBudget, recapFake } from '../../../dev/catalogue/insights/recapSections';
import { router } from '../../../dev/catalogue/routerTestStub';
import { CATALOGUE_NOW, draftEntry, queued } from '../../../dev/catalogue/screenFixtures';
import { RecapScreen } from './RecapScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Harness

/** 29 September 2026, 10:00 in Bangkok: September is this month, so far. */
const NOW = CATALOGUE_NOW;
type Mode = 'light' | 'dark';
type MountOptions = { resources?: SpendV1Resources; locale?: Locale; mode?: Mode; intensity?: BunIntensity; diary?: SpendDiary | null };

function mountRecap(month: string, options: MountOptions = {}) {
  const { resources = recapFake().resources, locale = 'en', mode = 'light', intensity, diary = null } = options;
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  const tree = (shown: string) => (
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>
          <BunIntensityProvider>
            <SpendV1Provider resources={resources}>
              <SpendDiaryProvider diary={diary}>
                <RecapScreen month={shown} now={NOW} />
              </SpendDiaryProvider>
            </SpendV1Provider>
          </BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>
  );
  const view = render(tree(month));
  return { ...view, show: (next: string) => view.rerender(tree(next)) };
}

const slip = () => screen.getByTestId('receipt-slip');
const recapShown = () => screen.findByTestId('receipt-slip');
/** The slip's spoken lines, in order ("Spent, ฿13,962.51", …). */
const slipLines = () => [...slip().querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '').filter((label) => label.includes(', '));
const t = (english: string, locale: Locale, values?: Record<string, string | number>) => translateCopy(english, locale, values);
const bars = (locale: Locale = 'en') => within(screen.getByRole('radiogroup', { name: t('Choose a month', locale) })).getAllByRole('radio');
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));
const leading = (role: Parameters<typeof bunText>[0], locale: Locale) => `${bunText(role, locale === 'th' ? 'thai' : 'latin').lineHeight}px`;

/** `#RRGGBB` for a CSS colour react-native-web wrote; null when transparent. */
function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Every visible text sits in a BUN_TEXT_PAIRS pair against its nearest ground, at 4.5:1 or more. */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let checked = 0;
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
    if (!ownText || !element.style.color || hiddenFromScreenReaders(element)) continue;
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    const pairOk = BUN_TEXT_PAIRS.some(([text, on]) => tokens(fg as string).includes(text) && tokens(ground as string).includes(on));
    expect(pairOk, `${element.textContent}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg as string, ground as string), element.textContent ?? '').toBeGreaterThanOrEqual(4.5);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(10);
}

const AUGUST_SHARE = [
  'August 2026 in Jotbun',
  'Spent: ฿13,962.51',
  'Budget: ฿13,962.51 of ฿18,000.00',
  'Earned: ฿29,500.00',
  'Top categories',
  'Bills: ฿13,167.00',
  'Travel: ฿480.00',
  'Food: ฿315.51',
  'Days logged: 7 days',
  'Kept: ฿15,537.49',
].join('\n');

// ---------------------------------------------------------------------------
// Loading and load problems

test('loading: the stage names the month and offers Back at once, with no total and no bun yet', async () => {
  const { fake, resources } = recapFake();
  fake.hold('summary');
  mountRecap('2026-08', { resources });
  expect(screen.getByLabelText('Loading your diary')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Month recap' })).toBeTruthy();
  expect(within(screen.getByTestId('stage-header')).getByText('August 2026')).toBeTruthy();
  expect(screen.queryByTestId('recap-total')).toBeNull();
  expect(screen.queryByTestId('recap-bun-cheer')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Share as text' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('offline: the records are safe, it is not an empty month, and Try again loads the recap', async () => {
  const { fake, resources } = recapFake();
  fake.fail('summary', 'network');
  mountRecap('2026-08', { resources });
  expect(await screen.findByRole('heading', { name: 'We could not load this month' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('Your records are safe. This is a connection problem, not an empty month.');
  expect(screen.queryByText('No entries in this month')).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await recapShown();
  expect(screen.getByLabelText('Spent, ฿13,962.51')).toBeTruthy();
});

test('a problem a retry cannot fix says what to do, with no Try again', async () => {
  const { fake, resources } = recapFake();
  fake.fail('summary', 'upgrade_required');
  mountRecap('2026-08', { resources });
  expect(await screen.findByRole('heading', { name: 'Update Jotbun' })).toBeTruthy();
  expect(screen.getByText('Update Jotbun to keep using your diary. Nothing you saved is lost.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// The recap

test('a past month: the printed receipt in order, with exact amounts, top categories and days logged', async () => {
  const { fake, resources } = recapFake();
  mountRecap('2026-08', { resources });
  await recapShown();
  expect(within(slip()).getByRole('heading', { name: 'August 2026' })).toBeTruthy();
  expect(within(slip()).getByRole('heading', { name: 'Top categories' })).toBeTruthy();
  // The ฿1,000.00 move on the 28th is a day logged, never money out or in.
  expect(slipLines()).toEqual([
    'Spent, ฿13,962.51',
    'Earned, ฿29,500.00',
    'Bills, ฿13,167.00',
    'Travel, ฿480.00',
    'Food, ฿315.51',
    'Days logged, 7 days',
    'Kept, ฿15,537.49',
  ]);
  expect(within(slip()).getByText('฿15,537.49')).toBeTruthy();
  expect(screen.getByTestId('recap-total').textContent).toBe('฿13,962.51 spent');
  expect(within(screen.getByTestId('stage-header')).getByText('August 2026')).toBeTruthy();
  // One read of the month's summary (shared with its bar), one per other bar, and the month's history pages.
  expect(fake.callsOf('summary').map((call) => call.args[0]).sort()).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  expect(fake.callsOf('history').map((call) => call.args)).toEqual([[{ from: '2026-08-01', through: '2026-08-31', sort: 'date_desc' }, undefined, 200]]);
});

test('days logged are read across every page of the month', async () => {
  const lunches = Array.from({ length: 230 }, (_, index) => ({
    id: `0000000c-1000-4000-8000-${String(index).padStart(12, '0')}`, type: 'expense' as const, amount_minor: '100', occurred_on: `2026-08-${String((index % 9) + 3).padStart(2, '0')}`,
    wallet_id: '0000000a-0000-4000-8000-000000000001', category_id: '0000000c-0000-4000-8000-000000000001', note: null, merchant: null, deleted_at: null, version: 1,
  }));
  const { fake, resources } = recapFake({ extra: lunches });
  mountRecap('2026-08', { resources });
  await recapShown();
  // 3 to 11 August from the lunches, plus the 1st, 2nd, 12th, 20th, 21st and 28th.
  expect(screen.getByLabelText('Days logged, 15 days')).toBeTruthy();
  expect(fake.callsOf('history').map((call) => call.args[1])).toEqual([undefined, 'c200']);
});

test('a month with a budget: spent of the limit on the receipt', async () => {
  mountRecap('2026-08', { resources: recapFake({ budgets: [recapBudget('2026-08', '1800000')] }).resources });
  await recapShown();
  expect(slipLines().slice(0, 3)).toEqual(['Spent, ฿13,962.51', 'Budget, ฿13,962.51 of ฿18,000.00', 'Earned, ฿29,500.00']);
  expect(screen.queryByText(/It happens/)).toBeNull();
});

test('over budget: the exact amount over, said kindly in words, and the bun still cheers', async () => {
  mountRecap('2026-08', { resources: recapFake({ budgets: [recapBudget('2026-08', '1000000')] }).resources });
  await recapShown();
  expect(within(slip()).getByLabelText('Budget, ฿3,962.51 over')).toBeTruthy();
  expect(within(slip()).getByText('It happens. ฿13,962.51 of ฿10,000.00 spent.')).toBeTruthy();
  expect(screen.getByTestId('recap-bun-cheer')).toBeTruthy();
});

test('money in only: nothing spent, no top categories, and all of it kept', async () => {
  mountRecap('2026-07');
  await recapShown();
  expect(slipLines()).toEqual(['Spent, ฿0.00', 'Earned, ฿28,500.00', 'Days logged, 2 days', 'Kept, ฿28,500.00']);
  expect(screen.queryByRole('heading', { name: 'Top categories' })).toBeNull();
  expect(screen.getByTestId('recap-total').textContent).toBe('฿0.00 spent');
});

test('more out than in: kept is said in kind words, never as a negative amount', async () => {
  mountRecap('2026-06');
  await recapShown();
  expect(slipLines().at(-1)).toBe('Kept, ฿5,268.00 more went out than came in');
  expect(within(slip()).queryByText(/[−-]฿/)).toBeNull();
});

test('this month so far: the stage, the hero and its bar say so', async () => {
  mountRecap('2026-09');
  await recapShown();
  expect(within(screen.getByTestId('stage-header')).getByText('September 2026 so far')).toBeTruthy();
  expect(screen.getByTestId('recap-total').textContent).toBe('฿12,450.00 spent so far');
  expect(slipLines()).toEqual(['Spent, ฿12,450.00', 'Earned, ฿28,000.00', 'Bills, ฿12,268.00', 'Food, ฿182.00', 'Days logged, 4 days', 'Kept, ฿15,550.00']);
  const current = screen.getByRole('radio', { name: 'September 2026 so far, ฿12,450.00' });
  expect(current.getAttribute('aria-checked')).toBe('true');
  expect(within(current).getByText('September 2026 so far')).toBeTruthy();
});

test('an empty month: kind words with the thinking bun, no receipt and no share, and the bars to pick another', async () => {
  mountRecap('2026-04');
  expect(await screen.findByRole('heading', { name: 'No entries in this month' })).toBeTruthy();
  expect(screen.getByText('Entries you add for this month show up here.')).toBeTruthy();
  expect(screen.getByTestId('recap-bun-thinking')).toBeTruthy();
  expect(screen.queryByTestId('recap-bun-cheer')).toBeNull();
  expect(screen.queryByTestId('receipt-slip')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Share as text' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
  expect(screen.queryByTestId('recap-total')).toBeNull();
  expect(bars()).toHaveLength(6);
  expect(screen.getByRole('radio', { name: 'April 2026, ฿0.00' }).getAttribute('aria-checked')).toBe('true');
});

test('an empty month that is this month offers Add an entry', async () => {
  mountRecap('2026-09', { resources: recapFake({ records: [] }).resources });
  fireEvent.click(await screen.findByRole('button', { name: 'Add an entry' }));
  expect(router.push).toHaveBeenCalledWith('/spend/add');
});

// ---------------------------------------------------------------------------
// Compare months

test('the bars: six months of exact money out, a 44 pt month picker with the month shown chosen', async () => {
  mountRecap('2026-08');
  await recapShown();
  expect(screen.getByRole('heading', { name: 'Compare months' })).toBeTruthy();
  expect(bars().map((bar) => [bar.getAttribute('aria-label'), bar.getAttribute('aria-checked')])).toEqual([
    ['April 2026, ฿0.00', 'false'],
    ['May 2026, ฿500.00', 'false'],
    ['June 2026, ฿15,268.00', 'false'],
    ['July 2026, ฿0.00', 'false'],
    ['August 2026, ฿13,962.51', 'true'],
    ['September 2026 so far, ฿12,450.00', 'false'],
  ]);
  for (const bar of bars()) {
    expect(Number.parseFloat(bar.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(bar.style.minWidth)).toBeGreaterThanOrEqual(44);
  }
  // The exact amount is written beside each bar; the bar itself is decoration.
  const june = screen.getByRole('radio', { name: 'June 2026, ฿15,268.00' });
  expect(within(june).getByText('฿15,268.00')).toBeTruthy();
  expect(hiddenFromScreenReaders(screen.getByTestId('recap-bar-fill-2026-06'))).toBe(true);
  expect(['2026-04', '2026-06', '2026-08'].map((month) => screen.getByTestId(`recap-bar-fill-${month}`).style.width)).toEqual(['0%', '100%', '91.4%']);
  // The month shown reads bold, so the choice is never colour alone.
  expect(within(screen.getByRole('radio', { name: 'August 2026, ฿13,962.51' })).getByText('August 2026').style.fontWeight).toBe('700');
});

test('tapping a bar shows that month in place; the month already shown does nothing', async () => {
  const { show } = mountRecap('2026-08');
  await recapShown();
  fireEvent.click(screen.getByRole('radio', { name: 'August 2026, ฿13,962.51' }));
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'June 2026, ฿15,268.00' }));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/spend/recap/[month]', params: { month: '2026-06' } });
  // The route gives the screen its new month.
  show('2026-06');
  expect(await within(await recapShown()).findByRole('heading', { name: 'June 2026' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'June 2026, ฿15,268.00' }).getAttribute('aria-checked')).toBe('true');
});

test('no month after this one ever appears: a month not started yet, and an older month ending the bars', async () => {
  const { fake, resources } = recapFake();
  mountRecap('2026-11', { resources });
  expect(await screen.findByText("This month hasn't started yet.")).toBeTruthy();
  expect(within(screen.getByTestId('stage-header')).getByText('November 2026')).toBeTruthy();
  expect(bars().map((bar) => bar.getAttribute('aria-label')?.split(',')[0])).toEqual(['April 2026', 'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026 so far']);
  expect(bars().filter((bar) => bar.getAttribute('aria-checked') === 'true')).toHaveLength(0);
  // Nothing of a month that has not started is read.
  expect(fake.callsOf('summary').map((call) => call.args[0])).not.toContain('2026-11');
  expect(fake.callsOf('history')).toHaveLength(0);
  cleanup();
  mountRecap('2025-12');
  expect(await screen.findByRole('heading', { name: 'No entries in this month' })).toBeTruthy();
  expect(bars().map((bar) => [bar.getAttribute('aria-label'), bar.getAttribute('aria-checked')])).toEqual([
    ['July 2025, ฿0.00', 'false'], ['August 2025, ฿0.00', 'false'], ['September 2025, ฿0.00', 'false'],
    ['October 2025, ฿0.00', 'false'], ['November 2025, ฿0.00', 'false'], ['December 2025, ฿0.00', 'true'],
  ]);
});

// ---------------------------------------------------------------------------
// Share as text

test('share as text: the recap in plain words with every amount exact', async () => {
  const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  mountRecap('2026-08', { resources: recapFake({ budgets: [recapBudget('2026-08', '1800000')] }).resources });
  await recapShown();
  const button = screen.getByRole('button', { name: 'Share as text' });
  expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
  fireEvent.click(button);
  expect(share).toHaveBeenCalledTimes(1);
  expect(share).toHaveBeenCalledWith({ message: AUGUST_SHARE });
});

test('a share that cannot open says so, and the recap stays', async () => {
  vi.spyOn(Share, 'share').mockRejectedValue(new Error('Share is not supported'));
  mountRecap('2026-08');
  await recapShown();
  fireEvent.click(screen.getByRole('button', { name: 'Share as text' }));
  expect(await screen.findByText("Couldn't open sharing. Try again.")).toBeTruthy();
  expect(screen.getByTestId('receipt-slip')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// The bun, motion, the device's drafts

test('the bun: cheer on the stage at Full, decorative; none at Quiet or Off', async () => {
  mountRecap('2026-08');
  await recapShown();
  const bun = within(screen.getByTestId('stage-header')).getByTestId('recap-bun-cheer');
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  for (const intensity of ['quiet', 'off'] as const) {
    cleanup();
    window.localStorage.clear();
    mountRecap('2026-08', { intensity });
    await recapShown();
    expect(screen.queryByTestId('recap-bun-cheer'), intensity).toBeNull();
    expect(document.querySelector('svg'), intensity).toBeNull();
  }
});

test('an empty month keeps its thinking bun at Quiet (an empty state) and drops it at Off', async () => {
  mountRecap('2026-04', { intensity: 'quiet' });
  expect(await screen.findByTestId('recap-bun-thinking')).toBeTruthy();
  cleanup();
  window.localStorage.clear();
  mountRecap('2026-04', { intensity: 'off' });
  await screen.findByRole('heading', { name: 'No entries in this month' });
  expect(screen.queryByTestId('recap-bun-thinking')).toBeNull();
});

test('reduced motion: nothing on the recap moves; the cheer bun simply stands on the stage', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  mountRecap('2026-08');
  await recapShown();
  await act(async () => { await Promise.resolve(); });
  const stage = screen.getByTestId('stage-header');
  for (let node: HTMLElement | null = within(stage).getByTestId('recap-bun-cheer'); node && node !== stage; node = node.parentElement) {
    expect(node.style.transform, node.getAttribute('data-testid') ?? node.tagName).toBe('');
  }
  expect(document.querySelectorAll('[style*="transform"]')).toHaveLength(0);
});

test('entries still on this device for the month are mentioned, since the recap holds confirmed money only', async () => {
  const diary = createFakeDiary({ outbox: [queued(draftEntry({ occurred_on: '2026-09-29' }), 'unsent')] });
  mountRecap('2026-09', { diary: diary.diary });
  await recapShown();
  expect(screen.getByText("Entries still on this device aren't in this recap yet.")).toBeTruthy();
  // The draft's ฿65.00 is never added in.
  expect(screen.getByLabelText('Spent, ฿12,450.00')).toBeTruthy();
  cleanup();
  mountRecap('2026-08', { diary: diary.diary });
  await recapShown();
  expect(screen.queryByText("Entries still on this device aren't in this recap yet.")).toBeNull();
});

// ---------------------------------------------------------------------------
// Thai, dark mode and accessibility

test('Thai: Buddhist-era month names, Thai category names, and Thai leading on the stage, the slip and the bars', async () => {
  mountRecap('2026-08', { locale: 'th' });
  await recapShown();
  const stage = screen.getByTestId('stage-header');
  expect(within(stage).getByText('สิงหาคม 2569').style.lineHeight).toBe(leading('body', 'th'));
  expect(within(stage).getByRole('heading').style.lineHeight).toBe(leading('title', 'th'));
  expect(within(slip()).getByRole('heading', { name: 'สิงหาคม 2569' }).style.lineHeight).toBe(leading('heading', 'th'));
  const join = (label: string, value: string) => t('{label}, {value}', 'th', { label, value });
  for (const [category, amount] of [['Bills', '฿13,167.00'], ['Travel', '฿480.00'], ['Food', '฿315.51']] as const) {
    expect(within(slip()).getByLabelText(join(t(category, 'th'), amount))).toBeTruthy();
  }
  expect(t('Bills', 'th')).not.toBe('Bills');
  expect(bars('th').map((bar) => bar.getAttribute('aria-label'))).toEqual([
    join('เมษายน 2569', '฿0.00'), join('พฤษภาคม 2569', '฿500.00'), join('มิถุนายน 2569', '฿15,268.00'),
    join('กรกฎาคม 2569', '฿0.00'), join('สิงหาคม 2569', '฿13,962.51'), join(t('{month} so far', 'th', { month: 'กันยายน 2569' }), '฿12,450.00'),
  ]);
  expect(within(screen.getByRole('radio', { name: join('มิถุนายน 2569', '฿15,268.00') })).getByText('มิถุนายน 2569').style.lineHeight).toBe(leading('label', 'th'));
});

test.each([['light', bunLight], ['dark', bunDark]] as const)('%s: the lavender stage, the paper slip and the card of bars, every text in an approved pair', async (mode, colors) => {
  mountRecap('2026-08', { mode, resources: recapFake({ budgets: [recapBudget('2026-08', '1000000')] }).resources });
  await recapShown();
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(slip().style.backgroundColor).toEqual(rgb(colors.paper));
  expect(screen.getByTestId('recap-compare').style.backgroundColor).toEqual(rgb(colors.card));
  expect(screen.getByTestId('recap-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expectApprovedTextPairs(document.body, colors);
});

test('accessibility: named headings, 44 pt targets and exact spoken amounts; the total is read with its label', async () => {
  mountRecap('2026-08');
  await recapShown();
  for (const name of ['Month recap', 'August 2026', 'Top categories', 'Compare months']) expect(screen.getByRole('heading', { name })).toBeTruthy();
  for (const name of ['Back', 'Share as text']) {
    const button = screen.getByRole('button', { name });
    expect(Number.parseFloat(button.style.minHeight), name).toBeGreaterThanOrEqual(44);
  }
  // Kept is the receipt's total, spoken with its label.
  expect(within(slip()).getByLabelText('Kept, ฿15,537.49')).toBeTruthy();
  // Only one primary (ink-filled) action on the screen: Share as text.
  const filled = screen.getAllByRole('button').filter((button) => hexOf(button.style.backgroundColor) === bunLight.ink.toUpperCase());
  expect(filled.map((button) => button.textContent)).toEqual(['Share as text']);
});

// ---------------------------------------------------------------------------
// The catalogue's recap sections (not registered until E2 checkpoint 3)

const SECTION_SHOWS: Readonly<Record<string, () => void>> = {
  'recap-month': () => {
    expect(screen.getByLabelText('Budget, ฿13,962.51 of ฿18,000.00')).toBeTruthy();
    expect(screen.getByTestId('recap-bun-cheer')).toBeTruthy();
  },
  'recap-over-budget': () => expect(screen.getByText('It happens. ฿13,962.51 of ฿10,000.00 spent.')).toBeTruthy(),
  'recap-money-in-only': () => expect(screen.getByLabelText('Kept, ฿28,500.00')).toBeTruthy(),
  'recap-more-out': () => expect(screen.getByLabelText('Kept, ฿5,268.00 more went out than came in')).toBeTruthy(),
  'recap-this-month': () => expect(screen.getByTestId('recap-total').textContent).toBe('฿12,450.00 spent so far'),
  'recap-on-device': () => expect(screen.getByText("Entries still on this device aren't in this recap yet.")).toBeTruthy(),
  'recap-empty': () => expect(screen.getByRole('heading', { name: 'No entries in this month' })).toBeTruthy(),
  'recap-loading': () => expect(screen.getByLabelText('Loading your diary')).toBeTruthy(),
  'recap-offline': () => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy(),
  'recap-problem': () => expect(screen.getByRole('heading', { name: 'Update Jotbun' })).toBeTruthy(),
};

test('the catalogue has one recap section per state, with recap ids and titles', () => {
  expect(RECAP_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SECTION_SHOWS));
  for (const section of RECAP_SECTIONS) {
    expect(section.id).toMatch(/^recap-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(section.title).toMatch(/^Recap: \S/);
    expect([section.group, section.layout]).toEqual(['Screens', 'screen']);
  }
  expect(new Set(RECAP_SECTIONS.map((section) => section.title)).size).toBe(RECAP_SECTIONS.length);
});

test.each(Object.keys(SECTION_SHOWS))('catalogue section %s reaches its state on the fakes, with no network', async (id) => {
  const section = RECAP_SECTIONS.find((candidate) => candidate.id === id);
  expect(section, id).toBeDefined();
  const network = vi.spyOn(globalThis, 'fetch');
  mountInApp(<>{section?.render()}</>);
  await settle();
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 10_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? null).toBeNull();
  expect(screen.getByTestId('recap-screen')).toBeTruthy();
  SECTION_SHOWS[id]();
  expect(network).not.toHaveBeenCalled();
}, 20_000);
