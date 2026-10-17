import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { HomeScreen } from './HomeScreen';
import { NOW, mountV1 } from './renderHarness';

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});
afterEach(() => cleanup());

test('shows loading, then exact golden balances, the month and recent entries', async () => {
  const fake = createFakeResources(goldenSeed());
  mountV1(<HomeScreen now={NOW} />, fake.resources);
  expect(screen.getByLabelText('Loading your diary')).toBeTruthy();
  expect(await screen.findByText('฿21,050.00')).toBeTruthy();
  expect(screen.getByText('฿2,350.00')).toBeTruthy();
  expect(screen.getByText('฿18,700.00')).toBeTruthy();
  expect(screen.getByLabelText('Money in ฿28,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Money out ฿12,450.00')).toBeTruthy();
  expect(screen.getByLabelText('Bills, Expense ฿12,268.00')).toBeTruthy();
  expect(fake.callsOf('summary')[0].args).toEqual(['2026-09']);
});

test('add and see-all go to their screens', async () => {
  const fake = createFakeResources(goldenSeed());
  mountV1(<HomeScreen now={NOW} />, fake.resources);
  fireEvent.click(await screen.findByRole('button', { name: 'Add an entry' }));
  expect(router.push).toHaveBeenCalledWith('/spend/add');
  fireEvent.click(screen.getByRole('button', { name: 'See all entries' }));
  expect(router.push).toHaveBeenCalledWith('/spend/all');
});

test('an empty account asks for an explicit first wallet; nothing is created by default', async () => {
  const fake = createFakeResources();
  mountV1(<HomeScreen now={NOW} />, fake.resources);
  expect(await screen.findByText('Add your first wallet')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByText('Enter a wallet name')).toBeTruthy();
  expect(fake.callsOf('createWallet')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Wallet name'), { target: { value: ' Cash ' } });
  fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: '1,000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  expect(await screen.findByLabelText('Cash ฿1,000.00')).toBeTruthy();
  const [input, key] = fake.callsOf('createWallet')[0].args as [Record<string, string>, string];
  expect(input).toMatchObject({ name: 'Cash', opening_minor: '100000', tracking_start: '2026-09-29' });
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
});

test('a failed load offers a retry that loads again', async () => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('wallets', 'network');
  mountV1(<HomeScreen now={NOW} />, fake.resources);
  expect(await screen.findByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('฿21,050.00')).toBeTruthy();
});

test.each([
  ['upgrade_required', 'Update GoGoSpend to keep using your diary. Nothing you saved is lost.'],
  ['policy_required', 'Review and accept the updated terms to continue.'],
  ['signed_out', 'Sign in again to see your diary.'],
])('%s shows its own state, not a generic error', async (outcome, message) => {
  const fake = createFakeResources(goldenSeed());
  fake.fail('ensureBuiltinCategories', outcome as 'upgrade_required');
  mountV1(<HomeScreen now={NOW} />, fake.resources);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add an entry' })).toBeNull();
});
