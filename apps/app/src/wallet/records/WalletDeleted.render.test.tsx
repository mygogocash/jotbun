// Recently deleted in the Bun Wallet (plan P2-T25, rh-deleted) and its fix
// round (ruling R109): days left and the last day; one restore, once, with
// its version and key; private mode before and after a restore; Restore
// pills of at least 44 pt that grow with their words; income in violet; each
// row's wallet and day; the top below the status bar; the board's back
// label; the leading of each language; and the catalogue section on its own
// fakes. Every case runs in Thai and English; Step 1's cases also in light
// and dark. Lookups assert, so a missing element fails on an AssertionError.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
// The catalogue section's stage (screenSection) reads expo-router's route params context.
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

// react-native-web drops numberOfLines and the other clamps from the DOM, so
// the props that reach the app's Text are recorded and the real one renders,
// as WalletCard.render.test.tsx does.
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

import type { TransactionDto } from '@gogospend/contracts';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { FOOD_ID, MOVE, NOW, RENT, SALARY_ID } from '@mobile/screens/redesign/HistoryTestHarness';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { HIDDEN_AMOUNT } from '../money/walletMoney';
import { AX5, mountWallet } from '../testing/walletHarness';
import { WalletDeletedScreen } from './WalletDeletedScreen';

beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  seen.props.length = 0;
});

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const PALETTE = { light: walletLight, dark: walletDark } as const;
const PRIVATE = { 'private-mode': '1' } as const;

/** The words each case looks for: the draft tables', the catalogs' and dateStep's. */
const WORDS = {
  th: {
    heading: 'รายการที่เพิ่งลบ',
    policy: 'รายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมัน',
    footer: 'เรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ',
    daysLeft: (n: number) => `เหลือ ${n} วัน`,
    lastDay: 'วันสุดท้ายที่กู้คืนได้',
    bills: 'ค่าบิล',
    food: 'อาหาร',
    salary: 'เงินเดือน',
    restore: (title: string, amount: string) => `กู้คืน ${title} ${amount}`,
    restorePattern: /^กู้คืน /,
    baht: (amount: string) => `${amount} บาท`,
    hidden: 'ซ่อนยอดเงินอยู่',
    restored: 'ค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้ว',
    restoredHidden: 'ค่าบิล กลับมาอยู่ในประวัติแล้ว',
    conflict: 'รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น',
    back: 'กลับไปประวัติ',
    /** dateStep's day labels on 29 September 2026: yesterday, a weekday, and last year's with its Buddhist-era year. */
    dayLines: ['· Cash → Daily account · เมื่อวาน', '· Daily account · อาทิตย์ 27 ก.ย.', '· Cash · พุธ 24 ธ.ค. 2568'],
    sectionRows: ['กู้คืน ค่าบิล 12,268 บาท', 'กู้คืน เงินเดือน 28,000 บาท', 'กู้คืน อาหาร 182 บาท', 'กู้คืน การเดินทาง 120 บาท'],
  },
  en: {
    heading: 'Recently deleted',
    policy: 'Deleted entries can be restored for 30 days. After that, they are gone for good. Restored entries return to their original day.',
    footer: 'Ordered by most recently deleted · Totals in budget and wallets do not count deleted entries.',
    daysLeft: (n: number) => `${n} days left`,
    lastDay: 'Last day to restore',
    bills: 'Bills',
    food: 'Food',
    salary: 'Salary',
    restore: (title: string, amount: string) => `Restore ${title} ${amount}`,
    restorePattern: /^Restore /,
    baht: (amount: string) => `${amount} baht`,
    hidden: 'Amount hidden',
    restored: 'Bills ฿12,268.00 is back in History.',
    restoredHidden: 'Bills is back in History.',
    conflict: 'This entry changed on another device.',
    back: 'Back to History',
    dayLines: ['· Cash → Daily account · Yesterday', '· Daily account · Sun 27 Sep', '· Cash · Wed 24 Dec 2025'],
    sectionRows: ['Restore Bills 12,268 baht', 'Restore Salary 28,000 baht', 'Restore Food 182 baht', 'Restore Travel 120 baht'],
  },
} as const;

/** WalletText's leading (walletLineHeight): 1.5 in Thai and 1.3 in every other language, rounded up. */
const LEADING = {
  th: { h1: '42px', policy: '21px', title: '24px', caption: '20px' },
  en: { h1: '37px', policy: '19px', title: '21px', caption: '17px' },
} as const;

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
function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByText(words);
  expect(element, `expected text "${words}" to be in DOM`).not.toBeNull();
  return element as HTMLElement;
}

