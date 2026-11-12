// The Bun Wallet's Categories screen, its category tray and the Thai pack
// tray (P2-T29; wc-categories, wc-category-edit, wc-thai-pack). Each case
// mounts through mountWallet, in Thai and by day unless it says otherwise.
//
// The plan's seven cases come first, then the fix round's (the review of
// P2-T29: B1 to B4, M1 to M12, m1 to m13), then the four P2-T11 carried
// (followups: its m2 and n5), which hold WalletCategoryIcon's glyph and
// initial, not this task's screens.
//
// Reanimated keeps a tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops numberOfLines from the DOM, so the props that
// reach the app's Text are recorded, as WalletsList.render.test.tsx does.
// Every lookup asserts, so a missing part fails as an AssertionError.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
// The commands' keys and a new category's id come from the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
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

import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto, MonthSummary } from '@gogospend/contracts';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { mountInApp, rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { contrastRatio } from '@mobile/theme/contrast';
import { ThemePreferenceOverride } from '@mobile/theme/ThemeProvider';
import { tileTint, walletDark, walletLight } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { WALLET_CATEGORY_SECTIONS } from '../../dev/catalogue/wallet/categorySections';
import { COMMON_COPY } from '../common/copy';
import { draftText } from '../copy/draftText';
import type { CopyValues } from '../copy/draftText';
import { CATEGORY_ICONS_NAME } from '../looks/WalletLooksProvider';
import { CategoryGlyph, WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, TEST_ACCOUNT_ID, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { CategoryTray, TRAY_SWATCHES } from './CategoryTray';
import { COPY } from './copy';
import { ThaiPackTray } from './ThaiPackTray';
import { WalletCategoriesScreen } from './WalletCategoriesScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  seen.props.length = 0;
});

// ---------------------------------------------------------------------------
// The board's month

const NOW = new Date('2026-09-29T03:00:00Z');
const MONTH = '2026-09';
type Locale = 'th' | 'en';
const LOCALES: readonly Locale[] = ['th', 'en'];
const MODES = [['light', walletLight], ['dark', walletDark]] as const;

const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto, CategoryDto];
/** ช้อปปิ้ง, over its limit, on the one hue whose tint `over` cannot read on by day (4.38:1; the card chip reads 5.86:1). */
const SHOPPING: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000b2', type: 'expense', builtin_key: 'shopping', label: null, color: '#4E93D9', archived: false, version: 1 };
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
/** C3's merit, by its Thai name: a pack category, whose lotus comes from the pack. */
const MERIT: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a3', type: 'expense', builtin_key: null, label: 'ทำบุญ', color: '#F2CE5C', archived: false, version: 1 };
const OLD: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a2', type: 'expense', builtin_key: null, label: 'Old hobby', color: CATEGORY_COLORS[9], archived: true, version: 3 };
/** One of the person's own with no colour: its tile is `raised`. */
const PLAIN: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a5', type: 'expense', builtin_key: null, label: 'Plain', color: null, archived: false, version: 1 };

/** ฿20,000, with อาหาร ฿6,000, การเดินทาง ฿100 and ช้อปปิ้ง ฿2,000 (฿8,100 of limits). */
const BUDGET: BudgetDto = {
  id: '0000000d-0000-4000-8000-000000000001',
  month: MONTH,
  overall_limit_minor: '2000000',
  category_limits: [
    { category_id: FOOD.id, limit_minor: '600000' },
    { category_id: TRAVEL.id, limit_minor: '10000' },
    { category_id: SHOPPING.id, limit_minor: '200000' },
  ],
  version: 4,
};

/** This month: อาหาร under its limit, การเดินทาง exactly at it, ช้อปปิ้ง ฿310 over, ค่าบิล with no limit, and a salary. */
const TOTALS: MonthSummary['categories'] = [
  { category_id: FOOD.id, type: 'expense', total_minor: '462000' },
  { category_id: TRAVEL.id, type: 'expense', total_minor: '10000' },
  { category_id: SHOPPING.id, type: 'expense', total_minor: '231000' },
  { category_id: BILLS.id, type: 'expense', total_minor: '27000' },
  { category_id: SALARY.id, type: 'income', total_minor: '2800000' },
];

type Board = ReturnType<typeof createFakeResources> & { shown: SpendV1Resources };

/** The fakes, with this month's per-category totals (the fake summary keeps none). */
function board(categories: readonly CategoryDto[] = [FOOD, TRAVEL, BILLS, SALARY, GIFT, SHOPPING, PETS, PLAIN, OLD], budgets: readonly BudgetDto[] = [BUDGET]): Board {
  const fake = createFakeResources({ categories: [...categories], budgets: [...budgets] });
  const shown: SpendV1Resources = { ...fake.resources, summary: async (month: string) => ({ ...(await fake.resources.summary(month)), categories: TOTALS }) };
  return { ...fake, shown };
}

function mountScreen(fake: Board, options: MountWalletOptions = {}) {
  return mountWallet(<WalletCategoriesScreen now={NOW} />, { resources: fake.shown, ...options });
}

// ---------------------------------------------------------------------------
// Helpers

const LINES = { ...COMMON_COPY, ...COPY };
const say = (key: string, locale: Locale = 'th', values?: CopyValues) => draftText(LINES, key, locale, values);
const tc = (english: string, locale: Locale = 'th', values?: CopyValues) => translateCopy(english, locale, values);

