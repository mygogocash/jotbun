// The Bun Wallet insights (P2-T31; bw-insights, wc-calendar,
// es-empty-insights), on the boards' day, Saturday 24 October 2026: the three
// tabs in both modes and both languages, the info tray, the six bars on one
// scale with the budget, the calendar's steps and labels, the early state, the
// load and its problems, a sync that changes nothing, private mode (R65), the
// analytics (R61), the largest text sizes, and the catalogue's sections
// drawing the real screen on fakes.
//
// The fakes: October holds ฿3,972.50 out over the 1st, 2nd, 5th and 24th (Food
// ฿3,784.50 in three entries, Travel ฿188.00), ฿25,000.00 in, and a ฿18,000.00
// budget; May to September before it spend ฿20.00, nothing, ฿2,500.00,
// ฿6,000.00 and ฿9,000.00, and September earns ฿30,000.00. The month's summary
// gives each category's money, as the server does (withCategoryTotals).
import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

// react-native-web drops maxFontSizeMultiplier and numberOfLines from the DOM,
// so the test records the props that reach the app's Text and still renders it.
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

// Each calendar the screen draws, by its month and the records it was drawn from.
const drawn = vi.hoisted(() => ({ calendars: [] as { month: string; days: string[] }[] }));
vi.mock('@mobile/spend/v1/redesign/insights/insightsModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/spend/v1/redesign/insights/insightsModel')>();
  return {
    ...actual,
    calendarModel: (input: Parameters<typeof actual.calendarModel>[0]) => {
      drawn.calendars.push({ month: input.month, days: input.records.map((record) => record.occurred_on) });
      return actual.calendarModel(input);
    },
  };
});

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { V1Error } from '@mobile/api/client';
import { hiddenFromScreenReaders } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { calendarPaint, walletDark, walletLight } from '@mobile/theme/walletPalette';
import type { WalletColors } from '@mobile/theme/walletPalette';
import { LARGEST_STANDARD_SCALE } from '@mobile/ui/largeTextScale';
import { rgba } from '../../dev/catalogue/catalogueTestHarness';
import { recapBudget, withCategoryTotals } from '../../dev/catalogue/insights/recapSections';
import { router } from '../../dev/catalogue/routerTestStub';
import { draftEntry, queued } from '../../dev/catalogue/screenFixtures';
import { WALLET_SECTIONS } from '../../dev/catalogue/wallet';
import { WALLET_INSIGHTS_SECTIONS } from '../../dev/catalogue/wallet/insightsSections';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { WalletInsightsScreen } from './WalletInsightsScreen';

beforeEach(() => {
  router.push.mockReset();
  drawn.calendars.length = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  seen.props.length = 0;
});

// ---------------------------------------------------------------------------
// The fakes

/** Saturday 24 October 2026, 17:00 in Bangkok. */
const NOW = new Date('2026-10-24T10:00:00Z');
const [CASH, DAILY] = goldenSeed().wallets as [WalletSnapshot, WalletSnapshot];
const [FOOD, TRAVEL, BILLS, SALARY] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];

function entry(id: string, type: 'expense' | 'income', day: string, amountMinor: string, category: CategoryDto, wallet: WalletSnapshot, extra: Partial<TransactionDto> = {}): TransactionDto {
  return { id, type, amount_minor: amountMinor, occurred_on: day, wallet_id: wallet.id, category_id: category.id, note: null, merchant: null, deleted_at: null, version: 1, ...extra } as TransactionDto;
}

const OCTOBER: readonly TransactionDto[] = [
  entry('t01', 'expense', '2026-10-01', '324050', FOOD, CASH, { note: 'Dinner' }),
  entry('t02', 'income', '2026-10-01', '2500000', SALARY, DAILY),
  entry('t03', 'expense', '2026-10-02', '41200', FOOD, CASH, { note: 'Lunch' }),
  entry('t04', 'expense', '2026-10-05', '18800', TRAVEL, DAILY, { note: 'BTS' }),
  entry('t05', 'expense', '2026-10-24', '13200', FOOD, CASH, { merchant: 'Coffee Shop' }),
];
const BEFORE: readonly TransactionDto[] = [
  entry('t10', 'expense', '2026-05-10', '2000', FOOD, CASH),
  entry('t11', 'expense', '2026-07-10', '250000', BILLS, DAILY),
  entry('t12', 'expense', '2026-08-10', '600000', BILLS, DAILY),
  entry('t13', 'expense', '2026-09-10', '900000', BILLS, DAILY),
  entry('t14', 'income', '2026-09-01', '3000000', SALARY, DAILY),
];

function insightsFake({ records = [...OCTOBER, ...BEFORE], budgetMinor = '1800000' }: { records?: readonly TransactionDto[]; budgetMinor?: string | null } = {}) {
  const fake = createFakeResources({ wallets: [CASH, DAILY], records: [...records], categories: [...BUILTINS], budgets: budgetMinor === null ? [] : [recapBudget('2026-10', budgetMinor)] });
  return { fake, resources: withCategoryTotals(fake) };
}

function mountInsights(options: MountWalletOptions = {}) {
  return mountWallet(<WalletInsightsScreen now={NOW} />, { resources: insightsFake().resources, ...options });
}