/** Wait for an element with this role and name. Fails on AssertionError, never TestingLibraryElementError. */
async function findNamed(role: string, name: string | RegExp, inside: HTMLElement = document.body): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    const element = within(inside).queryByRole(role, { name });
    expect(element, `expected ${role} named ${name} to appear`).not.toBeNull();
    matched = element as HTMLElement;
  });
  return matched!;
}

/** Wait for an element showing these words. Fails on AssertionError, never TestingLibraryElementError. */
async function findShown(words: string, inside: HTMLElement = document.body): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    const element = within(inside).queryByText(words);
    expect(element, `expected text "${words}" to appear`).not.toBeNull();
    matched = element as HTMLElement;
  });
  return matched!;
}

/** Wait for an element with this test id (a lazy import under load can take seconds). Fails on AssertionError, never TestingLibraryElementError. */
async function findFound(testID: string, timeout = 10_000): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    const element = screen.queryByTestId(testID);
    expect(element, `expected testID ${testID} to appear`).not.toBeNull();
    matched = element as HTMLElement;
  }, { timeout });
  return matched!;
}

/** Every live region inside `container`: what a screen reader reads out as it changes. */
function liveRegions(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]')];
}

/**
 * The golden diary with rent deleted yesterday (29 days left) and food nine
 * days ago (21 days left). The salary was deleted on 1 August, past its 30
 * days, so it is not listed, unless `when` says otherwise.
 */
function deletedSeed(extra: TransactionDto[] = [], when: Readonly<Record<string, string>> = {}): TransactionDto[] {
  const deletedAt: Record<string, string> = {
    [RENT]: '2026-09-28T03:00:00.000Z',
    [FOOD_ID]: '2026-09-20T03:00:00.000Z',
    [SALARY_ID]: '2026-08-01T03:00:00.000Z',
    ...when,
  };
  return [
    ...goldenSeed().records.map((record) => (deletedAt[record.id] ? { ...record, deleted_at: deletedAt[record.id], version: 2 } : record)),
    ...extra,
  ];
}

/** A phone bill deleted at 22:00 Bangkok on 30 August: its 30 days end at 22:00 tonight. */
const LAST_DAY: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000005', wallet_id: '00000000-0000-4000-8000-000000000002', type: 'expense', amount_minor: '39900',
  occurred_on: '2026-08-30', category_id: '0000000c-0000-4000-8000-000000000003', merchant: null, note: 'Phone bill', version: 2, deleted_at: '2026-08-30T15:00:00.000Z',
};
/** Deleted a day later: 36 hours left, so two days, and not yet the last. */
const TWO_DAYS: TransactionDto = { ...LAST_DAY, id: '0000000b-0000-4000-8000-000000000006', occurred_on: '2026-08-31', deleted_at: '2026-08-31T15:00:00.000Z' };
/** A lunch from last December, deleted two days ago. */
const LAST_YEAR: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000007', wallet_id: '0000000a-0000-4000-8000-000000000001', type: 'expense', amount_minor: '50000',
  occurred_on: '2025-12-24', category_id: '0000000c-0000-4000-8000-000000000001', merchant: null, note: null, version: 3, deleted_at: '2026-09-27T03:00:00.000Z',
};

function mount(options: {
  records?: TransactionDto[];
  locale?: 'th' | 'en';
  mode?: 'light' | 'dark';
  device?: Readonly<Record<string, string>>;
  fontScale?: number;
} = {}) {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, records: options.records ?? deletedSeed() });
  const mounted = mountWallet(<WalletDeletedScreen now={NOW} />, {
    resources: fake.resources,
    locale: options.locale ?? 'th',
    mode: options.mode ?? 'light',
    device: options.device,
    fontScale: options.fontScale,
  });
  return { fake, mounted };
}

test('Recently deleted says how many days are left and restores one entry (restoreTransaction once with its version and key)', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const { fake } = mount({ locale, mode });
      const rent = await findNamed('button', words.restore(words.bills, words.baht('12,268')));
      named('heading', words.heading);
      shown(words.policy);
      shown(words.daysLeft(29));
      shown(words.daysLeft(21));
      // Past its 30 days, the salary is not listed: looked for by its title in this language.
      expect(screen.queryByText(words.salary), `${locale} ${mode}: no salary row`).toBeNull();
      expect(screen.queryAllByRole('button', { name: words.restorePattern }), `${locale} ${mode}: restore buttons`).toHaveLength(2);
      // Each row names its wallet; the list ends with the footer line.
      expect(rent.parentElement?.textContent, `${locale} ${mode}: rent's row`).toContain('· Daily account ·');
      shown(words.footer);

      // Two taps before the screen draws again: the second finds a restore on its way.
      act(() => {
        fireEvent.click(rent);
        fireEvent.click(rent);
      });
      await findShown(words.restored);
      await waitFor(() => expect(fake.callsOf('recentlyDeleted').length).toBeGreaterThanOrEqual(2));
      const calls = fake.callsOf('restoreTransaction');
      expect(calls, `${locale} ${mode}: restore commands`).toHaveLength(1);
      expect(calls[0].args.slice(0, 2)).toEqual([RENT, 2]);
      expect(calls[0].args[2]).toEqual(expect.any(String));

      await waitFor(() => expect(screen.queryByText(words.daysLeft(29))).toBeNull());
      shown(words.daysLeft(21));
      cleanup();
    }
  }
});

