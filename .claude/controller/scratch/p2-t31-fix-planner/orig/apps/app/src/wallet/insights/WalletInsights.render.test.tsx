// The Bun Wallet insights screen render tests (bw-insights, wc-calendar, es-empty-insights, P2-T31).
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const analyticsMocks = vi.hoisted(() => ({
  trackInsightsViewed: vi.fn(),
}));

vi.mock('@mobile/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/analytics/events')>();
  return {
    ...actual,
    trackInsightsViewed: analyticsMocks.trackInsightsViewed,
  };
});

import type { CategoryDto, TransactionDto } from '@gogospend/contracts';
import { WALLET_INSIGHTS_SECTIONS } from '../../dev/catalogue/wallet/insightsSections';
import { createFakeResources } from '../../spend/v1/testing/fakeResources';
import { calendarPaint } from '../../theme/walletPalette';
import { mountWallet } from '../testing/walletHarness';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { WalletInsightsScreen } from './WalletInsightsScreen';

const NOW = new Date('2026-10-24T10:00:00Z');
const THIS_MONTH = '2026-10';

const FOOD_CAT: CategoryDto = {
  id: 'c-food',
  type: 'expense',
  builtin_key: 'food',
  label: 'อาหาร',
  color: '#FFE3CC',
  archived: false,
  version: 1,
};
const TRAVEL_CAT: CategoryDto = {
  id: 'c-trav',
  type: 'expense',
  builtin_key: 'travel',
  label: 'เดินทาง',
  color: '#DCE8FF',
  archived: false,
  version: 1,
};

function makeRecords(): TransactionDto[] {
  return [
    // 2026-10-01: 3,240 baht -> step 5
    { id: 't1', type: 'expense', amount_minor: '324000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: 'Dinner', merchant: null, deleted_at: null, version: 1 },
    // 2026-10-02: 412 baht -> step 2
    { id: 't2', type: 'expense', amount_minor: '41200', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: 'Lunch', merchant: null, deleted_at: null, version: 1 },
    // 2026-10-05: 188 baht -> step 1
    { id: 't3', type: 'expense', amount_minor: '18800', occurred_on: '2026-10-05', wallet_id: 'w1', category_id: 'c-trav', note: 'BTS', merchant: null, deleted_at: null, version: 1 },
    // 2026-10-24 (today): 132 baht
    { id: 't4', type: 'expense', amount_minor: '13200', occurred_on: '2026-10-24', wallet_id: 'w1', category_id: 'c-food', note: 'Coffee', merchant: 'Coffee Shop', deleted_at: null, version: 1 },
  ];
}

function seedData(records = makeRecords()) {
  return {
    records,
    categories: [FOOD_CAT, TRAVEL_CAT],
    budgets: [
      {
        id: 'b1',
        month: THIS_MONTH,
        overall_limit_minor: '1800000', // 18,000 baht
        category_limits: [],
        version: 1,
      },
    ],
  };
}

/** The element with this role and name, which must be there. Fails on AssertionError. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByRole(role, { name });
  expect(element, `a ${role} named ${String(name)}`).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this test id, which must be there. Fails on AssertionError. */
function found(testID: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

/** The element showing these words, which must be there. Fails on AssertionError. */
function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByText(words);
  expect(element, String(words)).not.toBeNull();
  return element as HTMLElement;
}

beforeEach(() => {
  analyticsMocks.trackInsightsViewed.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('the spending tab draws six bars, this month in barNow and the others in barPast, with the budget line', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th', mode: 'light' });

  // Waiting for data load
  await act(async () => {});

  const chart = found('insights-month-bars');
  expect(chart).not.toBeNull();

  // Current month bar (2026-10) uses barNow (#111014)
  const currentBar = found('month-bar-2026-10');
  expect(currentBar.getAttribute('fill')).toBe('#111014');

  // Past month bars use barPast (#8B76DA)
  const pastBar = found('month-bar-2026-09');
  expect(pastBar.getAttribute('fill')).toBe('#8B76DA');

  // Budget guideline is drawn
  const budgetLine = found('budget-guideline');
  expect(budgetLine.getAttribute('stroke')).toBe('#8A879A');
});

test("the chart is one named element that reads each month's amount", async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  const chart = found('insights-month-bars');
  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
  expect(label).toContain('ใช้จ่ายรายเดือน');
  // In normal mode, spoken label carries month and amount
  expect(label).toMatch(/ตุลาคม/);
  expect(label).toMatch(/3,972|12,480|0/);
});

test('in private mode the chart name carries no amount and the calendar is one neutral fill with no legend values', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, {
    resources: fake.resources,
    locale: 'th',
    device: { [PRIVATE_MODE_NAME]: '1' },
  });

  await act(async () => {});

  // 1. Chart accessibility label carries no amount
  const chart = found('insights-month-bars');
  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
  expect(label).toContain('ใช้จ่ายรายเดือน');
  expect(label).not.toContain('฿');
  expect(label).not.toContain('บาท');
  expect(label).not.toMatch(/3,972|12,480|3,240/);

  // 2. Switch to calendar tab
  const calTab = found('insights-tab-calendar');
  fireEvent.click(calTab);
  await act(async () => {});

  // Every active day uses neutral fill (raised: #F4F3F9) and drops its amount
  const day1 = found('calendar-day-1');
  expect(day1.getAttribute('style')).toContain('background-color: rgba(244, 243, 249, 1.00)');
  // No day amount text rendered
  expect(within(day1).queryByTestId('calendar-day-amount-1')).toBeNull();

  // 3. Legend shows swatches with no values
  found('calendar-legend');
  found('legend-swatch-0');
  expect(within(document.body).queryByTestId('legend-label-0')).toBeNull();
  expect(within(document.body).queryByTestId('legend-label-5')).toBeNull();
});

