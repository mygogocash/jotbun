import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. Nothing here draws images, so
// that one resolver is stubbed and the real SVG elements still render.
vi.mock('../../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { TransactionDto } from '@gogospend/contracts';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { RecordScreen } from './RecordScreen';
import { DIARY_REFERENCES, FOOD_ID, MATRIX, MOVE, NOW, RENT, leading, mountScreen, outboxCommand, pendingExpense, rgb } from './HistoryTestHarness';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});
afterEach(() => cleanup());

const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';

type MountOptions = { mode?: 'view' | 'edit'; locale?: 'en' | 'th' | 'vi'; theme?: 'light' | 'dark'; diary?: SpendDiary | null; patch?: (records: Map<string, TransactionDto>) => void };

function mountRecord(id: string, options: MountOptions = {}) {
  const fake = createFakeResources(goldenSeed());
  options.patch?.(fake.records);
  mountScreen(<RecordScreen id={id} mode={options.mode ?? 'view'} now={NOW} />, { resources: fake.resources, diary: options.diary ?? null, locale: options.locale, mode: options.theme });
  return fake;
}

async function editRent() {
  const fake = mountRecord(RENT, { mode: 'edit' });
  expect(await screen.findByLabelText('Amount, ฿12,268.00')).toBeTruthy();
  return fake;
}

const keypad = () => screen.getByRole('group', { name: 'Keypad' });
const press = (...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(keypad()).getByRole('button', { name: key }));
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const slip = () => screen.getByTestId('receipt-slip');
const changeRent = (fake: ReturnType<typeof createFakeResources>, patch: Partial<TransactionDto>) => {
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, ...patch } as TransactionDto);
};

// ---------------------------------------------------------------------------
// The receipt

test('the receipt shows the amount, type, category, wallet, date and note, with Edit, Copy and Delete', async () => {
  const fake = mountRecord(RENT);
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  expect(within(slip()).getByRole('heading', { name: 'Bills' })).toBeTruthy();
  for (const row of ['Type, Expense', 'Category, Bills', 'Wallet, Daily account', 'Date, Sunday 27 September 2026', 'Note, Rent']) {
    expect(within(slip()).getByLabelText(row)).toBeTruthy();
  }
  expect(within(slip()).queryByLabelText(/^Merchant, /)).toBeNull();
  expect(within(slip()).queryByLabelText(/^Status, /)).toBeNull();
  expect(screen.getByText('−฿12,268.00')).toBeTruthy();
  for (const action of ['Edit', 'Copy', 'Delete', 'Back']) expect(screen.getByRole('button', { name: action })).toBeTruthy();
  expect(fake.callsOf('transaction')[0].args).toEqual([RENT]);
});

test('a move reads From → To, and a merchant gets its own row', async () => {
  mountRecord(MOVE);
  expect(await screen.findByLabelText('Amount, Transfer ฿1,500.00')).toBeTruthy();
  expect(within(slip()).getByLabelText('From → To, Cash → Daily account')).toBeTruthy();
  expect(within(slip()).queryByLabelText(/^Category, /)).toBeNull();
  cleanup();
  mountRecord(FOOD_ID, { patch: (records) => records.set(FOOD_ID, { ...(records.get(FOOD_ID) as TransactionDto), merchant: '7-Eleven' }) });
  expect(await screen.findByLabelText('Merchant, 7-Eleven')).toBeTruthy();
});

