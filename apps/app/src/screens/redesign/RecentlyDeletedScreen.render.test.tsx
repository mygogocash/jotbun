import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { DeletedHistoryPage, TransactionDto } from '@gogospend/contracts';
import { translateCopy } from '@mobile/i18n/messages';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { RecentlyDeletedScreen } from './RecentlyDeletedScreen';
import { DIARY_REFERENCES, FOOD_ID, MATRIX, NOW, RENT, SALARY_ID, extraRecords, hiddenFromScreenReaders, leading, mountScreen, rgb } from './HistoryTestHarness';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';
const DISCLOSURE = 'Deleted entries can be restored for 30 days. After that, they are gone for good.';
/** How RecordRow reads a deleted row (it has no actions of its own here). */
const ROWS = { rent: 'Bills, Expense ฿12,268.00, Daily account · Rent', food: 'Food, Expense ฿182.00, Cash' } as const;
const RESTORE = { rent: 'Restore Bills, Expense ฿12,268.00', food: 'Restore Food, Expense ฿182.00' } as const;

/**
 * The golden diary with rent deleted yesterday, food nine days ago, and the
 * salary 59 days ago: the server would have left that one out, and this
 * device's clock leaves it out too.
 */
function deletedSeed(extra: TransactionDto[] = []): TransactionDto[] {
  const seed = goldenSeed();
  const when: Record<string, string> = { [RENT]: '2026-09-28T03:00:00.000Z', [FOOD_ID]: '2026-09-20T03:00:00.000Z', [SALARY_ID]: '2026-08-01T03:00:00.000Z' };
  return [...seed.records.map((record) => (when[record.id] ? { ...record, deleted_at: when[record.id], version: 2 } : record)), ...extra];
}

async function mount(options: { records?: TransactionDto[]; wrap?: (resources: SpendV1Resources) => SpendV1Resources; locale?: string; mode?: 'light' | 'dark'; diary?: ReturnType<typeof createFakeDiary> } = {}) {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, records: options.records ?? deletedSeed() });
  const resources = options.wrap ? options.wrap(fake.resources) : fake.resources;
  mountScreen(<RecentlyDeletedScreen now={NOW} />, { resources, locale: options.locale, mode: options.mode, diary: options.diary?.diary ?? null });
  return fake;
}

/** Deleted rows on screen, in order: RecordRow names its row by title, amount and wallet (a Restore button's name starts "Restore"). */
const deletedRows = () => screen.queryAllByLabelText(/^(?!Restore )[^,]+, (Expense|Income|Transfer) ฿/).map((row) => row.getAttribute('aria-label'));

test('lists what was deleted in the last 30 days, newest deletion first, under the retention notice', async () => {
  const fake = await mount();
  expect(await screen.findByLabelText(ROWS.rent)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Recently deleted' })).toBeTruthy();
  // The retention policy, in words, before anything can be restored.
  expect(screen.getByText(DISCLOSURE)).toBeTruthy();
  expect(deletedRows()).toEqual([ROWS.rent, ROWS.food]);
  expect(screen.getByText('29 days left to restore')).toBeTruthy();
  expect(screen.getByText('21 days left to restore')).toBeTruthy();
  // Past the window on this device's clock: no row, so no restore that would be refused.
  expect(screen.queryByLabelText(/^Salary,/)).toBeNull();
  expect(screen.getByRole('button', { name: RESTORE.rent })).toBeTruthy();
  expect(screen.getByRole('button', { name: RESTORE.food })).toBeTruthy();
  // Deleted rows are not active entries: no Edit, Copy or Delete, and no record to open.
  expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  expect(fake.callsOf('recentlyDeleted')[0].args).toEqual([undefined, 50]);
});

test('Restore sends the entry\'s own version under its own key, takes it off the list and says where it went', async () => {
  const fake = await mount();
  fireEvent.click(await screen.findByRole('button', { name: RESTORE.rent }));
  expect(await screen.findByText('Bills ฿12,268.00 is back in History.')).toBeTruthy();
  await waitFor(() => expect(deletedRows()).toEqual([ROWS.food]));
  const [restore] = fake.callsOf('restoreTransaction');
  expect(restore.args.slice(0, 2)).toEqual([RENT, 2]);
  expect(restore.args[2]).toEqual(expect.any(String));
  expect(fake.records.get(RENT)?.deleted_at).toBeNull();
  // The list is read again, in place.
  await waitFor(() => expect(fake.callsOf('recentlyDeleted')).toHaveLength(2));
  // A second restore is its own command.
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText('Food ฿182.00 is back in History.')).toBeTruthy();
  const [, second] = fake.callsOf('restoreTransaction');
  expect(second.args.slice(0, 2)).toEqual([FOOD_ID, 2]);
  expect(second.args[2]).not.toBe(restore.args[2]);
});

