import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) },
  /** The screen's focus effect: calling it again is "the screen came back into view". */
  focus: { effect: null as null | (() => void) },
}));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => nav.router,
    useFocusEffect: (effect: () => void) => {
      nav.focus.effect = effect;
      useEffect(() => { effect(); }, [effect]);
    },
  };
});
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { HistoryPage, TransactionDto } from '@gogospend/contracts';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { formatMinor } from '@mobile/spend/v1/money';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { monthLabel } from '@mobile/ui/dateStep';
import { HistoryScreen } from './HistoryScreen';
import {
  CASH, CATEGORIES, DIARY_REFERENCES, FOOD_ID, MATRIX, NOW, RENT, ROWS, extraRecords, hiddenFromScreenReaders, leading, mountScreen, openRowActions,
  outboxCommand, pendingExpense, recordRows, rgb, rowAction,
} from './HistoryTestHarness';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.focus.effect = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';

async function golden(options: { records?: TransactionDto[]; locale?: Locale; mode?: 'light' | 'dark'; wrap?: (resources: SpendV1Resources) => SpendV1Resources } = {}) {
  const seed = goldenSeed();
  const fake = createFakeResources({ ...seed, records: [...seed.records, ...(options.records ?? [])] });
  const resources = options.wrap ? options.wrap(fake.resources) : fake.resources;
  const onMonthChange = vi.fn();
  mountScreen(<HistoryScreen now={NOW} onMonthChange={onMonthChange} />, { resources, locale: options.locale, mode: options.mode });
  if (!options.locale || options.locale === 'en') await screen.findByRole('button', { name: ROWS.rent });
  else await waitFor(() => expect(recordRows().length + screen.queryAllByRole('button', { name: /฿12,268\.00/ }).length).toBeGreaterThan(0));
  return { fake, onMonthChange };
}

const summaryText = () => screen.getByTestId('history-summary').textContent;
const search = (value: string, label = 'Search entries') => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// ---------------------------------------------------------------------------
// Parity with the current Transactions screen

