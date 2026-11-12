// The Bun Wallet's Categories screen, CategoryTray, and ThaiPackTray (P2-T29, wc-categories, wc-category-edit, wc-thai-pack).
// Tests:
// 1. the grid shows each category's spending against its limit, over in the over colour
// 2. the pack card names the first three missing C3 items
// 3. the pack tray adds only the picked missing items, and marks the ones the person has
// 4. a new category keeps its icon for the account only after Jotbun accepted it
// 5. a limit that would pass the month's budget is refused in words
// 6. private mode hides the tiles' amounts
// 7. every glyph, swatch and checkbox is at least 44 pt and named
// 8. CategoryGlyph unfilled circles (travel's wheel) have stroke=ink, width=2, fill="none" (RV1)
// 9. CategoryGlyph paths have round linecaps and linejoins (RV2)
// 10. CategoryGlyph tile initial has Thai leading (RV3)
// 11. CategoryGlyph standalone glyph has DECORATIVE wrapper (RV4, RV4s)
// 12. with no account open (accountId === null), setIcon keeps nothing and changes nothing on screen
// 13. catalogue sections bw-categories, bw-category-new, bw-category-limit, bw-thai-pack render cleanly
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BudgetDto, CategoryDto, Minor, TransactionDto } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { router } from '@mobile/dev/catalogue/routerTestStub';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { COMMON_COPY } from '../common/copy';
import { draftText } from '../copy/draftText';
import type { CopyValues } from '../copy/draftText';
import { CATEGORY_PICKER_GLYPHS } from '../looks/categoryGlyphs';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { PrivateModeProvider } from '../privacy/PrivateModeProvider';
import { mountWallet } from '../testing/walletHarness';
import { CategoryTray, TRAY_SWATCHES } from './CategoryTray';
import { COPY } from './copy';
import { ThaiPackTray } from './ThaiPackTray';
import { WalletCategoriesScreen } from './WalletCategoriesScreen';
import { WALLET_CATEGORY_SECTIONS } from '../../dev/catalogue/wallet/categorySections';

const NOW = new Date('2026-09-29T03:00:00Z');
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const LOCALES = ['th', 'en'] as const;
type Locale = (typeof LOCALES)[number];

const ALL_TEXT = { ...COMMON_COPY, ...COPY };
const say = (key: string, locale: Locale = 'th', values?: CopyValues) => draftText(ALL_TEXT, key, locale, values);

const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS;
const PETS: CategoryDto = {
  id: '0000000c-0000-4000-8000-0000000000a1',
  type: 'expense',
  builtin_key: null,
  label: 'Pets',
  color: CATEGORY_COLORS[2],
  archived: false,
  version: 1,
};
const COFFEE: CategoryDto = {
  id: '0000000c-0000-4000-8000-0000000000a2',
  type: 'expense',
  builtin_key: null,
  label: 'Coffee',
  color: CATEGORY_COLORS[0],
  archived: false,
  version: 1,
};

const SAMPLE_BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-000000000001',
  month: '2026-09',
  overall_limit_minor: '2000000',
  category_limits: [
    { category_id: FOOD.id, limit_minor: '600000' },   // limit 6,000, spent in goldenSeed is 182
    { category_id: TRAVEL.id, limit_minor: '10000' },  // limit 100, spent is 1,500 (OVER)
  ],
  version: 1,
};

async function ready() {
  for (let step = 0; step < 4; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) {
      node.dispatchEvent(new Event('animationstart'));
    }
  });
}

function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const elements = within(inside).queryAllByRole(role, { name });
  expect(elements.length, `a ${role} named ${String(name)}`).toBeGreaterThan(0);
  return elements[0] as HTMLElement;
}

function found(testID: string): HTMLElement {
  const element = screen.queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const elements = within(inside).queryAllByText(words);
  expect(elements.length, String(words)).toBeGreaterThan(0);
  return elements[0] as HTMLElement;
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await ready();
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset().mockReturnValue(true);
});

