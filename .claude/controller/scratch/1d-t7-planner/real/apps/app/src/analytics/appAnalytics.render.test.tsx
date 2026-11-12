// The app's install (1D-T6) takes what was tracked before it (1D-T7, from
// 1D-T6's review m3): on a phone with a project key the install waits for
// PostHog's module, so onboarding's first step can come first. Its controller
// then holds that event like any other, and sends it only after a yes.
import { Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

type Captured = { name: string; properties: Record<string, unknown> };
const posthog = vi.hoisted(() => ({ captured: [] as Captured[] }));
vi.mock('./posthogClient', () => ({
  createPostHogClient: () => ({
    capture: (name: string, properties?: Record<string, unknown>) => { posthog.captured.push({ name, properties: properties ?? {} }); },
    screen: () => undefined,
    identify: () => undefined,
    reset: () => undefined,
    startSessionRecording: () => undefined,
    stopSessionRecording: () => undefined,
  }),
}));
const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secure.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secure.values.set(key, value); },
  deleteItemAsync: async (key: string) => { secure.values.delete(key); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));
// The server answers yes for the signed-in account.
vi.mock('@mobile/api/sharedV1', () => ({
  getSharedAnalyticsServer: () => ({
    read: async () => ({ consent: 'yes', analyticsId: 'a'.repeat(64), weeksSinceSignup: 2 }),
    setConsent: async () => undefined,
  }),
  v1ClientVersion: () => null,
}));

import { installAppAnalytics } from './appAnalytics';
import { getAnalytics, setAnalytics, takeEarlyEvents } from './bus';
import { trackOnboardingStepViewed } from './events';

const ACCOUNT = '00000000-0000-4000-8000-0000000000aa';
const os = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.unstubAllEnvs();
  setAnalytics(null);
  posthog.captured.length = 0;
  secure.values.clear();
});

test("an event tracked before the app's controller installs is held by it, and sent only after a yes", async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  vi.stubEnv('EXPO_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  setAnalytics(null);
  takeEarlyEvents();
  trackOnboardingStepViewed({ step: 'coffee' });
  const analytics = await installAppAnalytics();
  expect(getAnalytics()).toBe(analytics);
  expect(takeEarlyEvents()).toEqual([]);
  // No account yet: held, not sent.
  expect(posthog.captured).toEqual([]);
  await analytics.setAccount(ACCOUNT);
  expect(posthog.captured.map((event) => event.name)).toEqual(['onboarding_step_viewed']);
  expect(posthog.captured[0]?.properties).toMatchObject({ step: 'coffee', origin: 'app' });
});
