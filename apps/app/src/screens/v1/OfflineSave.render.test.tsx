import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { BUILTINS, createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { DiaryLocked, DraftReferenceUnavailable } from '@mobile/storage/types';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
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

// S4 review fixes.

const seed = goldenSeed();
const entry = (overrides: Partial<PendingEntry> = {}): PendingEntry =>
  ({ id: crypto.randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-09-29', wallet_id: seed.wallets[0].id, category_id: BUILTINS[0].id, note: null, merchant: null, ...overrides }) as PendingEntry;
const queued = (payload: PendingEntry, state: OutboxCommand['state']): OutboxCommand => ({
  commandId: crypto.randomUUID(), accountId: crypto.randomUUID(), schemaVersion: 1, kind: 'transaction.create', payload, state,
  firstTransmissionAt: state === 'unsent' ? null : '2026-09-29T03:00:00.000Z', createdAt: '2026-09-29T03:00:00.000Z', ackedRevision: state === 'acknowledged' ? '99' : null,
});

test('offline, Add works from the wallets and categories synced to the device', async () => {
  const fake = createFakeResources(seed);
  fake.fail('wallets', 'network');
  const diary = createFakeDiary({ wallets: seed.wallets, categories: BUILTINS });
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(diary.saves[0]).toMatchObject({ wallet_id: seed.wallets[0].id, category_id: BUILTINS[0].id });
  expect(diary.commandIds[0]).toMatch(/^[0-9a-f-]{36}$/);
});

test('offline, Home still shows the sync banner, money waiting on the device and Add', async () => {
  const fake = createFakeResources(seed);
  fake.fail('summary', 'network');
  const diary = createFakeDiary({ outbox: [queued(entry(), 'unsent')], wallets: seed.wallets, categories: BUILTINS });
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  expect(await screen.findByText('Saved on device · Waiting to sync (1)')).toBeTruthy();
  expect(screen.getByLabelText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  expect(screen.getByText("We couldn't load your diary.")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
  expect(router.push).toHaveBeenCalledWith('/spend/add');
});

test('an entry being checked with Jotbun is not shown as waiting money', async () => {
  const fake = createFakeResources(seed);
  const committed = entry();
  await fake.resources.createTransaction(committed as never, crypto.randomUUID()); // it committed; the response was lost
  const diary = createFakeDiary({ outbox: [queued(committed, 'uncertain'), queued(entry(), 'needs_review')] });
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  expect(await screen.findByLabelText('Money out ฿12,515.00')).toBeTruthy();
  expect(screen.queryByLabelText(/Waiting to sync: money out/)).toBeNull();
  expect(screen.getByLabelText('Checking with Jotbun: money out ฿65.00')).toBeTruthy();
  expect(screen.getByText('Entries that need your review: 1')).toBeTruthy();
});

test('when a waiting entry is acknowledged, Home reloads confirmed money without a loading flash', async () => {
  const fake = createFakeResources(seed);
  const waiting = entry();
  const diary = createFakeDiary({ outbox: [queued(waiting, 'unsent')] });
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  expect(await screen.findByLabelText('Waiting to sync: money out ฿65.00')).toBeTruthy();
  await fake.resources.createTransaction(waiting as never, crypto.randomUUID());
  act(() => diary.set({ outbox: [queued(waiting, 'acknowledged')] }));
  expect(screen.queryByText('Loading your diary')).toBeNull();
  expect(await screen.findByLabelText('Money out ฿12,515.00')).toBeTruthy();
  expect(screen.queryByLabelText(/Waiting to sync/)).toBeNull();
  expect(fake.callsOf('summary')).toHaveLength(2);
});

test('an unconfirmed online save stays online when the diary opens: Try again resends the same command', async () => {
  const fake = createFakeResources(seed);
  fake.loseResponse('createTransaction');
  const diary = createFakeDiary({ phase: 'opening' });
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  const again = await screen.findByRole('button', { name: 'Try again' });
  act(() => diary.set({ phase: 'ready', wallets: seed.wallets, categories: BUILTINS }));
  fireEvent.click(again);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/spend'));
  expect(diary.saves).toHaveLength(0);
  const keys = fake.callsOf('createTransaction').map((call) => call.args[1]);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(fake.records.size).toBe(seed.records.length + 1);
});

test('a device save that fails says why', async () => {
  const fake = createFakeResources(seed);
  const diary = createFakeDiary();
  diary.failNextSave(new DiaryLocked('locked'));
  mountV1(<AddTransactionScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText("This device's diary is locked. Nothing was saved.")).toBeTruthy();
  diary.failNextSave(new DraftReferenceUnavailable('wallet'));
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(await screen.findByText("This wallet or category isn't on this device yet. Connect and try again. Nothing was saved.")).toBeTruthy();
});

test('creating the first wallet online asks the device diary to sync it', async () => {
  const fake = createFakeResources();
  const diary = createFakeDiary();
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  fireEvent.change(await screen.findByLabelText('Wallet name'), { target: { value: 'Cash' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create wallet' }));
  await waitFor(() => expect(diary.calls.retry).toBeGreaterThan(0));
});

test('drafts waiting on the device can be undone; ones that need review can be discarded', async () => {
  const fake = createFakeResources(seed);
  const unsent = queued(entry(), 'unsent');
  const review = queued(entry({ amount_minor: '1200' }), 'needs_review');
  const checking = queued(entry({ amount_minor: '900' }), 'uncertain');
  const diary = createFakeDiary({ outbox: [unsent, review, checking] });
  mountV1(<HomeScreen now={NOW} />, fake.resources, 'en', diary.diary);
  expect(await screen.findByText('Saved on this device')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Food ฿65.00' }));
  await waitFor(() => expect(diary.calls.removed).toEqual([unsent.commandId]));
  fireEvent.click(screen.getByRole('button', { name: 'Discard Food ฿12.00' }));
  await waitFor(() => expect(diary.calls.discarded).toEqual([review.commandId]));
  expect(screen.queryByRole('button', { name: /฿9.00/ })).toBeNull();
});