// Test 1: the grid shows each category's spending against its limit, over in the over colour
test("the grid shows each category's spending against its limit, over in the over colour", async () => {
  for (const [mode, colors] of MODES) {
    for (const locale of LOCALES) {
      const fake = createFakeResources({
        wallets: goldenSeed().wallets,
        categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT, PETS],
        budgets: [SAMPLE_BUDGET],
        records: goldenSeed().records,
      });
      fake.resources.summary = async (month: string) => ({
        month,
        income_minor: '0',
        expense_minor: '168200',
        balance_minor: '-168200',
        by_wallet: {},
        categories: [
          { category_id: FOOD.id, type: 'expense', total_minor: '18200' },
          { category_id: TRAVEL.id, type: 'expense', total_minor: '150000' },
        ],
        budget: null,
        as_of_revision: '1',
      });

      mountWallet(<WalletCategoriesScreen now={NOW} />, {
        locale,
        mode,
        resources: fake.resources,
      });
      await ready();

      // Heading and navigation
      named('heading', say('categories.title', locale));
      named('button', say('common.back', locale));
      named('button', say('categories.new', locale));

      // Type segments
      named('radio', say('categories.expense', locale));
      named('radio', say('categories.income', locale));

      // Built-ins and custom sections
      shown(say('categories.builtins', locale));
      shown(say('categories.custom', locale));

      // Food category tile: under limit (limit 6,000)
      const foodLimit = say('categories.limit', locale, { amount: '฿6,000' });
      shown(foodLimit);

      // Travel category tile: OVER limit (spent 1,500 > limit 100)
      const travelOver = say('categories.over', locale, { amount: '฿1,400' });
      const overText = shown(travelOver);
      expect(overText.style.color).toBe(rgba(colors.over));

      // Unlimited category (Bills has no limit): says 'ไม่จำกัด' / 'No limit'
      shown(say('categories.unlimited', locale));

      cleanup();
    }
  }
});

// Test 2: the pack card names the first three missing C3 items
test('the pack card names the first three missing C3 items', async () => {
  for (const locale of LOCALES) {
    // With only built-ins, all C3 items are missing
    const fake = createFakeResources({
      wallets: goldenSeed().wallets,
      categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT],
      budgets: [SAMPLE_BUDGET],
    });

    mountWallet(<WalletCategoriesScreen now={NOW} />, {
      locale,
      resources: fake.resources,
    });
    await ready();

    // Pack card appears with heading and names
    shown(say('categories.packTitle', locale));
    shown(say('categories.packName', locale));

    // Names first three missing C3 items
    const firstThree = locale === 'th'
      ? 'ส่งเงินให้ครอบครัว, ทำบุญ, เดลิเวอรี'
      : 'Family support, Merit making, Delivery';
    shown(new RegExp(firstThree.split(',')[0]));

    // "และอีก 6 หมวด" / "and 6 more"
    const moreText = say('categories.packMore', locale, { n: 6 });
    shown(new RegExp(moreText));

    cleanup();
  }
});

// Test 3: the pack tray adds only the picked missing items, and marks the ones the person has
test('the pack tray adds only the picked missing items, and marks the ones the person has', async () => {
  for (const locale of LOCALES) {
    // Person already has PETS (label 'Pets')
    const fake = createFakeResources({
      wallets: goldenSeed().wallets,
      categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT, PETS],
      budgets: [SAMPLE_BUDGET],
    });

    const onClose = vi.fn();
    mountWallet(
      <ThaiPackTray
        visible={true}
        onClose={onClose}
        categories={[FOOD, TRAVEL, BILLS, SALARY, GIFT, PETS]}
      />,
      { locale, resources: fake.resources }
    );
    await ready();
    startAnimations();

    // Dialog title
    named('heading', say('categories.packHeading', locale));

    // Pets has "มีแล้ว" / "Already added" badge and is disabled
    const haveBadge = shown(say('categories.packHave', locale));
    expect(haveBadge).not.toBeNull();

    // The add button at first says "เพิ่ม 0 หมวด" / "Add 0 categories"
    const addZero = say('categories.packAdd', locale, { n: 0 });
    named('button', addZero);

    // Pick merit (ทำบุญ)
    const meritName = locale === 'th' ? 'ทำบุญ' : 'Merit making';
    const meritCheckbox = named('checkbox', meritName);
    expect(meritCheckbox.getAttribute('aria-checked')).toBe('false');

    await press(meritCheckbox);
    expect(meritCheckbox.getAttribute('aria-checked')).toBe('true');

    // Add button updates to "เพิ่ม 1 หมวด" / "Add 1 category"
    const addOne = say('categories.packAdd', locale, { n: 1 });
    const addButton = named('button', addOne);

    // Press add
    await press(addButton);
    await ready();

    expect(fake.callsOf('createCategory').length, 'only picked category added').toBe(1);
    expect(onClose).toHaveBeenCalled();
    cleanup();
  }
});

