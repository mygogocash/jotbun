import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { AddTransactionScreen } from './AddTransactionScreen';
import { HomeScreen } from './HomeScreen';
import { NOW, mountV1 } from './renderHarness';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

afterEach(() => {
  cleanup();
  router.replace.mockClear();
});

test('with a device diary, an entry is saved on the device first and never sent directly', async () => {
  const fake = createFakeResources(goldenSeed());
  const diary = createFakeDiary();
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(diary.saves).toHaveLength(1);
  expect(diary.saves[0]).toMatchObject({ type: 'expense', amount_minor: '6500', category_id: BUILTINS[0].id });
  expect(fake.callsOf('createTransaction')).toHaveLength(0);
});

test('a failed local save shows a save error and never claims the entry was saved', async () => {
  const fake = createFakeResources(goldenSeed());
  const diary = createFakeDiary();
  diary.failNextSave(new Error('disk full'));
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText("Couldn't save this entry on the device. Nothing was saved.")).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByText(/Saved on device/)).toBeNull();
});

test('Home keeps confirmed money and money waiting on the device apart', async () => {
  const fake = createFakeResources(goldenSeed());
  const diary = createFakeDiary();
  await diary.diary.saveDraft({ id: crypto.randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: goldenSeed().wallets[0].id, category_id: BUILTINS[0].id });
  diary.set({ outbox: [{ commandId: crypto.randomUUID(), accountId: crypto.randomUUID(), schemaVersion: 1, kind: 'transaction.create', payload: diary.saves[0], state: 'unsent', firstTransmissionAt: null, createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: null }] });
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  expect(await screen.findByLabelText('Money out ฿12,450.00')).toBeTruthy();
  expect(screen.getByLabelText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  expect(screen.getByText('Saved on device · Waiting to sync (1)')).toBeTruthy();
});
