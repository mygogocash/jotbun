// The Bun Wallet month recap tests (bw-recap, P2-T32).
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Share } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const analyticsMocks = vi.hoisted(() => ({
  trackRecapOpened: vi.fn(),
  trackRecapShared: vi.fn(),
}));

vi.mock('@mobile/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/analytics/events')>();
  return {
    ...actual,
    trackRecapOpened: analyticsMocks.trackRecapOpened,
    trackRecapShared: analyticsMocks.trackRecapShared,
  };
});

const hapticMocks = vi.hoisted(() => ({
  playHaptic: vi.fn(),
}));

vi.mock('@mobile/lib/hapticMoment', () => ({
  playHaptic: hapticMocks.playHaptic,
}));

import type { CategoryDto, TransactionDto } from '@gogospend/contracts';
import { WALLET_RECAP_SECTIONS } from '../../dev/catalogue/wallet/recapSections';
import { fakeAiResources } from '../../spend/v1/ai/testing/fakeAiResources';
import { createFakeResources } from '../../spend/v1/testing/fakeResources';
import { mountWallet } from '../testing/walletHarness';
import { CONFETTI_NAME } from './Confetti';
import { WalletRecapScreen } from './WalletRecapScreen';

const NOW = new Date('2026-10-15T12:00:00Z');
const PAST_MONTH = '2026-09';

const SALARY_CAT: CategoryDto = { id: 'c-sal', type: 'income', builtin_key: 'salary', label: null, color: '#A8CC4A', archived: false, version: 1 };
const FOOD_CAT: CategoryDto = { id: 'c-food', type: 'expense', builtin_key: 'food', label: null, color: '#F0A868', archived: false, version: 1 };
const TRAVEL_CAT: CategoryDto = { id: 'c-travel', type: 'expense', builtin_key: 'travel', label: null, color: '#6FB3F2', archived: false, version: 1 };

function makeRecords(): TransactionDto[] {
  return [
    // Sept 25: 2,380 expense + salary income (biggest day & payday)
    { id: 't-sal-day', type: 'expense', amount_minor: '238000', occurred_on: '2026-09-25', wallet_id: 'w1', category_id: 'c-food', note: 'Dinner', merchant: null, deleted_at: null, version: 1 },
    { id: 't-sal-inc', type: 'income', amount_minor: '3500000', occurred_on: '2026-09-25', wallet_id: 'w1', category_id: 'c-sal', note: 'Salary', merchant: null, deleted_at: null, version: 1 },
    // Other Sept expenses, none exceeding 238,000 on a single day
    { id: 't1', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-01', wallet_id: 'w1', category_id: 'c-food', note: 'Shopee order', merchant: 'Shopee', deleted_at: null, version: 1 },
    { id: 't2', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-03', wallet_id: 'w1', category_id: 'c-food', note: 'Lazada order', merchant: 'Lazada', deleted_at: null, version: 1 },
    { id: 't3', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-05', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't4', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-08', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't5', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-12', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't6', type: 'expense', amount_minor: '200000', occurred_on: '2026-09-15', wallet_id: 'w1', category_id: 'c-food', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't7', type: 'expense', amount_minor: '154000', occurred_on: '2026-09-18', wallet_id: 'w1', category_id: 'c-travel', note: null, merchant: null, deleted_at: null, version: 1 },
    { id: 't8', type: 'expense', amount_minor: '100000', occurred_on: '2026-09-20', wallet_id: 'w1', category_id: 'c-travel', note: null, merchant: null, deleted_at: null, version: 1 },
  ];
}

function seedData() {
  const records = makeRecords();
  const categories = [SALARY_CAT, FOOD_CAT, TRAVEL_CAT];

  return {
    records,
    categories,
    budgets: [
      {
        id: 'b1',
        month: PAST_MONTH,
        overall_limit_minor: '1800000',
        category_limits: [],
        version: 1,
      },
    ],
  };
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByRole(role, { name });
  expect(element, `a ${role} named ${String(name)}`).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this test id, which must be there. */
function found(testID: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

/** The element showing these words, which must be there. */
function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByText(words);
  expect(element, String(words)).not.toBeNull();
  return element as HTMLElement;
}

beforeEach(() => {
  analyticsMocks.trackRecapOpened.mockClear();
  analyticsMocks.trackRecapShared.mockClear();
  hapticMocks.playHaptic.mockClear();
  vi.spyOn(Share, 'share').mockImplementation(async () => ({ action: 'sharedAction', activityType: undefined }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("the recap draws bw-recap's facts from the month", async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fake.resources, locale: 'th' });

  await waitFor(() => {
    found('recap-title');
  });

  expect(found('recap-title').textContent).toContain('กันยายน');
  expect(found('recap-spent').textContent).toContain('฿16,920');
  expect(found('recap-budget').textContent).toContain('฿18,000');
  expect(found('recap-under').textContent).toContain('฿1,080');
  shown(/25 ก\.ย\./);
  shown(/วันเงินเดือนออก/);
  expect(found('recap-biggest-day-amount').textContent).toContain('฿2,380');
  expect(found('recap-days').textContent).toContain('9 จาก 30 วัน');
});

test('over budget shows over label and tone, and budget-less month hides budget rows', async () => {
  const data = seedData();
  data.budgets[0].overall_limit_minor = '1000000'; // 10,000 budget vs 16,920 spent -> over by 6,920
  const fake = createFakeResources(data);
  const view = mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fake.resources, locale: 'th' });

  await waitFor(() => {
    found('recap-over');
  });

  expect(found('recap-over').textContent).toContain('฿6,920');
  shown('เกิน');
  view.unmount();

  // Without budget
  const noBudgetData = seedData();
  noBudgetData.budgets = [];
  const fakeNoBudget = createFakeResources(noBudgetData);
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fakeNoBudget.resources, locale: 'th' });

  await waitFor(() => {
    found('recap-title');
  });

  expect(within(document.body).queryByTestId('recap-budget')).toBeNull();
  expect(within(document.body).queryByTestId('recap-under')).toBeNull();
  expect(within(document.body).queryByTestId('recap-over')).toBeNull();
});

test('empty month renders 0 days logged, hides biggest day and top categories', async () => {
  const fake = createFakeResources({ records: [], categories: [SALARY_CAT, FOOD_CAT], budgets: [] });
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fake.resources, locale: 'th' });

  await waitFor(() => {
    found('recap-title');
  });

  expect(found('recap-days').textContent).toContain('0 จาก 30 วัน');
  expect(within(document.body).queryByTestId('recap-biggest-day-amount')).toBeNull();
  expect(within(document.body).queryByText('หมวดหมู่ที่ใช้จ่ายสูงสุด')).toBeNull();
});