test("lists the month's entries in day groups with signed exact amounts and the month's totals", async () => {
  const { fake } = await golden();
  expect(screen.getByText('September 2026')).toBeTruthy();
  for (const row of Object.values(ROWS)) expect(screen.getByRole('button', { name: row })).toBeTruthy();
  expect(within(screen.getByRole('button', { name: ROWS.salary })).getByText('+฿28,000.00')).toBeTruthy();
  expect(within(screen.getByRole('button', { name: ROWS.rent })).getByText('-฿12,268.00')).toBeTruthy();
  expect(within(screen.getByRole('button', { name: ROWS.move })).getByText('฿1,500.00')).toBeTruthy();
  expect(screen.getByLabelText('Money in ฿28,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  // Days, newest first, each with its own confirmed total.
  const days = screen.getAllByRole('heading').map((node) => node.getAttribute('aria-label')).filter((label) => label?.includes('September 2026'));
  expect(days).toEqual([
    'Yesterday, Monday 28 September 2026',
    'Sunday 27 September 2026, Money out ฿12,268.00',
    'Saturday 26 September 2026, Money out ฿182.00',
    'Friday 25 September 2026, Money in ฿28,000.00',
  ]);
  expect(fake.callsOf('history')[0].args[0]).toEqual({ from: '2026-09-01', through: '2026-09-30', sort: 'date_desc' });
});

test('filters by type and moves between months; the filter stays on', async () => {
  const { fake, onMonthChange } = await golden();
  fireEvent.click(screen.getByRole('radio', { name: 'Expense' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.salary })).toBeNull());
  expect(screen.getByRole('radio', { name: 'Expense' }).getAttribute('aria-checked')).toBe('true');
  expect(fake.callsOf('history').at(-1)?.args[0]).toMatchObject({ type: 'expense' });
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('August 2026')).toBeTruthy();
  expect(onMonthChange).toHaveBeenLastCalledWith('2026-08');
  // An empty month under a filter says so, and offers the way out.
  expect(await screen.findByText('No entries match')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  expect(fake.callsOf('history').at(-1)?.args[0]).toEqual({ from: '2026-08-01', through: '2026-08-31', sort: 'date_desc' });
  // Records are never in the future, so there is no month after this one.
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(await screen.findByText('September 2026')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next month' }).getAttribute('aria-disabled')).toBe('true');
});

test('pages through every entry with Load more, with no hidden cap', async () => {
  await golden({ records: extraRecords() });
  expect(recordRows()).toHaveLength(50);
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(recordRows()).toHaveLength(64));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});

test('delete hides the entry after the acknowledgement; Undo restores it with the new version and its own key', async () => {
  const { fake } = await golden();
  rowAction(ROWS.rent, 'Delete');
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull());
  const bar = screen.getByText('Entry deleted').closest('[role="status"]');
  expect(bar?.getAttribute('aria-live')).toBe('polite');
  const [removal] = fake.callsOf('deleteTransaction');
  expect(removal.args.slice(0, 2)).toEqual([RENT, 1]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  const [restore] = fake.callsOf('restoreTransaction');
  expect(restore.args.slice(0, 2)).toEqual([RENT, 2]);
  expect(typeof restore.args[2]).toBe('string');
  expect(restore.args[2]).not.toBe(removal.args[2]);
  expect(screen.queryByText('Entry deleted')).toBeNull();
});

test('an unconfirmed delete is frozen and resent with the same key, even after the list refreshes', async () => {
  const { fake } = await golden();
  fake.loseResponse('deleteTransaction');
  rowAction(ROWS.rent, 'Delete');
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  // The entry is still shown, and no other delete can start while this one is unknown.
  expect(screen.getByRole('button', { name: ROWS.rent })).toBeTruthy();
  const bar = openRowActions(ROWS.food);
  expect(within(bar).queryByRole('button', { name: 'Delete' })).toBeNull();
  fireEvent.click(within(bar).getByRole('button', { name: 'Copy' }));
  nav.focus.effect?.();
  await waitFor(() => expect(fake.callsOf('history')).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull());
  const [first, second] = fake.callsOf('deleteTransaction');
  expect(second.args).toEqual(first.args);
  expect(screen.getByText('Entry deleted')).toBeTruthy();
});

test('an unconfirmed undo keeps the bar and resends the same restore', async () => {
  const { fake } = await golden();
  rowAction(ROWS.rent, 'Delete');
  await screen.findByText('Entry deleted');
  fake.loseResponse('restoreTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(screen.getByText('Entry deleted')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  const [first, second] = fake.callsOf('restoreTransaction');
  expect(second.args).toEqual(first.args);
  expect(first.args.slice(0, 2)).toEqual([RENT, 2]);
});

test('deleting an entry another device already deleted reloads with a clear notice', async () => {
  const { fake } = await golden();
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, deleted_at: '2026-09-29T00:00:00.000Z', version: 2 });
  rowAction(ROWS.rent, 'Delete');
  expect(await screen.findByText('This entry was already deleted.')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull());
  expect(screen.queryByText('Entry deleted')).toBeNull();
});

test('a delete that meets a newer version elsewhere reloads instead of overwriting', async () => {
  const { fake } = await golden();
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1300000', version: 2 });
  rowAction(ROWS.rent, 'Delete');
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Bills, Expense ฿13,000.00, Daily account · Rent' })).toBeTruthy();
  expect(fake.callsOf('deleteTransaction')).toHaveLength(1);
});

test('suggests a refresh when entries changed since the list opened', async () => {
  const { fake } = await golden({ wrap: (resources) => ({ ...resources, history: async (...args) => ({ ...(await resources.history(...args)), refresh_suggested: true }) as HistoryPage }) });
  expect(screen.getByText('Entries changed since you opened this list.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(fake.callsOf('history')).toHaveLength(2));
  expect(fake.callsOf('history')[1].args[2]).toBe(50);
  expect(screen.getByRole('button', { name: ROWS.rent })).toBeTruthy();
});

test('load problems: a failed load can be tried again; blocked ones say what to do', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('history', 'network');
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources });
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  cleanup();
  for (const [outcome, message] of [
    ['upgrade_required', 'Update Jotbun to keep using your diary. Nothing you saved is lost.'],
    ['policy_required', 'Review and accept the updated terms to continue.'],
    ['signed_out', 'Sign in again to see your diary.'],
  ] as const) {
    const blocked = createFakeResources(goldenSeed());
    blocked.fail('history', outcome);
    mountScreen(<HistoryScreen now={NOW} />, { resources: blocked.resources });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    cleanup();
  }
});