test('an unconfirmed restore is frozen: only Try again, which resends the same command', async () => {
  const fake = await mount();
  fake.loseResponse('restoreTransaction');
  fireEvent.click(await screen.findByRole('button', { name: RESTORE.rent }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  // Still listed, and no other restore can start while this one is unknown.
  expect(deletedRows()).toEqual([ROWS.rent, ROWS.food]);
  expect(screen.getByRole('button', { name: RESTORE.food }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Bills ฿12,268.00 is back in History.')).toBeTruthy();
  const [first, second] = fake.callsOf('restoreTransaction');
  expect(second.args).toEqual(first.args);
  await waitFor(() => expect(deletedRows()).toEqual([ROWS.food]));
  expect(screen.getByRole('button', { name: RESTORE.food }).getAttribute('aria-disabled')).not.toBe('true');
});

/** Every read of the list suggests a refresh, so Refresh is on screen. */
const refreshSuggested = (resources: SpendV1Resources): SpendV1Resources => ({
  ...resources,
  recentlyDeleted: async (...args) => ({ ...(await resources.recentlyDeleted(...args)), refresh_suggested: true }) as DeletedHistoryPage,
});

test('an unconfirmed restore that did commit stops holding the other Restores once a reload no longer lists it', async () => {
  const fake = await mount({ wrap: refreshSuggested });
  fake.loseResponse('restoreTransaction');
  fireEvent.click(await screen.findByRole('button', { name: RESTORE.rent }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(screen.getByRole('button', { name: RESTORE.food }).getAttribute('aria-disabled')).toBe('true');
  // It committed: Refresh reads the list without it.
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(deletedRows()).toEqual([ROWS.food]));
  expect(screen.getByRole('button', { name: RESTORE.food }).getAttribute('aria-disabled')).not.toBe('true');
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText('Food ฿182.00 is back in History.')).toBeTruthy();
  expect(fake.callsOf('restoreTransaction').map((call) => call.args[0])).toEqual([RENT, FOOD_ID]);
});

test('the same after a failed reload and its Try again', async () => {
  const fake = await mount({ wrap: refreshSuggested });
  fake.loseResponse('restoreTransaction');
  fireEvent.click(await screen.findByRole('button', { name: RESTORE.rent }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  fake.fail('recentlyDeleted', 'network');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(deletedRows()).toEqual([ROWS.food]));
  expect(screen.getByRole('button', { name: RESTORE.food }).getAttribute('aria-disabled')).not.toBe('true');
});

test('a refused restore says why in plain words and reads the list again', async () => {
  const fake = await mount();
  // Past the window (or purged) on the server.
  fake.fail('restoreTransaction', 'deleted', { status: 409, code: 'ENTITY_DELETED' });
  fireEvent.click(await screen.findByRole('button', { name: RESTORE.rent }));
  expect(await screen.findByText('This entry can no longer be restored.')).toBeTruthy();
  await waitFor(() => expect(fake.callsOf('recentlyDeleted')).toHaveLength(2));
  // Its category is archived.
  fake.fail('restoreTransaction', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_id: 'errors.category_archived' } });
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText("This entry's wallet or category is archived. Unarchive it, then restore the entry.")).toBeTruthy();
  // Its wallet is gone, or its category is for the other type: not archived, so nothing to unarchive.
  fake.fail('restoreTransaction', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { wallet_id: 'errors.wallet_not_found' } });
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText("This entry can't be restored: its wallet no longer exists.")).toBeTruthy();
  fake.fail('restoreTransaction', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { category_id: 'errors.category_type_mismatch' } });
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText("This entry can't be restored: its category is for the other type (expense or income).")).toBeTruthy();
  // Restored on another device meanwhile.
  fake.fail('restoreTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT' });
  fireEvent.click(screen.getByRole('button', { name: RESTORE.food }));
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  // A refusal is definite: the next press is a new command.
  const keys = fake.callsOf('restoreTransaction').map((call) => call.args[2]);
  expect(new Set(keys).size).toBe(5);
});

