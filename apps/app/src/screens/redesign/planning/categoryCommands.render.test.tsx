// The categories' commands, moved out of CategoriesScreen.tsx (plan P2-T29,
// W2), keep today's screen as it was: its suite runs unchanged, and these
// cases hold what it does not cover:
// - when an archive is not confirmed, or is refused, the archive sheet
//   closes, so the footer's words (and Try again) are seen (the review of
//   P2-T29, M1; its probes A1 and A2);
// - a category changed on another device closes the form and reads again;
// - once the category is accepted and the budget refused, the form is
//   rebased on it, so saving again sends only the budget.
// The moved hook tells the screen every way a send stops. Same setup as
// CategoriesScreen.render.test.tsx.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import { CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { mountScreen } from '../HistoryTestHarness';
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
const [, TRAVEL] = BUILTINS;
const PETS: CategoryDto = { id: '0000000c-0000-4000-8000-0000000000a1', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[2], archived: false, version: 1 };
const BUDGET: BudgetDto = { id: '0000000d-0000-4000-8000-000000000001', month: '2026-09', overall_limit_minor: '2000000', category_limits: [{ category_id: TRAVEL.id, limit_minor: '300000' }], version: 4 };
const NOT_CONFIRMED = 'Not confirmed yet. Your changes are kept; try again.';

/** The element with this role and name, which must be there. */
async function named(role: string, name: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.queryByRole(role, { name }), `a ${role} named ${name}`).not.toBeNull());
  return screen.queryByRole(role, { name }) as HTMLElement;
}

/** Pets' form, open, on the routed Bun diary screen. */
async function editPets() {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, categories: [...BUILTINS, PETS], budgets: [BUDGET] });
  mountScreen(<CategoriesScreen now={NOW} />, { resources: fake.resources, locale: 'en', mode: 'light' });
  fireEvent.click(await named('button', 'Pets'));
  await named('heading', 'Edit category');
  return fake;
}

async function confirmArchive() {
  fireEvent.click(await named('button', 'Archive category'));
  const sheet = await named('dialog', 'Archive Pets?');
  const archive = within(sheet).queryByRole('button', { name: 'Archive' });
  expect(archive, 'the sheet asks with Archive').not.toBeNull();
  fireEvent.click(archive as HTMLElement);
}

test('an archive that is not confirmed closes the sheet and offers Try again', async () => {
  const fake = await editPets();
  fake.fail('archiveCategory', 'network');
  await confirmArchive();
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText(NOT_CONFIRMED), 'the footer says so').not.toBeNull());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive Pets?' }), 'the archive sheet closes').toBeNull());
  expect(within(screen.getByTestId('categories-footer')).queryByRole('button', { name: 'Try again' }), 'Try again').not.toBeNull();
});

test('an archive that is refused closes the sheet and says why', async () => {
  const fake = await editPets();
  fake.fail('archiveCategory', 'invalid');
  await confirmArchive();
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('Could not save that. Try again.'), 'the footer says why').not.toBeNull());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive Pets?' }), 'the archive sheet closes').toBeNull());
});

/** The field with this name, which must be there. */
async function field(name: string): Promise<HTMLInputElement> {
  return (await named('textbox', name)) as HTMLInputElement;
}

test('a category changed on another device closes the form, says so, and reads the grid again', async () => {
  const fake = await editPets();
  fake.fail('updateCategory', 'not_found');
  fireEvent.change(await field('Name'), { target: { value: 'Cats' } });
  fireEvent.click(await named('button', 'Save changes'));
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('This category changed on another device.'), 'said').not.toBeNull());
  expect(screen.queryAllByRole('heading', { name: 'Edit category' }), 'the form closes').toEqual([]);
  expect(fake.callsOf('ensureBuiltinCategories').length, 'read again').toBe(2);
});

test('once the category is accepted and the budget refused, saving again sends only the budget', async () => {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, categories: [...BUILTINS, PETS], budgets: [BUDGET] });
  mountScreen(<CategoriesScreen now={NOW} />, { resources: fake.resources, locale: 'en', mode: 'light' });
  fireEvent.click(await named('button', 'New category'));
  fireEvent.change(await field('Name'), { target: { value: 'Boba' } });
  fireEvent.change(await field("This month's limit"), { target: { value: '100' } });
  fake.fail('setBudget', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_limits: 'errors.limits' } });
  fireEvent.click(await named('button', 'Add this category'));
  await waitFor(() => expect(within(screen.getByTestId('categories-footer')).queryByText('Check the highlighted fields.'), 'the refusal').not.toBeNull());
  // Boba was accepted: the form now changes it.
  fireEvent.change(await field("This month's limit"), { target: { value: '50' } });
  fireEvent.click(await named('button', 'Save changes'));
  await waitFor(() => expect(fake.callsOf('setBudget').length, 'the budget again').toBe(2));
  expect(fake.callsOf('createCategory').length, 'Boba is created once').toBe(1);
});
