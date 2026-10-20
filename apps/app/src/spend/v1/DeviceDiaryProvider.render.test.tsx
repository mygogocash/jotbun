// Decision 7: the import draft lives in the encrypted diary. On the device,
// the plain-text draft an older build kept in AsyncStorage is erased before the
// diary draft's first use, and still at the explicit sign-out erase.
import { cleanup, render } from '@testing-library/react';
import { Platform, Text } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

const plain = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => plain.get(key) ?? null,
    setItem: async (key: string, value: string) => void plain.set(key, value),
    removeItem: async (key: string) => void plain.delete(key),
    getAllKeys: async () => [...plain.keys()],
  },
}));
// The diary itself is a fake: this test reads only what the provider hands it.
const captured = vi.hoisted(() => ({ deps: null as null | Record<string, unknown>, created: [] as { close: () => Promise<void> }[] }));
vi.mock('@mobile/spend/v1/spendDiary', async () => {
  const { createFakeDiary } = await import('@mobile/spend/v1/testing/fakeDiary');
  return {
    createSpendDiary: (deps: Record<string, unknown>) => {
      captured.deps = deps;
      const diary = createFakeDiary().diary;
      captured.created.push(diary);
      return diary;
    },
  };
});
vi.mock('@mobile/storage/deviceDiary', () => ({ createDeviceAccountDatabase: () => ({ open: async () => { throw new Error('not opened in this test'); }, discard: async () => undefined }) }));
vi.mock('@mobile/sync/deviceSync', () => ({ createDeviceSync: () => { throw new Error('no sync in this test'); } }));
vi.mock('@mobile/api/sharedV1', () => ({ fetchAccountId: async () => { throw new Error('offline'); } }));
const sessions = vi.hoisted(() => ({ subscribed: 0, unsubscribed: 0 }));
vi.mock('@mobile/auth/session', () => ({
  getV1SessionSnapshot: () => ({ binding: null, epoch: 1 }),
  subscribeSession: () => {
    sessions.subscribed += 1;
    return () => { sessions.unsubscribed += 1; };
  },
}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
// History's kept view follows the route: a record is open over History here.
vi.mock('expo-router', () => ({ usePathname: () => '/spend/record/r1' }));

import { HistoryKeepProvider, useHistoryKeep } from '@mobile/screens/redesign/HistoryKeepProvider';
import type { HistoryKeep } from '@mobile/screens/redesign/historyKeep';
import { DeviceDiaryProvider } from './DeviceDiaryProvider';
import { useSpendDiary } from './SpendDiaryContext';
import { IMPORT_DRAFT_KEY_PREFIX } from './importDraftStore';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const REMINDER = 'gogospend.reminder.v1';

const os = Platform.OS;
afterEach(async () => {
  cleanup();
  // The shared device diary closes a tick after its last provider leaves.
  await new Promise((resolve) => setTimeout(resolve, 0));
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  plain.clear();
  captured.deps = null;
  captured.created = [];
  sessions.subscribed = 0;
  sessions.unsubscribed = 0;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the device diary erases every leftover plain-text import draft before first use, and an account's again at the sign-out erase", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  for (const [key, value] of [[`${IMPORT_DRAFT_KEY_PREFIX}${A}`, '{"version":1}'], [`${IMPORT_DRAFT_KEY_PREFIX}${B}`, '{"version":1}'], [REMINDER, '{"enabled":true}']]) plain.set(key, value);
  render(<DeviceDiaryProvider><Text>screens</Text></DeviceDiaryProvider>);
  const deps = captured.deps as { eraseLegacyImportDraft?: (accountId: string) => Promise<void>; eraseWithDiary?: (accountId: string) => Promise<void> };
  expect(typeof deps.eraseLegacyImportDraft).toBe('function');

  // No plain-text draft of any account outlives the first use of a diary draft on this device.
  await deps.eraseLegacyImportDraft?.(A);
  expect([...plain.keys()]).toEqual([REMINDER]);
  plain.set(`${IMPORT_DRAFT_KEY_PREFIX}${B}`, '{"version":1}');
  await deps.eraseWithDiary?.(B);
  expect([...plain.keys()]).toEqual([REMINDER]);
});

test("the sign-out erase also forgets History's view, kept while one of its entries is open", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  const seen: { keep: HistoryKeep | null } = { keep: null };
  const Probe = () => {
    seen.keep = useHistoryKeep();
    return null;
  };
  render(<DeviceDiaryProvider><HistoryKeepProvider><Probe /></HistoryKeepProvider></DeviceDiaryProvider>);
  const view = { month: '2026-09', type: 'expense', walletId: undefined, categoryId: undefined, query: 'rent', shown: 62 } as const;
  seen.keep?.keep(view);
  expect(seen.keep?.kept()).toEqual(view);
  const deps = captured.deps as { eraseWithDiary?: (accountId: string) => Promise<void> };
  await deps.eraseWithDiary?.(A);
  expect(seen.keep?.kept()).toBeNull();
});

test('spend and Settings share one device diary: leaving Settings never closes the diary the spend screens still use', async () => {
  // Settings sits on top of a spend screen, so both route groups mount a
  // provider at once. Two diaries over the one database each synced it, and
  // the first to unmount locked the store under the other (Quick add saves
  // and the import draft then failed with DiaryLocked).
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  const seen: unknown[] = [];
  const Probe = () => {
    seen.push(useSpendDiary());
    return null;
  };
  const spend = render(<DeviceDiaryProvider><Probe /></DeviceDiaryProvider>);
  const settings = render(<DeviceDiaryProvider><Probe /></DeviceDiaryProvider>);
  expect(captured.created).toHaveLength(1);
  expect(new Set(seen).size).toBe(1);
  // One set of listeners for the one diary.
  expect(sessions.subscribed).toBe(1);
  const close = vi.spyOn(captured.created[0], 'close');
  settings.unmount();
  await tick();
  expect(close).not.toHaveBeenCalled();
  expect(sessions.unsubscribed).toBe(0);
  // The last provider to leave closes it, once; a later mount starts a new one.
  spend.unmount();
  await tick();
  expect(close).toHaveBeenCalledTimes(1);
  expect(sessions.unsubscribed).toBe(1);
  render(<DeviceDiaryProvider><Probe /></DeviceDiaryProvider>);
  expect(captured.created).toHaveLength(2);
});