test('the last day says so', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      mount({ records: deletedSeed([LAST_DAY, TWO_DAYS]), locale, mode });
      await findNamed('button', words.restore(words.bills, words.baht('12,268')));
      // Only the final 24 hours are the last day: two days left is not.
      const lastDays = screen.queryAllByText(words.lastDay);
      expect(lastDays, `${locale} ${mode}: one last day`).toHaveLength(1);
      const two = shown(words.daysLeft(2));
      expect([lastDays[0].style.fontWeight, lastDays[0].style.color], `${locale} ${mode}: the last day`).toEqual(['700', rgba(colors.ink)]);
      expect([two.style.fontWeight, two.style.color], `${locale} ${mode}: two days left`).toEqual(['400', rgba(colors.quiet)]);
      cleanup();
    }
  }
});

test('private mode hides every amount and masks the restore label', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const { mounted } = mount({ locale, mode, device: PRIVATE });
      await findNamed('button', words.restore(words.bills, words.hidden));
      named('button', words.restore(words.food, words.hidden));
      expect(screen.queryAllByText(HIDDEN_AMOUNT), `${locale} ${mode}: masked amounts`).toHaveLength(2);
      expect(mounted.container.textContent, `${locale} ${mode}`).not.toMatch(/12,268|182/);
      cleanup();
    }
  }
});

test('private mode: a restore names its entry without the amount, on screen and in every live region (R109)', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const { fake, mounted } = mount({ locale, mode, device: PRIVATE });
      // A refusal keeps its own words in private mode.
      fake.fail('restoreTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT' });
      fireEvent.click(await findNamed('button', words.restore(words.food, words.hidden)));
      await findShown(words.conflict);

      fireEvent.click(named('button', words.restore(words.bills, words.hidden)));
      await findShown(words.restoredHidden);
      await waitFor(() => expect(fake.callsOf('recentlyDeleted').length).toBeGreaterThanOrEqual(3));
      expect(fake.callsOf('restoreTransaction'), `${locale} ${mode}: restore commands`).toHaveLength(2);
      const regions = liveRegions(mounted.container);
      expect(regions.length, `${locale} ${mode}: the notice is a live region`).toBeGreaterThan(0);
      for (const region of [mounted.container, ...regions]) {
        expect(region.textContent, `${locale} ${mode}: ฿ and a digit`).not.toMatch(/฿\s*\d/);
        expect(region.textContent, `${locale} ${mode}: rent's amount`).not.toContain('12,268');
      }
      cleanup();
    }
  }
});

test('every restore button is 44 pt and names its entry', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      mount({ locale, mode });
      await findNamed('button', words.restore(words.bills, words.baht('12,268')));
      const buttons = screen.queryAllByRole('button', { name: words.restorePattern });
      expect(buttons.map((button) => button.getAttribute('aria-label')), `${locale} ${mode}`).toEqual([
        words.restore(words.bills, words.baht('12,268')),
        words.restore(words.food, words.baht('182')),
      ]);
      for (const button of buttons) {
        expect([button.style.minHeight, button.style.borderRadius], `${locale} ${mode}`).toEqual(['44px', '999px']);
      }
      cleanup();
    }
  }
});

test('at the largest text size the title wraps and each restore pill grows with its words (m1)', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mount({ locale, fontScale: AX5 });
    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
    // No text is clamped or shrunk to fit.
    expect(seen.props.length, locale).toBeGreaterThan(0);
    for (const props of seen.props) {
      expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode], `${locale}: ${String(props.children)}`).toEqual([undefined, undefined, undefined]);
    }
    // At least 44 pt, and no fixed height: the pill is as tall as its words need.
    for (const button of screen.queryAllByRole('button', { name: words.restorePattern })) {
      expect([button.style.minHeight, button.style.height], locale).toEqual(['44px', '']);
    }
    cleanup();
    seen.props.length = 0;
  }
});