/** Lets every read the fakes started land. */
const settle = () => act(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Asserting lookups: each fails on an AssertionError, never a lookup error

function found(testID: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

function named(role: string, name: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByRole(role, { name });
  expect(element, `${role} ${name}`).not.toBeNull();
  return element as HTMLElement;
}

const textOf = (testID: string) => found(testID).textContent;
/** The words an element shows, leaving out what is hidden from screen readers (a category tile's initial). */
function wordsOf(element: Element): string {
  return [...element.childNodes].map((node) => {
    if (node.nodeType === 3) return node.textContent ?? '';
    return node instanceof Element && node.getAttribute('aria-hidden') !== 'true' ? wordsOf(node) : '';
  }).join('');
}
const rowsOf = (testID: string) => [...found(testID).querySelectorAll('[role="link"]')].map(wordsOf);
const labelOf = (element: HTMLElement) => element.getAttribute('aria-label');
const day = (n: number) => found(`calendar-day-${n}`);
const reads = (fake: ReturnType<typeof insightsFake>['fake']) =>
  (['summary', 'history', 'categories', 'wallets'] as const).map((method) => fake.callsOf(method).length);

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await settle();
}

async function openTab(name: string) {
  await press(named('tab', name));
}

const TABS = { th: { spending: 'ใช้จ่าย', inOut: 'เงินเข้า-ออก', calendar: 'ปฏิทิน' }, en: { spending: 'Spending', inOut: 'In and out', calendar: 'Calendar' } } as const;
const PALETTE: Readonly<Record<'light' | 'dark', WalletColors>> = { light: walletLight, dark: walletDark };
/** Thai letters and marks; ฿ (U+0E3F) is not one, since English amounts carry it too. */
const THAI_LETTERS = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;

// ---------------------------------------------------------------------------
// The spending tab

test('the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line', async () => {
  for (const mode of ['light', 'dark'] as const) {
    const colors = PALETTE[mode];
    mountInsights({ mode, locale: 'th' });
    await settle();
    const chart = found('insights-month-bars');
    const bars = [...chart.querySelectorAll('rect')];
    expect(bars.map((bar) => bar.getAttribute('data-testid')), mode).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month) => `month-bar-${month}`));
    expect(bars.map((bar) => bar.getAttribute('fill')), mode).toEqual([colors.barPast, colors.barPast, colors.barPast, colors.barPast, colors.barPast, colors.barNow]);
    expect(found('budget-guideline').getAttribute('stroke'), mode).toBe(colors.guideLine);
    expect(found('budget-guideline').getAttribute('stroke-dasharray'), mode).toBe('4 4');
    // bw-insights: the money out at 36, the days left with today counted, the budget in the wallet's money text, the months by their short names.
    expect(textOf('spending-hero-amount'), mode).toBe('฿3,972.50');
    expect(textOf('spending-days-left'), mode).toBe('ใช้ไปแล้ว · อีก 8 วันจบเดือน');
    expect(textOf('insights-budget-label'), mode).toBe('งบ ฿18,000');
    expect(['05', '06', '07', '08', '09', '10'].map((month) => textOf(`month-name-2026-${month}`)), mode).toEqual(['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.']);
    cleanup();
  }
});

test("the budget line sits on the bars' own scale, from one baseline", async () => {
  // Under budget: ฿18,000 is the top (110 units above the baseline at 130), and every month stands by its true share.
  mountInsights();
  await settle();
  const rise = (month: string) => Number(found(`month-bar-${month}`).getAttribute('height'));
  const top = (month: string) => Number(found(`month-bar-${month}`).getAttribute('y'));
  expect(['05', '06', '07', '08', '09', '10'].map((month) => rise(`2026-${month}`))).toEqual([3, 0, 15, 36, 55, 24]);
  expect(['05', '06', '07', '08', '09', '10'].map((month) => top(`2026-${month}`) + rise(`2026-${month}`))).toEqual([130, 130, 130, 130, 130, 130]);
  expect([found('budget-guideline').getAttribute('y1'), found('budget-guideline').getAttribute('y2')]).toEqual(['20', '20']);
  cleanup();
  // Over the budget in September: the largest month is the top, and the ฿4,500 line stands at its share of it.
  mountInsights({ resources: insightsFake({ budgetMinor: '450000' }).resources });
  await settle();
  expect(['05', '06', '07', '08', '09', '10'].map((month) => rise(`2026-${month}`))).toEqual([3, 0, 30, 73, 110, 48]);
  expect(found('budget-guideline').getAttribute('y1')).toBe('75');
  expect(textOf('insights-budget-label')).toBe('งบ ฿4,500');
  cleanup();
  // No budget: no line and no label.
  mountInsights({ resources: insightsFake({ budgetMinor: null }).resources });
  await settle();
  expect(found('insights-month-bars').querySelector('line')).toBeNull();
  expect(screen.queryByTestId('insights-budget-label')).toBeNull();
  expect(rise('2026-09')).toBe(110);
});

test("the chart is one named element that reads each month's amount", async () => {
  const spoken = {
    th: 'ใช้จ่ายรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569 ฿20.00, มิถุนายน 2569 ฿0.00, กรกฎาคม 2569 ฿2,500.00, สิงหาคม 2569 ฿6,000.00, กันยายน 2569 ฿9,000.00, ตุลาคม 2569 ถึงตอนนี้ ฿3,972.50',
    en: 'Monthly spending, May 2026 to October 2026: May 2026, ฿20.00, June 2026, ฿0.00, July 2026, ฿2,500.00, August 2026, ฿6,000.00, September 2026, ฿9,000.00, October 2026 so far, ฿3,972.50',
  } as const;
  for (const locale of ['th', 'en'] as const) {
    mountInsights({ locale });
    await settle();
    expect(screen.queryAllByRole('img', { name: spoken[locale] }), locale).toHaveLength(1);
    expect(found('insights-month-bars').getAttribute('role'), locale).toBe('img');
    cleanup();
  }
});

test('the info button explains the number in a tray', async () => {
  mountInsights();
  await settle();
  const info = named('button', 'ตัวเลขนี้คืออะไร');
  expect([info.style.width, info.style.height]).toEqual(['44px', '44px']);
  expect(screen.queryByRole('dialog', { name: 'ตัวเลขนี้คืออะไร' })).toBeNull();
  await press(info);
  const tray = named('dialog', 'ตัวเลขนี้คืออะไร');
  expect(within(tray).queryByText('ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง')).not.toBeNull();
});