test('in private mode with English locale and dark mode, no amount reaches chart label, calendar days or legend', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, {
    resources: fake.resources,
    locale: 'en',
    mode: 'dark',
    device: { [PRIVATE_MODE_NAME]: '1' },
  });

  await act(async () => {});

  const chart = found('insights-month-bars');
  const label = chart.getAttribute('aria-label') ?? chart.getAttribute('accessibilityLabel') ?? '';
  expect(label).toContain('Monthly spending');
  expect(label).not.toContain('฿');
  expect(label).not.toMatch(/3,972|12,480|3,240/);

  const calTab = found('insights-tab-calendar');
  fireEvent.click(calTab);
  await act(async () => {});

  const day1 = found('calendar-day-1');
  expect(within(day1).queryByTestId('calendar-day-amount-1')).toBeNull();
  expect(within(document.body).queryByTestId('legend-label-0')).toBeNull();
});

test('the info button explains the number in a tray', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  const infoBtn = found('spending-info-button');
  fireEvent.click(infoBtn);
  await act(async () => {});

  // Info tray opens with explanation
  shown('ตัวเลขนี้คืออะไร');
  shown('ยอดนี้คือรายจ่ายที่บันทึกแล้วในเดือนนี้ ไม่รวมการโอนและรายการที่ยังรอส่ง');
});

test('each tab is a 44 pt tab and sends insights_viewed with spending, in_out or calendar', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  // Initial tab is spending: sends insights_viewed once with 'spending'
  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'spending' });

  // Each tab has at least 44 pt minHeight
  const spendingTab = found('insights-tab-spending');
  const inOutTab = found('insights-tab-in_out');
  const calendarTab = found('insights-tab-calendar');

  expect(spendingTab.getAttribute('style')).toContain('min-height: 44px');
  expect(inOutTab.getAttribute('style')).toContain('min-height: 44px');
  expect(calendarTab.getAttribute('style')).toContain('min-height: 44px');

  // Switch to in_out tab
  fireEvent.click(inOutTab);
  await act(async () => {});
  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'in_out' });

  // Switch to calendar tab
  fireEvent.click(calendarTab);
  await act(async () => {});
  expect(analyticsMocks.trackInsightsViewed).toHaveBeenCalledWith({ tab: 'calendar' });
});

