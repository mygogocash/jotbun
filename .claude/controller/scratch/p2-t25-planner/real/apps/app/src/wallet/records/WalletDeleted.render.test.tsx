import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/analytics/events', () => ({ trackRecordRestored: vi.fn() }));

import type { TransactionDto } from '@gogospend/contracts';
import { trackRecordRestored } from '@mobile/analytics/events';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { FOOD_ID, NOW, RENT, SALARY_ID } from '@mobile/screens/redesign/HistoryTestHarness';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { HIDDEN_AMOUNT } from '../money/walletMoney';
import { mountWallet } from '../testing/walletHarness';
import { WalletDeletedScreen } from './WalletDeletedScreen';

const LAST_DAY_ID = '0000000b-0000-4000-8000-000000000005';

beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The element with this role and name, which must be in the DOM. Fails on AssertionError, never TestingLibraryElementError. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByRole(role, { name });
  expect(element, `expected ${role} named ${name} to be in DOM`).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this test id, which must be in the DOM. Fails on AssertionError, never TestingLibraryElementError. */
function found(testID: string): HTMLElement {
  const element = screen.queryByTestId(testID);
  expect(element, `expected testID ${testID} to be in DOM`).not.toBeNull();
  return element as HTMLElement;
}

/** The element showing these words, which must be in the DOM. Fails on AssertionError, never TestingLibraryElementError. */
function shown(words: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByText(words);
  expect(element, `expected text "${words}" to be in DOM`).not.toBeNull();
  return element as HTMLElement;
}

/** Wait for an element with this role and name. Fails on AssertionError, never TestingLibraryElementError. */
async function findNamed(role: string, name: string | RegExp, inside: HTMLElement = document.body): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    const el = within(inside).queryByRole(role, { name });
    expect(el, `expected ${role} named ${name} to appear`).not.toBeNull();
    matched = el as HTMLElement;
  });
  return matched!;
}

/** Wait for an element showing these words. Fails on AssertionError, never TestingLibraryElementError. */
async function findShown(words: string, inside: HTMLElement = document.body): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    const el = within(inside).queryByText(words);
    expect(el, `expected text "${words}" to appear`).not.toBeNull();
    matched = el as HTMLElement;
  });
  return matched!;
}

function deletedSeed(extra: TransactionDto[] = []): TransactionDto[] {
  const seed = goldenSeed();
  const when: Record<string, string> = {
    [RENT]: '2026-09-28T03:00:00.000Z',
    [FOOD_ID]: '2026-09-20T03:00:00.000Z',
    [SALARY_ID]: '2026-08-01T03:00:00.000Z',
  };
  return [
    ...seed.records.map((record) => (when[record.id] ? { ...record, deleted_at: when[record.id], version: 2 } : record)),
    ...extra,
  ];
}

function seedWithLastDay(): TransactionDto[] {
  const lastDayRecord: TransactionDto = {
    id: LAST_DAY_ID,
    wallet_id: '00000000-0000-4000-8000-000000000002',
    type: 'expense',
    amount_minor: '39900',
    occurred_on: '2026-08-30',
    category_id: '0000000c-0000-4000-8000-000000000003',
    merchant: null,
    note: 'Phone bill',
    version: 2,
    deleted_at: '2026-08-30T15:00:00.000Z',
  };
  return deletedSeed([lastDayRecord]);
}

async function mount(options: {
  records?: TransactionDto[];
  locale?: 'th' | 'en';
  mode?: 'light' | 'dark';
  device?: Readonly<Record<string, string>>;
} = {}) {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, records: options.records ?? deletedSeed() });
  const mounted = mountWallet(<WalletDeletedScreen now={NOW} />, {
    resources: fake.resources,
    locale: options.locale ?? 'th',
    mode: options.mode ?? 'light',
    device: options.device,
  });
  return { fake, mounted };
}