test("the categories are the month's totals in topCategories' order, each with its own count, opening History filtered to it", async () => {
  for (const locale of ['th', 'en'] as const) {
    mountInsights({ locale });
    await settle();
    expect(rowsOf('insights-categories'), locale).toEqual(locale === 'th'
      ? ['อาหาร3 รายการ฿3,784.50', 'การเดินทาง1 รายการ฿188']
      : ['Food3 entries฿3,784.50', 'Travel1 entries฿188']);
    expect(named('heading', locale === 'th' ? 'หมวดหมู่' : 'Categories'), locale).not.toBeNull();
    cleanup();
  }
  mountInsights();
  await settle();
  await press(found(`category-row-${TRAVEL.id}`));
  expect(router.push.mock.calls).toEqual([[{ pathname: '/spend/all', params: { category: TRAVEL.id } }]]);
});

test('a category no longer listed, a deleted record and money in are counted nowhere they do not belong', async () => {
  const GONE = '0000000c-0000-4000-8000-0000000000ff';
  const records = [
    ...OCTOBER,
    ...BEFORE,
    entry('t20', 'expense', '2026-10-02', '5000', { ...FOOD, id: GONE }, CASH, { note: 'Old tea' }),
    entry('t21', 'income', '2026-10-02', '7000', SALARY, CASH),
  ];
  const { fake, resources } = insightsFake({ records });
  // History hands back a record deleted meanwhile, as a page read before the delete would.
  const withDeleted: SpendV1Resources = {
    ...resources,
    history: async (filter, cursor, limit) => {
      const page = await fake.resources.history(filter, cursor, limit);
      return cursor === undefined ? { ...page, items: [...page.items, entry('t22', 'expense', '2026-10-02', '9900', FOOD, CASH, { deleted_at: '2026-10-03T00:00:00.000Z' })] } : page;
    },
  };
  mountInsights({ resources: withDeleted });
  await settle();
  const rows = rowsOf('insights-categories');
  // Food's count is its three live expenses; the money in and the deleted record are not among them.
  expect(rows).toEqual(['อาหาร3 รายการ฿3,784.50', 'การเดินทาง1 รายการ฿188', 'หมวดหมู่1 รายการ฿50']);
  await openTab('ปฏิทิน');
  await press(day(2));
  expect(textOf('calendar-chosen-day')).toBe('ศุกร์ 2 ต.ค.');
  // In history's order; the money in and the deleted record are not among them.
  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('ศุกร์ 2 ต.ค.2 รายการ฿462Old teaหมวดหมู่ · Cash฿50Lunchอาหาร · Cash฿412');
});

// ---------------------------------------------------------------------------
// The tabs and the analytics

test('each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar', async () => {
  const recorded = await recordAnalytics();
  try {
    mountInsights();
    await settle();
    const tabs = screen.queryAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['ใช้จ่าย', 'เงินเข้า-ออก', 'ปฏิทิน']);
    for (const tab of tabs) expect(tab.style.minHeight, tab.textContent ?? '').toBe('44px');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    await openTab('เงินเข้า-ออก');
    await openTab('ปฏิทิน');
    // Choosing the tab already shown sends nothing.
    await openTab('ปฏิทิน');
    await press(day(2));
    const viewed = recorded.sent.filter((event) => event.name === 'insights_viewed');
    expect(viewed.map(({ kind, properties }) => [kind, properties.tab, properties.period])).toEqual([
      ['capture', 'spending', 'month'], ['capture', 'in_out', 'month'], ['capture', 'calendar', 'month'],
    ]);
    expect(recorded.sent.map((event) => event.name)).toEqual(['insights_viewed', 'insights_viewed', 'insights_viewed']);
    const sent = JSON.stringify(recorded.sent);
    for (const secret of ['324050', '3,240', '397250', '3,972', '1800000', '18,000', 'Dinner', 'Lunch', 'Coffee Shop', 'Cash']) expect(sent).not.toContain(secret);
  } finally {
    recorded.restore();
  }
});

test('the in-and-out tab shows money in in violet with a plus', async () => {
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    const colors = PALETTE[mode];
    mountInsights({ mode, locale });
    await settle();
    await openTab(TABS[locale].inOut);
    const income = found('in-out-income');
    expect([income.textContent, income.style.color], mode).toEqual(['+฿25,000', rgba(colors.violet)]);
    const out = found('in-out-expense');
    expect([out.textContent, out.style.color], mode).toEqual(['฿3,972.50', rgba(colors.ink)]);
    expect(textOf('in-out-kept'), mode).toBe(locale === 'th' ? 'เก็บได้ ฿21,027.50' : 'Kept ฿21,027.50');
    // Six pairs on one scale, September's ฿30,000.00 in at the top: money in violet, money out in ink.
    const pairs = found('in-out-paired-bars');
    expect([...pairs.querySelectorAll('rect')].map((bar) => [bar.getAttribute('data-testid'), bar.getAttribute('fill'), bar.getAttribute('height')]), mode).toEqual([
      ['paired-in-2026-05', colors.violet, '0'], ['paired-out-2026-05', colors.barNow, '3'],
      ['paired-in-2026-06', colors.violet, '0'], ['paired-out-2026-06', colors.barNow, '0'],
      ['paired-in-2026-07', colors.violet, '0'], ['paired-out-2026-07', colors.barNow, '9'],
      ['paired-in-2026-08', colors.violet, '0'], ['paired-out-2026-08', colors.barNow, '22'],
      ['paired-in-2026-09', colors.violet, '110'], ['paired-out-2026-09', colors.barNow, '33'],
      ['paired-in-2026-10', colors.violet, '91'], ['paired-out-2026-10', colors.barNow, '14'],
    ]);
    expect(labelOf(pairs), mode).toBe(locale === 'th'
      ? 'เงินเข้าและเงินออกรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569 เงินเข้า ฿0.00 เงินออก ฿20.00, มิถุนายน 2569 เงินเข้า ฿0.00 เงินออก ฿0.00, กรกฎาคม 2569 เงินเข้า ฿0.00 เงินออก ฿2,500.00, สิงหาคม 2569 เงินเข้า ฿0.00 เงินออก ฿6,000.00, กันยายน 2569 เงินเข้า ฿30,000.00 เงินออก ฿9,000.00, ตุลาคม 2569 เงินเข้า ฿25,000.00 เงินออก ฿3,972.50'
      : 'Money in and out by month, May 2026 to October 2026: May 2026: money in ฿0.00, money out ฿20.00, June 2026: money in ฿0.00, money out ฿0.00, July 2026: money in ฿0.00, money out ฿2,500.00, August 2026: money in ฿0.00, money out ฿6,000.00, September 2026: money in ฿30,000.00, money out ฿9,000.00, October 2026: money in ฿25,000.00, money out ฿3,972.50');
    expect(pairs.getAttribute('role'), mode).toBe('img');
    cleanup();
  }
});