/** Lets the reads, the kept looks' read and the commands land. */
async function settle() {
  for (let tick = 0; tick < 6; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryAllByRole(role, { name })[0];
  expect(element, `a ${role} named ${String(name)}`).toBeDefined();
  return element as HTMLElement;
}

/** The element with this test id, which must be there: the newest, while a closed tray's Modal is still leaving. */
function found(testID: string): HTMLElement {
  const elements = screen.queryAllByTestId(testID);
  expect(elements.length, testID).toBeGreaterThan(0);
  return elements[elements.length - 1];
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await settle();
  startAnimations();
}

async function typeInto(element: HTMLElement, text: string) {
  fireEvent.change(element, { target: { value: text } });
  await settle();
}

/** `#RRGGBB` from react-native-web's `rgba(r, g, b, a)`. */
function hex(colour: string): string {
  const [r, g, b] = (colour.match(/\d+/g) ?? []).map(Number);
  expect([r, g, b].every((channel) => Number.isInteger(channel)), `a colour, got "${colour}"`).toBe(true);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const BUILTIN_EN: Readonly<Record<string, 'Food' | 'Travel' | 'Bills' | 'Shopping' | 'Salary'>> = { food: 'Food', travel: 'Travel', bills: 'Bills', shopping: 'Shopping', salary: 'Salary' };
const builtinName = (key: 'Food' | 'Travel' | 'Bills' | 'Shopping' | 'Salary', locale: Locale) => tc(key, locale);
const baht = (amount: string, locale: Locale) => say('common.baht', locale, { amount });
const tileOf = (category: CategoryDto) => found(`category-tile-${category.id}`);

/** The grid, read. */
async function openScreen(fake: Board = board(), options: MountWalletOptions = {}) {
  const view = mountScreen(fake, options);
  await settle();
  found('categories-builtins');
  return view;
}

/** The category tray, opened from a tile or from the new tile. */
async function openTray(from: HTMLElement) {
  await press(from);
  found('category-tray');
}

const nameField = (locale: Locale = 'th') => named('textbox', say('categories.name', locale));
const limitField = (locale: Locale = 'th') => named('textbox', say('categories.limitField', locale));
const NOT_CONFIRMED = (locale: Locale = 'th') => tc('Not confirmed yet. Your changes are kept; try again.', locale);

// ---------------------------------------------------------------------------
// The plan's cases

test("the grid shows each category's spending against its limit, over in the over colour", async () => {
  for (const [mode, colors] of MODES) {
    for (const locale of LOCALES) {
      await openScreen(board(), { mode, locale });
      const at = `${mode} ${locale}`;
      const food = builtinName('Food', locale);
      const travel = builtinName('Travel', locale);
      const shopping = builtinName('Shopping', locale);
      const bills = builtinName('Bills', locale);
      expect(tileOf(FOOD).getAttribute('aria-label'), at).toBe(say('categories.tileLabel', locale, { name: food, spent: baht('4,620', locale), limit: baht('6,000', locale) }));
      // Spending equal to its limit is not over.
      expect(tileOf(TRAVEL).getAttribute('aria-label'), at).toBe(say('categories.tileLabel', locale, { name: travel, spent: baht('100', locale), limit: baht('100', locale) }));
      expect(tileOf(SHOPPING).getAttribute('aria-label'), at).toBe(say('categories.tileOver', locale, { name: shopping, spent: baht('2,310', locale), over: baht('310', locale) }));
      expect(tileOf(BILLS).getAttribute('aria-label'), at).toBe(say('categories.tileUnlimited', locale, { name: bills, spent: baht('270', locale) }));
      expect(tileOf(PETS).getAttribute('aria-label'), at).toBe(say('categories.tileUnlimited', locale, { name: 'Pets', spent: baht('0', locale) }));
      // The lines the board draws.
      expect(found(`category-limit-${FOOD.id}`).textContent, at).toBe(say('categories.limit', locale, { amount: '฿6,000' }));
      expect(found(`category-limit-${TRAVEL.id}`).textContent, at).toBe(say('categories.limit', locale, { amount: '฿100' }));
      expect(found(`category-limit-${BILLS.id}`).textContent, at).toBe(say('categories.unlimited', locale));
      expect(screen.queryAllByTestId(`category-over-${TRAVEL.id}`), `${at}: at its limit is not over`).toEqual([]);
      // Three to a row; ช้อปปิ้ง alone on the last row keeps a third of it.
      expect((tileOf(SHOPPING).parentElement as HTMLElement).children.length, at).toBe(3);
      expect(found('categories-type').style.flexDirection, at).toBe('row');
      const over = found(`category-over-${SHOPPING.id}`);
      expect(over.textContent, at).toBe(say('categories.over', locale, { amount: '฿310' }));
      // Over in `over`, on a card chip.
      expect((over.firstElementChild as HTMLElement).style.color, at).toBe(rgba(colors.over));
      expect(over.style.backgroundColor, at).toBe(rgba(colors.card));
      // Each tile on its colour tinted for the mode (`raised` with none); its words 4.5:1 on whatever they sit on.
      for (const category of [FOOD, TRAVEL, SHOPPING, BILLS, PETS, PLAIN]) {
        const tile = tileOf(category);
        expect(tile.style.backgroundColor, `${at} ${category.id}`).toBe(rgba(category.color === null ? colors.raised : tileTint(category.color, colors.isDark)));
        const words = [...tile.querySelectorAll<HTMLElement>('*')].filter((node) => node.style.color && [...node.childNodes].some((child) => child.nodeType === 3 && (child.textContent ?? '').trim() !== ''));
        expect(words.length, `${at} ${category.id}: words`).toBeGreaterThan(1);
        for (const word of words) {
          let ground: HTMLElement | null = word;
          while (ground && ground !== tile && !ground.style.backgroundColor) ground = ground.parentElement;
          const back = (ground ?? tile).style.backgroundColor;
          expect(contrastRatio(hex(word.style.color), hex(back)), `${at} ${category.id}: "${word.textContent}"`).toBeGreaterThanOrEqual(4.5);
        }
      }
      cleanup();
    }
  }
}, 60_000);

test('the pack card names the first three missing C3 items', async () => {
  for (const locale of LOCALES) {
    const join = locale === 'th' ? ' ' : ', ';
    // None of C3's nine yet: the first three, and six more.
    await openScreen(board([FOOD, TRAVEL, BILLS, SALARY, GIFT]), { locale });
    expect(found('categories-pack-line').textContent, locale).toBe(
      `${locale === 'th' ? ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี'].join(join) : ['Family support', 'Merit making', 'Delivery'].join(join)} ${say('categories.packMore', locale, { n: 6 })}`,
    );
    expect(found('categories-pack').getAttribute('aria-label'), locale).toBe(`${say('categories.packTitle', locale)} ${say('categories.packName', locale)} ${found('categories-pack-line').textContent}`);
    cleanup();
    // ทำบุญ held: the next three, and five more.
    await openScreen(board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]), { locale });
    expect(found('categories-pack-line').textContent, locale).toBe(
      `${locale === 'th' ? ['ส่งเงินให้ครอบครัว', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า'].join(join) : ['Family support', 'Delivery', 'Motorbike taxi and rail'].join(join)} ${say('categories.packMore', locale, { n: 5 })}`,
    );
    cleanup();
  }
  // One missing: its name alone. None missing: no card.
  const held = (label: string, n: number): CategoryDto => ({ ...PETS, id: `0000000c-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, label, type: label === 'เงินจากครอบครัว' ? 'income' : 'expense' });
  const eight = ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า', 'เติมเงินมือถือ', 'เซเว่น', 'สัตว์เลี้ยง', 'เงินจากครอบครัว'].map(held);
  await openScreen(board([FOOD, ...eight]));
  expect(found('categories-pack-line').textContent).toBe('ลอตเตอรี่');
  cleanup();
  await openScreen(board([FOOD, ...eight, held('ลอตเตอรี่', 9)]));
  expect(screen.queryAllByTestId('categories-pack'), 'no pack card once all nine are there').toEqual([]);
}, 60_000);

test('the pack tray adds only the picked missing items, and marks the ones the person has', async () => {
  for (const locale of LOCALES) {
    const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]);
    await openScreen(fake, { locale });
    await press(found('categories-pack'));
    found('thai-pack-tray');
    const items = found('thai-pack-items');
    expect(within(items).queryAllByRole('checkbox').map((box) => box.getAttribute('aria-label')), locale).toEqual(
      locale === 'th'
        ? ['ส่งเงินให้ครอบครัว', 'ทำบุญ', 'เดลิเวอรี', 'วินมอไซค์และรถไฟฟ้า', 'เติมเงินมือถือ', 'เซเว่น', 'ลอตเตอรี่', 'สัตว์เลี้ยง', 'เงินจากครอบครัว']
        : ['Family support', 'Merit making', 'Delivery', 'Motorbike taxi and rail', 'Mobile top-up', 'Convenience store', 'Lottery', 'Pets', 'From family'],
    );
    // Nothing is picked at first; the one the person has says มีแล้ว and cannot be picked.
    expect(within(items).queryAllByRole('checkbox', { checked: true }), locale).toEqual([]);
    const merit = found('thai-pack-merit');
    expect(merit.getAttribute('aria-disabled'), locale).toBe('true');
    expect(within(merit).queryAllByText(say('categories.packHave', locale)), locale).not.toEqual([]);
    await press(merit);
    expect(merit.getAttribute('aria-checked'), `${locale}: a held row never checks`).toBe('false');
    // Pick เดลิเวอรี and ลอตเตอรี่ (not the first missing ones), then un-pick and re-pick one.
    expect(named('button', say('categories.packAdd', locale, { n: 0 })).getAttribute('aria-disabled'), `${locale}: nothing to add yet`).toBe('true');
    await press(found('thai-pack-lottery'));
    // One picked: the singular line (in Thai it reads as the plural one does).
    expect(named('button', say('categories.packAddOne', locale)).getAttribute('aria-disabled'), locale).not.toBe('true');
    await press(found('thai-pack-delivery'));
    await press(found('thai-pack-lottery'));
    await press(found('thai-pack-lottery'));
    expect(within(items).queryAllByRole('checkbox', { checked: true }).map((box) => box.getAttribute('aria-label')), locale).toEqual(
      locale === 'th' ? ['เดลิเวอรี', 'ลอตเตอรี่'] : ['Delivery', 'Lottery'],
    );
    await press(named('button', say('categories.packAdd', locale, { n: 2 })));
    // Only the picked, in C3's order, named in the person's language, in C3's colours.
    const created = fake.callsOf('createCategory').map((call) => call.args[0] as { label: string; color: string; type: string });
    expect(created.map((input) => [input.label, input.color, input.type]), locale).toEqual(
      locale === 'th' ? [['เดลิเวอรี', '#F0A868', 'expense'], ['ลอตเตอรี่', '#D3C2F2', 'expense']] : [['Delivery', '#F0A868', 'expense'], ['Lottery', '#D3C2F2', 'expense']],
    );
    // The tray closes and the screen reads again: the two are no longer missing.
    expect(screen.queryAllByTestId('thai-pack-tray'), `${locale}: the tray closes`).toEqual([]);
    expect(found('categories-pack-line').textContent, locale).not.toContain(locale === 'th' ? 'เดลิเวอรี' : 'Delivery');
    cleanup();
  }
}, 60_000);

test('a new category keeps its icon for the account only after Jotbun accepted it', async () => {
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    const fake = board();
    const view = await openScreen(fake, { mode, locale });
    await openTray(found('categories-new-tile'));
    await typeInto(nameField(locale), 'Boba');
    await press(named('radio', say('categories.glyphCoffee', locale)));
    const release = fake.hold('createCategory');
    await press(named('button', tc('Add this category', locale)));
    const iconsKey = `jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`;
    expect(view.stored.get(iconsKey), `${locale}: nothing kept before Jotbun answers`).toBeUndefined();
    release();
    await settle();
    const id = (fake.callsOf('createCategory')[0]?.args[0] as { id: string } | undefined)?.id;
    expect(id, locale).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(view.stored.get(iconsKey) ?? '{}'), `${locale}: kept once accepted`).toEqual({ [id as string]: 'coffee' });
    // The grid reads again and shows it.
    expect(found(`category-tile-${id as string}`).getAttribute('aria-label'), locale).toBe(say('categories.tileUnlimited', locale, { name: 'Boba', spent: baht('0', locale) }));
    cleanup();
  }
  // A refusal keeps nothing.
  const fake = board();
  const view = await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  await press(named('radio', say('categories.glyphCoffee')));
  fake.fail('createCategory', 'invalid');
  await press(named('button', tc('Add this category')));
  expect(view.stored.get(`jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`), 'a refused category keeps no icon').toBeUndefined();
}, 60_000);

test("a limit that would pass the month's budget is refused in words", async () => {
  for (const locale of LOCALES) {
    const fake = board();
    await openScreen(fake, { locale });
    await openTray(tileOf(FOOD));
    // Within the budget: the total, not a refusal (฿8,100 of limits becomes ฿9,100).
    await typeInto(limitField(locale), '7000');
    expect(found('category-limit-total').textContent, locale).toBe(say('categories.limitsTotal', locale, { total: '฿9,100', budget: '฿20,000' }));
    expect(screen.queryAllByTestId('category-limit-problem'), locale).toEqual([]);
    // Exactly the budget still fits.
    await typeInto(limitField(locale), '17900');
    expect(screen.queryAllByTestId('category-limit-problem'), `${locale}: equal fits`).toEqual([]);
    // One satang more is refused in today's words, as it is typed.
    await typeInto(limitField(locale), '17900.01');
    const problem = found('category-limit-problem');
    expect(problem.textContent, locale).toBe(tc("Category limits would add up to {total}, more than this month's budget of {overall}.", locale, { total: '฿20,000.01', overall: '฿20,000' }));
    expect(problem.getAttribute('role'), locale).toBe('alert');
    expect(screen.queryAllByTestId('category-limit-total'), `${locale}: the refusal is not the total`).toEqual([]);
    // Saving sends nothing.
    await press(named('button', tc('Save changes', locale)));
    expect(fake.callsOf('setBudget'), locale).toEqual([]);
    expect(found('category-limit-problem').textContent, locale).toBe(problem.textContent);
    cleanup();
  }
}, 60_000);

test("private mode hides the tiles' amounts", async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    for (const category of [FOOD, TRAVEL, SHOPPING, BILLS, PETS]) {
      const tile = tileOf(category);
      expect(tile.getAttribute('aria-label'), locale).toBe(`${category.label ?? tc(BUILTIN_EN[category.builtin_key as string], locale)} ${say('common.amountHidden', locale)}`);
      expect(tile.textContent, `${locale}: no digit on ${category.id}`).not.toMatch(/\d/);
      expect(tile.textContent, locale).toContain('฿••••');
    }
    expect(found(`category-over-${SHOPPING.id}`).textContent, locale).toBe(say('categories.over', locale, { amount: '฿••••' }));
    expect(found(`category-limit-${FOOD.id}`).textContent, locale).toBe(say('categories.limit', locale, { amount: '฿••••' }));
    cleanup();
  }
}, 60_000);

test('every glyph, swatch and checkbox is at least 44 pt and named', async () => {
  const minimum = (element: HTMLElement) => Math.min(
    Number.parseFloat(element.style.minHeight || element.style.height),
    Number.parseFloat(element.style.width || element.style.minWidth || '44'),
  );
  for (const [mode, locale] of [['light', 'th'], ['dark', 'en']] as const) {
    await openScreen(board(), { mode, locale });
    // The screen's type segments, tiles and buttons.
    for (const radio of within(found('categories-type')).queryAllByRole('radio')) expect(minimum(radio), `${locale}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    await openTray(found('categories-new-tile'));
    // The fields say their names (B3).
    nameField(locale);
    const glyphs = within(found('category-glyphs')).queryAllByRole('radio');
    expect(glyphs.map((glyph) => glyph.getAttribute('aria-label')), locale).toEqual(
      ['Food', 'Coffee', 'Car', 'Bag', 'Home', 'Receipt', 'Heart', 'Lotus', 'Gift', 'Phone', 'Paw', 'Book'].map((each) => say(`categories.glyph${each}`, locale)),
    );
    if (locale === 'th') expect(glyphs.map((glyph) => glyph.getAttribute('aria-label'))).toEqual(['อาหาร', 'กาแฟ', 'รถ', 'ถุงช้อปปิ้ง', 'บ้าน', 'ใบเสร็จ', 'หัวใจ', 'ดอกบัว', 'ของขวัญ', 'มือถือ', 'รอยเท้าสัตว์', 'หนังสือ']);
    for (const glyph of glyphs) expect(Number.parseFloat(glyph.style.minHeight), `${locale}: ${glyph.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(48);
    const swatches = within(found('category-swatches')).queryAllByRole('radio');
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label')), locale).toEqual(
      ['Peach', 'Blue', 'Lilac', 'Pink', 'Yellow', 'Sky', 'Slate'].map((each) => say(`categories.swatch${each}`, locale)),
    );
    if (locale === 'th') expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['สีส้มพีช', 'สีฟ้า', 'สีม่วงอ่อน', 'สีชมพู', 'สีเหลือง', 'สีเทาฟ้า', 'สีเทาม่วง']);
    for (const swatch of swatches) expect([swatch.style.width, swatch.style.height], `${locale}: ${swatch.getAttribute('aria-label')}`).toEqual(['44px', '44px']);
    for (const radio of within(found('category-type')).queryAllByRole('radio')) expect(minimum(radio), `${locale}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    expect(named('radio', say('categories.swatchPeach', locale)).getAttribute('aria-checked'), `${locale}: a new category starts peach`).toBe('true');
    const limitSwitch = named('switch', say('categories.setLimit', locale));
    expect([limitSwitch.style.width, limitSwitch.style.height], locale).toEqual(['56px', '44px']);
    await press(limitSwitch);
    limitField(locale);
    expect(screen.queryAllByTestId('category-limit-total'), `${locale}: no total until a limit is typed`).toEqual([]);
    await press(named('button', say('common.close', locale)));
    // The pack tray's checkboxes.
    await press(found('categories-pack'));
    const boxes = within(found('thai-pack-items')).queryAllByRole('checkbox');
    expect(boxes.length, locale).toBe(9);
    for (const box of boxes) {
      expect((box.getAttribute('aria-label') ?? '').trim(), locale).not.toBe('');
      expect(Number.parseFloat(box.style.minHeight), `${locale}: ${box.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    }
    cleanup();
  }
}, 60_000);

// ---------------------------------------------------------------------------
// The fix round's cases (the review of P2-T29)


test('B4: an unconfirmed save keeps the frozen Try again, with the same id and key, and makes no second category', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  fake.loseResponse('createCategory');
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(NOT_CONFIRMED());
  // Only Try again: no second Add, and the draft is frozen.
  expect(screen.queryAllByRole('button', { name: tc('Add this category') }), 'no Add while unconfirmed').toEqual([]);
  expect(nameField().hasAttribute('readonly'), 'the name is frozen').toBe(true);
  for (const [role, name] of [['radio', say('categories.swatchBlue')], ['radio', say('categories.glyphCoffee')], ['radio', say('categories.income')], ['switch', say('categories.setLimit')]] as const) {
    expect(named(role, name, found('category-tray')).getAttribute('aria-disabled'), `${name} is frozen`).toBe('true');
  }
  // Closed and opened again it is still frozen, on the same draft.
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  expect((nameField() as HTMLInputElement).value).toBe('Boba');
  expect(screen.queryAllByRole('button', { name: tc('Add this category') }), 'still no Add').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  const calls = fake.callsOf('createCategory');
  expect(calls.length).toBe(2);
  expect((calls[1].args[0] as { id: string }).id, 'the same id').toBe((calls[0].args[0] as { id: string }).id);
  expect(calls[1].args[1], 'the same key').toBe(calls[0].args[1]);
  expect([...fake.categories.values()].filter((category) => category.label === 'Boba').length, 'one Boba').toBe(1);
  expect(screen.queryAllByTestId('category-tray'), 'saved: the tray closes').toEqual([]);
}, 30_000);

test('B4: an unconfirmed pack add keeps Try again with the same ids and keys, and adds nothing twice', async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT]);
  await openScreen(fake);
  await press(found('categories-pack'));
  await press(found('thai-pack-merit'));
  fake.loseResponse('createCategory');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(NOT_CONFIRMED());
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'no Add while unconfirmed').toEqual([]);
  expect(found('thai-pack-merit').getAttribute('aria-disabled'), 'the picks are frozen').toBe('true');
  // Closed, the screen reads again (ทำบุญ did land, so it is มีแล้ว now); opened again the tray is still frozen.
  await press(named('button', say('common.close')));
  await press(found('categories-pack'));
  expect(found('thai-pack-problem').textContent).toBe(NOT_CONFIRMED());
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'still no Add').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  const calls = fake.callsOf('createCategory');
  expect(calls.length).toBe(2);
  expect((calls[1].args[0] as { id: string }).id).toBe((calls[0].args[0] as { id: string }).id);
  expect(calls[1].args[1]).toBe(calls[0].args[1]);
  expect([...fake.categories.values()].filter((category) => category.label === 'ทำบุญ').length, 'one ทำบุญ').toBe(1);
}, 30_000);

test('M8: a tray that is saving cannot be closed, and the save still lands', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  const release = fake.hold('createCategory');
  await press(named('button', tc('Add this category')));
  expect(named('button', tc('Saving…')).getAttribute('aria-busy'), 'Save says it is saving').toBe('true');
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  const close = named('button', say('common.close'));
  expect(close.getAttribute('aria-disabled'), 'close says it is unavailable').toBe('true');
  await press(close);
  await press(found('tray-backdrop'));
  expect(found('category-tray'), 'still open').toBeTruthy();
  expect(fake.callsOf('ensureBuiltinCategories').length, 'not closed').toBe(reads);
  release();
  await settle();
  expect(screen.queryAllByTestId('category-tray'), 'the save lands and the tray closes').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'and the grid reads again').toBe(reads + 1);
  // The pack tray too.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  const releasePack = fake.hold('createCategory');
  await press(named('button', say('categories.packAddOne')));
  expect(named('button', tc('Saving…')).getAttribute('aria-busy'), 'Add says it is saving').toBe('true');
  expect(named('button', say('common.close')).getAttribute('aria-disabled'), 'the pack tray is locked').toBe('true');
  await press(found('tray-backdrop'));
  expect(found('thai-pack-tray'), 'still open').toBeTruthy();
  releasePack();
  await settle();
  expect(screen.queryAllByTestId('thai-pack-tray'), 'the add lands and the tray closes').toEqual([]);
}, 30_000);

test('M2: the screen reads again after a save, so a second change sends the new version', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  const release = fake.hold('updateCategory');
  await press(named('button', tc('Save changes')));
  expect(screen.queryAllByRole('button', { name: tc('Archive category') }), 'no archive while a save is out').toEqual([]);
  release();
  await settle();
  expect(screen.queryAllByTestId('category-tray'), 'saved').toEqual([]);
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchBlue')));
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('updateCategory').map((call) => call.args[1]), 'versions 1, then 2').toEqual([1, 2]);
  expect(fake.categories.get(PETS.id)?.color).toBe(TRAY_SWATCHES[1]);
}, 30_000);

test('M3: a read that fails says so with Try again, and shows no grid, no pack card and no new', async () => {
  const fake = board();
  fake.fail('summary', 'network');
  await act(async () => { mountScreen(fake); });
  await settle();
  expect(found('categories-problem').textContent).toContain(tc("We couldn't load your diary."));
  for (const testID of ['categories-builtins', 'categories-pack', 'categories-new-tile']) expect(screen.queryAllByTestId(testID), testID).toEqual([]);
  expect(screen.queryAllByRole('button', { name: say('categories.new') }), 'no new').toEqual([]);
  await press(named('button', say('common.tryAgain')));
  expect(found(`category-tile-${FOOD.id}`)).toBeTruthy();
  cleanup();
  // A problem a retry cannot fix offers no Try again.
  const signedOut = board();
  signedOut.fail('budget', 'signed_out');
  mountScreen(signedOut);
  await settle();
  expect(found('categories-problem').textContent).toContain(tc('Sign in again to see your diary.'));
  expect(screen.queryAllByRole('button', { name: say('common.tryAgain') }), 'no Try again').toEqual([]);
  cleanup();
  // Loading says so; the categories come from ensureBuiltinCategories, so the built-ins are there.
  const loading = board([PETS]);
  const release = loading.hold('ensureBuiltinCategories');
  mountScreen(loading);
  await settle();
  expect(found('categories-loading').textContent).toBe(tc('Loading your diary'));
  expect(screen.queryAllByTestId('categories-builtins')).toEqual([]);
  release();
  await settle();
  expect(tileOf(FOOD)).toBeTruthy();
}, 30_000);

test('M4: in dark mode the trays draw on the mode: tints for the preview, the swatches and the pack glyphs', async () => {
  await openScreen(board(), { mode: 'dark' });
  await openTray(tileOf(PETS));
  expect(found('category-preview').style.backgroundColor).toBe(rgba(tileTint(PETS.color as string, true)));
  const fills = TRAY_SWATCHES.map((_, index) => found(`category-swatch-fill-${index}`).style.backgroundColor);
  expect(fills).toEqual(TRAY_SWATCHES.map((swatch) => rgba(tileTint(swatch, true))));
  await press(named('button', say('common.close')));
  await press(found('categories-pack'));
  const glyphTile = found('thai-pack-family_out').querySelector<HTMLElement>('[aria-hidden="true"]');
  expect(glyphTile?.style.backgroundColor).toBe(rgba(tileTint('#F291C4', true)));
}, 30_000);

test("M5 and M6: names, never keys: the swatches by colour, a built-in's tray by its name", async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale });
    await openTray(tileOf(FOOD));
    const food = builtinName('Food', locale);
    expect(named('heading', food).textContent, locale).toBe(food);
    expect((nameField(locale) as HTMLInputElement).placeholder, locale).toBe(food);
    expect(within(found('category-tray')).queryAllByText(/^food$|swatch\.|categories\./).length, `${locale}: no key on screen`).toBe(0);
    cleanup();
  }
}, 30_000);

test('M7: Back goes back, or to Budget when there is nothing to go back to', async () => {
  await openScreen();
  await press(named('button', say('common.back')));
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  await press(named('button', say('common.back')));
  expect(router.replace).toHaveBeenCalledWith('/spend/budget');
});

test('M9: private mode leaks no amount in the category tray', async () => {
  for (const locale of LOCALES) {
    await openScreen(board(), { locale, device: { [PRIVATE_MODE_NAME]: '1' } });
    await openTray(tileOf(FOOD));
    expect(found('category-limit-hint').textContent, locale).toBe(say('categories.limitHint', locale, { budget: '฿••••' }));
    // The stored limit is masked until a key is pressed.
    expect((limitField(locale) as HTMLInputElement).value, `${locale}: the stored limit is masked`).toBe('');
    expect((limitField(locale) as HTMLInputElement).placeholder, locale).toBe('••••');
    expect(found('category-limit-total').textContent, locale).toBe(say('categories.limitsTotal', locale, { total: '฿••••', budget: '฿••••' }));
    await typeInto(limitField(locale), '18000');
    expect(found('category-limit-problem').textContent, locale).toBe(tc("Category limits would add up to {total}, more than this month's budget of {overall}.", locale, { total: '฿••••', overall: '฿••••' }));
    // What the person types is theirs to see; Save says the refusal again, still masked.
    expect((limitField(locale) as HTMLInputElement).value, locale).toBe('18000');
    await press(named('button', tc('Save changes', locale)));
    expect(found('category-limit-problem').textContent, `${locale}: masked when saving too`).not.toMatch(/\d/);
    cleanup();
  }
}, 30_000);

test('M10: problems with a field are said in words, never a code', async () => {
  await openScreen();
  await openTray(tileOf(FOOD));
  for (const [typed, words] of [['abc', 'Enter an amount like 65 or 65.50'], ['12.345', 'Use at most two decimal places'], ['0', 'Enter an amount above zero']] as const) {
    await typeInto(limitField(), typed);
    expect(screen.queryAllByTestId('category-limit-problem'), `${typed}: a mistyped amount is said when saving`).toEqual([]);
    await press(named('button', tc('Save changes')));
    expect(found('category-limit-problem').textContent, typed).toBe(tc(words));
  }
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  // Too long is said as it is typed; empty when saving.
  await typeInto(nameField(), 'ก'.repeat(81));
  expect(found('category-name-problem').textContent).toBe(tc('Use one line of up to 80 characters.'));
  await typeInto(nameField(), '');
  expect(screen.queryAllByTestId('category-name-problem')).toEqual([]);
  await press(named('button', tc('Add this category')));
  expect(found('category-name-problem').textContent).toBe(tc('Give the category a name.'));
  expect(document.body.textContent ?? '').not.toMatch(/\b(invalid|too_precise|zero|too_large|too_long|not_one_line|empty)\b/);
  await typeInto(nameField(), 'Boba');
  expect(screen.queryAllByTestId('category-name-problem'), 'the name problem goes as it is typed').toEqual([]);
  // A mistyped limit's problem goes when the type changes, as today's screen does.
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), 'abc');
  await press(named('button', tc('Add this category')));
  expect(found('category-limit-problem').textContent).toBe(tc('Enter an amount like 65 or 65.50'));
  await press(named('radio', say('categories.income'), found('category-tray')));
  await press(named('radio', say('categories.expense'), found('category-tray')));
  expect(screen.queryAllByTestId('category-limit-problem'), 'gone with the type change').toEqual([]);
  cleanup();
  // A budget already holding 100 limits takes no more.
  const full: BudgetDto = { ...BUDGET, overall_limit_minor: '100000000', category_limits: Array.from({ length: 100 }, (_, n) => ({ category_id: `0000000c-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`, limit_minor: '100' })) };
  await openScreen(board(undefined, [full]));
  await openTray(tileOf(FOOD));
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), '10');
  expect(found('category-limit-problem').textContent).toBe(tc('A budget holds up to 100 category limits.'));
}, 30_000);

test("M11: a catalogue section draws in the catalogue's language and theme", async () => {
  const section = WALLET_CATEGORY_SECTIONS.find((each) => each.id === 'bw-categories');
  expect(section, 'bw-categories').toBeDefined();
  mountInApp(
    <IntlProvider locale="en">
      <ThemePreferenceOverride preference="dark">{(section as { render(): ReactElement }).render()}</ThemePreferenceOverride>
    </IntlProvider>,
    'en',
  );
  await waitFor(() => expect(screen.queryAllByRole('heading', { name: say('categories.title', 'en') }), 'the English heading').not.toEqual([]), { timeout: 10_000 });
  expect(found('categories-screen').style.backgroundColor, 'the dark ground').toBe(rgba(walletDark.ground));
  // The catalogue's ช้อปปิ้ง has this suite's id, and is ฿310 over.
  expect(found(`category-over-${SHOPPING.id}`).textContent, "the board's over tile").toBe(say('categories.over', 'en', { amount: '฿310' }));
}, 30_000);

test("M12: the catalogue's four sections are wallet screens, in the plan's order", () => {
  const ids = WALLET_SECTIONS.map((each) => each.id);
  const at = ids.indexOf('bw-categories');
  expect(ids.slice(at, at + 4)).toEqual(['bw-categories', 'bw-category-new', 'bw-category-limit', 'bw-thai-pack']);
  expect(ids.indexOf('bw-wallets'), 'after the wallets list').toBeLessThan(at);
  expect(WALLET_CATEGORY_SECTIONS.map((each) => [each.group, each.layout])).toEqual(Array.from({ length: 4 }, () => ['Screens', 'screen']));
  for (const each of WALLET_CATEGORY_SECTIONS) expect(each.title).toMatch(/^Bun Wallet: /);
});

test('m3: a new opening shows no failure from the last one', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  fake.fail('createCategory', 'invalid');
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(tc('Could not save that. Try again.'));
  await press(named('button', say('common.close')));
  await openTray(tileOf(PETS));
  expect(screen.queryAllByTestId('category-tray-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('m6: archive asks first, and an archived category comes back with Unarchive', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('button', tc('Archive category')));
  expect(named('heading', tc('Archive {name}?', 'th', { name: 'Pets' }))).toBeTruthy();
  expect(found('category-archive-words').textContent).toBe(tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", 'th', { name: 'Pets' }));
  // Back returns to the form without sending.
  await press(named('button', say('common.back'), found('category-tray')));
  expect(fake.callsOf('archiveCategory')).toEqual([]);
  // A refused archive goes back to the form and says why, as today's sheet closes.
  await press(named('button', tc('Archive category')));
  fake.fail('archiveCategory', 'invalid');
  await press(named('button', tc('Archive')));
  expect(found('category-tray-problem').textContent).toBe(tc('Could not save that. Try again.'));
  nameField();
  await press(named('button', tc('Archive category')));
  await press(named('button', tc('Archive')));
  expect(fake.callsOf('archiveCategory').map((call) => call.args.slice(0, 2))).toEqual([[PETS.id, 1], [PETS.id, 1]]);
  expect(screen.queryAllByTestId(`category-tile-${PETS.id}`), 'archived: off the grid').toEqual([]);
  expect(found(`archived-category-${PETS.id}`)).toBeTruthy();
  await press(named('button', tc('Unarchive {name}', 'th', { name: 'Pets' })));
  expect(fake.callsOf('unarchiveCategory').map((call) => call.args.slice(0, 2))).toEqual([[PETS.id, 2]]);
  expect(tileOf(PETS), 'back on the grid').toBeTruthy();
}, 30_000);

test('R5 and R6: the type is chosen for a new category only, and a changed limit replaces the old one', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-type'), 'a new category picks its type').not.toEqual([]);
  await press(named('button', say('common.close')));
  await openTray(tileOf(FOOD));
  expect(screen.queryAllByTestId('category-type'), 'an existing one keeps its type').toEqual([]);
  await typeInto(limitField(), '7000');
  await press(named('button', tc('Save changes')));
  const [month, input, , existing] = fake.callsOf('setBudget')[0]?.args ?? [];
  expect(month).toBe(MONTH);
  expect(input).toEqual({
    overall_limit_minor: '2000000',
    category_limits: [
      { category_id: FOOD.id, limit_minor: '700000' },
      { category_id: TRAVEL.id, limit_minor: '10000' },
      { category_id: SHOPPING.id, limit_minor: '200000' },
    ].sort((a, b) => a.category_id.localeCompare(b.category_id)),
  });
  expect(existing).toEqual({ id: BUDGET.id, version: 4 });
}, 30_000);

test('m10 and the followup: an icon is kept only when it changes, and only with an account', async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, MERIT]);
  const view = await openScreen(fake);
  const iconsKey = `jotbun.account.${TEST_ACCOUNT_ID}.${CATEGORY_ICONS_NAME}`;
  // A pack category and a built-in show their own glyphs: saving them keeps none.
  await openTray(tileOf(MERIT));
  expect(named('radio', say('categories.glyphLotus')).getAttribute('aria-checked'), "the pack's lotus is shown").toBe('true');
  await press(named('radio', say('categories.swatchPink')));
  await press(named('button', tc('Save changes')));
  await openTray(tileOf(FOOD));
  await typeInto(nameField(), 'Meals');
  await press(named('button', tc('Save changes')));
  expect(view.stored.get(iconsKey), 'nothing kept for an unchanged glyph').toBeUndefined();
  // Only the glyph changed: kept at once, with nothing to send.
  await openTray(tileOf(FOOD));
  const updates = fake.callsOf('updateCategory').length;
  await press(named('radio', say('categories.glyphCoffee')));
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('updateCategory').length).toBe(updates);
  expect(JSON.parse(view.stored.get(iconsKey) ?? '{}')).toEqual({ [FOOD.id]: 'coffee' });
  cleanup();
  // With no account (the web) nothing could be kept, so no picker is offered.
  await openScreen(board(), { diary: null });
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-glyphs'), 'no icon picker without an account').toEqual([]);
}, 30_000);

test('m11: income tiles say what came in, never a limit', async () => {
  await openScreen();
  await press(named('radio', say('categories.income')));
  const salary = tileOf(SALARY);
  expect(salary.getAttribute('aria-label')).toBe(say('categories.tileIncome', 'th', { name: builtinName('Salary', 'th'), amount: baht('28,000', 'th') }));
  expect(screen.queryAllByTestId(`category-limit-${SALARY.id}`)).toEqual([]);
  expect(salary.textContent).not.toContain(say('categories.unlimited'));
});

test('m5: at AX5 each tile takes a row, grows with its words, and nothing is clamped', async () => {
  await openScreen(board(), { fontScale: AX5 });
  for (const category of [FOOD, SHOPPING, PETS]) {
    const tile = tileOf(category);
    expect((tile.parentElement as HTMLElement).children.length, `${category.id}: alone in its row`).toBe(1);
    expect([tile.style.minHeight, tile.style.height], category.id).toEqual(['104px', '']);
  }
  expect(found('categories-type').style.flexDirection, 'the segments stack').toBe('column');
  await openTray(tileOf(FOOD));
  for (const field of [nameField(), limitField()]) expect([field.style.minHeight, field.style.height]).toEqual(['44px', '']);
  await press(named('button', say('common.close')));
  await openTray(found('categories-new-tile'));
  expect(found('category-type').style.flexDirection, "the tray's segments stack").toBe('column');
  expect(seen.props.filter((props) => props.numberOfLines !== undefined), 'nothing clamped').toEqual([]);
}, 30_000);

// ---------------------------------------------------------------------------
// Carried from P2-T11's review (followups: its m2 and n5): the kit's glyph and
// initial, which this task's tiles and rows draw.

test('P2-T11 m2 (RV1): an unfilled ring is a stroke in the colour, 2 pt wide, with no fill', () => {
  const { container } = render(<CategoryGlyph glyph="paw" color="#111014" size={48} />);
  const rings = [...container.querySelectorAll('circle')];
  expect(rings.length).toBeGreaterThan(0);
  for (const ring of rings) expect([ring.getAttribute('stroke'), ring.getAttribute('stroke-width'), ring.getAttribute('fill')]).toEqual(['#111014', '2', 'none']);
});

test('P2-T11 m2 (RV2): every stroke has round caps and joins', () => {
  const { container } = render(<CategoryGlyph glyph="travel" color="#111014" size={48} />);
  const strokes = [...container.querySelectorAll('path')];
  expect(strokes.length).toBeGreaterThan(0);
  for (const stroke of strokes) expect([stroke.getAttribute('stroke-linecap'), stroke.getAttribute('stroke-linejoin')]).toEqual(['round', 'round']);
});

test("P2-T11 n5 (RV3): the tile's initial has Thai leading", () => {
  const category: CategoryDto = { ...PETS, label: 'ขนม' };
  mountWallet(<WalletCategoryIcon category={category} name="ขนม" size={52} />);
  const [initial] = screen.queryAllByText('ข');
  expect(initial, 'the initial').toBeDefined();
  expect(initial.style.lineHeight).toBe(`${walletLineHeight(Math.round((52 * 15) / 36), 'thai')}px`);
});

test('P2-T11 n5 (RV4, RV4s): a glyph drawn alone is hidden from screen readers', () => {
  const { container } = render(<CategoryGlyph glyph="food" color="#111014" size={48} />);
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
});

// The trays on their own, as a host other than the screen mounts them.
test("the trays mount on their own with the plan's props", async () => {
  mountWallet(<CategoryTray visible onClose={() => undefined} category={null} type="income" budget={BUDGET} />, { resources: board().shown });
  await settle();
  startAnimations();
  expect(named('heading', say('categories.new')).textContent, 'a new category is หมวดใหม่').toBe(say('categories.new'));
  expect(named('radio', say('categories.income')).getAttribute('aria-checked'), "a new category takes the host's type").toBe('true');
  expect(screen.queryAllByTestId('category-limit-section'), 'income has no limit').toEqual([]);
  cleanup();
  // Open from the start: nothing picked (n1). A picked item the host now reads as the person's is not added.
  const pack = mountWallet(<ThaiPackTray visible onClose={() => undefined} categories={[FOOD]} />, { resources: board().shown });
  await settle();
  startAnimations();
  expect(within(found('thai-pack-items')).queryAllByRole('checkbox', { checked: true }), 'nothing picked at first').toEqual([]);
  await press(found('thai-pack-delivery'));
  named('button', say('categories.packAddOne'));
  const delivery: CategoryDto = { ...PETS, id: '0000000c-0000-4000-8000-0000000000d1', label: 'เดลิเวอรี' };
  pack.rerender(<ThaiPackTray visible onClose={() => undefined} categories={[FOOD, delivery]} />);
  await settle();
  expect(named('button', say('categories.packAdd', 'th', { n: 0 })).getAttribute('aria-disabled'), 'not added once it is theirs').toBe('true');
});

test('a change made elsewhere says so, and Reload closes the tray so the grid reads again', async () => {
  const fake = board();
  await openScreen(fake);
  // Gone elsewhere (no copy of theirs).
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'not_found');
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(tc('This category changed on another device.'));
  expect(screen.queryAllByRole('button', { name: tc('Save changes') }), 'no Save on a stale draft').toEqual([]);
  expect(screen.queryAllByRole('button', { name: tc('Archive category') }), 'no archive on a stale draft').toEqual([]);
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  await press(named('button', tc('Reload')));
  expect(screen.queryAllByTestId('category-tray'), 'Reload closes the tray').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'and the grid reads again').toBe(reads + 1);
  // A version conflict with their copy says so too.
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'conflict', { current: { ...PETS, label: 'Animals', version: 2 } });
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(tc('This category changed on another device.'));
  // Reload closes it; opened again it starts clean.
  await press(named('button', tc('Reload')));
  await openTray(tileOf(PETS));
  expect(screen.queryAllByTestId('category-tray-problem'), 'no conflict from the last opening').toEqual([]);
  named('button', tc('Save changes'));
  await press(named('button', say('common.close')));
  // A refused pack add says so, and offers Reload, not Add.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  fake.fail('createCategory', 'invalid');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(tc('Could not save that. Try again.'));
  expect(screen.queryAllByRole('button', { name: say('categories.packAddOne') }), 'no Add after a refusal').toEqual([]);
  expect(found('thai-pack-lottery').getAttribute('aria-disabled'), 'nothing to pick after a refusal').toBe('true');
  // Reload closes it; opened again it starts clean.
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  expect(screen.queryAllByTestId('thai-pack-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('the limit switch: off removes the limit, and a month with no budget says why there is none', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(FOOD));
  const limitSwitch = named('switch', say('categories.setLimit'));
  expect(limitSwitch.getAttribute('aria-checked'), 'on: อาหาร has a limit').toBe('true');
  await press(limitSwitch);
  expect(screen.queryAllByRole('textbox', { name: say('categories.limitField') }), 'no field once off').toEqual([]);
  await press(named('button', tc('Save changes')));
  const [, input] = fake.callsOf('setBudget')[0]?.args ?? [];
  expect((input as { category_limits: { category_id: string }[] } | undefined)?.category_limits.map((limit) => limit.category_id), 'no limit for อาหาร').toEqual(
    [TRAVEL.id, SHOPPING.id].sort((a, b) => a.localeCompare(b)),
  );
  cleanup();
  await openScreen(board(undefined, []));
  await openTray(found('categories-new-tile'));
  expect(screen.queryAllByTestId('category-limit-section'), 'no limit without a budget').toEqual([]);
  expect(found('category-no-budget').textContent).toBe(tc("Category limits are part of a monthly budget. Set this month's budget first."));
}, 30_000);

test("the draft table holds the plan's Thai lines", () => {
  const plan: Readonly<Record<string, string>> = {
    'categories.title': 'หมวดหมู่',
    'categories.expense': 'รายจ่าย',
    'categories.income': 'รายรับ',
    'categories.packTitle': 'เพิ่มชุดหมวด',
    'categories.packName': 'ชีวิตประจำวันแบบไทย',
    'categories.packMore': 'และอีก {n} หมวด',
    'categories.builtins': 'หมวดตั้งต้น',
    'categories.thisMonth': 'เดือนนี้',
    'categories.custom': 'หมวดของคุณ',
    'categories.limit': 'งบ {amount}',
    'categories.over': 'เกิน {amount}',
    'categories.unlimited': 'ไม่จำกัด',
    'categories.tileLabel': '{name} ใช้ไป {spent} จากงบ {limit}',
    'categories.tileOver': '{name} ใช้ไป {spent} เกินงบ {over}',
    'categories.tileUnlimited': '{name} ใช้ไป {spent} ไม่จำกัดงบ',
    'categories.new': 'หมวดใหม่',
    'categories.limitsTotal': 'วงเงินทุกหมวดรวมกันจะเป็น {total} จากงบ {budget}',
    'categories.packHeading': 'ชุดหมวดแบบไทย',
    'categories.packIntro': 'หมวดที่ใช้กันทุกวันในไทย เลือกเฉพาะที่ใช่ แล้วเพิ่มทีเดียว',
    'categories.packPick': 'เลือกหมวดที่จะเพิ่ม',
    'categories.packHave': 'มีแล้ว',
    'categories.packNote': 'เพิ่มแล้วเป็นหมวดของคุณเหมือนหมวดอื่น เปลี่ยนชื่อ ไอคอน สี หรือเก็บถาวรได้ทุกเมื่อ',
    'categories.packAdd': 'เพิ่ม {n} หมวด',
    'pack.family_out': 'เงินที่โอนให้พ่อแม่หรือญาติ',
    'pack.merit': 'ใส่บาตร ทำบุญที่วัด หรือบริจาค',
    'pack.delivery': 'สั่งอาหารผ่านแอป รวมค่าส่ง',
    'pack.motorbike_rail': 'วิน BTS และ MRT แยกจากเดินทางอื่น',
    'pack.topup': 'เติมเงินหรือจ่ายค่าโทรรายเดือน',
    'pack.seven': 'ของกินของใช้จากร้านสะดวกซื้อ',
    'pack.lottery': 'สลากงวดวันที่ 1 และ 16',
    'pack.pets': 'อาหารและค่าหมอของสัตว์เลี้ยง',
    'pack.family_in': 'เงินที่พ่อแม่หรือญาติโอนมาให้',
  };
  expect(Object.fromEntries(Object.keys(plan).map((key) => [key, (COPY as Readonly<Record<string, { th: string }>>)[key]?.th]))).toEqual(plan);
});

test('a later refusal keeps what was accepted: the field says why, and saving again sends only what is left', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(found('categories-new-tile'));
  await typeInto(nameField(), 'Boba');
  await press(named('switch', say('categories.setLimit')));
  await typeInto(limitField(), '500');
  fake.fail('setBudget', 'invalid', { fields: { category_limits: 'errors.limits' } });
  await press(named('button', tc('Add this category')));
  expect(found('category-tray-problem').textContent).toBe(tc('Check the highlighted fields.'));
  expect(found('category-limit-problem').textContent).toBe(tc('Check this and try again.'));
  // Boba was accepted: the tray now saves changes to it.
  expect(named('button', tc('Save changes'))).toBeTruthy();
  await typeInto(limitField(), '400');
  expect(screen.queryAllByTestId('category-limit-problem'), 'the field problem goes as it is edited').toEqual([]);
  await press(named('button', tc('Save changes')));
  expect(fake.callsOf('createCategory').length, 'Boba is created once').toBe(1);
  expect(fake.callsOf('setBudget').length).toBe(2);
  expect(screen.queryAllByTestId('category-tray'), 'saved').toEqual([]);
}, 30_000);

test('m6: unarchive is one at a time, keeps Try again when unconfirmed, and says a change made elsewhere', async () => {
  const OLDER: CategoryDto = { ...OLD, id: '0000000c-0000-4000-8000-0000000000a6', label: 'Older hobby' };
  const OLDEST: CategoryDto = { ...OLD, id: '0000000c-0000-4000-8000-0000000000a7', label: 'Oldest hobby' };
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT, OLD, OLDER, OLDEST]);
  await openScreen(fake);
  const unarchive = (name: string) => named('button', tc('Unarchive {name}', 'th', { name }));
  // One at a time.
  const release = fake.hold('unarchiveCategory');
  await press(unarchive('Old hobby'));
  expect(unarchive('Older hobby').getAttribute('aria-disabled'), 'one at a time').toBe('true');
  release();
  await settle();
  expect(tileOf(OLD), 'back on the grid').toBeTruthy();
  // An answer that never came: Try again, under the same key.
  fake.loseResponse('unarchiveCategory');
  await press(unarchive('Older hobby'));
  expect(found('categories-unarchive-problem').textContent).toContain(NOT_CONFIRMED());
  expect(unarchive('Oldest hobby').getAttribute('aria-disabled'), 'frozen until the outcome is known').toBe('true');
  await press(named('button', say('common.tryAgain'), found('categories-unarchive-problem')));
  const keys = fake.callsOf('unarchiveCategory').map((call) => call.args[2]);
  expect(keys[2], 'the same key').toBe(keys[1]);
  expect(tileOf(OLDER), 'back on the grid').toBeTruthy();
  // Changed on another device: said, and Reload reads again.
  fake.fail('unarchiveCategory', 'conflict', { current: { ...OLDEST, version: 9 } });
  await press(unarchive('Oldest hobby'));
  expect(found('categories-unarchive-problem').textContent).toContain(tc('This category was archived on another device.'));
  const reads = fake.callsOf('ensureBuiltinCategories').length;
  await press(named('button', tc('Reload'), found('categories-unarchive-problem')));
  expect(screen.queryAllByTestId('categories-unarchive-problem'), 'cleared').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'read again').toBe(reads + 1);
}, 30_000);

test('blocked (an update is needed): the trays and Unarchive wait, and say why', async () => {
  const fake = board();
  await openScreen(fake);
  const UPDATE = tc('Update Jotbun to keep saving. Your changes are kept.');
  await openTray(tileOf(PETS));
  await press(named('radio', say('categories.swatchYellow')));
  fake.fail('updateCategory', 'upgrade_required');
  await press(named('button', tc('Save changes')));
  expect(found('category-tray-problem').textContent).toBe(UPDATE);
  expect(named('button', tc('Save changes')).getAttribute('aria-disabled'), 'Save waits').toBe('true');
  await press(named('button', tc('Archive category')));
  expect(named('button', tc('Archive')).getAttribute('aria-disabled'), 'Archive waits').toBe('true');
  await press(named('button', say('common.close')));
  // The pack tray: Reload after the refusal, and Add waits on the next opening.
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  fake.fail('createCategory', 'upgrade_required');
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(UPDATE);
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  expect(named('button', say('categories.packAddOne')).getAttribute('aria-disabled'), 'Add waits').toBe('true');
  await press(named('button', say('common.close')));
  // Unarchive.
  fake.fail('unarchiveCategory', 'upgrade_required');
  await press(named('button', tc('Unarchive {name}', 'th', { name: 'Old hobby' })));
  expect(found('categories-unarchive-problem').textContent).toBe(UPDATE);
  expect(named('button', tc('Unarchive {name}', 'th', { name: 'Old hobby' })).getAttribute('aria-disabled'), 'Unarchive waits').toBe('true');
}, 30_000);

test("a pack add that meets its own id with other fields says so, and the next opening starts clean", async () => {
  const fake = board([FOOD, TRAVEL, BILLS, SALARY, GIFT]);
  await openScreen(fake);
  await press(found('categories-pack'));
  await press(found('thai-pack-delivery'));
  const id = '0000000c-0000-4000-8000-0000000000e1';
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(id);
  fake.fail('createCategory', 'conflict', { current: { ...PETS, id, label: 'Something else' } });
  await press(named('button', say('categories.packAddOne')));
  expect(found('thai-pack-problem').textContent).toBe(tc('This category changed on another device.'));
  await press(named('button', tc('Reload')));
  await press(found('categories-pack'));
  expect(screen.queryAllByTestId('thai-pack-problem'), 'a fresh opening starts clean').toEqual([]);
}, 30_000);

test('m6: the archive question cannot be left while it sends', async () => {
  const fake = board();
  await openScreen(fake);
  await openTray(tileOf(PETS));
  await press(named('button', tc('Archive category')));
  const release = fake.hold('archiveCategory');
  await press(named('button', tc('Archive')));
  expect(within(found('category-tray')).queryAllByRole('button', { name: say('common.back') }), 'no Back while it sends').toEqual([]);
  release();
  await settle();
  expect(found(`archived-category-${PETS.id}`)).toBeTruthy();
}, 30_000);