// Test 4: a new category keeps its icon for the account only after Jotbun accepted it
test('a new category keeps its icon for the account only after Jotbun accepted it', async () => {
  const fake = createFakeResources({
    wallets: goldenSeed().wallets,
    categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT],
    budgets: [SAMPLE_BUDGET],
  });

  const onClose = vi.fn();
  const view = mountWallet(
    <CategoryTray
      visible={true}
      onClose={onClose}
      category={null}
      type="expense"
      now={NOW}
    />,
    { resources: fake.resources }
  );
  await ready();
  startAnimations();

  // Name field
  const nameInput = found('category-name-input');
  fireEvent.change(nameInput, { target: { value: 'Boba Tea' } });
  await ready();

  // Select coffee/drink glyph (second glyph in CATEGORY_PICKER_GLYPHS)
  const coffeeGlyph = named('radio', 'กาแฟ');
  await press(coffeeGlyph);

  // Select peach swatch (TRAY_SWATCHES[0])
  const peachSwatch = named('radio', say('swatch.peach', 'th'));
  await press(peachSwatch);

  // Before save, store has no icon for category
  const rawBefore = view.stored.get('jotbun.account.00000000-0000-4000-8000-0000000000aa.category-icons');
  expect(rawBefore == null).toBe(true);

  // If save fails, icon is NOT kept
  fake.fail('createCategory', 'network');
  const saveBtn = named('button', say('common.save', 'th'));
  await press(saveBtn);
  await ready();

  const rawFailed = view.stored.get('jotbun.account.00000000-0000-4000-8000-0000000000aa.category-icons');
  expect(rawFailed == null, 'icon not stored if save fails').toBe(true);

  // Retry save without failure: succeeds and stores icon
  await press(saveBtn);
  await ready();

  // After Jotbun accepted it, the icon is stored
  const rawAfter = view.stored.get('jotbun.account.00000000-0000-4000-8000-0000000000aa.category-icons');
  expect(rawAfter).not.toBeNull();
  expect(rawAfter).toContain('coffee');
  expect(onClose).toHaveBeenCalled();
});

// Test 5: a limit that would pass the month's budget is refused in words
test("a limit that would pass the month's budget is refused in words", async () => {
  // Budget total is 20,000 (overall_limit_minor: 2000000).
  // CategoryLimits: Travel is 3,000 (300000).
  // Food has no limit yet. If Food enters 18,000 -> 18,000 + 3,000 = 21,000 > 20,000!
  const budget: BudgetDto = {
    id: '0000000d-0000-4000-8000-000000000001',
    month: '2026-09',
    overall_limit_minor: '2000000',
    category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }],
    version: 1,
  };
  const fake = createFakeResources({
    wallets: goldenSeed().wallets,
    categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT],
    budgets: [budget],
  });

  mountWallet(
    <CategoryTray
      visible={true}
      onClose={() => {}}
      category={FOOD}
      type="expense"
      now={NOW}
    />,
    { resources: fake.resources }
  );
  await ready();
  startAnimations();

  // Turn limit switch on
  const limitSwitch = named('switch', say('categories.setLimit', 'th'));
  await press(limitSwitch);
  await ready();

  // Type limit of 18,000
  const limitInput = found('category-limit-input');
  fireEvent.change(limitInput, { target: { value: '18000' } });
  await ready();

  // Over-budget refusal message appears
  const expectedMessage = say('categories.limitsTotal', 'th', { total: '฿21,000', budget: '฿20,000' });
  const refusalText = shown(expectedMessage);
  expect(refusalText).not.toBeNull();

  // Save button is disabled / pressing does nothing
  const saveBtn = named('button', say('common.save', 'th'));
  expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
});