test('more out than in, and in and out matched, are said in words', async () => {
  const short = insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t30', 'income', '2026-10-03', '100000', SALARY, DAILY)] });
  mountInsights({ resources: short.resources });
  await settle();
  await openTab('เงินเข้า-ออก');
  expect(textOf('in-out-kept')).toBe('จ่ายออกมากกว่ารับเข้า ฿2,972.50');
  cleanup();
  const even = insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t31', 'income', '2026-10-03', '397250', SALARY, DAILY)] });
  mountInsights({ resources: even.resources });
  await settle();
  await openTab('เงินเข้า-ออก');
  expect(textOf('in-out-kept')).toBe('ได้รับเท่ากับที่ใช้ไป');
});

// ---------------------------------------------------------------------------
// The calendar

test('the calendar shades each day by its baht step, frames today and leaves future days inert', async () => {
  for (const mode of ['light', 'dark'] as const) {
    const colors = PALETTE[mode];
    mountInsights({ mode });
    await settle();
    await openTab('ปฏิทิน');
    const paint = (step: 0 | 1 | 2 | 3 | 4 | 5) => calendarPaint(step, mode === 'dark');
    // 3,240.50 is step 5, 412 step 2, 188 step 1, today's 132 step 1, and a day with nothing is step 0 with its hairline.
    for (const [n, step, amount] of [[1, 5, '3,240'], [2, 2, '412'], [5, 1, '188'], [24, 1, '132'], [3, 0, null]] as const) {
      const cell = day(n);
      expect([cell.style.backgroundColor, within(cell).queryByTestId(`calendar-day-amount-${n}`)?.textContent ?? null], `${mode} day ${n}`).toEqual([rgba(paint(step).fill), amount]);
      expect(within(cell).getByText(String(n)).style.color, `${mode} day ${n}`).toBe(rgba(paint(step).text));
    }
    expect([day(3).style.borderTopWidth, day(3).style.borderTopColor], mode).toEqual(['1px', rgba(paint(0).border!)]);
    expect([day(1).style.borderTopWidth, day(2).style.borderTopWidth], mode).toEqual(['0px', '0px']);
    expect([day(24).style.borderTopWidth, day(24).style.borderTopColor], mode).toEqual(['2px', rgba(colors.ink)]);
    // Days after today are drawn, are no buttons and are hidden from screen readers.
    const future = found('calendar-future-day-25');
    expect([future.textContent, future.getAttribute('role'), hiddenFromScreenReaders(future)], mode).toEqual(['25', null, true]);
    expect(screen.queryAllByRole('button').filter((button) => /^calendar-day-/.test(button.getAttribute('data-testid') ?? '')), mode).toHaveLength(24);
    cleanup();
  }
});

test('each day button says its date and its money out, today named and drafts said apart', async () => {
  const diary = createFakeDiary({ outbox: [queued(draftEntry({ occurred_on: '2026-10-24' }), 'unsent')] });
  mountInsights({ diary: diary.diary });
  await settle();
  await openTab('ปฏิทิน');
  expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))]).toEqual([
    'วันพฤหัสบดีที่ 1 ตุลาคม 2569, จ่ายออก ฿3,240.50',
    'วันเสาร์ที่ 3 ตุลาคม 2569, ไม่มีรายการ',
    'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00, รอซิงก์: เงินออก ฿65.00',
  ]);
  cleanup();
  mountInsights({ locale: 'en' });
  await settle();
  await openTab('Calendar');
  expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))]).toEqual([
    'Thursday 1 October 2026, Money out ฿3,240.50',
    'Saturday 3 October 2026, Nothing logged',
    'Today, Saturday 24 October 2026, Money out ฿132.00',
  ]);
});

test("the calendar's month line, legend and chosen day are wc-calendar's, every amount exact", async () => {
  mountInsights();
  await settle();
  await openTab('ปฏิทิน');
  expect(named('heading', 'ตุลาคม 2569')).not.toBeNull();
  expect(screen.queryAllByText('ตุลาคม 2569')).toHaveLength(1);
  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
  const legend = found('calendar-legend');
  expect([legend.getAttribute('role'), labelOf(legend)]).toEqual(['img', 'สีเข้มขึ้นเมื่อใช้มากขึ้น ตั้งแต่ 0 ถึงมากกว่า 2,000 บาทต่อวัน กรอบคือวันนี้']);
  expect([0, 1, 2, 3, 4, 5].map((step) => textOf(`legend-label-${step}`))).toEqual(['0', '≤200', '≤500', '≤1,000', '≤2,000', '2,000+']);
  expect(textOf('legend-unit')).toBe('บาท\nต่อวัน');
  expect([0, 1, 2, 3, 4, 5].map((step) => found(`legend-swatch-${step}`).style.backgroundColor)).toEqual([0, 1, 2, 3, 4, 5].map((step) => rgba(calendarPaint(step as 0, false).fill)));
  // Today is chosen first; another day shows its own records, with each category and wallet named.
  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('เสาร์ 24 ต.ค. · วันนี้1 รายการ฿132Coffee Shopอาหาร · Cash฿132');
  expect(named('heading', 'เสาร์ 24 ต.ค. · วันนี้')).not.toBeNull();
  expect(day(24).getAttribute('aria-selected')).toBe('true');
  await press(day(1));
  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('พฤหัส 1 ต.ค.1 รายการ฿3,240.50Dinnerอาหาร · Cash฿3,240.50');
  expect([day(1).getAttribute('aria-selected'), day(24).getAttribute('aria-selected')]).toEqual(['true', 'false']);
  await press(day(5));
  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('จันทร์ 5 ต.ค.1 รายการ฿188BTSการเดินทาง · Daily account฿188');
});

