// The app's analytics controller with its real store, server calls and PostHog
// client (plan 1D-T6). Installed once per app run. On the web, in tests and
// without a project key the client is null, so nothing leaves the phone; the
// controller still answers status() and allowsAnalytics() for the transport's
// X-GoGoSpend-Analytics header.
import { Platform } from 'react-native';

import { getSharedAnalyticsServer, v1ClientVersion } from '@mobile/api/sharedV1';
import { getMobileEnv } from '@mobile/config/env';
import { getAnalytics, setAnalytics } from './bus';
import { eraseStoredConsent, readStoredConsent, writeStoredConsent } from './consentStorage';
import { createAnalytics } from './controller';
import type { Analytics, PostHogLike } from './controller';
import { gateOutgoing } from './gate';
import { REPLAY_TOUCHES_CAN_BE_OFF, posthogOptions } from './posthogOptions';

let installing: Promise<Analytics> | null = null;

/** The installed controller, or a new one with the app's client, store and server. */
export function installAppAnalytics(): Promise<Analytics> {
  const installed = getAnalytics();
  if (installed) return Promise.resolve(installed);
  installing ??= install().finally(() => { installing = null; });
  return installing;
}

async function install(): Promise<Analytics> {
  const env = getMobileEnv();
  const crashReportsWithoutConsent = env.crashReportsWithoutConsent;
  // before_send asks the controller, which is made after the client.
  let analytics: Analytics | null = null;
  let client: PostHogLike | null = null;
  if ((Platform.OS === 'ios' || Platform.OS === 'android') && env.posthogKey !== '') {
    const { createPostHogClient } = await import('./posthogClient');
    client = createPostHogClient(env.posthogKey, posthogOptions({
      host: env.posthogHost,
      beforeSend: (event) => gateOutgoing(event, { analytics: analytics?.allowsAnalytics() === true, crashReportsWithoutConsent }),
      crashReportsWithoutConsent,
      replayTouchesCanBeOff: REPLAY_TOUCHES_CAN_BE_OFF,
    }));
  }
  const created = createAnalytics({
    client,
    replay: REPLAY_TOUCHES_CAN_BE_OFF,
    store: { read: readStoredConsent, write: writeStoredConsent, erase: eraseStoredConsent },
    // The shared transport is made at the first call, not at install.
    server: {
      read: () => getSharedAnalyticsServer().read(),
      setConsent: (on) => getSharedAnalyticsServer().setConsent(on),
    },
  });
  analytics = created;
  const version = v1ClientVersion();
  created.setCommon(version ? { app_version: version.version, platform: version.platform, home_currency: 'THB' } : { home_currency: 'THB' });
  // Another caller (a test's recorder) may have installed one while the client loaded.
  const existing = getAnalytics();
  if (existing) return existing;
  setAnalytics(created);
  return created;
}