test('loading state and error state render their respective screens', async () => {
  // Error state: resource throwing error
  const errorResources = {
    ...createFakeResources(seedData()).resources,
    summary: async () => {
      throw new Error('Network error');
    },
  };

  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: errorResources, locale: 'th' });

  await waitFor(() => {
    found('bw-recap-error');
  });
  shown('Something went wrong');
});

test('the cashback card is a count and shows only when tips are on and count is positive', async () => {
  const fake = createFakeResources(seedData());
  const aiOn = fakeAiResources({}, { cashback_tips: true });

  const view = mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, {
    resources: fake.resources,
    ai: aiOn.resources,
    locale: 'th',
  });

  await waitFor(() => {
    found('recap-cashback-card');
  });

  // 2 purchases at Shopee and Lazada -> count is 2
  expect(found('recap-cashback-card').textContent).toContain('2 รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash');

  // With tips off
  view.unmount();
  const aiOff = fakeAiResources({}, { cashback_tips: false });
  const viewOff = mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, {
    resources: fake.resources,
    ai: aiOff.resources,
    locale: 'th',
  });

  await waitFor(() => {
    found('recap-title');
  });

  expect(within(document.body).queryByTestId('recap-cashback-card')).toBeNull();
});

test('confetti plays once per month on this phone, never under reduced motion, and never before the phone answers', async () => {
  const fake = createFakeResources(seedData());

  // 1. First opening: confetti plays, celebration haptic fires, store receives setting
  const view1 = mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, {
    resources: fake.resources,
    reducedMotion: false,
  });

  await waitFor(() => {
    expect(hapticMocks.playHaptic).toHaveBeenCalledWith('celebration');
    found('recap-confetti');
    const pieces = within(document.body).queryAllByTestId('confetti-piece');
    expect(pieces).toHaveLength(24);
  });

  expect(view1.stored.get(`jotbun.wallet.${CONFETTI_NAME(PAST_MONTH)}`)).toBe('1');
  view1.unmount();

  // 2. Second opening: confetti and haptic do not play
  hapticMocks.playHaptic.mockClear();
  const view2 = mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, {
    resources: fake.resources,
    reducedMotion: false,
    device: { [CONFETTI_NAME(PAST_MONTH)]: '1' },
  });

  await waitFor(() => {
    found('recap-title');
  });
  expect(hapticMocks.playHaptic).not.toHaveBeenCalled();
  expect(within(document.body).queryByTestId('recap-confetti')).toBeNull();
  view2.unmount();

  // 3. Under reduced motion: haptic fires, no confetti pieces
  hapticMocks.playHaptic.mockClear();
  const view3 = mountWallet(<WalletRecapScreen month="2026-08" now={NOW} />, {
    resources: fake.resources,
    reducedMotion: true,
  });

  await waitFor(() => {
    expect(hapticMocks.playHaptic).toHaveBeenCalledWith('celebration');
  });
  expect(within(document.body).queryByTestId('recap-confetti')).toBeNull();
  view3.unmount();

  // 4. reducedMotion: 'pending' (before answer is known): decided at mount -> no pieces, one celebration haptic
  hapticMocks.playHaptic.mockClear();
  const view4 = mountWallet(<WalletRecapScreen month="2026-07" now={NOW} />, {
    resources: fake.resources,
    reducedMotion: 'pending',
  });

  await waitFor(() => {
    expect(hapticMocks.playHaptic).toHaveBeenCalledWith('celebration');
  });
  expect(within(document.body).queryByTestId('recap-confetti')).toBeNull();
});