test('a record with no merchant or note is named by its category, and one whose wallet is no longer listed by its category alone', async () => {
  const records = [...OCTOBER, ...BEFORE, entry('t40', 'expense', '2026-10-24', '2500', TRAVEL, { ...CASH, id: '0000000a-0000-4000-8000-0000000000ff' })];
  mountInsights({ resources: insightsFake({ records }).resources });
  await settle();
  await openTab('ปฏิทิน');
  expect(wordsOf(found('day-record-t40'))).toBe('การเดินทางการเดินทาง฿25');
});

test('the calendar steps back a month and never draws October under September; next stops at this month', async () => {
  const { fake, resources } = insightsFake();
  mountInsights({ resources });
  await settle();
  await openTab('ปฏิทิน');
  const next = named('button', 'เดือนถัดไป');
  expect([next.getAttribute('aria-disabled'), next.style.opacity]).toEqual(['true', '0.4']);
  await press(next);
  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
  const release = fake.hold('summary');
  fireEvent.click(named('button', 'เดือนก่อน'));
  await settle();
  // While September loads, nothing of October is drawn under its name.
  expect([screen.queryByTestId('calendar-tab'), textOf('insights-loading')]).toEqual([null, 'กำลังโหลดบันทึกของคุณ']);
  await act(async () => release());
  await settle();
  expect(named('heading', 'กันยายน 2569')).not.toBeNull();
  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿9,000 · จด 2 จาก 30 วัน');
  expect(textOf('calendar-chosen-day')).toBe('อังคาร 1 ก.ย.');
  expect(drawn.calendars.every(({ month, days }) => days.every((date) => date.startsWith(`${month}-`))), JSON.stringify(drawn.calendars.map(({ month }) => month))).toBe(true);
  expect(drawn.calendars.some(({ month }) => month === '2026-09')).toBe(true);
  expect(named('button', 'เดือนถัดไป').getAttribute('aria-disabled')).toBeNull();
  // A month gone by has no days left to count.
  await openTab('ใช้จ่าย');
  expect([textOf('spending-hero-amount'), screen.queryByTestId('spending-days-left')]).toEqual(['฿9,000', null]);
  await openTab('ปฏิทิน');
  await press(named('button', 'เดือนถัดไป'));
  expect(named('heading', 'ตุลาคม 2569')).not.toBeNull();
});

test('every page of the month is read', async () => {
  const { fake, resources } = insightsFake();
  // Pages of two: October's five records take three pages.
  const paged: SpendV1Resources = { ...resources, history: (filter, cursor) => fake.resources.history(filter, cursor, 2) };
  mountInsights({ resources: paged });
  await settle();
  expect(fake.callsOf('history').map((call) => call.args[1])).toEqual([undefined, 'c2', 'c4']);
  await openTab('ปฏิทิน');
  expect([labelOf(day(1)), labelOf(day(24))]).toEqual(['วันพฤหัสบดีที่ 1 ตุลาคม 2569, จ่ายออก ฿3,240.50', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00']);
  expect(textOf('calendar-month-line')).toBe('ใช้ไป ฿3,972.50 · จด 4 จาก 24 วัน');
});

// ---------------------------------------------------------------------------
// The early state

test('with two logged days the early state asks for one more day', async () => {
  const early = insightsFake({ records: [OCTOBER[0], OCTOBER[2]] });
  mountInsights({ resources: early.resources });
  await settle();
  const state = found('insights-early-state');
  expect(named('heading', 'จดอีก 1 วัน กราฟจะขึ้นตรงนี้', state)).not.toBeNull();
  expect(within(state).queryByText('กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้')).not.toBeNull();
  // es-empty-insights: each logged day by its own date, then the day still to log.
  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['พฤหัส 1 ต.ค.', 'ศุกร์ 2 ต.ค.', 'วันถัดไป']);
  expect(screen.queryByTestId('insights-month-bars')).toBeNull();
  expect(named('heading', 'ที่จดไว้แล้ว')).not.toBeNull();
  expect(textOf('insights-no-previous')).toBe('ยังไม่มีเดือนก่อนให้เทียบ');
  expect(rowsOf('insights-categories')).toEqual(['อาหาร2 รายการ฿3,652.50']);
  cleanup();
  // An earlier month with money out: no "no earlier month".
  mountInsights({ resources: insightsFake({ records: [OCTOBER[0], OCTOBER[2], BEFORE[3]] }).resources, locale: 'en' });
  await settle();
  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['Thu 1 Oct', 'Fri 2 Oct', 'Next day']);
  expect(screen.queryByTestId('insights-no-previous')).toBeNull();
  cleanup();
  // Three logged days: the chart.
  mountInsights({ resources: insightsFake({ records: [OCTOBER[0], OCTOBER[2], OCTOBER[3]] }).resources });
  await settle();
  expect([screen.queryByTestId('insights-early-state'), screen.queryByTestId('insights-month-bars') !== null]).toEqual([null, true]);
  expect(named('heading', 'หมวดหมู่')).not.toBeNull();
  cleanup();
  // Nothing logged yet: three days to log, and no categories.
  mountInsights({ resources: insightsFake({ records: [] }).resources });
  await settle();
  expect(named('heading', 'จดอีก 3 วัน กราฟจะขึ้นตรงนี้')).not.toBeNull();
  expect([0, 1, 2].map((index) => textOf(`insights-early-day-${index}`))).toEqual(['วันถัดไป', 'วันถัดไป', 'วันถัดไป']);
  expect(screen.queryByTestId('insights-categories')).toBeNull();
});

