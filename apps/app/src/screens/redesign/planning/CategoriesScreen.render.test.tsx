// R4 Planning: the Categories screen (plan §6.2). Every state has a test: the
// loading and load problems, the grid for each type, no categories of your
// own yet, creating with the live preview, editing a built-in (back to its
// default name), saving, unconfirmed (frozen; Try again resends the same
// command and key), a conflict (theirs shown, then Reload), archive and
// unarchive, a limit with no monthly budget, a limit over the total and a
// label problem. Then Thai leading, the en/th/vi × light/dark matrix, target
// sizes, decorative art, reduced motion, the source scan and the catalogue's
// sections.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { CATEGORY_SECTIONS } from '@mobile/dev/catalogue/planning/categorySections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { translateCopy } from '@mobile/i18n/messages';
import type { Locale } from '@mobile/i18n/locales';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { MATRIX, hiddenFromScreenReaders, leading, mountScreen, rgb } from '../HistoryTestHarness';
import { CategoriesScreen } from './CategoriesScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-09-29T03:00:00Z');
const MONTH = '2026-09';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const [FOOD, TRAVEL, BILLS, SALARY, GIFT] = BUILTINS;
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
const OLD: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a2', type: 'expense', builtin_key: null, label: 'Old hobby', color: CATEGORY_COLORS[9], archived: true, version: 3 };
const BUDGET: BudgetDto = { id: '0000000d-0000-4000-8000-000000000001', month: MONTH, overall_limit_minor: '2000000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }], version: 4 };
const NOT_CONFIRMED = 'Not confirmed yet. Your changes are kept; try again.';
const OVER = "Category limits would add up to ฿20,000.01, more than this month's budget of ฿20,000.00.";

type Seed = { categories?: CategoryDto[]; budgets?: BudgetDto[] };
type MountOptions = { locale?: Locale; theme?: 'light' | 'dark' };

function fakeWith(seed: Seed = {}) {
  return createFakeResources({ wallets: goldenSeed().wallets, categories: seed.categories ?? [...BUILTINS, PETS, OLD], budgets: seed.budgets ?? [BUDGET] });
}
function mount(fake: ReturnType<typeof fakeWith>, { locale = 'en', theme = 'light' }: MountOptions = {}) {
  return mountScreen(<CategoriesScreen now={NOW} />, { resources: fake.resources, locale, mode: theme });
}
/** The grid, loaded. */
async function open(seed: Seed = {}, options: MountOptions = {}) {
  const fake = fakeWith(seed);
  mount(fake, options);
  await screen.findByRole('button', { name: translateCopy('New category', options.locale ?? 'en') });
  return fake;
}

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const nameField = () => screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
const limitField = () => screen.getByRole('textbox', { name: "This month's limit" }) as HTMLInputElement;
const type = (field: HTMLInputElement, text: string) => fireEvent.change(field, { target: { value: text } });
const footer = () => screen.getByTestId('categories-footer');
const grid = () => screen.getByTestId('categories-grid');
const tiles = () => within(grid()).getAllByRole('button').map((tile) => tile.getAttribute('aria-label'));
const preview = () => screen.getByTestId('category-preview');
const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked') === 'true';
/** Whether `element` or anything in it is filled with `hex` (as react-native-web writes it). */
function hasFill(element: HTMLElement, hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const pattern = new RegExp(`^rgba?\\(${r}, ${g}, ${b}(, 1(\\.0+)?)?\\)$`);
  return [element, ...element.querySelectorAll<HTMLElement>('*')].some((node) => pattern.test(node.style?.backgroundColor ?? ''));
}
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true' || (element as HTMLInputElement).readOnly === true;

async function startCreate(seed: Seed = {}) {
  const fake = await open(seed);
  press('New category');
  await screen.findByRole('heading', { name: 'New category' });
  return fake;
}
async function edit(tile: string, seed: Seed = {}) {
  const fake = await open(seed);
  press(tile);
  await screen.findByRole('heading', { name: 'Edit category' });
  return fake;
}

// ---------------------------------------------------------------------------
// Loading and load problems

test('loading: a spinner until the categories and this month\'s budget arrive', async () => {
  const fake = fakeWith();
  const release = fake.hold('ensureBuiltinCategories');
  mount(fake);
  expect(screen.getByLabelText('Loading your diary')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Categories' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'New category' })).toBeNull();
  release();
  expect(await screen.findByRole('button', { name: 'New category' })).toBeTruthy();
  expect(screen.queryByLabelText('Loading your diary')).toBeNull();
  expect(fake.callsOf('budget')[0].args).toEqual([MONTH]);
});

test('a load problem says so, and Try again loads again; offline is the same retryable problem', async () => {
  const fake = fakeWith();
  fake.fail('ensureBuiltinCategories', 'network');
  mount(fake);
  const alert = await screen.findByRole('alert');
  expect(within(alert).getByText("We couldn't load your diary.")).toBeTruthy();
  // Back still works; nothing else is offered.
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'New category' })).toBeNull();
  fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'New category' })).toBeTruthy();
  cleanup();
  const blocked = fakeWith();
  blocked.fail('budget', 'upgrade_required');
  mount(blocked);
  expect(await screen.findByText('Update Jotbun to keep using your diary. Nothing you saved is lost.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

// ---------------------------------------------------------------------------
// The grid

test('the grid: expense categories, built-in then your own, each with its icon or initial in its colour; Back goes back', async () => {
  await open();
  expect(screen.getByRole('heading', { name: 'Categories' })).toBeTruthy();
  const stage = screen.getByTestId('stage-header');
  expect(within(stage).getByRole('button', { name: 'Back' })).toBe(screen.getAllByRole('button')[0]);
  expect(checked('Expense')).toBe(true);
  expect(tiles()).toEqual(['Food', 'Travel, ฿3,000.00 a month', 'Bills', 'Pets']);
  // A built-in draws its own icon; your own category shows its initial. Both sit on the category's colour.
  const food = screen.getByRole('button', { name: 'Food' });
  expect(food.querySelector('svg')).toBeTruthy();
  const pets = screen.getByRole('button', { name: 'Pets' });
  expect(pets.querySelector('svg')).toBeNull();
  expect(within(pets).getByText('P')).toBeTruthy();
  expect(hasFill(food, FOOD.color as string)).toBe(true);
  expect(hasFill(pets, CATEGORY_COLORS[2])).toBe(true);
  // The archived are apart, collapsed.
  const archived = screen.getByRole('button', { name: 'Archived, 1' });
  expect(archived.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Old hobby')).toBeNull();
  expect(screen.queryByText('No categories of your own yet')).toBeNull();
  expect(within(footer()).getByRole('button', { name: 'New category' })).toBeTruthy();
  press('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('the grid: income categories on the switch, with nothing of your own yet', async () => {
  await open();
  choose('Income');
  expect(checked('Income')).toBe(true);
  expect(tiles()).toEqual(['Salary', 'Gift']);
  expect(screen.queryByRole('button', { name: /^Archived/ })).toBeNull();
  expect(screen.getByRole('heading', { name: 'No categories of your own yet' })).toBeTruthy();
  choose('Expense');
  expect(tiles()).toEqual(['Food', 'Travel, ฿3,000.00 a month', 'Bills', 'Pets']);
});

test('no categories of your own yet: the built-ins, and a line that says what New category is for', async () => {
  await open({ categories: [...BUILTINS] });
  expect(tiles()).toEqual(['Food', 'Travel, ฿3,000.00 a month', 'Bills']);
  expect(screen.getByRole('heading', { name: 'No categories of your own yet' })).toBeTruthy();
  expect(screen.getByText("Add one for anything the built-in categories don't cover.")).toBeTruthy();
  // The empty state adds no second action: New category stays the one primary.
  expect(screen.getAllByRole('button', { name: 'New category' })).toHaveLength(1);
  const art = screen.queryByTestId('empty-state-art');
  if (art) expect(hiddenFromScreenReaders(art)).toBe(true);
});

// ---------------------------------------------------------------------------
// Creating

test('creating: a name, a colour from the palette and a limit, with a live chip preview; Add this category sends one create, then the limit', async () => {
  const fake = await startCreate();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(checked('Expense')).toBe(true);
  expect(within(preview()).getByText('Your category')).toBeTruthy();
  expect(within(preview()).getByText('?')).toBeTruthy();
  expect(screen.getByLabelText('0 of 80 characters')).toBeTruthy();
  // Twelve swatches, each named in words; the first colour Expense does not use yet is chosen.
  const colours = within(screen.getByRole('radiogroup', { name: 'Colour' })).getAllByRole('radio');
  expect(colours.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Orange', 'Coral', 'Pink', 'Yellow', 'Blue', 'Lavender', 'Sky blue', 'Ocean blue', 'Lilac', 'Purple', 'Lime', 'Green']);
  expect(checked('Yellow')).toBe(true);
  type(nameField(), 'Coffee');
  expect(within(preview()).getByText('Coffee')).toBeTruthy();
  expect(within(preview()).getByText('C')).toBeTruthy();
  expect(screen.getByLabelText('6 of 80 characters')).toBeTruthy();
  choose('Lavender');
  expect(checked('Lavender')).toBe(true);
  expect(checked('Yellow')).toBe(false);
  expect(hasFill(preview(), CATEGORY_COLORS[5])).toBe(true);
  expect(hasFill(preview(), CATEGORY_COLORS[3])).toBe(false);
  expect(screen.getByText("Part of this month's budget of ฿20,000.00. Leave it empty for no limit.")).toBeTruthy();
  type(limitField(), '500');
  const add = within(footer()).getByRole('button', { name: 'Add this category' });
  expect(within(footer()).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  fireEvent.click(add);
  expect(await screen.findByRole('button', { name: 'Coffee, ฿500.00 a month' })).toBeTruthy();
  const [input, key] = fake.callsOf('createCategory')[0].args as [{ id: string }, string];
  expect(input).toEqual({ id: expect.stringMatching(UUID), type: 'expense', label: 'Coffee', color: CATEGORY_COLORS[5] });
  expect(key).toMatch(UUID);
  expect(key).not.toBe(input.id);
  // The month's budget is replaced at its version: the overall limit unchanged, the new limit added.
  const [month, budget, budgetKey, existing] = fake.callsOf('setBudget')[0].args;
  expect(month).toBe(MONTH);
  expect(budget).toEqual({
    overall_limit_minor: '2000000',
    category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }, { category_id: input.id, limit_minor: '50000' }].sort((a, b) => a.category_id.localeCompare(b.category_id)),
  });
  expect(existing).toEqual({ id: BUDGET.id, version: 4 });
  expect(budgetKey).not.toBe(key);
  const order = fake.calls.map((call) => call.method).filter((method) => method === 'createCategory' || method === 'setBudget');
  expect(order).toEqual(['createCategory', 'setBudget']);
  expect(screen.getByRole('status')).toHaveProperty('textContent', 'Saved.');
});

test('creating an income category: the type is chosen in the form, and income has no limit', async () => {
  const fake = await startCreate();
  choose('Income');
  expect(screen.queryByRole('textbox', { name: "This month's limit" })).toBeNull();
  type(nameField(), 'Tips');
  press('Add this category');
  expect(await screen.findByRole('button', { name: 'Tips' })).toBeTruthy();
  expect(checked('Income')).toBe(true);
  expect(fake.callsOf('createCategory')[0].args[0]).toMatchObject({ type: 'income', label: 'Tips' });
  expect(fake.callsOf('setBudget')).toHaveLength(0);
});

test('Cancel leaves the form without sending anything', async () => {
  const fake = await startCreate();
  type(nameField(), 'Coffee');
  press('Cancel');
  expect(await screen.findByRole('heading', { name: 'Categories' })).toBeTruthy();
  expect(fake.callsOf('createCategory')).toHaveLength(0);
  expect(tiles()).not.toContain('Coffee');
});

// ---------------------------------------------------------------------------
// Editing

test('editing a built-in: its default name as the placeholder, and "Use the default name" sends label null', async () => {
  const meals = { ...FOOD, label: 'Meals', version: 2 };
  const fake = await edit('Meals', { categories: [meals, TRAVEL, BILLS, SALARY, GIFT] });
  expect(nameField().value).toBe('Meals');
  expect(nameField().placeholder).toBe('Food');
  expect(within(preview()).getByText('Meals')).toBeTruthy();
  // Editing never changes the type.
  expect(screen.queryByRole('radiogroup', { name: 'Category type' })).toBeNull();
  press('Use the default name');
  expect(nameField().value).toBe('');
  expect(within(preview()).getByText('Food')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Use the default name' })).toBeNull();
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Food' })).toBeTruthy();
  const [id, version, changes, key] = fake.callsOf('updateCategory')[0].args;
  expect([id, version, changes]).toEqual([FOOD.id, 2, { label: null }]);
  expect(key).toMatch(UUID);
});

test('editing your own category sends only what changed, at the version read', async () => {
  const fake = await edit('Pets');
  expect(nameField().value).toBe('Pets');
  expect(checked('Pink')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Use the default name' })).toBeNull();
  choose('Green');
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Pets' })).toBeTruthy();
  expect(fake.callsOf('updateCategory')[0].args.slice(0, 3)).toEqual([PETS.id, 1, { color: CATEGORY_COLORS[11] }]);
  expect(fake.callsOf('setBudget')).toHaveLength(0);
  // Nothing changed: nothing is sent.
  press('Pets');
  await screen.findByRole('heading', { name: 'Edit category' });
  press('Save changes');
  await screen.findByRole('heading', { name: 'Categories' });
  expect(fake.callsOf('updateCategory')).toHaveLength(1);
});

test("this month's limit shows when the budget has one, and a change replaces the budget with the overall limit unchanged", async () => {
  const fake = await edit('Travel, ฿3,000.00 a month');
  expect(limitField().value).toBe('3000.00');
  type(limitField(), '2,500');
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Travel, ฿2,500.00 a month' })).toBeTruthy();
  expect(fake.callsOf('updateCategory')).toHaveLength(0);
  const [month, budget, , existing] = fake.callsOf('setBudget')[0].args;
  expect([month, budget, existing]).toEqual([MONTH, { overall_limit_minor: '2000000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '250000' }] }, { id: BUDGET.id, version: 4 }]);
  // Emptying the field removes the limit.
  press('Travel, ฿2,500.00 a month');
  await screen.findByRole('heading', { name: 'Edit category' });
  type(limitField(), '');
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Travel' })).toBeTruthy();
  expect(fake.callsOf('setBudget')[1].args[1]).toEqual({ overall_limit_minor: '2000000', category_limits: [] });
  expect(fake.callsOf('setBudget')[1].args[3]).toEqual({ id: BUDGET.id, version: 5 });
});

// ---------------------------------------------------------------------------
// Saving, unconfirmed and conflicts

test('saving: the action is busy and the form is locked until the answer', async () => {
  const fake = await edit('Pets');
  const release = fake.hold('updateCategory');
  type(nameField(), 'Cats');
  press('Save changes');
  const busy = await within(footer()).findByRole('button', { name: 'Saving…' });
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(disabled(nameField())).toBe(true);
  expect(disabled(screen.getByRole('radio', { name: 'Green' }))).toBe(true);
  release();
  expect(await screen.findByRole('button', { name: 'Cats' })).toBeTruthy();
});

test('unconfirmed: the form freezes, offers only Try again, and Try again resends the same command under the same key', async () => {
  const fake = await startCreate();
  fake.loseResponse('createCategory');
  type(nameField(), 'Coffee');
  press('Add this category');
  const message = await within(footer()).findByText(NOT_CONFIRMED);
  expect(message.style.fontWeight).toBe('700');
  expect(within(footer()).getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(within(footer()).queryByRole('button', { name: 'Add this category' })).toBeNull();
  expect(within(footer()).queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(disabled(nameField())).toBe(true);
  expect(disabled(screen.getByRole('radio', { name: 'Lavender' }))).toBe(true);
  expect(disabled(screen.getByRole('radio', { name: 'Income' }))).toBe(true);
  type(nameField(), 'Tea');
  expect(nameField().value).toBe('Coffee');
  press('Try again');
  expect(await screen.findByRole('button', { name: 'Coffee' })).toBeTruthy();
  const [first, second] = fake.callsOf('createCategory');
  expect(second.args[0]).toEqual(first.args[0]);
  expect(second.args[1]).toBe(first.args[1]);
  // The server kept one Coffee: the resend replayed the first one's receipt.
  expect([...fake.categories.values()].filter((category) => category.label === 'Coffee')).toHaveLength(1);
});

test('unconfirmed after the category saved: Try again resends only the budget command, with its own key', async () => {
  const fake = await edit('Pets');
  fake.fail('setBudget', 'network');
  type(nameField(), 'Cats');
  type(limitField(), '100');
  press('Save changes');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  press('Try again');
  expect(await screen.findByRole('button', { name: 'Cats, ฿100.00 a month' })).toBeTruthy();
  expect(fake.callsOf('updateCategory')).toHaveLength(1);
  const [first, second] = fake.callsOf('setBudget');
  expect(second.args).toEqual(first.args);
});

test('a definite refusal unfreezes the form, and the corrected save is a new command with a new key', async () => {
  const fake = await edit('Pets');
  fake.fail('updateCategory', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { label: 'errors.custom_category_needs_label' } });
  type(nameField(), 'Cats');
  press('Save changes');
  expect(await screen.findByText('Check this and try again.')).toBeTruthy();
  expect(nameField().getAttribute('aria-invalid')).toBe('true');
  expect(disabled(nameField())).toBe(false);
  type(nameField(), 'Dogs');
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Dogs' })).toBeTruthy();
  const [first, second] = fake.callsOf('updateCategory');
  expect(second.args[2]).toEqual({ label: 'Dogs' });
  expect(second.args[3]).not.toBe(first.args[3]);
});

test('a changed session blocks saving but keeps the draft; nothing is resent under another identity', async () => {
  const fake = await edit('Pets');
  fake.fail('updateCategory', 'session_changed');
  type(nameField(), 'Cats');
  press('Save changes');
  expect(await within(footer()).findByText('Your session changed. Sign in again to save.')).toBeTruthy();
  expect(nameField().value).toBe('Cats');
  const save = within(footer()).getByRole('button', { name: 'Save changes' });
  expect(save.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(save);
  expect(fake.callsOf('updateCategory')).toHaveLength(1);
});

test('a conflict shows the category as it now is beside yours, and Reload shows theirs', async () => {
  const fake = await edit('Pets');
  fake.categories.set(PETS.id, { ...PETS, label: 'Dogs', color: CATEGORY_COLORS[11], version: 2 });
  type(nameField(), 'Cats');
  press('Save changes');
  const panel = await screen.findByTestId('categories-conflict');
  expect(within(panel).getByRole('heading', { name: 'This category changed on another device.' })).toBeTruthy();
  expect(within(panel).getByLabelText('Name. Yours: Cats. On the server: Dogs.')).toBeTruthy();
  expect(within(panel).getByLabelText('Colour. Yours: Pink. On the server: Green.')).toBeTruthy();
  expect(fake.callsOf('updateCategory')).toHaveLength(1);
  fireEvent.click(within(panel).getByRole('button', { name: 'Reload' }));
  expect(await screen.findByRole('button', { name: 'Dogs' })).toBeTruthy();
  expect(screen.queryByTestId('categories-conflict')).toBeNull();
  expect(fake.callsOf('updateCategory')).toHaveLength(1);
});

test("a budget changed elsewhere shows this month's limit and budget as they now are, and Reload", async () => {
  const fake = await edit('Travel, ฿3,000.00 a month');
  fake.budgets.set(MONTH, { ...BUDGET, overall_limit_minor: '2500000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '400000' }], version: 5 });
  type(limitField(), '3500');
  press('Save changes');
  const panel = await screen.findByTestId('categories-conflict');
  expect(within(panel).getByRole('heading', { name: "This month's budget changed on another device." })).toBeTruthy();
  expect(within(panel).getByLabelText("This month's limit. Yours: ฿3,500.00. On the server: ฿4,000.00.")).toBeTruthy();
  expect(within(panel).getByLabelText("This month's budget. Yours: ฿20,000.00. On the server: ฿25,000.00.")).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Reload' }));
  expect(await screen.findByRole('button', { name: 'Travel, ฿4,000.00 a month' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Archive and unarchive

test('archive asks first, saying what archiving does; then the category moves to Archived', async () => {
  const fake = await edit('Pets');
  press('Archive category');
  const sheet = await screen.findByRole('dialog', { name: 'Archive Pets?' });
  expect(within(sheet).getByText("Pets won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.")).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive Pets?' })).toBeNull());
  expect(fake.callsOf('archiveCategory')).toHaveLength(0);
  press('Archive category');
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Pets?' })).getByRole('button', { name: 'Archive' }));
  expect(await screen.findByRole('button', { name: 'Archived, 2' })).toBeTruthy();
  expect(tiles()).not.toContain('Pets');
  const [id, version, key] = fake.callsOf('archiveCategory')[0].args;
  expect([id, version]).toEqual([PETS.id, 1]);
  expect(key).toMatch(UUID);
  expect(screen.getByRole('status')).toHaveProperty('textContent', 'Pets is archived.');
});

test('archived: the section opens to each archived category, and Unarchive brings it back', async () => {
  const fake = await open();
  press('Archived, 1');
  expect(screen.getByRole('button', { name: 'Archived, 1' }).getAttribute('aria-expanded')).toBe('true');
  const list = screen.getByTestId('categories-archived');
  expect(within(list).getByText('Old hobby')).toBeTruthy();
  // An archived category cannot be changed, so it is not a tile that opens the form.
  expect(tiles()).not.toContain('Old hobby');
  fireEvent.click(within(list).getByRole('button', { name: 'Unarchive Old hobby' }));
  expect(await screen.findByRole('button', { name: 'Old hobby' })).toBeTruthy();
  expect(fake.callsOf('unarchiveCategory')[0].args.slice(0, 2)).toEqual([OLD.id, 3]);
  expect(screen.queryByRole('button', { name: /^Archived/ })).toBeNull();
  expect(screen.getByRole('status')).toHaveProperty('textContent', 'Old hobby is back in Quick add.');
});

test('an unconfirmed unarchive freezes the grid; Try again resends the same command and key', async () => {
  const fake = await open();
  fake.fail('unarchiveCategory', 'network');
  press('Archived, 1');
  press('Unarchive Old hobby');
  expect(await within(footer()).findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(within(footer()).queryByRole('button', { name: 'New category' })).toBeNull();
  expect(disabled(screen.getByRole('button', { name: 'Food' }))).toBe(true);
  expect(disabled(screen.getByRole('radio', { name: 'Income' }))).toBe(true);
  press('Try again');
  expect(await screen.findByRole('button', { name: 'Old hobby' })).toBeTruthy();
  const [first, second] = fake.callsOf('unarchiveCategory');
  expect(second.args).toEqual(first.args);
});

// ---------------------------------------------------------------------------
// The limit's rules

test('a limit with no monthly budget: it says a budget comes first and links to Budget, and creates none', async () => {
  const fake = await edit('Food', { budgets: [] });
  expect(screen.queryByRole('textbox', { name: "This month's limit" })).toBeNull();
  expect(screen.getByText('No budget this month')).toBeTruthy();
  expect(screen.getByText("Category limits are part of a monthly budget. Set this month's budget first.")).toBeTruthy();
  press('Set a monthly budget');
  expect(router.push).toHaveBeenCalledWith('/spend/budget');
  type(nameField(), 'Meals');
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Meals' })).toBeTruthy();
  expect(fake.callsOf('setBudget')).toHaveLength(0);
});

test('a limit over the total is said inline as it is typed, and nothing is sent', async () => {
  const fake = await edit('Food');
  type(limitField(), '17000.01');
  expect(screen.getByText(OVER)).toBeTruthy();
  expect(limitField().getAttribute('aria-invalid')).toBe('true');
  press('Save changes');
  expect(fake.callsOf('setBudget')).toHaveLength(0);
  expect(fake.callsOf('updateCategory')).toHaveLength(0);
  type(limitField(), '17000');
  expect(screen.queryByText(OVER)).toBeNull();
  press('Save changes');
  expect(await screen.findByRole('button', { name: 'Food, ฿17,000.00 a month' })).toBeTruthy();
  expect(fake.callsOf('setBudget')).toHaveLength(1);
});

test('a limit must be an exact amount above zero', async () => {
  const fake = await edit('Food');
  type(limitField(), '0');
  press('Save changes');
  expect(await screen.findByText('Enter an amount above zero')).toBeTruthy();
  type(limitField(), '12.345');
  press('Save changes');
  expect(await screen.findByText('Use at most two decimal places')).toBeTruthy();
  expect(fake.callsOf('setBudget')).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// The label's rules

test('a label problem: an empty name is refused before sending, a long one as it is typed', async () => {
  const fake = await startCreate();
  press('Add this category');
  expect(await screen.findByText('Give the category a name.')).toBeTruthy();
  expect(nameField().getAttribute('aria-invalid')).toBe('true');
  expect(fake.callsOf('createCategory')).toHaveLength(0);
  type(nameField(), 'x'.repeat(81));
  expect(screen.getByText('Use one line of up to 80 characters.')).toBeTruthy();
  expect(screen.getByLabelText('81 of 80 characters')).toBeTruthy();
  press('Add this category');
  expect(fake.callsOf('createCategory')).toHaveLength(0);
  type(nameField(), '  Tea  ');
  expect(screen.queryByText('Use one line of up to 80 characters.')).toBeNull();
  press('Add this category');
  expect(await screen.findByRole('button', { name: 'Tea' })).toBeTruthy();
  expect(fake.callsOf('createCategory')[0].args[0]).toMatchObject({ label: 'Tea' });
});

test('the name field is one line', async () => {
  await startCreate();
  expect(nameField().tagName).toBe('INPUT');
});

// ---------------------------------------------------------------------------
// Thai, the locale and theme matrix, accessibility and motion

test('Thai: built-in names are translated and the text keeps Thai leading', async () => {
  await open({}, { locale: 'th' });
  const th = (english: string) => translateCopy(english, 'th');
  const title = screen.getByRole('heading', { name: th('Categories') });
  expect(title.style.lineHeight).toBe(leading('title', 'th'));
  const food = screen.getByRole('button', { name: th('Food') });
  expect(within(food).getByText(th('Food')).style.lineHeight).toBe(leading('caption', 'th'));
  expect(screen.getByRole('radio', { name: th('Expense') })).toBeTruthy();
  fireEvent.click(food);
  const field = await screen.findByRole('textbox', { name: th('Name') });
  expect((field as HTMLInputElement).placeholder).toBe(th('Food'));
  expect(field.style.lineHeight).toBe(leading('body', 'th'));
});

test.each(MATRIX)('reads in $locale, $mode, in palette colours', async ({ locale, mode, colors }) => {
  const say = (english: string) => translateCopy(english, locale);
  await open({}, { locale, theme: mode });
  expect(screen.getByTestId('categories-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByRole('heading', { name: say('Categories') }).style.lineHeight).toBe(leading('title', locale));
  expect(screen.getByRole('radio', { name: say('Expense') }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('button', { name: say('Food') })).toBeTruthy();
  const add = within(footer()).getByRole('button', { name: say('New category') });
  expect(add.style.backgroundColor).toEqual(rgb(colors.ink));
});

test('every control is at least 44 pt and has a role and a name; a swatch is a radio named for its colour', async () => {
  const size = (element: HTMLElement) => Math.max(Number.parseFloat(element.style.minHeight || '0'), Number.parseFloat(element.style.height || '0'));
  const audit = () => {
    for (const role of ['button', 'radio', 'textbox'] as const) {
      for (const control of screen.queryAllByRole(role)) {
        expect(size(control), `${role} ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
        expect((control.getAttribute('aria-label') ?? control.textContent ?? '').trim(), role).not.toBe('');
      }
    }
  };
  await open();
  press('Archived, 1');
  audit();
  press('Pets');
  await screen.findByRole('heading', { name: 'Edit category' });
  audit();
  const swatch = screen.getByRole('radio', { name: 'Pink' });
  expect(Number.parseFloat(swatch.style.minWidth)).toBeGreaterThanOrEqual(44);
  expect(swatch.closest('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Colour');
});

test('decorative art is hidden from screen readers: icons, initials and the preview', async () => {
  await open();
  for (const svg of screen.getByTestId('categories-screen').querySelectorAll('svg')) expect(hiddenFromScreenReaders(svg)).toBe(true);
  expect(hiddenFromScreenReaders(within(screen.getByRole('button', { name: 'Pets' })).getByText('P'))).toBe(true);
  press('New category');
  await screen.findByRole('heading', { name: 'New category' });
  expect(hiddenFromScreenReaders(preview())).toBe(true);
});

test('reduced motion: switching type, choosing a colour and the archive sheet move without a spring', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const spring = vi.spyOn(Animated, 'spring');
  await edit('Pets');
  await act(async () => { await Promise.resolve(); });
  choose('Green');
  press('Archive category');
  await screen.findByRole('dialog', { name: 'Archive Pets?' });
  expect(spring).not.toHaveBeenCalled();
  cleanup();
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  await open();
  await act(async () => { await Promise.resolve(); });
  choose('Income');
  expect(spring).toHaveBeenCalled();
});

test('the screen draws with palette tokens only, and keeps money out of floating point', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = ['CategoriesScreen.tsx', 'CategoryParts.tsx'].map((file) => {
    const path = join(here, file);
    expect(existsSync(path), file).toBe(true);
    return [file, readFileSync(path, 'utf8')] as const;
  });
  for (const [file, source] of sources) {
    expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source, file).not.toMatch(/rgba?\(/);
    expect(source, file).not.toMatch(/parseFloat|parseInt|toFixed|Number\(|Math\./);
  }
  // The parts draw with the theme's tokens; the screen draws through the parts and the kit.
  expect(sources[1][1]).toMatch(/useBunColors\(\)/);
});

// ---------------------------------------------------------------------------
// The catalogue's sections (registered by the main session)

const SECTIONS: readonly (readonly [string, string, (tc: (english: string) => string) => string])[] = [
  ['categories-loading', 'Categories: loading', (tc) => tc('Loading your diary')],
  ['categories-load-problem', 'Categories: load problem', (tc) => tc("We couldn't load your diary.")],
  ['categories-expense', 'Categories: expense', (tc) => tc('Archived')],
  ['categories-income', 'Categories: income', (tc) => tc('Salary')],
  ['categories-no-custom', 'Categories: no custom yet', (tc) => tc('No categories of your own yet')],
  ['categories-create', 'Categories: creating', (tc) => tc('Lavender')],
  ['categories-edit-builtin', 'Categories: editing a built-in', (tc) => tc('Use the default name')],
  ['categories-saving', 'Categories: saving', (tc) => tc('Saving…')],
  ['categories-unconfirmed', 'Categories: unconfirmed', (tc) => tc(NOT_CONFIRMED)],
  ['categories-conflict', 'Categories: conflict', (tc) => tc('This category changed on another device.')],
  ['categories-archived', 'Categories: archived', (tc) => tc('Old hobby')],
  ['categories-archive-confirm', 'Categories: archive confirm', (tc) => tc('Archive {name}?').replace('{name}', 'Pets')],
  ['categories-limit-no-budget', 'Categories: limit, no budget', (tc) => tc("Category limits are part of a monthly budget. Set this month's budget first.")],
  ['categories-limit-over', 'Categories: limit over the total', () => OVER],
  ['categories-label-error', 'Categories: label error', (tc) => tc('Give the category a name.')],
];

test('the catalogue has one section per state, with categories-… ids and Categories: … titles', () => {
  expect(CATEGORY_SECTIONS.map((section) => [section.id, section.title, section.group, section.layout])).toEqual(SECTIONS.map(([id, title]) => [id, title, 'Screens', 'screen']));
});

test.each(SECTIONS)('catalogue section %s reaches its state in English and Thai, without errors', async (id, _title, shows) => {
  const section = CATEGORY_SECTIONS.find((candidate) => candidate.id === id);
  expect(section, id).toBeDefined();
  if (!section) return;
  for (const locale of ['en', 'th'] as const) {
    const errors = vi.spyOn(console, 'error');
    const view = mountInApp(<>{section.render()}</>, locale);
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-stopped'), screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? '').toBeNull();
    const tc = (english: string) => translateCopy(english, locale);
    expect(screen.queryAllByText(shows(tc)).length + screen.queryAllByLabelText(shows(tc)).length, id).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    view.unmount();
  }
}, 60_000);

// Categories opens from Budget: with nothing to go back to, Back goes there.
test('Back goes back, or to Budget with nothing to go back to', async () => {
  await open();
  fireEvent.click(within(screen.getByTestId('stage-header')).getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  fireEvent.click(within(screen.getByTestId('stage-header')).getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenLastCalledWith('/spend/budget');
});