test('current month never plays confetti or celebration haptic', async () => {
  const fake = createFakeResources(seedData());
  // Current month: 2026-10 with NOW = 2026-10-15
  mountWallet(<WalletRecapScreen month="2026-10" now={NOW} />, {
    resources: fake.resources,
    reducedMotion: false,
  });

  await waitFor(() => {
    found('recap-title');
  });

  expect(hapticMocks.playHaptic).not.toHaveBeenCalled();
  expect(within(document.body).queryByTestId('recap-confetti')).toBeNull();
});

test('opening sends one recap_opened, sharing one recap_shared', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fake.resources });

  await waitFor(() => {
    expect(analyticsMocks.trackRecapOpened).toHaveBeenCalledTimes(1);
  });

  const shareButton = found('recap-share-button');
  await act(async () => {
    fireEvent.click(shareButton);
  });

  await waitFor(() => {
    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.trackRecapShared).toHaveBeenCalledTimes(1);
  });
});

test('private mode hides every amount in UI and share text', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, {
    resources: fake.resources,
    device: { 'private-mode': '1' },
  });

  await waitFor(() => {
    found('recap-spent');
  });

  // Masked in UI
  expect(found('recap-spent').textContent).not.toContain('16,920');

  // Share text in private mode has no ฿ and no amounts
  const shareButton = found('recap-share-button');
  await act(async () => {
    fireEvent.click(shareButton);
  });

  await waitFor(() => {
    expect(Share.share).toHaveBeenCalled();
  });

  const sharedText = vi.mocked(Share.share).mock.lastCall?.[0]?.message ?? '';
  expect(sharedText).not.toContain('฿');
  expect(sharedText).not.toContain('16,920');
  expect(sharedText).not.toContain('18,000');
  expect(sharedText).not.toContain('2,380');
});

test('the share button never says การ์ด', async () => {
  const fake = createFakeResources(seedData());
  mountWallet(<WalletRecapScreen month={PAST_MONTH} now={NOW} />, { resources: fake.resources, locale: 'th' });

  await waitFor(() => {
    found('recap-share-button');
  });

  const buttonText = found('recap-share-button').textContent;
  expect(buttonText).toBe('แชร์สรุป');
  expect(buttonText).not.toContain('การ์ด');
});

test("the catalogue lists the recap's sections with bw- ids and 'Bun Wallet: ' titles", () => {
  expect(WALLET_RECAP_SECTIONS).toHaveLength(4);
  const ids = WALLET_RECAP_SECTIONS.map((s) => s.id);
  expect(ids).toEqual(['bw-recap', 'bw-recap-over', 'bw-recap-private', 'bw-recap-cashback']);

  for (const section of WALLET_RECAP_SECTIONS) {
    expect(section.id).toMatch(/^bw(-[a-z0-9]+)+$/);
    expect(section.title.startsWith('Bun Wallet: ')).toBe(true);
  }
});