// ---------------------------------------------------------------------------
// The load

test('a diary sync never blanks the screen or resets it, and reads nothing again', async () => {
  const { fake, resources } = insightsFake();
  const diary = createFakeDiary();
  mountInsights({ resources, diary: diary.diary });
  await settle();
  const before = reads(fake);
  await press(named('button', 'ตัวเลขนี้คืออะไร'));
  // What the diary does after every sync run: a new view with a new, equal outbox.
  await act(async () => diary.set({ outbox: [] }));
  await settle();
  expect(named('dialog', 'ตัวเลขนี้คืออะไร')).not.toBeNull();
  cleanup();
  mountInsights({ resources, diary: diary.diary });
  await settle();
  await openTab('ปฏิทิน');
  await press(day(2));
  const counted = reads(fake);
  await act(async () => diary.set({ outbox: [] }));
  await settle();
  await act(async () => diary.set({ outbox: [] }));
  await settle();
  expect([textOf('calendar-chosen-day'), screen.queryByTestId('insights-loading')]).toEqual(['ศุกร์ 2 ต.ค.', null]);
  expect(reads(fake)).toEqual(counted);
  expect(before).toEqual([6, 1, 1, 1]);
});

test('a draft saved meanwhile shows at once, and one that resolves refreshes in place', async () => {
  const { fake, resources } = insightsFake();
  const diary = createFakeDiary();
  mountInsights({ resources, diary: diary.diary });
  await settle();
  await openTab('ปฏิทิน');
  await press(day(2));
  const counted = reads(fake);
  const draft = queued(draftEntry({ occurred_on: '2026-10-24' }), 'unsent');
  await act(async () => diary.set({ outbox: [draft] }));
  await settle();
  expect(labelOf(day(24))).toBe('วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00, รอซิงก์: เงินออก ฿65.00');
  expect(reads(fake)).toEqual(counted);
  // It is sent and acknowledged: the month is read again, quietly, and the chosen day stays.
  const release = fake.hold('summary');
  await act(async () => diary.set({ outbox: [{ ...draft, state: 'acknowledged', ackedRevision: '11' }] }));
  await settle();
  expect([textOf('calendar-chosen-day'), screen.queryByTestId('insights-loading')]).toEqual(['ศุกร์ 2 ต.ค.', null]);
  await act(async () => release());
  await settle();
  expect(reads(fake)).toEqual([counted[0] + 6, counted[1] + 1, counted[2] + 1, counted[3] + 1]);
  expect([textOf('calendar-chosen-day'), labelOf(day(24))]).toEqual(['ศุกร์ 2 ต.ค.', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569, จ่ายออก ฿132.00']);
});

test('a compare month that cannot be read is never drawn as ฿0: the problem says so with Try again', async () => {
  const { fake, resources } = insightsFake();
  let failing = true;
  const september: SpendV1Resources = {
    ...resources,
    summary: async (month) => {
      if (month === '2026-09' && failing) {
        failing = false;
        throw new V1Error('network', 0, 'NETWORK_ERROR');
      }
      return resources.summary(month);
    },
  };
  mountInsights({ resources: september, diary: null });
  await settle();
  const problem = found('insights-problem');
  expect(named('heading', 'โหลดข้อมูลเดือนนี้ไม่สำเร็จ', problem)).not.toBeNull();
  expect(within(problem).queryByText('ข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการ')).not.toBeNull();
  expect(screen.queryByTestId('insights-month-bars')).toBeNull();
  // The month shown shares its own summary with its bar: October and the four others, once each.
  expect(fake.callsOf('summary').map((call) => call.args[0]).sort()).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-10']);
  await press(named('button', 'ลองอีกครั้ง', problem));
  expect(labelOf(found('insights-month-bars'))).toContain('กันยายน 2569 ฿9,000.00');
  expect(screen.queryByTestId('insights-problem')).toBeNull();
});

test('offline is said with the banner where a diary is open; a problem a retry cannot fix offers no Try again', async () => {
  const offline = insightsFake();
  offline.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
  mountInsights({ resources: offline.resources });
  await settle();
  expect(found('insights-problem').textContent).toBe('ออฟไลน์อยู่ รายการใหม่จะบันทึกไว้ในเครื่องนี้โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
  cleanup();
  const web = insightsFake();
  web.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
  mountInsights({ resources: web.resources, diary: null });
  await settle();
  expect(found('insights-problem').textContent).toBe('โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
  cleanup();
  // A diary that is not open keeps nothing on this phone to speak of.
  const locked = insightsFake();
  locked.fake.fail('history', 'network', { code: 'NETWORK_ERROR' });
  mountInsights({ resources: locked.resources, diary: createFakeDiary({ phase: 'locked', lockReason: null }).diary });
  await settle();
  expect(found('insights-problem').textContent).toBe('โหลดข้อมูลเดือนนี้ไม่สำเร็จข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการลองอีกครั้ง');
  cleanup();
  const signedOut = insightsFake();
  signedOut.fake.fail('categories', 'signed_out');
  mountInsights({ resources: signedOut.resources, locale: 'en' });
  await settle();
  const problem = found('insights-problem');
  expect(problem.textContent).toBe('Signed outSign in again to see your diary.');
  expect(within(problem).queryByRole('button')).toBeNull();
});

test('entries changed meanwhile are said, with Refresh', async () => {
  const { fake, resources } = insightsFake();
  let changed = true;
  const later: SpendV1Resources = {
    ...resources,
    history: async (filter, cursor, limit) => {
      const page = await fake.resources.history(filter, cursor, 2);
      return cursor === 'c2' && changed ? { ...page, refresh_suggested: true } : page;
    },
  };
  mountInsights({ resources: later });
  await settle();
  expect(found('insights-changed').textContent).toBe('มีการเปลี่ยนแปลงรายการหลังจากที่คุณเปิดรายการนี้รีเฟรช');
  changed = false;
  await press(named('button', 'รีเฟรช'));
  expect([screen.queryByTestId('insights-changed'), screen.queryByTestId('insights-month-bars') !== null]).toEqual([null, true]);
});

// ---------------------------------------------------------------------------
// Private mode (R65)

test("in private mode the chart's name carries no amount and the calendar is one neutral fill with no legend values", async () => {
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    const colors = PALETTE[mode];
    mountInsights({ mode, locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    await settle();
    expect(labelOf(found('insights-month-bars')), mode).toBe(locale === 'th'
      ? 'ใช้จ่ายรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569, มิถุนายน 2569, กรกฎาคม 2569, สิงหาคม 2569, กันยายน 2569, ตุลาคม 2569 ถึงตอนนี้'
      : 'Monthly spending, May 2026 to October 2026: May 2026, June 2026, July 2026, August 2026, September 2026, October 2026 so far');
    expect([textOf('spending-hero-amount'), textOf('insights-budget-label')], mode).toEqual(['฿••••', locale === 'th' ? 'งบ ฿••••' : 'Budget ฿••••']);
    await openTab(TABS[locale].calendar);
    // Every day alike: one neutral fill, ink numbers, no amount, no border but today's frame.
    for (const n of [1, 2, 3, 5, 24]) {
      const cell = day(n);
      expect([cell.style.backgroundColor, within(cell).getByText(String(n)).style.color, within(cell).queryByTestId(`calendar-day-amount-${n}`)], `${mode} day ${n}`).toEqual([rgba(colors.raised), rgba(colors.ink), null]);
    }
    expect([1, 2, 3, 5].map((n) => day(n).style.borderTopWidth), mode).toEqual(['0px', '0px', '0px', '0px']);
    expect([day(24).style.borderTopWidth, day(24).style.borderTopColor], mode).toEqual(['2px', rgba(colors.ink)]);
    // Each day says its date alone.
    expect([labelOf(day(1)), labelOf(day(3)), labelOf(day(24))], mode).toEqual(locale === 'th'
      ? ['วันพฤหัสบดีที่ 1 ตุลาคม 2569', 'วันเสาร์ที่ 3 ตุลาคม 2569', 'วันนี้, วันเสาร์ที่ 24 ตุลาคม 2569']
      : ['Thursday 1 October 2026', 'Saturday 3 October 2026', 'Today, Saturday 24 October 2026']);
    expect(textOf('calendar-month-line'), mode).toBe(locale === 'th' ? 'ใช้ไป ฿•••• · จด 4 จาก 24 วัน' : 'Spent ฿•••• · logged 4 of 24 days');
    // The legend keeps its swatches, with no values, no unit and nothing said of amounts.
    expect([0, 5].map((step) => found(`legend-swatch-${step}`).style.backgroundColor), mode).toEqual([rgba(calendarPaint(0, mode === 'dark').fill), rgba(calendarPaint(5, mode === 'dark').fill)]);
    expect([screen.queryByTestId('legend-label-0'), screen.queryByTestId('legend-label-5'), screen.queryByTestId('legend-unit')], mode).toEqual([null, null, null]);
    expect(labelOf(found('calendar-legend')), mode).toBe(locale === 'th' ? 'กรอบคือวันนี้' : 'The framed day is today');
    expect(textOf('calendar-chosen-day-total'), mode).toBe('฿••••');
    const shown = document.body.textContent ?? '';
    for (const secret of ['3,240', '3,972', '412', '188', '132', '18,000']) expect(shown, `${mode} ${secret}`).not.toContain(secret);
    cleanup();
  }
});

test('in private mode the in-and-out tab masks every amount and keeps its words', async () => {
  for (const locale of ['th', 'en'] as const) {
    mountInsights({ locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    await settle();
    await openTab(TABS[locale].inOut);
    expect([textOf('in-out-income'), textOf('in-out-expense'), textOf('in-out-kept')], locale).toEqual(['฿••••', '฿••••', locale === 'th' ? 'เก็บได้ ฿••••' : 'Kept ฿••••']);
    expect(labelOf(found('in-out-paired-bars')), locale).toBe(locale === 'th'
      ? 'เงินเข้าและเงินออกรายเดือน พฤษภาคม 2569ถึงตุลาคม 2569: พฤษภาคม 2569, มิถุนายน 2569, กรกฎาคม 2569, สิงหาคม 2569, กันยายน 2569, ตุลาคม 2569'
      : 'Money in and out by month, May 2026 to October 2026: May 2026, June 2026, July 2026, August 2026, September 2026, October 2026');
    cleanup();
  }
  mountInsights({ device: { [PRIVATE_MODE_NAME]: '1' }, resources: insightsFake({ records: [...OCTOBER.filter((record) => record.type === 'expense'), entry('t30', 'income', '2026-10-03', '100000', SALARY, DAILY)] }).resources });
  await settle();
  await openTab('เงินเข้า-ออก');
  expect(textOf('in-out-kept')).toBe('จ่ายออกมากกว่ารับเข้า ฿••••');
});

// ---------------------------------------------------------------------------
// Languages and text sizes

test('in English the insights carry no Thai: weekdays, today, the per-day unit and entries are its own words', async () => {
  mountInsights({ locale: 'en', mode: 'dark' });
  await settle();
  expect(named('heading', 'Insights')).not.toBeNull();
  expect(found('spending-tab').textContent).toBe('฿3,972.50Spent so far · 8 days to the end of the monthBudget ฿18,000MayJunJulAugSepOctCategoriesFood3 entries฿3,784.50Travel1 entries฿188');
  await openTab('In and out');
  expect(found('in-out-tab').textContent).not.toMatch(THAI_LETTERS);
  expect(found('in-out-tab').textContent).toContain('Money in+฿25,000Money out฿3,972.50Kept ฿21,027.50');
  await openTab('Calendar');
  const calendar = found('calendar-tab');
  expect(calendar.textContent).not.toMatch(THAI_LETTERS);
  expect(calendar.textContent).toContain('October 2026Spent ฿3,972.50 · logged 4 of 24 daysSMTWTFS');
  expect([textOf('legend-unit'), textOf('calendar-chosen-day')]).toEqual(['baht\na day', 'Sat 24 Oct · Today']);
  expect(wordsOf(found('calendar-chosen-day-section'))).toBe('Sat 24 Oct · Today1 entries฿132Coffee ShopFood · Cash฿132');
  expect(labelOf(found('calendar-legend'))).toBe('Darker as you spend more, from 0 to over 2,000 baht a day The framed day is today');
  expect(named('button', 'Previous month')).not.toBeNull();
});

test("at AX5 the calendar's days stay 44 pt wide and grow taller, and nothing is cut", async () => {
  mountInsights({ fontScale: AX5 });
  await settle();
  await openTab('ปฏิทิน');
  const grid = found('calendar-grid');
  for (const cell of [day(1), day(24), found('calendar-future-day-25')]) {
    expect([cell.style.minWidth, cell.style.minHeight, cell.style.height], cell.textContent ?? '').toEqual(['44px', '50px', '']);
  }
  expect([...grid.children].map((row) => (row as HTMLElement).style.columnGap || (row as HTMLElement).style.gap)).toEqual(['4px', '4px', '4px', '4px', '4px']);
  // The grid's numbers stop at the largest standard size, in DM Sans; every other word keeps its role's scale.
  const grown = (text: string) => seen.props.filter((props) => props.children === text).map((props) => [props.maxFontSizeMultiplier, (props.style as { fontFamily?: string }).fontFamily]);
  expect(grown('3,240').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
  expect(grown('24').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
  expect(grown('2,000+').at(-1)).toEqual([LARGEST_STANDARD_SCALE, LATIN_UI_FONT_FAMILY]);
  for (const props of seen.props) expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode]).toEqual([undefined, undefined, undefined]);
});

// ---------------------------------------------------------------------------
// The catalogue

test("the catalogue's insights sections draw the real screen on fakes, one state each", async () => {
  expect(WALLET_INSIGHTS_SECTIONS.map((section) => [section.id, section.group, section.layout])).toEqual([
    ['bw-insights', 'Screens', 'screen'], ['bw-insights-in-out', 'Screens', 'screen'], ['bw-calendar', 'Screens', 'screen'],
    ['bw-insights-early', 'Screens', 'screen'], ['bw-insights-private', 'Screens', 'screen'], ['bw-insights-large', 'Screens', 'screen'],
  ]);
  const ids = WALLET_SECTIONS.map((section) => section.id);
  expect(ids.filter((id) => WALLET_INSIGHTS_SECTIONS.some((section) => section.id === id))).toEqual(WALLET_INSIGHTS_SECTIONS.map((section) => section.id));
  const states: Readonly<Record<string, () => unknown>> = {
    'bw-insights': () => [textOf('spending-hero-amount'), textOf('insights-budget-label'), textOf('spending-days-left')],
    'bw-insights-in-out': () => [textOf('in-out-income'), textOf('in-out-kept')],
    'bw-calendar': () => [textOf('calendar-month-line'), wordsOf(found('calendar-chosen-day-section'))],
    'bw-insights-early': () => [0, 1, 2].map((index) => textOf(`insights-early-day-${index}`)).concat(textOf('insights-no-previous') ?? ''),
    'bw-insights-private': () => [textOf('calendar-month-line'), screen.queryByTestId('calendar-day-amount-1'), labelOf(day(1))],
    'bw-insights-large': () => [textOf('spending-hero-amount'), rowsOf('insights-categories')],
  };
  const expected: Readonly<Record<string, unknown>> = {
    'bw-insights': ['฿12,480', 'งบ ฿18,000', 'ใช้ไปแล้ว · อีก 8 วันจบเดือน'],
    'bw-insights-in-out': ['+฿35,000', 'เก็บได้ ฿22,520'],
    'bw-calendar': ['ใช้ไป ฿12,480 · จด 22 จาก 24 วัน', 'เสาร์ 24 ต.ค. · วันนี้3 รายการ฿132กาแฟเย็นอาหาร · เงินสด฿65BTSการเดินทาง · บัญชีหลัก฿47วินการเดินทาง · เงินสด฿20'],
    'bw-insights-early': ['ศุกร์ 23 ต.ค.', 'เสาร์ 24 ต.ค.', 'วันถัดไป', 'ยังไม่มีเดือนก่อนให้เทียบ'],
    'bw-insights-private': ['ใช้ไป ฿•••• · จด 22 จาก 24 วัน', null, 'วันพฤหัสบดีที่ 1 ตุลาคม 2569'],
    'bw-insights-large': ['฿999,999,999.99', ['ค่าเทอมลูก ค่าเรียนพิเศษ และค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดทั้งปีน้า1 รายการ฿999,999,998.99', 'อาหาร2 รายการ฿1']],
  };
  for (const section of WALLET_INSIGHTS_SECTIONS) {
    mountWallet(<>{section.render()}</>);
    // The section's script runs its steps, then the stage says ready, or where it stopped.
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-ready'), section.id).not.toBeNull();
    expect(states[section.id](), section.id).toEqual(expected[section.id]);
    cleanup();
  }
}, 60_000);
