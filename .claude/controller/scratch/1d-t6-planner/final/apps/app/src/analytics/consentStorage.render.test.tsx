// This phone's analytics answer (plan 1D-T6): kept in the secure store, on this
// device only, and read back only when it is exactly a stored answer.
import { Platform } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const secure = vi.hoisted(() => ({ values: new Map<string, string>(), options: [] as unknown[], locked: false }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string, options?: unknown) => {
    secure.options.push(options);
    if (secure.locked) throw new Error('keychain locked');
    return secure.values.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string, options?: unknown) => { secure.options.push(options); secure.values.set(key, value); },
  deleteItemAsync: async (key: string, options?: unknown) => { secure.options.push(options); secure.values.delete(key); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));

import { ANALYTICS_CONSENT_KEY, eraseStoredConsent, readStoredConsent, writeStoredConsent } from './consentStorage';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const os = Platform.OS;
const onNative = () => Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
beforeEach(() => {
  secure.values.clear();
  secure.options = [];
  secure.locked = false;
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

test('on native the answer is kept on this device only, read back, and erased', async () => {
  onNative();
  expect(await readStoredConsent()).toBeNull();
  await writeStoredConsent({ accountId: ACCOUNT, answer: 'no', pendingServer: true });
  expect(JSON.parse(secure.values.get(ANALYTICS_CONSENT_KEY) ?? 'null')).toEqual({ accountId: ACCOUNT, answer: 'no', pendingServer: true });
  expect(await readStoredConsent()).toEqual({ accountId: ACCOUNT, answer: 'no', pendingServer: true });
  await eraseStoredConsent();
  expect(secure.values.has(ANALYTICS_CONSENT_KEY)).toBe(false);
  expect(await readStoredConsent()).toBeNull();
  expect(secure.options.length).toBeGreaterThan(0);
  for (const options of secure.options) expect(options).toEqual({ keychainAccessible: 'when-unlocked-this-device-only' });
});

test('anything that is not exactly a stored answer reads as none, and a failing read never throws', async () => {
  onNative();
  const unreadable = [
    'not json',
    '"no"',
    JSON.stringify([ACCOUNT, 'no', true]),
    JSON.stringify({ accountId: 'kan@example.com', answer: 'no', pendingServer: true }),
    JSON.stringify({ accountId: ACCOUNT, answer: 'maybe', pendingServer: true }),
    JSON.stringify({ accountId: ACCOUNT, answer: 'yes', pendingServer: 'false' }),
    JSON.stringify({ accountId: ACCOUNT, answer: 'yes', pendingServer: false, note: 'extra' }),
  ];
  for (const text of unreadable) {
    secure.values.set(ANALYTICS_CONSENT_KEY, text);
    expect(await readStoredConsent(), text).toBeNull();
  }
  secure.values.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ accountId: ACCOUNT, answer: 'no', pendingServer: true }));
  secure.locked = true;
  await expect(readStoredConsent()).resolves.toBeNull();
});

test('on the web nothing is kept', async () => {
  await writeStoredConsent({ accountId: ACCOUNT, answer: 'yes', pendingServer: false });
  expect(secure.values.size).toBe(0);
  expect(await readStoredConsent()).toBeNull();
  await eraseStoredConsent();
  expect(secure.options).toEqual([]);
});
