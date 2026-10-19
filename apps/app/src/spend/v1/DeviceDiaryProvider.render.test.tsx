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
const captured = vi.hoisted(() => ({ deps: null as null | Record<string, unknown> }));
vi.mock('@mobile/spend/v1/spendDiary', async () => {
  const { createFakeDiary } = await import('@mobile/spend/v1/testing/fakeDiary');
  return {
    createSpendDiary: (deps: Record<string, unknown>) => {
      captured.deps = deps;
      return createFakeDiary().diary;
    },
  };
});
vi.mock('@mobile/storage/deviceDiary', () => ({ createDeviceAccountDatabase: () => ({ open: async () => { throw new Error('not opened in this test'); }, discard: async () => undefined }) }));
vi.mock('@mobile/sync/deviceSync', () => ({ createDeviceSync: () => { throw new Error('no sync in this test'); } }));
vi.mock('@mobile/api/sharedV1', () => ({ fetchAccountId: async () => { throw new Error('offline'); } }));
vi.mock('@mobile/auth/session', () => ({ getV1SessionSnapshot: () => ({ binding: null, epoch: 1 }), subscribeSession: () => () => undefined }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

import { DeviceDiaryProvider } from './DeviceDiaryProvider';
import { IMPORT_DRAFT_KEY_PREFIX } from './importDraftStore';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const REMINDER = 'gogospend.reminder.v1';

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  plain.clear();
  captured.deps = null;
});

test("the device diary erases an account's leftover plain-text import draft before first use, and again at the sign-out erase", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  for (const [key, value] of [[`${IMPORT_DRAFT_KEY_PREFIX}${A}`, '{"version":1}'], [`${IMPORT_DRAFT_KEY_PREFIX}${B}`, '{"version":1}'], [REMINDER, '{"enabled":true}']]) plain.set(key, value);
  render(<DeviceDiaryProvider><Text>screens</Text></DeviceDiaryProvider>);
  const deps = captured.deps as { eraseLegacyImportDraft?: (accountId: string) => Promise<void>; eraseWithDiary?: (accountId: string) => Promise<void> };
  expect(typeof deps.eraseLegacyImportDraft).toBe('function');

  await deps.eraseLegacyImportDraft?.(A);
  expect([...plain.keys()].sort()).toEqual([`${IMPORT_DRAFT_KEY_PREFIX}${B}`, REMINDER].sort());
  await deps.eraseWithDiary?.(B);
  expect([...plain.keys()]).toEqual([REMINDER]);
});