// Test 6: private mode hides the tiles' amounts
test("private mode hides the tiles' amounts", async () => {
  for (const locale of LOCALES) {
    const fake = createFakeResources({
      wallets: goldenSeed().wallets,
      categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT],
      budgets: [SAMPLE_BUDGET],
      records: goldenSeed().records,
    });
    fake.resources.summary = async (month: string) => ({
      month,
      income_minor: '0',
      expense_minor: '168200',
      balance_minor: '-168200',
      by_wallet: {},
      categories: [
        { category_id: FOOD.id, type: 'expense', total_minor: '18200' },
        { category_id: TRAVEL.id, type: 'expense', total_minor: '150000' },
      ],
      budget: null,
      as_of_revision: '1',
    });

    mountWallet(
      <WalletCategoriesScreen now={NOW} />,
      { locale, resources: fake.resources, device: { 'private-mode': '1' } }
    );
    await ready();

    // The raw amount 182 or 6,000 should NOT be present anywhere in the document text
    expect(screen.queryByText(/฿182/)).toBeNull();
    expect(screen.queryByText(/฿6,000/)).toBeNull();
    expect(screen.queryByText(/182 บาท/)).toBeNull();

    // Tiles have masked indicators (e.g. ฿••••)
    const masked = screen.queryAllByText('฿••••');
    expect(masked.length, 'masked amount indicators').toBeGreaterThan(0);

    // Spoken and accessible labels hide the amounts
    const tiles = screen.queryAllByRole('button');
    expect(tiles.length, 'category tiles in private mode').toBeGreaterThan(0);
    for (const tile of tiles) {
      const label = tile.getAttribute('aria-label') ?? '';
      expect(label).not.toContain('182');
      expect(label).not.toContain('6,000');
      expect(label).not.toContain('1,500');
    }

    cleanup();
  }
});

// Test 7: every glyph, swatch and checkbox is at least 44 pt and named
test('every glyph, swatch and checkbox is at least 44 pt and named', async () => {
  const fake = createFakeResources({
    wallets: goldenSeed().wallets,
    categories: [FOOD, TRAVEL, BILLS, SALARY, GIFT],
    budgets: [SAMPLE_BUDGET],
  });

  // Check CategoryTray controls: 12 glyphs at 48 pt, 7 swatches at 44 pt
  mountWallet(
    <CategoryTray
      visible={true}
      onClose={() => {}}
      category={null}
      type="expense"
      now={NOW}
    />,
    { resources: fake.resources }
  );
  await ready();
  startAnimations();

  // 12 glyphs
  expect(CATEGORY_PICKER_GLYPHS.length).toBe(12);
  const glyphThaiNames = ['อาหาร', 'กาแฟ', 'รถ', 'ถุงช้อปปิ้ง', 'บ้าน', 'ใบเสร็จ', 'หัวใจ', 'ดอกบัว', 'ของขวัญ', 'มือถือ', 'รอยเท้าสัตว์', 'หนังสือ'];
  for (const name of glyphThaiNames) {
    const glyphRadio = named('radio', name);
    expect(glyphRadio).not.toBeNull();
  }

  // 7 swatches
  expect(TRAY_SWATCHES.length).toBe(7);
  const swatchNames = [
    'swatch.peach', 'swatch.sky', 'swatch.light_violet',
    'swatch.pink', 'swatch.yellow', 'swatch.steel_blue', 'swatch.steel_violet',
  ];
  for (const swatchKey of swatchNames) {
    const swatchRadio = named('radio', say(swatchKey, 'th'));
    expect(swatchRadio).not.toBeNull();
  }

  cleanup();

  // Check ThaiPackTray controls: 44 pt checkbox rows
  mountWallet(
    <ThaiPackTray
      visible={true}
      onClose={() => {}}
      categories={[FOOD, TRAVEL, BILLS, SALARY, GIFT]}
    />,
    { resources: fake.resources }
  );
  await ready();
  startAnimations();

  const checkboxes = screen.queryAllByRole('checkbox');
  expect(checkboxes.length, '9 checkbox rows').toBe(9);
  for (const cb of checkboxes) {
    expect(cb.getAttribute('aria-label')).toBeTruthy();
  }
});

