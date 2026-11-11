// The shared v1 transport tells the server whether this phone's answer is yes
// (plan 1D, L4; 1D-T6): every request carries X-GoGoSpend-Analytics: off
// unless the installed controller allows analytics, read at each request.
import { Platform } from 'react-native';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';

// Metro defines __DEV__; the shared transport reads it for the LAN rule.
vi.hoisted(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = false; });
vi.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
vi.mock('expo-crypto', () => ({ digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

import { getAnalytics, setAnalytics } from '@mobile/analytics/bus';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { setSession } from '@mobile/auth/session';
import { fetchAccountId } from './sharedV1';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
afterAll(() => { delete (globalThis as { __DEV__?: boolean }).__DEV__; });
const sent: Array<Record<string, string>> = [];
const os = Platform.OS;

beforeEach(() => {
  sent.length = 0;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push({ ...(init.headers as Record<string, string>) });
    return new Response(JSON.stringify({ account_id: ACCOUNT }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
  setAnalytics(null);
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

test("requests from the app carry X-GoGoSpend-Analytics: off unless this phone's answer is yes", async () => {
  expect(getAnalytics()).toBeNull();
  await fetchAccountId();
  const { analytics } = await recordAnalytics();
  expect(analytics.allowsAnalytics()).toBe(true);
  await fetchAccountId();
  await analytics.answer('no');
  await fetchAccountId();
  expect(sent.map((headers) => headers['X-GoGoSpend-Analytics'] ?? null)).toEqual(['off', null, 'off']);
});
