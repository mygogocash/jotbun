// Review nit: the explicit sign-out erase also forgets the bun's device
// settings (DeviceDiaryProvider's `eraseWithDiary` calls these two).
import { Platform } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '@mobile/i18n/languagePreferenceStorage';
import { QUICK_ADD_CHEER_KEY, eraseCheerDay } from '@mobile/screens/redesign/quickAddCheer';
import { CELEBRATION_WEEK_KEY } from '@mobile/screens/redesign/insights/celebrationWeek';
import { CASHBACK_DECLINED_KEY } from '@mobile/screens/redesign/insights/cashbackDecline';
import { HAPTIC_PREFERENCE_STORAGE_KEY } from '@mobile/lib/hapticPreferenceStorage';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { ANALYTICS_CONSENT_KEY } from '@mobile/analytics/consentStorage';
import { BUN_INTENSITY_STORAGE_KEY, eraseStoredBunIntensity } from './bunIntensityStorage';
import { installBrowserStorage } from './mascotTestHarness';

const store = vi.hoisted(() => ({ deleteItemAsync: vi.fn(async () => undefined), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only' }));
vi.mock('expo-secure-store', () => store);
// DeviceDiaryProvider's own erase hook, without the device database, sync or session behind it.
const erased = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock('@mobile/spend/v1/deviceImportDraftStore', () => ({
  eraseLegacyImportDraft: async (accountId: string) => { erased.order.push(`import draft ${accountId}`); },
}));
vi.mock('@mobile/storage/deviceDiary', () => ({ createDeviceAccountDatabase: () => { throw new Error('no device database in this test'); } }));
vi.mock('@mobile/sync/deviceSync', () => ({ createDeviceSync: () => { throw new Error('no sync in this test'); } }));
vi.mock('@mobile/api/sharedV1', () => ({ fetchAccountId: async () => null }));
vi.mock('@mobile/auth/session', () => ({ getV1SessionSnapshot: () => null, subscribeSession: () => () => undefined }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

import { eraseWithDiary } from '@mobile/spend/v1/DeviceDiaryProvider';

const os = Platform.OS;
beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  window.localStorage.clear();
  store.deleteItemAsync.mockClear();
});

test('on the web the intensity and the cheer day leave browser storage', async () => {
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'off');
  window.localStorage.setItem(QUICK_ADD_CHEER_KEY, '2026-09-29');
  window.localStorage.setItem('gogospend.theme.preference', 'dark');
  await eraseStoredBunIntensity();
  await eraseCheerDay();
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBeNull();
  expect(window.localStorage.getItem(QUICK_ADD_CHEER_KEY)).toBeNull();
  // Only the bun's own keys.
  expect(window.localStorage.getItem('gogospend.theme.preference')).toBe('dark');
});

test('on native both keys leave the secure store', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  await eraseStoredBunIntensity();
  await eraseCheerDay();
  expect(store.deleteItemAsync.mock.calls.map((call) => (call as unknown[])[0])).toEqual([BUN_INTENSITY_STORAGE_KEY, QUICK_ADD_CHEER_KEY]);
});

test('the sign-out erase hook forgets the bun settings after the import draft, and a setting that cannot be erased never stops it', async () => {
  erased.order = [];
  window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, 'quiet');
  window.localStorage.setItem(QUICK_ADD_CHEER_KEY, '2026-09-29');
  window.localStorage.setItem(CELEBRATION_WEEK_KEY, '2026-W43');
  window.localStorage.setItem(CASHBACK_DECLINED_KEY, '1');
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'th');
  await eraseWithDiary('a0000000-0000-4000-8000-000000000001');
  expect(erased.order).toEqual(['import draft a0000000-0000-4000-8000-000000000001']);
  expect(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)).toBeNull();
  expect(window.localStorage.getItem(QUICK_ADD_CHEER_KEY)).toBeNull();
  expect(window.localStorage.getItem(CELEBRATION_WEEK_KEY)).toBeNull();
  expect(window.localStorage.getItem(CASHBACK_DECLINED_KEY)).toBeNull();
  // The phone's own settings stay: the language choice is kept, as the theme preference is.
  expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
  expect(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('th');
  // On native a locked keychain refuses the delete; the erase still finishes.
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  store.deleteItemAsync.mockRejectedValue(new Error('keychain locked'));
  await expect(eraseWithDiary('a0000000-0000-4000-8000-000000000001')).resolves.toBeUndefined();
  expect(store.deleteItemAsync.mock.calls.map((call) => (call as unknown[])[0])).toEqual([BUN_INTENSITY_STORAGE_KEY, HAPTIC_PREFERENCE_STORAGE_KEY, QUICK_ADD_CHEER_KEY, CELEBRATION_WEEK_KEY, CASHBACK_DECLINED_KEY, ANALYTICS_CONSENT_KEY]);
  store.deleteItemAsync.mockReset();
  store.deleteItemAsync.mockImplementation(async () => undefined);
});