test('a deleted income draws as income: violet, with its plus (m2)', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      // The salary deleted four days ago: an income with 26 days left.
      mount({ locale, mode, records: deletedSeed([], { [SALARY_ID]: '2026-09-25T03:00:00.000Z' }) });
      await findNamed('button', words.restore(words.salary, words.baht('28,000')));
      expect(shown('+฿28,000').style.color, `${locale} ${mode}: income`).toBe(rgba(colors.violet));
      // An expense is its size alone, in ink.
      expect(shown('฿12,268').style.color, `${locale} ${mode}: expense`).toBe(rgba(colors.ink));
      cleanup();
    }
  }
});

test("each row says its wallet and its day as dateStep says it: yesterday, a weekday, and another year's with its year (m4)", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    // The move (28 September) was deleted yesterday as well.
    mount({ locale, records: deletedSeed([LAST_YEAR], { [MOVE]: '2026-09-28T05:00:00.000Z' }) });
    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
    for (const line of words.dayLines) shown(line);
    cleanup();
  }
});

test('the page starts 8 pt below the status bar, from the safe-area inset (m5)', async () => {
  mount();
  await findNamed('button', WORDS.th.restore(WORDS.th.bills, WORDS.th.baht('12,268')));
  // The scroll view's content: the harness's phone has a 62 pt top inset.
  const content = found('wallet-deleted-screen').firstElementChild?.firstElementChild as HTMLElement | null | undefined;
  expect(content?.style.paddingTop).toBe('70px');
});

test('an unconfirmed restore is frozen: only Try again, which resends the same command', async () => {
  const { fake } = mount();
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
  for (const locale of LOCALES) {
    const isThai = locale === 'th';
    const { fake } = mount({ locale });
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

test("Back, named as rh-deleted names it, returns to History, or opens it when there is nothing to go back to (n1)", async () => {
  for (const locale of LOCALES) {
    mount({ locale });
    const back = await findNamed('button', WORDS[locale].back);
    fireEvent.click(back);
    expect(nav.router.back, locale).toHaveBeenCalledTimes(1);

    nav.router.canGoBack.mockReturnValue(false);
    fireEvent.click(back);
    expect(nav.router.replace, locale).toHaveBeenLastCalledWith('/spend/all');
    cleanup();
    nav.router.back.mockReset();
    nav.router.canGoBack.mockReturnValue(true);
  }
});

test('with nothing deleted it says so and shows the empty state', async () => {
  for (const locale of LOCALES) {
    const isThai = locale === 'th';
    mount({ records: goldenSeed().records, locale });
    const emptyText = isThai ? 'ไม่มีรายการที่ถูกลบในช่วง 30 วันที่ผ่านมา' : 'Nothing deleted in the last 30 days';
    const emptyBody = isThai ? 'รายการที่คุณลบจะแสดงที่นี่' : 'Entries you delete show up here.';
    await findShown(emptyText);
    shown(emptyBody);
    const bun = found('recently-deleted-empty-bun');
    expect(bun.querySelector('path[d*="M46 9 H51"]'), 'sleepy Bun has Z detail').not.toBeNull();
    cleanup();
  }
});

test("each line takes WalletText's leading for its language (n4)", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const leading = LEADING[locale];
    mount({ locale });
    await findNamed('button', words.restore(words.bills, words.baht('12,268')));
    expect([
      named('heading', words.heading).style.lineHeight,
      shown(words.policy).style.lineHeight,
      shown(words.bills).style.lineHeight,
      shown(/^· Daily account · /).style.lineHeight,
      shown(words.daysLeft(29)).style.lineHeight,
      shown(words.footer).style.lineHeight,
    ], locale).toEqual([leading.h1, leading.policy, leading.title, leading.caption, leading.caption, leading.caption]);
    cleanup();
  }
});

test('the catalogue section bw-deleted draws the real screen on its own fakes (B1)', async () => {
  const section = WALLET_SECTIONS.find((each) => each.id === 'bw-deleted');
  expect(section, 'section bw-deleted registered in WALLET_SECTIONS').toBeDefined();
  expect([section?.title, section?.group, section?.layout]).toEqual(['Bun Wallet: recently deleted', 'Screens', 'screen']);
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    // The harness's own fakes hold nothing deleted: every row below is the section's.
    mountWallet(<>{section?.render()}</>, { locale });
    // While the screen loads, and while its script runs, the catalogue's suites wait on this.
    found('catalogue-screen-running');
    await findFound('catalogue-screen-ready');
    named('heading', words.heading);
    for (const label of words.sectionRows) named('button', label);
    shown(words.lastDay);
    cleanup();
  }
  // Longer than findFound's 10 s, so a section that never gets ready fails on its assertion, not on the case's time.
}, 30_000);