test('Copy opens quick add with copyOf; Back returns to the list', async () => {
  mountRecord(RENT);
  fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/add?copyOf=${RENT}`);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(nav.router.back).toHaveBeenCalledTimes(1);
  nav.router.canGoBack.mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(nav.router.replace).toHaveBeenLastCalledWith('/spend/all');
});

// ---------------------------------------------------------------------------
// Editing (parity with the current list's inline edit)

test('edits with the version you saw and its own command key, then shows the server record after the acknowledgement', async () => {
  const fake = await editRent();
  press('Clear', '1', '2', '0', '0', '0');
  expect(screen.getByLabelText('Amount, ฿12,000.00')).toBeTruthy();
  save();
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  const [id, version, changes, key] = fake.callsOf('updateTransaction')[0].args;
  expect([id, version, changes]).toEqual([RENT, 1, { amount_minor: '1200000' }]);
  expect(typeof key).toBe('string');
  // The receipt comes from a fresh read after the acknowledgement, not from the receipt of the command.
  expect(fake.callsOf('transaction')).toHaveLength(2);
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
});

test('Edit on the receipt opens the edit mode; Cancel leaves it without sending', async () => {
  const fake = mountRecord(RENT);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Amount, ฿12,268.00')).toBeTruthy();
  press('Clear', '9');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  expect(fake.callsOf('updateTransaction')).toHaveLength(0);
});

test('the keypad sends an exact amount_minor: 0.1 + 0.2 is 30 satang, 100 ÷ 3 is ฿33.33', async () => {
  const fake = await editRent();
  press('Clear', '0', 'Decimal point', '1', 'Plus', '0', 'Decimal point', '2');
  expect(screen.getByLabelText('Amount, 0.1 + 0.2')).toBeTruthy();
  save();
  await waitFor(() => expect(fake.callsOf('updateTransaction')).toHaveLength(1));
  expect(fake.callsOf('updateTransaction')[0].args[2]).toEqual({ amount_minor: '30' });
  cleanup();
  const again = await editRent();
  press('Clear', '1', '0', '0', 'Divided by', '3');
  save();
  await waitFor(() => expect(again.callsOf('updateTransaction')).toHaveLength(1));
  expect(again.callsOf('updateTransaction')[0].args[2]).toEqual({ amount_minor: '3333' });
});

test('only the fields you changed are sent: note, merchant and date', async () => {
  const fake = await editRent();
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Rent and water' } });
  fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'Landlord' } });
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  save();
  expect(await screen.findByLabelText('Note, Rent and water')).toBeTruthy();
  expect(fake.callsOf('updateTransaction')[0].args.slice(0, 3)).toEqual([RENT, 1, { occurred_on: '2026-09-26', note: 'Rent and water', merchant: 'Landlord' }]);
  expect(screen.getByLabelText('Date, Saturday 26 September 2026')).toBeTruthy();
});

test('an unchanged edit sends nothing; an amount the keypad cannot save says why', async () => {
  const fake = await editRent();
  save();
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  press('Clear');
  save();
  expect(await screen.findByText('Enter an amount')).toBeTruthy();
  press('5', 'Divided by', '0', 'Equals');
  expect(await screen.findByText("You can't divide by zero")).toBeTruthy();
  expect(fake.callsOf('updateTransaction')).toHaveLength(0);
});

test('a conflict shows yours and the server side by side, and Apply my change resends on the server version with a new key', async () => {
  const fake = await editRent();
  changeRent(fake, { amount_minor: '1300000', note: 'Rent and water', version: 2 });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  const panel = await screen.findByTestId('conflict');
  expect(panel.getAttribute('aria-live')).toBe('polite');
  expect(within(panel).getByText('This entry changed on another device.')).toBeTruthy();
  expect(within(panel).getByText('Yours')).toBeTruthy();
  expect(within(panel).getByText('On the server')).toBeTruthy();
  expect(within(panel).getByLabelText('Amount. Yours: ฿12,000.00. On the server: ฿13,000.00. Applying your change replaces this.')).toBeTruthy();
  // A field you did not touch keeps the server's value on both sides.
  expect(within(panel).getByLabelText('Note. Yours: Rent and water. On the server: Rent and water.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Apply my change' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Note, Rent and water')).toBeTruthy();
  const [first, second] = fake.callsOf('updateTransaction');
  expect(first.args[1]).toBe(1);
  expect(second.args[1]).toBe(2);
  expect(second.args[2]).toEqual({ amount_minor: '1200000' });
  expect(second.args[3]).not.toBe(first.args[3]);
});

test('Reload after a conflict shows the other device’s version and drops the edit', async () => {
  const fake = await editRent();
  changeRent(fake, { amount_minor: '1300000', version: 2 });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
  expect(await screen.findByLabelText('Amount, Expense ฿13,000.00')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  expect(screen.queryByTestId('conflict')).toBeNull();
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
});

test('a conflict without a usable current record reloads instead of looping', async () => {
  const fake = await editRent();
  fake.fail('updateTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { id: 'someone-else', amount_minor: 5 } });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Apply my change' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  await waitFor(() => expect(fake.callsOf('transaction')).toHaveLength(2));
});

test('an entry deleted on another device says so, drops the edit and can be restored within 30 days', async () => {
  const fake = await editRent();
  changeRent(fake, { deleted_at: '2026-09-29T00:00:00.000Z', version: 2 });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  expect(await screen.findByText('This entry was deleted on another device.')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  expect(await screen.findByText('30 days left to restore')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  expect(fake.callsOf('restoreTransaction')[0].args.slice(0, 2)).toEqual([RENT, 2]);
  expect(screen.getByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
});

test('an unconfirmed edit is frozen and retried as the same command', async () => {
  const fake = await editRent();
  press('Clear', '1', '2', '0', '0', '0');
  fake.loseResponse('updateTransaction');
  save();
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(within(keypad()).getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
  const note = screen.getByLabelText('Note') as HTMLInputElement;
  expect(note.readOnly || note.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  const [first, second] = fake.callsOf('updateTransaction');
  expect(second.args).toEqual(first.args);
});

test('a failed reload after an acknowledged edit is a load problem, not an unconfirmed save', async () => {
  const fake = await editRent();
  press('Clear', '1', '2', '0', '0', '0');
  fake.fail('transaction', 'network');
  save();
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.queryByText(NOT_CONFIRMED)).toBeNull();
  expect(screen.queryByRole('group', { name: 'Keypad' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Delete and undo

test('Delete shows the undo bar; Undo restores with the new version and its own key', async () => {
  const fake = mountRecord(RENT);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const bar = (await screen.findByText('Entry deleted')).closest('[role="status"]');
  expect(bar?.getAttribute('aria-live')).toBe('polite');
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  const [removal] = fake.callsOf('deleteTransaction');
  expect(removal.args.slice(0, 2)).toEqual([RENT, 1]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  const [restore] = fake.callsOf('restoreTransaction');
  expect(restore.args.slice(0, 2)).toEqual([RENT, 2]);
  expect(restore.args[2]).not.toBe(removal.args[2]);
  expect(screen.queryByText('Entry deleted')).toBeNull();
});

test('an unconfirmed delete is frozen and resent with the same key', async () => {
  const fake = mountRecord(RENT);
  fake.loseResponse('deleteTransaction');
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Entry deleted')).toBeTruthy();
  const [first, second] = fake.callsOf('deleteTransaction');
  expect(second.args).toEqual(first.args);
});

// ---------------------------------------------------------------------------
// Drafts on the device, load problems

test('a draft on this device opens from the diary with its state, and can be copied or removed', async () => {
  const draft = outboxCommand(pendingExpense({ amount_minor: '6500', occurred_on: '2026-09-29', merchant: 'Café' }), 'unsent');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [draft] });
  const fake = mountRecord(draft.payload.id, { diary: diary.diary });
  expect(await screen.findByLabelText('Amount, Expense ฿65.00, saving')).toBeTruthy();
  for (const row of ['Status, Saving…', 'Merchant, Café', 'Category, Food', 'Wallet, Cash', 'Date, Tuesday 29 September 2026']) {
    expect(within(slip()).getByLabelText(row)).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  expect(fake.callsOf('transaction')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(nav.router.push).toHaveBeenLastCalledWith(`/spend/add?copyOf=${draft.payload.id}`);
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(diary.calls.removed).toEqual([draft.commandId]));
  expect(nav.router.back).toHaveBeenCalledTimes(1);
});

test('a draft that needs a look can be discarded; one being checked can only wait', async () => {
  const review = outboxCommand(pendingExpense({ amount_minor: '999' }), 'needs_review');
  const checking = outboxCommand(pendingExpense({ amount_minor: '4000' }), 'uncertain');
  const diary = createFakeDiary({ ...DIARY_REFERENCES, outbox: [review, checking] });
  mountRecord(review.payload.id, { diary: diary.diary });
  expect(await screen.findByLabelText('Amount, Expense ฿9.99, needs a look')).toBeTruthy();
  expect(screen.getByLabelText('Status, Needs a look')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(diary.calls.discarded).toEqual([review.commandId]));
  cleanup();
  mountRecord(checking.payload.id, { diary: createFakeDiary({ ...DIARY_REFERENCES, outbox: [checking] }).diary });
  expect(await screen.findByLabelText('Status, Checking with Jotbun')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
});

test('load problems: a failed load can be tried again; a missing entry says so', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('transaction', 'network');
  mountScreen(<RecordScreen id={RENT} now={NOW} />, { resources: fake.resources });
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  cleanup();
  const missing = createFakeResources(goldenSeed());
  mountScreen(<RecordScreen id="0000000b-0000-4000-8000-0000000000ff" now={NOW} />, { resources: missing.resources });
  expect(await screen.findByText("This entry isn't in your diary.")).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Locales and modes

test.each(MATRIX)('reads in $locale, $mode: paper slip, translated rows, the long date and Thai leading', async ({ locale, mode, colors }) => {
  mountRecord(RENT, { locale, theme: mode });
  const type = translateCopy('Type', locale);
  const expense = translateCopy('Expense', locale);
  expect(await screen.findByLabelText(`${type}, ${expense}`)).toBeTruthy();
  expect(slip().style.backgroundColor).toEqual(rgb(colors.paper));
  expect(screen.getByTestId('record-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(within(slip()).getByLabelText(`${translateCopy('Date', locale)}, ${fullDateLabel('2026-09-27', locale)}`)).toBeTruthy();
  const amount = screen.getByText('−฿12,268.00');
  expect(amount.style.color).toEqual(rgb(colors.ink));
  const title = within(slip()).getByRole('heading');
  expect(title.style.lineHeight).toBe(leading('heading', locale));
});
