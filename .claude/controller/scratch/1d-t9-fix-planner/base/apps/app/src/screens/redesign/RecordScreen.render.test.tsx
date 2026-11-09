import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) } }));
vi.mock('expo-router', () => ({ useRouter: () => nav.router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { TransactionDto } from '@gogospend/contracts';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import type { PendingChoice } from '@mobile/storage/types';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { RecordScreen } from './RecordScreen';
import { DIARY_REFERENCES, FOOD_ID, MATRIX, MOVE, NOW, RENT, leading, mountScreen, outboxCommand, pendingExpense, rgb } from './HistoryTestHarness';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [nav.router.push, nav.router.replace, nav.router.back]) fn.mockReset();
  nav.router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';

type MountOptions = {
  mode?: 'view' | 'edit'; locale?: 'en' | 'th' | 'vi'; theme?: 'light' | 'dark'; diary?: SpendDiary | null; patch?: (records: Map<string, TransactionDto>) => void;
  /** The fake API to mount on, when a test opens the same record again. */
  fake?: ReturnType<typeof createFakeResources>;
};

function mountRecord(id: string, options: MountOptions = {}) {
  const fake = options.fake ?? createFakeResources(goldenSeed());
  options.patch?.(fake.records);
  mountScreen(<RecordScreen id={id} mode={options.mode ?? 'view'} now={NOW} />, { resources: fake.resources, diary: options.diary ?? null, locale: options.locale, mode: options.theme });
  return fake;
}

async function editRent(diary: SpendDiary | null = null) {
  const fake = mountRecord(RENT, { mode: 'edit', diary });
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
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/add', params: { copyOf: RENT } });
  // Back is the stage header's own back button, the first control on the screen.
  const stage = screen.getByTestId('stage-header');
  expect(within(stage).getByRole('button', { name: 'Back' })).toBe(screen.getAllByRole('button')[0]);
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
  press('Clear', '0', 'Decimal point', '1', 'Plus sign', '0', 'Decimal point', '2');
  // Review m2: a sum shows and says its exact result live, before it is saved.
  expect(screen.getByLabelText('Amount, 0.1 + 0.2 = ฿0.30')).toBeTruthy();
  expect(within(screen.getByTestId('edit-amount')).getByText('฿0.30')).toBeTruthy();
  save();
  await waitFor(() => expect(fake.callsOf('updateTransaction')).toHaveLength(1));
  expect(fake.callsOf('updateTransaction')[0].args[2]).toEqual({ amount_minor: '30' });
  cleanup();
  const again = await editRent();
  press('Clear', '1', '0', '0', 'Divided by', '3');
  const line = screen.getByTestId('edit-amount');
  expect(line.getAttribute('aria-live')).toBe('polite');
  expect(within(line).getByText('฿33.33')).toBeTruthy();
  expect(screen.getByLabelText('Amount, 100 ÷ 3 = ฿33.33')).toBeTruthy();
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
  expect(await screen.findByText("You can't divide by zero.")).toBeTruthy();
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

test('an unconfirmed undo keeps the bar and resends the same restore', async () => {
  const fake = mountRecord(RENT);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await screen.findByText('Entry deleted');
  fake.loseResponse('restoreTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(screen.getByText('Entry deleted')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  const [first, second] = fake.callsOf('restoreTransaction');
  expect(second.args).toEqual(first.args);
  expect(first.args.slice(0, 2)).toEqual([RENT, 2]);
});

// Review m4: a definite refusal of Undo must not leave a deleted entry looking live.
test('an undo Jotbun definitely refuses reloads the entry, which then reads as deleted', async () => {
  const fake = mountRecord(RENT);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await screen.findByText('Entry deleted');
  fake.fail('restoreTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT' });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('This entry was already deleted.')).toBeTruthy();
  await waitFor(() => expect(fake.callsOf('transaction')).toHaveLength(2));
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

// Review m5: one press of Save sends one edit, however fast the second press comes.
test('a second Save while the first is still on its way sends nothing', async () => {
  const fake = await editRent();
  press('Clear', '1', '2', '0', '0', '0');
  const button = screen.getByRole('button', { name: 'Save changes' });
  act(() => {
    button.click();
    button.click();
  });
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
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
  expect(nav.router.push).toHaveBeenLastCalledWith({ pathname: '/spend/add', params: { copyOf: draft.payload.id } });
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
  // The amount says the same as the status row: checking, not saving.
  expect(screen.getByLabelText('Amount, Expense ฿40.00, checking')).toBeTruthy();
  expect(within(slip()).getByText('checking…')).toBeTruthy();
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

// Kit polish item 12: in Vietnamese the receipt's date reads in the kit's words, as History's day headers say it.
test('in Vietnamese the receipt date uses the same words as the day headers, never Intl English', async () => {
  mountRecord(RENT, { locale: 'vi' });
  const date = await screen.findByLabelText(`${translateCopy('Date', 'vi')}, ${fullDateLabel('2026-09-27', 'vi')}`);
  expect(date.textContent).toContain('Chủ Nhật, 27 tháng 9, 2026');
  expect(slip().textContent).not.toMatch(/Sunday|September/);
});

test.each(MATRIX)('reads in $locale, $mode: paper slip, translated rows, the long date and Thai leading', async ({ locale, mode, colors }) => {
  mountRecord(RENT, { locale, theme: mode });
  const type = translateCopy('Type', locale);
  const expense = translateCopy('Expense', locale);
  expect(await screen.findByLabelText(translateCopy('{label}, {value}', locale, { label: type, value: expense }))).toBeTruthy();
  expect(slip().style.backgroundColor).toEqual(rgb(colors.paper));
  expect(screen.getByTestId('record-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(within(slip()).getByLabelText(translateCopy('{label}, {value}', locale, { label: translateCopy('Date', locale), value: fullDateLabel('2026-09-27', locale) }))).toBeTruthy();
  const amount = screen.getByText('−฿12,268.00');
  expect(amount.style.color).toEqual(rgb(colors.ink));
  const title = within(slip()).getByRole('heading');
  expect(title.style.lineHeight).toBe(leading('heading', locale));
});

// E2 (19 October 2026): the keypad pushed Save changes and its message below
// the fold; they are pinned under the scrolling form while editing.
test('while editing, the message and Save changes with Cancel are pinned under the scrolling form', async () => {
  const fake = await editRent();
  const footer = screen.getByTestId('record-edit-footer');
  const scroll = screen.getByTestId('record-scroll');
  expect(within(footer).getByRole('button', { name: 'Save changes' })).toBeTruthy();
  expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(within(scroll).queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(within(scroll).getByRole('group', { name: 'Keypad' })).toBeTruthy();
  expect(scroll.contains(footer)).toBe(false);
  press('Clear', '1', '2', '0', '0', '0');
  fake.loseResponse('updateTransaction');
  save();
  expect(await within(footer).findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(within(footer).getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('the receipt view has no pinned footer', async () => {
  mountRecord(RENT);
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  expect(screen.queryByTestId('record-edit-footer')).toBeNull();
});

test('the amount being edited shows exactly, as Quick add does, with what was typed above it', async () => {
  await editRent();
  const line = screen.getByTestId('edit-amount');
  expect(within(line).getByText('฿12,268.00')).toBeTruthy();
  press('Clear', '1', '2', 'Decimal point', '5');
  expect(within(line).getByText('12.5')).toBeTruthy();
  expect(within(line).getByText('฿12.50')).toBeTruthy();
  expect(screen.getByLabelText('Amount, ฿12.50')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// C16: the conflict choice (1D-T9), in the `conflict` area

const conflictArea = () => vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'conflict');
const choicePanel = () => screen.getByTestId('choice-panel');
const yoursCard = () => screen.getByRole('radio', { name: /^Yours\./ });
const serverCard = () => screen.getByRole('radio', { name: /^On the server\./ });
const kept = (diary: ReturnType<typeof createFakeDiary>) => diary.diary.getView().pendingChoices;
const RENT_RECORD = () => goldenSeed().records.find((record) => record.id === RENT) as TransactionDto;

/** Another phone saved ฿13,000.00 with a note; this one saves ฿12,000.00 on the version it read, and is refused. */
async function refuseAnEdit(diary: SpendDiary | null) {
  const fake = await editRent(diary);
  changeRent(fake, { amount_minor: '1300000', note: 'Rent and water', version: 2 });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  await screen.findByTestId('choice-panel');
  return fake;
}

/** A choice kept on this phone earlier: ฿12,000.00 on the rent, refused at 09:14 by the ฿13,000.00 another phone saved. */
function keptChoice(): PendingChoice {
  const rent = RENT_RECORD();
  return {
    recordId: RENT, original: rent, changes: { amount_minor: '1200000' }, server: { ...rent, amount_minor: '1300000', note: 'Rent and water', version: 2 } as TransactionDto,
    editedAt: '2026-09-29T02:14:00.000Z', refusedAt: '2026-09-29T02:14:01.000Z',
  };
}

test('a refused edit is kept as a choice and both versions are shown, yours chosen', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  expect(within(choicePanel()).getByRole('heading', { name: 'This entry was changed on another phone' })).toBeTruthy();
  expect(screen.getByText("The details don't match. Choose which to keep. Your change stays on this phone until you choose.")).toBeTruthy();
  // Yours (this phone, changed at 10:00 Bangkok time) is chosen first; the amount differs; the note you did not touch reads the server's on both.
  expect(yoursCard().getAttribute('aria-checked')).toBe('true');
  expect(serverCard().getAttribute('aria-checked')).toBe('false');
  expect(yoursCard().getAttribute('aria-label')).toMatch(/^Yours\. This phone · changed 10:00\. Amount: ฿12,000\.00, Differs\./);
  expect(serverCard().getAttribute('aria-label')).toMatch(/^On the server\. Another phone\. Amount: ฿13,000\.00, Differs\./);
  for (const card of [yoursCard(), serverCard()]) expect(card.getAttribute('aria-label')).toContain('Note: Rent and water');
  expect(screen.getByRole('button', { name: 'Use yours' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Decide later' })).toBeTruthy();
  // The board's "Edit entry", with Back (leaving keeps the choice); today's panel is gone.
  expect(screen.getByRole('heading', { name: 'Edit entry' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(screen.queryByTestId('conflict')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Apply my change' })).toBeNull();
  // Kept in the diary as the edit's original, its changes and the refusal's record; nothing more was sent.
  expect(kept(diary)).toHaveLength(1);
  const [choice] = kept(diary);
  expect([choice.recordId, choice.original.version, choice.changes, choice.server.version, choice.server.amount_minor]).toEqual([RENT, 1, { amount_minor: '1200000' }, 2, '1300000']);
  expect([choice.editedAt, choice.refusedAt]).toEqual([NOW.toISOString(), NOW.toISOString()]);
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
});

test('decide later keeps the choice, and reopening the record shows it again', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
  expect(nav.router.back).toHaveBeenCalledTimes(1);
  expect(kept(diary)).toHaveLength(1);
  cleanup();
  // The other phone changes it again before this one comes back: the panel compares with the fresh record, and keeps it.
  changeRent(fake, { amount_minor: '1350000', version: 3 });
  mountRecord(RENT, { fake, diary: diary.diary });
  expect(await screen.findByTestId('choice-panel')).toBeTruthy();
  expect(serverCard().getAttribute('aria-label')).toMatch(/^On the server\. Another phone\. Amount: ฿13,500\.00, Differs\./);
  expect(yoursCard().getAttribute('aria-label')).toMatch(/Amount: ฿12,000\.00, Differs\./);
  await waitFor(() => expect(kept(diary)[0]?.server.version).toBe(3));
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
});

test('use yours sends the same changes on the server\'s version once, then drops the choice', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  const useYours = screen.getByRole('button', { name: 'Use yours' });
  act(() => {
    useYours.click();
    useYours.click();
  });
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  const [refused, sent, ...more] = fake.callsOf('updateTransaction');
  expect(more).toHaveLength(0);
  expect(sent.args.slice(0, 3)).toEqual([RENT, 2, { amount_minor: '1200000' }]);
  expect(sent.args[3]).not.toBe(refused.args[3]);
  expect(screen.getByLabelText('Note, Rent and water')).toBeTruthy();
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
  expect(screen.queryByTestId('choice-panel')).toBeNull();
});

test('use yours meeting yet another change keeps the choice with the newer record and shows it again', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  changeRent(fake, { amount_minor: '1350000', version: 3 });
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  await waitFor(() => expect(serverCard().getAttribute('aria-label')).toMatch(/Amount: ฿13,500\.00, Differs\./));
  expect(kept(diary)[0]?.server.version).toBe(3);
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  expect(fake.callsOf('updateTransaction').map((call) => call.args[1])).toEqual([1, 2, 3]);
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
});

test('once use yours is acknowledged the choice is gone, even when the next read fails', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  fake.fail('transaction', 'network');
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  expect(kept(diary)).toHaveLength(0);
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(fake.callsOf('updateTransaction')).toHaveLength(2);
});

test('an unconfirmed "use yours" is frozen with Try again, resent with the same key, and the choice stays until it is confirmed', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  fake.loseResponse('updateTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  for (const name of ['Use yours', "Use the server's", 'Decide later', 'Back']) expect(screen.queryByRole('button', { name })).toBeNull();
  expect(kept(diary)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  const [, first, second] = fake.callsOf('updateTransaction');
  expect(second.args).toEqual(first.args);
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
});

test("choosing the server's version sends nothing and drops the choice", async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  fireEvent.click(serverCard());
  fireEvent.click(screen.getByRole('button', { name: "Use the server's" }));
  expect(await screen.findByLabelText('Amount, Expense ฿13,000.00')).toBeTruthy();
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
});

// P2-T6's notice rule holds for the choice: leaving a conflict (here, by choosing the server's) clears the notice.
test("use yours refused without a usable record reads the record again, and choosing the server's then clears the notice", async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await refuseAnEdit(diary.diary);
  fake.fail('updateTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { id: 'someone-else', amount_minor: 5 } });
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  // Read again: still not what you sent, so the choice is offered again against the record now on the server.
  await waitFor(() => expect(fake.callsOf('transaction')).toHaveLength(2));
  expect(await screen.findByTestId('choice-panel')).toBeTruthy();
  expect(kept(diary)).toHaveLength(1);
  fireEvent.click(serverCard());
  fireEvent.click(screen.getByRole('button', { name: "Use the server's" }));
  expect(await screen.findByLabelText('Amount, Expense ฿13,000.00')).toBeTruthy();
  expect(screen.queryByText('This entry changed on another device.')).toBeNull();
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
  expect(fake.callsOf('updateTransaction')).toHaveLength(2);
});

test('offline, the choice compares with the kept record and cannot send yours', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES, pendingChoices: [keptChoice()] });
  const fake = createFakeResources(goldenSeed());
  fake.fail('transaction', 'network');
  mountRecord(RENT, { fake, diary: diary.diary });
  expect(await screen.findByTestId('choice-panel')).toBeTruthy();
  // The stored record (฿13,000.00), named with the diary's wallets and categories; yours was changed at 09:14.
  expect(serverCard().getAttribute('aria-label')).toMatch(/^On the server\. Another phone\. Amount: ฿13,000\.00, Differs\. Category: Bills\. Wallet: Daily account\./);
  expect(yoursCard().getAttribute('aria-label')).toMatch(/^Yours\. This phone · changed 09:14\./);
  const useYours = screen.getByRole('button', { name: 'Use yours' });
  expect(useYours.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText('Connect to the internet to send yours.')).toBeTruthy();
  fireEvent.click(useYours);
  expect(screen.getByRole('button', { name: 'Decide later' })).toBeTruthy();
  expect(fake.callsOf('updateTransaction')).toHaveLength(0);
  expect(kept(diary)).toEqual([keptChoice()]);
});

test('a choice the server already holds clears itself', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES, pendingChoices: [keptChoice()] });
  // Another phone (or a resend whose answer was lost) already saved ฿12,000.00.
  const fake = mountRecord(RENT, { diary: diary.diary, patch: (records) => records.set(RENT, { ...RENT_RECORD(), amount_minor: '1200000', version: 3 } as TransactionDto) });
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  expect(fake.callsOf('updateTransaction')).toHaveLength(0);
});

test('a deleted record offers Restore and Discard my change', async () => {
  conflictArea();
  const diary = createFakeDiary({ ...DIARY_REFERENCES, pendingChoices: [keptChoice()] });
  const fake = mountRecord(RENT, { diary: diary.diary, patch: (records) => records.set(RENT, { ...RENT_RECORD(), deleted_at: '2026-09-29T00:00:00.000Z', version: 2 } as TransactionDto) });
  expect(await screen.findByText('This entry was already deleted.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Discard my change' }));
  await waitFor(() => expect(kept(diary)).toHaveLength(0));
  expect(screen.queryByRole('button', { name: 'Discard my change' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(fake.callsOf('updateTransaction')).toHaveLength(0);
});

test('a phone that cannot keep the choice asks for it now', async () => {
  conflictArea();
  // On the web there is no diary: the panel asks now, with no Decide later and no Back.
  const fake = await refuseAnEdit(null);
  const cannotKeep = "This phone can't keep this choice, so please choose now.";
  expect(screen.getByText(cannotKeep)).toBeTruthy();
  expect(screen.queryByText(/stays on this phone/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Decide later' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  // The choice is still the person's to make, on this screen.
  fireEvent.click(screen.getByRole('button', { name: 'Use yours' }));
  expect(await screen.findByLabelText('Amount, Expense ฿12,000.00')).toBeTruthy();
  expect(fake.callsOf('updateTransaction')[1].args.slice(0, 3)).toEqual([RENT, 2, { amount_minor: '1200000' }]);
  cleanup();
  // A locked diary keeps nothing either.
  const locked = createFakeDiary({ ...DIARY_REFERENCES, phase: 'locked', lockReason: 'locked' });
  await refuseAnEdit(locked.diary);
  expect(screen.getByText(cannotKeep)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Decide later' })).toBeNull();
  expect(kept(locked)).toHaveLength(0);
});

test('conflict_shown is sent once, from the edit rule, with the class name and the route pattern only', async () => {
  conflictArea();
  const recorded = await recordAnalytics();
  try {
    const diary = createFakeDiary({ ...DIARY_REFERENCES });
    const fake = await refuseAnEdit(diary.diary);
    const shown = () => recorded.sent.filter((event) => event.name === 'conflict_shown');
    expect(shown()).toEqual([{ kind: 'capture', name: 'conflict_shown', properties: { reason_code: 'VERSION_CONFLICT', screen: '/spend/record/[id]', origin: 'app' } }]);
    // Choosing a card draws the panel again; leaving and coming back shows it again. Neither is a new refusal.
    fireEvent.click(serverCard());
    fireEvent.click(yoursCard());
    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    cleanup();
    mountRecord(RENT, { fake, diary: diary.diary });
    expect(await screen.findByTestId('choice-panel')).toBeTruthy();
    expect(shown()).toHaveLength(1);
    expect(recorded.sent.filter((event) => event.kind === 'capture').map((event) => event.name)).toEqual(['conflict_shown']);
  } finally {
    recorded.restore();
  }
});

test('with the conflict area off, today\'s comparison stays and nothing is kept', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', '');
  const diary = createFakeDiary({ ...DIARY_REFERENCES });
  const fake = await editRent(diary.diary);
  changeRent(fake, { amount_minor: '1300000', version: 2 });
  press('Clear', '1', '2', '0', '0', '0');
  save();
  const panel = await screen.findByTestId('conflict');
  expect(within(panel).getByRole('button', { name: 'Apply my change' })).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'Reload' })).toBeTruthy();
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(kept(diary)).toHaveLength(0);
  cleanup();
  // A choice kept while the area was on is left alone: the record shows as usual.
  const earlier = createFakeDiary({ ...DIARY_REFERENCES, pendingChoices: [keptChoice()] });
  mountRecord(RENT, { diary: earlier.diary });
  expect(await screen.findByLabelText('Amount, Expense ฿12,268.00')).toBeTruthy();
  expect(screen.queryByTestId('choice-panel')).toBeNull();
  expect(kept(earlier)).toHaveLength(1);
});