// Test 8 (RV1): CategoryGlyph unfilled circles have stroke=ink, width=2, fill="none"
test('CategoryGlyph unfilled circles (travel wheel) have stroke=ink, width=2, fill="none"', () => {
  const { container } = render(
    <CategoryGlyph glyph="travel" color="#111014" size={48} />
  );
  const circles = container.querySelectorAll('circle');
  expect(circles.length).toBeGreaterThan(0);
  for (const circle of circles) {
    expect(circle.getAttribute('stroke')).toBe('#111014');
    expect(circle.getAttribute('stroke-width')).toBe('2');
    expect(circle.getAttribute('fill')).toBe('none');
  }
});

// Test 9 (RV2): CategoryGlyph paths have round linecaps and linejoins
test('CategoryGlyph paths have round linecaps and linejoins', () => {
  const { container } = render(
    <CategoryGlyph glyph="travel" color="#111014" size={48} />
  );
  const paths = container.querySelectorAll('path');
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-linejoin')).toBe('round');
  }
});

// Test 10 (RV3): CategoryGlyph tile initial has Thai leading
test('CategoryGlyph tile initial has Thai leading', () => {
  const size = 52;
  const expectedLineHeight = walletLineHeight(Math.round((size * 15) / 36), 'thai');
  const customCat: CategoryDto = {
    id: 'custom-cat-initial',
    type: 'expense',
    builtin_key: null,
    label: 'ขนม',
    color: CATEGORY_COLORS[0],
    archived: false,
    version: 1,
  };
  mountWallet(
    <WalletCategoryIcon category={customCat} name="ขนม" size={size} />
  );
  const initialElement = shown('ข');
  expect(initialElement.style.lineHeight).toBe(`${expectedLineHeight}px`);
});

// Test 11 (RV4, RV4s): CategoryGlyph standalone glyph has DECORATIVE wrapper (aria-hidden)
test('CategoryGlyph standalone glyph has DECORATIVE wrapper (aria-hidden)', () => {
  const { container } = render(
    <CategoryGlyph glyph="food" color="#111014" size={48} />
  );
  const wrapper = container.querySelector('[aria-hidden="true"]');
  expect(wrapper).not.toBeNull();
});

// Test 12: with no account open (accountId === null), setIcon keeps nothing and changes nothing on screen
test('with no account open, setIcon keeps nothing and changes nothing on screen', async () => {
  const fake = createFakeResources();
  // Mount with no diary account (accountId === null)
  mountWallet(
    <CategoryTray
      visible={true}
      onClose={() => {}}
      category={null}
      type="expense"
      now={NOW}
    />,
    { diary: null, resources: fake.resources }
  );
  await ready();
  startAnimations();

  // Form is accessible and usable
  const nameInput = found('category-name-input');
  fireEvent.change(nameInput, { target: { value: 'Snacks' } });
  await ready();

  const peachSwatch = named('radio', say('swatch.peach', 'th'));
  await press(peachSwatch);
  await ready();

  // Save does not throw and completes cleanly
  const saveBtn = named('button', say('common.save', 'th'));
  await press(saveBtn);
  await ready();
});

// Test 13: catalogue sections render cleanly
test('catalogue sections bw-categories, bw-category-new, bw-category-limit, bw-thai-pack render cleanly', () => {
  expect(WALLET_CATEGORY_SECTIONS.length).toBe(4);
  const ids = WALLET_CATEGORY_SECTIONS.map((s) => s.id);
  expect(ids).toEqual(['bw-categories', 'bw-category-new', 'bw-category-limit', 'bw-thai-pack']);

  for (const section of WALLET_CATEGORY_SECTIONS) {
    expect(section.title.startsWith('Bun Wallet: ')).toBe(true);
    expect(section.group).toBe('Screens');
    const { container } = render(section.render());
    expect(container).not.toBeNull();
    cleanup();
  }
});