test('Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)', async () => {
  for (const locale of ['th', 'en'] as const) {
    const { fake } = await mount({ locale });
    const isThai = locale === 'th';

    const heading = isThai ? 'รายการที่เพิ่งลบ' : 'Recently deleted';
    await findNamed('heading', heading);

    const policy = isThai
      ? 'รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน'
      : 'Deleted entries can be restored for 30 days. After that, they are gone for good. Restored entries return to their original day.';
    shown(policy);

    const days29 = isThai ? 'เหลือ 29 วัน' : '29 days left';
    const days21 = isThai ? 'เหลือ 21 วัน' : '21 days left';
    shown(days29);
    shown(days21);

    // Expired record is not listed
    expect(screen.queryByText('Salary')).toBeNull();

    // Restore Rent
    const titleBills = isThai ? 'ค่าบิล' : 'Bills';
    const restoreRentName = isThai ? `กู้คืน ${titleBills} 12,268 บาท` : `Restore ${titleBills} 12,268 baht`;
    const restoreRentBtn = named('button', restoreRentName);

    fireEvent.click(restoreRentBtn);

    const restoredNotice = isThai ? `${titleBills} ฿12,268.00 กลับมาอยู่ในประวัติแล้ว` : `${titleBills} ฿12,268.00 is back in History.`;
    await findShown(restoredNotice);

    const [restoreCall] = fake.callsOf('restoreTransaction');
    expect(restoreCall.args.slice(0, 2)).toEqual([RENT, 2]);
    expect(restoreCall.args[2]).toEqual(expect.any(String));
    expect(trackRecordRestored).toHaveBeenCalledWith({ kind: 'expense' });

    await waitFor(() => expect(screen.queryByText(days29)).toBeNull());
    shown(days21);

    cleanup();
  }
});

test('the last day says so', async () => {
  for (const locale of ['th', 'en'] as const) {
    await mount({ records: seedWithLastDay(), locale });
    const isThai = locale === 'th';
    const lastDayText = isThai ? 'วันสุดท้ายที่กู้คืนได้' : 'Last day to restore';
    const el = await findShown(lastDayText);
    expect(el.style.fontWeight).toBe('700');
    cleanup();
  }
});

test('private mode hides every amount and masks the restore label', async () => {
  for (const locale of ['th', 'en'] as const) {
    const isThai = locale === 'th';
    const { mounted } = await mount({ locale, device: { 'private-mode': '1' } });
    await findNamed('heading', isThai ? 'รายการที่เพิ่งลบ' : 'Recently deleted');

    // Amounts are masked to HIDDEN_AMOUNT
    const hiddenAmounts = screen.queryAllByText(HIDDEN_AMOUNT);
    expect(hiddenAmounts.length, 'hidden amounts count').toBeGreaterThanOrEqual(2);

    // No raw amount figures like 12,268 or 182 in the text content
    expect(mounted.container.textContent).not.toMatch(/12,268|182/);

    // Restore button accessibilityLabel masks the amount
    const titleBills = isThai ? 'ค่าบิล' : 'Bills';
    const hiddenPhrase = isThai ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
    const restoreLabel = isThai ? `กู้คืน ${titleBills} ${hiddenPhrase}` : `Restore ${titleBills} ${hiddenPhrase}`;
    named('button', restoreLabel);

    cleanup();
  }
});

test('every restore button is 44 pt and names its entry', async () => {
  for (const locale of ['th', 'en'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      await mount({ locale, mode });
      const isThai = locale === 'th';
      const pattern = isThai ? /^กู้คืน / : /^Restore /;
      await waitFor(() => {
        const buttons = screen.queryAllByRole('button', { name: pattern });
        expect(buttons.length, 'restore buttons count').toBe(2);
      });
      const buttons = screen.queryAllByRole('button', { name: pattern });

      for (const btn of buttons) {
        expect(btn.style.height).toBe('44px');
        expect(btn.style.minHeight).toBe('44px');
        expect(btn.style.borderRadius).toBe('999px');
        expect(btn.getAttribute('aria-label')).toMatch(pattern);
      }
      cleanup();
    }
  }
});