test('returning to the list refreshes it in place and keeps every loaded page', async () => {
  const { fake } = await golden({ records: extraRecords() });
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(recordRows()).toHaveLength(64));
  // The record screen changed the entry meanwhile.
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1200000', version: 2 });
  nav.focus.effect?.();
  expect(await screen.findByRole('button', { name: 'Bills, Expense ฿12,000.00, Daily account · Rent' })).toBeTruthy();
  expect(recordRows()).toHaveLength(64);
  expect(fake.callsOf('history').at(-1)?.args[2]).toBe(64);
});

// ---------------------------------------------------------------------------
// Rows, actions and drafts

test('a row opens its record; long-press offers Edit, Copy and Delete', async () => {
  await golden();
  fireEvent.click(screen.getByRole('button', { name: ROWS.rent }));
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/record/${RENT}`);
  nav.router.push.mockReset();
  rowAction(ROWS.rent, 'Edit');
  expect(nav.router.push).toHaveBeenCalledTimes(1);
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/record/${RENT}?mode=edit`);
  rowAction(ROWS.food, 'Copy');
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/add?copyOf=${FOOD_ID}`);
});

test("drafts on the device join their days with their state, and never count in the day's total", async () => {
  const seed = goldenSeed();
  const fake = createFakeResources(seed);
  const saving = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-26' }), 'unsent');
  const checking = outboxCommand(pendingExpense({ amount_minor: '4000', occurred_on: '2026-09-27', category_id: CATEGORIES.TRAVEL.id }), 'uncertain');
  const review = outboxCommand(pendingExpense({ amount_minor: '999', occurred_on: '2026-09-29', note: 'Snacks' }), 'needs_review');
  // A draft the server already confirmed shows once, as the confirmed record.
  const confirmed = outboxCommand(pendingExpense({ id: FOOD_ID, amount_minor: '18200', occurred_on: '2026-09-26' }), 'uncertain');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [saving, checking, review, confirmed] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, diary: diary.diary });
  expect(await screen.findByRole('button', { name: 'Food, Expense ฿65.00, saving, Cash' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Travel, Expense ฿40.00, checking, Cash' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Food, Expense ฿9.99, needs a look, Cash · Snacks' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Food, Expense ฿182\.00/ })).toHaveLength(1);
  // Confirmed money only in the day header; draft money is said apart.
  expect(screen.getByRole('heading', { name: 'Saturday 26 September 2026, Money out ฿182.00' })).toBeTruthy();
  expect(screen.getByText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  expect(screen.getByText('Checking with Jotbun: money out ฿40.00')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Today, Tuesday 29 September 2026' })).toBeTruthy();
  // The month's totals stay the server's confirmed totals.
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  // Drafts can be copied, not edited or deleted (they are not on the server yet).
  const bar = openRowActions('Food, Expense ฿65.00, saving, Cash');
  expect(within(bar).queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(within(bar).queryByRole('button', { name: 'Delete' })).toBeNull();
  fireEvent.click(within(bar).getByRole('button', { name: 'Copy' }));
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/add?copyOf=${saving.payload.id}`);
  // The banner names what needs a look, and leads to it.
  expect(screen.getByText('Entries that need your review: 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/record/${review.payload.id}`);
});

test('a draft that resolves refreshes the list in place', async () => {
  const fake = createFakeResources(goldenSeed());
  const draft = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29' }), 'uncertain');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [draft] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, diary: diary.diary });
  await screen.findByRole('button', { name: 'Food, Expense ฿65.00, checking, Cash' });
  const payload = draft.payload as TransactionDto;
  fake.records.set(payload.id, { ...payload, deleted_at: null, version: 1 } as TransactionDto);
  diary.set({ outbox: [{ ...draft, state: 'acknowledged' }] });
  expect(await screen.findByRole('button', { name: 'Food, Expense ฿65.00, Cash' })).toBeTruthy();
  expect(fake.callsOf('history')).toHaveLength(2);
});

