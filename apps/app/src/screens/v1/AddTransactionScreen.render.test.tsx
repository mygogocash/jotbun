import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { AddTransactionScreen } from './AddTransactionScreen';
import { NOW, mountV1 } from './renderHarness';

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const [food] = BUILTINS;
const seed = goldenSeed();
const [cash, daily] = seed.wallets;

beforeEach(() => {
  router.replace.mockReset();
});
afterEach(() => cleanup());

async function ready() {
  const fake = createFakeResources(seed);
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources);
  await screen.findByLabelText('Amount');
  return fake;
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('saves an expense as an exact command and returns home only after the acknowledgement', async () => {
  const fake = await ready();
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Food' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  const [input, key] = fake.callsOf('createTransaction')[0].args as [Record<string, unknown>, string];
  expect(input).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: cash.id, category_id: food.id, note: null, merchant: null });
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(key).not.toBe(input.id);
});

test.each([
  ['1,5', 'Enter an amount like 65 or 65.50'],
  ['0', 'Enter an amount above zero'],
  ['1.234', 'Use at most two decimal places'],
  ['', 'Enter an amount'],
])('refuses the amount %p without sending anything', async (amount, message) => {
  const fake = await ready();
  type('Amount', amount);
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('refuses an impossible date', async () => {
  const fake = await ready();
  type('Amount', '65');
  type('Date', '2026-02-30');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Enter a real date as YYYY-MM-DD')).toBeTruthy();
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('an unconfirmed save keeps the entry frozen and retries the same command', async () => {
  const fake = await ready();
  fake.fail('createTransaction', 'network');
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  expect((screen.getByLabelText('Amount') as HTMLInputElement).disabled || (screen.getByLabelText('Amount') as HTMLInputElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  const [first, second] = fake.callsOf('createTransaction');
  expect(second.args).toEqual(first.args);
});

// Review B1: a retry refused before processing (signed out, terms, an update, a
// changed session) says nothing about the unconfirmed first attempt, so the
// entry stays frozen with its key until that command's outcome is known.
test('an unconfirmed save stays frozen with its key when the retry is refused before processing', async () => {
  const fake = await ready();
  fake.loseResponse('createTransaction');
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Not confirmed yet. Your entry is kept; try again.')).toBeTruthy();
  fake.fail('createTransaction', 'signed_out', { status: 401 });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Sign in again to save.')).toBeTruthy();
  const amount = screen.getByLabelText('Amount') as HTMLInputElement;
  expect(amount.disabled || amount.readOnly).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  const calls = fake.callsOf('createTransaction').map((call) => call.args);
  expect(calls).toHaveLength(3);
  for (const call of calls) expect(call).toEqual(calls[0]);
  expect(fake.records.get((calls[0][0] as { id: string }).id)?.amount_minor).toBe('6500');
});

test('records a transfer between two different wallets', async () => {
  const fake = await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));
  type('Amount', '1,500');
  fireEvent.click(screen.getByRole('button', { name: 'To Cash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Choose two different wallets')).toBeTruthy();
  expect(fake.callsOf('createTransfer')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'To Daily account' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(fake.callsOf('createTransfer')[0].args[0]).toMatchObject({ amount_minor: '150000', source_wallet_id: cash.id, destination_wallet_id: daily.id });
});

test('an upgrade requirement blocks saving but keeps the draft', async () => {
  const fake = await ready();
  fake.fail('createTransaction', 'upgrade_required', { status: 426, code: 'CLIENT_UPGRADE_REQUIRED' });
  type('Amount', '65');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('Update Jotbun to keep saving. Your entry is kept.')).toBeTruthy();
  expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('65');
  expect(screen.getByRole('button', { name: 'Save entry' }).getAttribute('aria-disabled')).toBe('true');
  expect(router.replace).not.toHaveBeenCalled();
});

test('a refused entry shows the field problem, and the corrected entry is a new command', async () => {
  const fake = await ready();
  fake.fail('createTransaction', 'invalid', { status: 422, code: 'DATE_BEFORE_TRACKING_START', fields: { occurred_on: 'x' } });
  type('Amount', '65');
  type('Date', '2026-08-31');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText('This date is before the wallet started tracking.')).toBeTruthy();
  type('Date', '2026-09-02');
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  const [first, second] = fake.callsOf('createTransaction');
  expect(second.args[1]).not.toBe(first.args[1]);
});
