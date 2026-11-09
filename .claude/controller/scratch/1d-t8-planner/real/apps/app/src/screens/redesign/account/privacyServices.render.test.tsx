// The app's own transport for Privacy and data (privacyServices.ts) is built
// as the shared one is (sharedV1.ts): a development build may reach
// `wrangler dev` on the LAN (plan 1D, L8), and every request carries
// X-GoGoSpend-Analytics: off unless this phone's answer is yes (L4). 1D-T8,
// from 1C-T6's and 1D-T6's reviews (m4).
import { afterEach, expect, test, vi } from 'vitest';

// SettingsParts loads the router and safe areas; the real shared client loads native modules a render test cannot.
vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('@mobile/api/sharedV1', () => ({ v1ClientVersion: () => ({ platform: 'ios', version: '1.2.3' }) }));

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { setSession } from '@mobile/auth/session';
import { appPrivacyServices } from './privacyServices';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const EXPORT_ID = '7b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setSession(null);
});

test("Privacy's transport reaches a LAN Worker in a development build, and turns server events off unless the answer is yes", async () => {
  // The render suite is a development build (__DEV__, vitest.render.config.ts).
  vi.stubEnv('EXPO_PUBLIC_V1_API_URL', 'http://192.168.1.20:8787');
  const seen: { url: string; analytics: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, analytics: (init.headers as Record<string, string>)['X-GoGoSpend-Analytics'] ?? null });
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  setSession({ access_token: 'token-a', userId: ACCOUNT, binding: 'session-a' });
  // A release build refuses http:// to a LAN address; a development build takes it.
  expect(() => appPrivacyServices()).not.toThrow();
  const services = appPrivacyServices();
  const check = () => services.privacy.exportStatus(EXPORT_ID).catch(() => undefined);
  // No controller yet, then a yes, then a no.
  await check();
  const recorded = await recordAnalytics();
  try {
    await check();
    await recorded.analytics.answer('no');
    await check();
  } finally {
    recorded.restore();
  }
  expect(seen.map((request) => request.url)).toEqual(Array.from({ length: 3 }, () => `http://192.168.1.20:8787/v1/exports/${EXPORT_ID}`));
  expect(seen.map((request) => request.analytics)).toEqual(['off', null, 'off']);
});
