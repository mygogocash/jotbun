import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import type { TransactionDto } from '@gogospend/contracts';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { NOW, mountV1 } from './renderHarness';
import { TransactionsScreen } from './TransactionsScreen';

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

afterEach(() => cleanup());

const RENT = '0000000b-0000-4000-8000-000000000003';
const RENT_ROW = 'Bills, Expense ฿12,268.00';

async function golden() {
  const fake = createFakeResources(goldenSeed());
  mountV1(<TransactionsScreen now={NOW} />, fake.resources);
  await screen.findByLabelText(RENT_ROW);
  return fake;
}

test("lists the month's entries with signed amounts and the month's totals", async () => {
  const fake = await golden();
  expect(screen.getByText('September 2026')).toBeTruthy();
  expect(screen.getByLabelText('Salary, Income ฿28,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Food, Expense ฿182.00')).toBeTruthy();
  expect(screen.getByLabelText('Transfer, Transfer ฿1,500.00')).toBeTruthy();
  expect(screen.getByLabelText('Money in ฿28,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  expect(fake.callsOf('history')[0].args[0]).toEqual({ from: '2026-09-01', through: '2026-09-30', sort: 'date_desc' });
});

test('filters by type and moves between months', async () => {
  const fake = await golden();
  fireEvent.click(screen.getByRole('button', { name: 'Expense' }));
  await waitFor(() => expect(screen.queryByLabelText('Salary, Income ฿28,000.00')).toBeNull());
  expect(fake.callsOf('history').at(-1)?.args[0]).toMatchObject({ type: 'expense' });
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(await screen.findByText('No entries in this month')).toBeTruthy();
  expect(screen.getByText('August 2026')).toBeTruthy();
});

test('pages through every entry with Load more', async () => {
  const seed = goldenSeed();
  const [food] = BUILTINS;
  const extra: TransactionDto[] = Array.from({ length: 60 }, (_, i) => ({
    id: `0000000d-0000-4000-8000-${String(i).padStart(12, '0')}`, type: 'expense', amount_minor: String(100 + i), occurred_on: '2026-09-10',
    wallet_id: seed.wallets[0].id, category_id: food.id, note: null, merchant: null, deleted_at: null, version: 1,
  }));
  const fake = createFakeResources({ ...seed, records: [...seed.records, ...extra] });
  mountV1(<TransactionsScreen now={NOW} />, fake.resources);
  await screen.findByLabelText(RENT_ROW);
  expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(50);
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(64));
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});

test('edits with the current version and shows the server record after the acknowledgement', async () => {
  const fake = await golden();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  expect((screen.getByLabelText('Edit amount') as HTMLInputElement).value).toBe('12268.00');
  fireEvent.change(screen.getByLabelText('Edit amount'), { target: { value: '12,000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByLabelText('Bills, Expense ฿12,000.00')).toBeTruthy();
  const [id, version, changes] = fake.callsOf('updateTransaction')[0].args;
  expect([id, version, changes]).toEqual([RENT, 1, { amount_minor: '1200000' }]);
  // The shown record comes from a fresh read after the acknowledgement, not from the receipt.
  expect(fake.callsOf('history').length).toBeGreaterThan(1);
});

test('a conflicting edit offers reload or an explicit reapply, never a silent overwrite', async () => {
  const fake = await golden();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  // Another device changed the entry first.
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1300000', version: 2 });
  fireEvent.change(screen.getByLabelText('Edit amount'), { target: { value: '12,000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('This entry changed on another device. It now reads ฿13,000.00 (Rent).')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Apply my change' }));
  expect(await screen.findByLabelText('Bills, Expense ฿12,000.00')).toBeTruthy();
  const [first, second] = fake.callsOf('updateTransaction');
  expect(second.args[1]).toBe(2);
  expect(second.args[3]).not.toBe(first.args[3]);
});

test('reload after a conflict shows the other device’s version and drops the edit', async () => {
  const fake = await golden();
  fireEvent.click(screen.getByRole('button', { name: `Edit ${RENT_ROW}` }));
  const rent = fake.records.get(RENT) as TransactionDto;
  fake.records.set(RENT, { ...rent, amount_minor: '1300000', version: 2 });
  fireEvent.change(screen.getByLabelText('Edit amount'), { target: { value: '12,000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
  expect(await screen.findByLabelText('Bills, Expense ฿13,000.00')).toBeTruthy();
  expect(screen.queryByLabelText('Edit amount')).toBeNull();
  expect(fake.callsOf('updateTransaction')).toHaveLength(1);
});

test('delete hides the entry after the acknowledgement and Undo restores it', async () => {
  const fake = await golden();
  fireEvent.click(screen.getByRole('button', { name: `Delete ${RENT_ROW}` }));
  await waitFor(() => expect(screen.queryByLabelText(RENT_ROW)).toBeNull());
  expect(screen.getByText('Entry deleted')).toBeTruthy();
  expect(fake.callsOf('deleteTransaction')[0].args.slice(0, 2)).toEqual([RENT, 1]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByLabelText(RENT_ROW)).toBeTruthy();
  expect(fake.callsOf('restoreTransaction')[0].args.slice(0, 2)).toEqual([RENT, 2]);
});
