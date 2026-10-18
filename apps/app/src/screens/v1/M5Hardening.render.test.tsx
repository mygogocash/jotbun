// Regression tests for the independent M5 review findings: saves that may
// have committed, reads after an acknowledgement, per-action command keys,
// conflict data, pagination after edits, and Thai at runtime.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { TransactionDto } from '@gogospend/contracts';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { AddTransactionScreen } from './AddTransactionScreen';
import { HomeScreen } from './HomeScreen';
import { NOW, mountV1 } from './renderHarness';
import { TransactionsScreen } from './TransactionsScreen';

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

beforeEach(() => {
  router.replace.mockReset();
});
afterEach(() => cleanup());

const RENT = '0000000b-0000-4000-8000-000000000003';
const RENT_ROW = 'Bills, Expense ฿12,268.00';
const FOOD_ROW = 'Food, Expense ฿182.00';
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const isLocked = (label: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  return input.disabled || input.readOnly;
};

async function addScreen() {
  const fake = createFakeResources(goldenSeed());
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources);
  await screen.findByLabelText('Amount');
  return fake;
}

async function transactionsScreen(records?: TransactionDto[]) {
  const seed = goldenSeed();
  const fake = createFakeResources(records ? { ...seed, records: [...seed.records, ...records] } : seed);
  mountV1(<TransactionsScreen now={NOW} />, fake.resources);
  await screen.findByLabelText(RENT_ROW);
  return fake;
}

test('an acknowledgement that arrives garbled is unconfirmed, and retrying the same command finishes', async () => {
  const fake = await addScreen();
  fake.loseResponse('createTransaction', 'invalid_response');
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  expect(isLocked('Amount')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  const [first, second] = fake.callsOf('createTransaction');
  expect(second.args).toEqual(first.args);
  expect(fake.records.size).toBe(5);
});

test('a lost response after the save committed resolves by replay, with no duplicate', async () => {
  const fake = await addScreen();
  fake.loseResponse('createTransaction');
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(fake.records.size).toBe(5);
});

test('if this entry already exists under an earlier command, it counts as saved', async () => {
  const fake = await addScreen();
  fake.fail('createTransaction', 'invalid', { status: 422, code: 'DATE_BEFORE_TRACKING_START', fields: { occurred_on: 'x' } });
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await screen.findByText('This date is before the wallet started tracking.');
  // An earlier attempt of this same entry had in fact committed.
  const [input] = fake.callsOf('createTransaction')[0].args as [TransactionDto];
  fake.records.set(input.id, { ...input, deleted_at: null, version: 1 } as TransactionDto);
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(screen.queryByText('This entry could not be saved.')).toBeNull();
});

test('a failed reload after an acknowledged edit is a load problem, not an unconfirmed save', async () => {
  const fake = await transactionsScreen();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  type('Edit amount', '12,000');
  fake.fail('history', 'network');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  expect(screen.queryByText('Not confirmed yet. Your entry is kept; try again.')).toBeNull();
  expect(screen.queryByLabelText('Edit amount')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Bills, Expense ฿12,000.00')).toBeTruthy();
});

test('an unconfirmed edit is frozen and retried as the same command', async () => {
  const fake = await transactionsScreen();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  type('Edit amount', '12,000');
  fake.loseResponse('updateTransaction');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  expect(isLocked('Edit amount')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Bills, Expense ฿12,000.00')).toBeTruthy();
  const [first, second] = fake.callsOf('updateTransaction');
  expect(second.args).toEqual(first.args);
});

test('an unconfirmed delete keeps its own key while another entry is edited', async () => {
  const fake = await transactionsScreen();
  fake.loseResponse('deleteTransaction');
  fireEvent.click(screen.getByRole('button', { name: `Delete ${RENT_ROW}` }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${FOOD_ROW}` }));
  type('Edit amount', '200');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByLabelText('Food, Expense ฿200.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByLabelText(RENT_ROW)).toBeNull());
  const [first, second] = fake.callsOf('deleteTransaction');
  expect(second.args).toEqual(first.args);
  expect(screen.getByText('Entry deleted')).toBeTruthy();
});

test("a conflict shows the other device's values before reapplying", async () => {
  const fake = await transactionsScreen();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1300000', note: 'Rent and water', version: 2 });
  type('Edit amount', '12,000');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('This entry changed on another device. It now reads ฿13,000.00 (Rent and water).')).toBeTruthy();
});

test('a conflict without a usable current record reloads instead of looping', async () => {
  const fake = await transactionsScreen();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  fake.fail('updateTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { id: 'someone-else', amount_minor: 5 } });
  type('Edit amount', '12,000');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Apply my change' })).toBeNull();
  expect(screen.queryByLabelText('Edit amount')).toBeNull();
  await waitFor(() => expect(fake.callsOf('history')).toHaveLength(2));
});

test('deleting an entry another device already deleted reloads with a clear notice', async () => {
  const fake = await transactionsScreen();
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, deleted_at: '2026-09-29T00:00:00.000Z', version: 2 });
  fireEvent.click(screen.getByRole('button', { name: `Delete ${RENT_ROW}` }));
  expect(await screen.findByText('This entry was already deleted.')).toBeTruthy();
  await waitFor(() => expect(screen.queryByLabelText(RENT_ROW)).toBeNull());
});

test('editing after Load more keeps every loaded entry', async () => {
  const [food] = BUILTINS;
  const extra: TransactionDto[] = Array.from({ length: 60 }, (_, i) => ({
    id: `0000000d-0000-4000-8000-${String(i).padStart(12, '0')}`, type: 'expense', amount_minor: String(100 + i), occurred_on: '2026-09-10',
    wallet_id: goldenSeed().wallets[0].id, category_id: food.id, note: null, merchant: null, deleted_at: null, version: 1,
  }));
  await transactionsScreen(extra);
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(64));
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  type('Edit amount', '12,000');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByLabelText('Bills, Expense ฿12,000.00')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(64);
});

test('the screens speak Thai, and Thai digits are understood in the first-wallet form', async () => {
  const fake = createFakeResources();
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'th');
  expect(await screen.findByText('เพิ่มกระเป๋าเงินใบแรก')).toBeTruthy();
  type('ชื่อกระเป๋าเงิน', 'เงินสด');
  type('ยอดเริ่มต้น', '๑,๐๐๐');
  fireEvent.click(screen.getByRole('button', { name: 'สร้างกระเป๋าเงิน' }));
  expect(await screen.findByLabelText('เงินสด ฿1,000.00')).toBeTruthy();
  expect((fake.callsOf('createWallet')[0].args[0] as { opening_minor: string }).opening_minor).toBe('100000');
});