test('offline, the month still shows what this device holds, under an offline banner', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('history', 'network');
  const draft = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29' }), 'unsent');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [draft] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, diary: diary.diary });
  expect(await screen.findByText('Offline. New entries are saved on this phone.')).toBeTruthy();
  expect(screen.getByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Food, Expense ฿65.00, saving, Cash' })).toBeTruthy();
  expect(screen.getByText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: ROWS.rent })).toBeTruthy();
  expect(screen.queryByText('Offline. New entries are saved on this phone.')).toBeNull();
});

test('a draft waiting for an app update never looks confirmed and says why it waits', async () => {
  const fake = createFakeResources(goldenSeed());
  const paused = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29' }), 'paused_upgrade');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [paused] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, diary: diary.diary });
  expect(await screen.findByRole('button', { name: 'Food, Expense ฿65.00, saving, Cash' })).toBeTruthy();
  expect(screen.getByText('Update Jotbun to send')).toBeTruthy();
  expect(screen.getByText('Update Jotbun to send the entries saved on this device')).toBeTruthy();
  expect(screen.getByText('Waiting to sync: money out ฿65.00')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Search, filters and the summary

test('search matches the category, merchant and note, with a summary of what matched', async () => {
  await golden();
  search('rent');
  await waitFor(() => expect(recordRows()).toHaveLength(1));
  expect(screen.getByRole('button', { name: ROWS.rent })).toBeTruthy();
  expect(summaryText()).toContain('1 entry, ฿12,268.00 out');
  expect(screen.getByTestId('history-summary').getAttribute('aria-live')).toBe('polite');
  search('SALARY');
  await waitFor(() => expect(summaryText()).toContain('1 entry, ฿28,000.00 in'));
  expect(screen.getByRole('button', { name: ROWS.salary })).toBeTruthy();
  search('nothing like this');
  await waitFor(() => expect(recordRows()).toHaveLength(0));
  expect(summaryText()).toContain('No entries match');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() => expect(recordRows()).toHaveLength(4));
  expect(screen.queryByTestId('history-summary')).toBeNull();
});

test('a search over part of the month says so until every page is loaded', async () => {
  await golden({ records: extraRecords() });
  const foodTotal = (amounts: number[]) => formatMinor(String(amounts.reduce((sum, amount) => sum + amount, 18200)), 'en');
  search('food');
  // Page one holds golden Food and 46 of the 60 extras (ids 59 down to 14).
  const firstPage = Array.from({ length: 46 }, (_, i) => 100 + 59 - i);
  await waitFor(() => expect(summaryText()).toContain(`47 entries, ${foodTotal(firstPage)} out`));
  expect(summaryText()).toContain('Only loaded entries are searched. Load more to search the rest.');
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  const all = Array.from({ length: 60 }, (_, i) => 100 + i);
  await waitFor(() => expect(summaryText()).toContain(`61 entries, ${foodTotal(all)} out`));
  expect(summaryText()).not.toContain('Only loaded entries');
});

test('Thai search folds combining marks the same way and never strips them', async () => {
  const seed = goldenSeed();
  const notes: TransactionDto[] = [
    { id: '0000000d-0000-4000-8000-000000000101', type: 'expense', amount_minor: '5000', occurred_on: '2026-09-20', wallet_id: CASH, category_id: CATEGORIES.FOOD.id, note: 'ปู่ย่า', merchant: null, deleted_at: null, version: 1 },
    { id: '0000000d-0000-4000-8000-000000000102', type: 'expense', amount_minor: '2000', occurred_on: '2026-09-21', wallet_id: CASH, category_id: CATEGORIES.FOOD.id, note: null, merchant: 'น้ำแข็ง', deleted_at: null, version: 1 },
  ];
  const fake = createFakeResources({ ...seed, records: [...seed.records, ...notes] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources, locale: 'th' });
  await screen.findByText('Cash · ปู่ย่า');
  const label = translateCopy('Search entries', 'th');
  // The tone mark typed before the lower vowel still finds "ปู่".
  search('ปู่', label);
  await waitFor(() => expect(screen.queryByText('Cash · น้ำแข็ง')).toBeNull());
  expect(screen.getByText('Cash · ปู่ย่า')).toBeTruthy();
  // Sara am matches nikhahit followed by sara aa.
  search('น้ํา', label);
  await waitFor(() => expect(screen.getByText('Cash · น้ำแข็ง')).toBeTruthy());
  expect(screen.queryByText('Cash · ปู่ย่า')).toBeNull();
  // Marks are letters: "ยา" is not "ย่า".
  search('ยา', label);
  await waitFor(() => expect(screen.queryByText('Cash · ปู่ย่า')).toBeNull());
});

test('wallet and category chips scope the month, with exact totals from the server', async () => {
  const { fake } = await golden();
  const wallets = screen.getByRole('radiogroup', { name: 'Wallet' });
  fireEvent.click(within(wallets).getByRole('radio', { name: 'Cash' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: ROWS.rent })).toBeNull());
  expect(fake.callsOf('history').at(-1)?.args[0]).toMatchObject({ wallet_id: CASH });
  expect(await screen.findByRole('button', { name: ROWS.food })).toBeTruthy();
  expect(screen.getByRole('button', { name: ROWS.move })).toBeTruthy();
  expect(summaryText()).toContain('2 entries, ฿182.00 out');
  fireEvent.click(within(wallets).getByRole('radio', { name: 'All wallets' }));
  const categories = screen.getByRole('radiogroup', { name: 'Category' });
  fireEvent.click(within(categories).getByRole('radio', { name: 'Bills' }));
  await waitFor(() => expect(fake.callsOf('history').at(-1)?.args[0]).toEqual({ from: '2026-09-01', through: '2026-09-30', category_id: CATEGORIES.BILLS.id, sort: 'date_desc' }));
  await waitFor(() => expect(recordRows()).toHaveLength(1));
  expect(screen.getByRole('button', { name: ROWS.rent })).toBeTruthy();
  expect(summaryText()).toContain('1 entry, ฿12,268.00 out');
  // A move has no category, so choosing Transfer drops the category chips and their filter.
  fireEvent.click(screen.getByRole('radio', { name: 'Transfer' }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Category' })).toBeNull());
  expect(await screen.findByRole('button', { name: ROWS.move })).toBeTruthy();
  expect(fake.callsOf('history').at(-1)?.args[0]).toEqual({ from: '2026-09-01', through: '2026-09-30', type: 'transfer', sort: 'date_desc' });
});

// ---------------------------------------------------------------------------
// Empty month, the bun, locales and modes

test('an empty month shows the thinking bun, which follows the bun setting', async () => {
  const fake = createFakeResources({ wallets: goldenSeed().wallets, records: [] });
  mountScreen(<HistoryScreen now={NOW} />, { resources: fake.resources });
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  const bun = screen.getByTestId('history-empty-bun');
  expect(bun.querySelector('svg')).toBeTruthy();
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
  expect(nav.router.push).toHaveBeenLastCalledWith('/spend/add');
  cleanup();
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'off');
  mountScreen(<HistoryScreen now={NOW} />, { resources: createFakeResources({ wallets: goldenSeed().wallets, records: [] }).resources });
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  expect(screen.queryByTestId('history-empty-bun')).toBeNull();
});

test('the bun stays off a list that has entries', async () => {
  await golden();
  expect(screen.queryByTestId('history-empty-bun')).toBeNull();
});

test.each(MATRIX)('reads in $locale, $mode: palette ground, the stage, the month, ink amounts and Thai leading', async ({ locale, mode, colors }) => {
  await golden({ locale, mode });
  expect(screen.getByTestId('history-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  expect(screen.getByText(monthLabel('2026-09', locale))).toBeTruthy();
  const title = screen.getByRole('heading', { name: translateCopy('History', locale) });
  expect(title.style.lineHeight).toBe(leading('title', locale));
  expect(title.style.color).toEqual(rgb(colors.ink));
  expect(within(screen.getByRole('button', { name: /฿12,268\.00/ })).getByText('-฿12,268.00').style.color).toEqual(rgb(colors.ink));
  expect(screen.getByRole('radio', { name: translateCopy('Expense', locale) })).toBeTruthy();
  expect(screen.getByLabelText(`${translateCopy('Money out', locale)} ฿12,450.00`)).toBeTruthy();
});