test('an unconfirmed restore is frozen: only Try again, which resends the same command', async () => {
  const { fake } = await mount();
  fake.loseResponse('restoreTransaction');
  const rentBtn = await findNamed('button', 'กู้คืน ค่าบิล 12,268 บาท');
  fireEvent.click(rentBtn);

  await findShown('ยังไม่ได้รับการยืนยัน รายการของคุณยังอยู่ ลองอีกครั้ง');

  // The rent button becomes Try again
  const tryAgain = await findNamed('button', 'ลองอีกครั้ง');
  shown('ลองอีกครั้ง', tryAgain);

  // The other button is disabled
  const foodBtn = named('button', 'กู้คืน อาหาร 182 บาท');
  expect(foodBtn.getAttribute('aria-disabled')).toBe('true');

  fireEvent.click(tryAgain);
  await findShown('ค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้ว');
  const [first, second] = fake.callsOf('restoreTransaction');
  expect(second.args).toEqual(first.args);
});

test('a refused restore says why in plain words and reads the list again', async () => {
  for (const locale of ['th', 'en'] as const) {
    const isThai = locale === 'th';
    const { fake } = await mount({ locale });
    const titleBills = isThai ? 'ค่าบิล' : 'Bills';
    const restoreRentName = isThai ? `กู้คืน ${titleBills} 12,268 บาท` : `Restore ${titleBills} 12,268 baht`;
    const titleFood = isThai ? 'อาหาร' : 'Food';
    const restoreFoodName = isThai ? `กู้คืน ${titleFood} 182 บาท` : `Restore ${titleFood} 182 baht`;

    // Past window / deleted
    fake.fail('restoreTransaction', 'deleted', { status: 409, code: 'ENTITY_DELETED' });
    const rentBtn = await findNamed('button', restoreRentName);
    fireEvent.click(rentBtn);
    const msgDeleted = isThai ? 'กู้คืนรายการนี้ไม่ได้แล้ว' : 'This entry can no longer be restored.';
    await findShown(msgDeleted);
    await waitFor(() => expect(fake.callsOf('recentlyDeleted').length).toBe(2));

    // Conflict: changed on another device
    fake.fail('restoreTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT' });
    const foodBtn = named('button', restoreFoodName);
    fireEvent.click(foodBtn);
    const msgConflict = isThai ? 'รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น' : 'This entry changed on another device.';
    await findShown(msgConflict);

    // Category archived
    fake.fail('restoreTransaction', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_id: 'errors.category_archived' } });
    fireEvent.click(foodBtn);
    const msgArchived = isThai
      ? 'กระเป๋าเงินหรือหมวดหมู่ของรายการนี้ถูกเก็บถาวรอยู่ นำกลับมาใช้ก่อน แล้วจึงกู้คืนรายการ'
      : "This entry's wallet or category is archived. Unarchive it, then restore the entry.";
    await findShown(msgArchived);

    cleanup();
  }
});

test('Back returns to History, or opens it when there is nothing to go back to', async () => {
  await mount();
  const backBtn = await findNamed('button', 'กลับ');
  fireEvent.click(backBtn);
  expect(nav.router.back).toHaveBeenCalledTimes(1);

  nav.router.canGoBack.mockReturnValue(false);
  fireEvent.click(backBtn);
  expect(nav.router.replace).toHaveBeenLastCalledWith('/spend/all');
});

test('with nothing deleted it says so and shows the empty state', async () => {
  for (const locale of ['th', 'en'] as const) {
    const isThai = locale === 'th';
    await mount({ records: goldenSeed().records, locale });
    const emptyText = isThai ? 'ไม่มีรายการที่ถูกลบในช่วง 30 วันที่ผ่านมา' : 'Nothing deleted in the last 30 days';
    const emptyBody = isThai ? 'รายการที่คุณลบจะแสดงที่นี่' : 'Entries you delete show up here.';
    await findShown(emptyText);
    shown(emptyBody);
    const bun = found('recently-deleted-empty-bun');
    expect(bun.querySelector('path[d*="M46 9 H51"]'), 'sleepy Bun has Z detail').not.toBeNull();
    cleanup();
  }
});

test('catalogue section bw-deleted is registered and renders', () => {
  const section = WALLET_SECTIONS.find((s) => s.id === 'bw-deleted');
  expect(section, 'section bw-deleted registered in WALLET_SECTIONS').toBeDefined();
  expect(section?.title).toBe('Bun Wallet: recently deleted');
  expect(section?.render).toBeDefined();
});