test('with nothing deleted it says so, and still says how long deleted entries are kept', async () => {
  await mount({ records: goldenSeed().records });
  expect(await screen.findByText('Nothing deleted in the last 30 days')).toBeTruthy();
  expect(screen.getByText('Entries you delete show up here.')).toBeTruthy();
  expect(screen.getByText(DISCLOSURE)).toBeTruthy();
  const bun = screen.getByTestId('recently-deleted-empty-bun');
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  expect(deletedRows()).toEqual([]);
  cleanup();
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'off');
  await mount({ records: goldenSeed().records });
  expect(await screen.findByText('Nothing deleted in the last 30 days')).toBeTruthy();
  expect(screen.queryByTestId('recently-deleted-empty-bun')).toBeNull();
});

test('pages through every deleted entry with Load more', async () => {
  const many = extraRecords().map((record, i) => ({ ...record, deleted_at: `2026-09-25T00:00:${String(i).padStart(2, '0')}.000Z`, version: 2 }));
  const fake = await mount({ records: [...goldenSeed().records, ...many] });
  await waitFor(() => expect(deletedRows()).toHaveLength(50));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(deletedRows()).toHaveLength(60));
  expect(fake.callsOf('recentlyDeleted')[1].args[0]).toBe('d50');
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});

test('load problems as in History: offline under the banner with Try again; blocked ones say what to do', async () => {
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await mount({ diary });
  // The first answer is lost: offline.
  cleanup();
  const offline = createFakeResources({ wallets: goldenSeed().wallets, records: deletedSeed() });
  offline.fail('recentlyDeleted', 'network');
  mountScreen(<RecentlyDeletedScreen now={NOW} />, { resources: offline.resources, diary: diary.diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.getByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.getByText(DISCLOSURE)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText(ROWS.rent)).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
  expect(fake).toBeTruthy();
  cleanup();
  for (const [outcome, message] of [
    ['upgrade_required', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
    ['policy_required', 'Review and accept the updated terms to continue.'],
    ['signed_out', 'Sign in again to see your diary.'],
  ] as const) {
    const blocked = createFakeResources({ wallets: goldenSeed().wallets, records: deletedSeed() });
    blocked.fail('recentlyDeleted', outcome);
    mountScreen(<RecentlyDeletedScreen now={NOW} />, { resources: blocked.resources });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    cleanup();
  }
});

test('suggests a refresh when entries changed since the list opened', async () => {
  const fake = await mount({ wrap: refreshSuggested });
  expect(await screen.findByText('Entries changed since you opened this list.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(fake.callsOf('recentlyDeleted')).toHaveLength(2));
});

test('Back returns to History, or opens it when there is nothing to go back to', async () => {
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
  expect(nav.router.back).toHaveBeenCalledTimes(1);
  nav.router.canGoBack.mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(nav.router.replace).toHaveBeenLastCalledWith('/spend/all');
});

test.each(MATRIX)('reads in $locale, $mode: palette ground, the stage, the notice and Thai leading', async ({ locale, mode, colors }) => {
  await mount({ locale, mode });
  const t = (english: string, values?: Record<string, string | number>) => translateCopy(english, locale, values);
  const title = await screen.findByRole('heading', { name: t('Recently deleted') });
  expect(title.style.lineHeight).toBe(leading('title', locale));
  expect(title.style.color).toEqual(rgb(colors.ink));
  expect(screen.getByTestId('recently-deleted-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByText(t('Deleted entries can be restored for {days} days. After that, they are gone for good.', { days: 30 }))).toBeTruthy();
  expect(await screen.findByText(t('{days} days left to restore', { days: 29 }))).toBeTruthy();
  const restore = screen.getAllByRole('button', { name: new RegExp(`^${t('Restore')} `) });
  expect(restore).toHaveLength(2);
  expect(within(restore[0]).getByText(t('Restore'))).toBeTruthy();
});