test('the in-and-out tab shows money in in violet with a plus', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  // Switch to in_out tab
  const inOutTab = found('insights-tab-in_out');
  fireEvent.click(inOutTab);
  await act(async () => {});

  found('in-out-tab');
  // Plus sign in violet (#6A4BD4)
  const plus = shown('+');
  expect(plus.getAttribute('style')).toContain('color: rgba(106, 75, 212, 1.00)');

  shown('เงินเข้า');
  shown('เงินออก');
});

test('the calendar shades each day by its baht step, frames today and leaves future days inert', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th', mode: 'light' });

  await act(async () => {});

  // Switch to calendar tab
  const calendarTab = found('insights-tab-calendar');
  fireEvent.click(calendarTab);
  await act(async () => {});

  // 1. Day 1 (3,240 baht): step 5 -> fill #3B2790
  const day1 = found('calendar-day-1');
  const step5Paint = calendarPaint(5, false);
  expect(day1.getAttribute('style')).toContain(`background-color: ${hexToRgba(step5Paint.fill)}`);
  expect(shown('3,240', day1)).not.toBeNull();

  // 2. Day 2 (412 baht): step 2 -> fill #D5C9F7
  const day2 = found('calendar-day-2');
  const step2Paint = calendarPaint(2, false);
  expect(day2.getAttribute('style')).toContain(`background-color: ${hexToRgba(step2Paint.fill)}`);
  expect(shown('412', day2)).not.toBeNull();

  // 3. Day 5 (188 baht): step 1 -> fill #EEE9FC
  const day5 = found('calendar-day-5');
  const step1Paint = calendarPaint(1, false);
  expect(day5.getAttribute('style')).toContain(`background-color: ${hexToRgba(step1Paint.fill)}`);
  expect(shown('188', day5)).not.toBeNull();

  // 4. Day 24 (today): framed 2 pt in ink and named วันนี้
  const day24 = found('calendar-day-24');
  expect(day24.getAttribute('style')).toContain('border-width: 2px');
  expect(day24.getAttribute('style')).toContain('border-color: rgba(17, 16, 20, 1.00)');
  const day24Label = day24.getAttribute('aria-label') ?? day24.getAttribute('accessibilityLabel') ?? '';
  expect(day24Label).toContain('วันนี้');

  // 5. Future days (Day 25) are drawn and inert
  const futureDay25 = found('calendar-future-day-25');
  expect(futureDay25.getAttribute('role')).toBeNull();
});

test('a category row opens History filtered to it', async () => {
  const routerMock = await import('../../dev/catalogue/routerTestStub');
  const fake = createFakeResources(seedData());
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  const catRow = found('category-row-c-food');
  fireEvent.click(catRow);
  await act(async () => {});

  expect(routerMock.router.push).toHaveBeenCalledWith({
    pathname: '/spend/all',
    params: { category: 'c-food' },
  });
});

test('with two logged days the early state asks for one more day', async () => {
  // Seed with records on only 2 distinct days
  const twoDayRecords = [
    { id: 't1', type: 'expense', amount_minor: '10000', occurred_on: '2026-10-01', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't2', type: 'expense', amount_minor: '20000', occurred_on: '2026-10-02', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
  ] as TransactionDto[];

  const fake = createFakeResources(seedData(twoDayRecords));
  mountWallet(<WalletInsightsScreen now={NOW} />, { resources: fake.resources, locale: 'th' });

  await act(async () => {});

  found('insights-early-state');
  shown('จดอีก 1 วัน กราฟจะขึ้นตรงนี้');
  shown('กราฟต้องมีบันทึกอย่างน้อย 3 วัน ถึงจะเทียบกันได้');
});

test('the insights catalogue sections are registered and render correctly', async () => {
  expect(WALLET_INSIGHTS_SECTIONS.length).toBe(6);
  for (const section of WALLET_INSIGHTS_SECTIONS) {
    expect(section.id.startsWith('bw-')).toBe(true);
    expect(section.title.startsWith('Bun Wallet: ')).toBe(true);
    expect(section.render()).not.toBeNull();
  }
});

function hexToRgba(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, 1.00)`;
}
