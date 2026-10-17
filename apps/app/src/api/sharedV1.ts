import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getSession, getV1SessionSnapshot } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { createSpendV1Resources } from '@mobile/spend/v1/resources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createV1Transport } from './client';
import type { V1ClientVersion } from './client';

/**
 * `X-GoGoSpend-Client` for this build. The web preview has no native version,
 * so v1 requests from it report `unsupported_platform` (no real sign-in on web).
 */
export function v1ClientVersion(): V1ClientVersion | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const version = Application.nativeApplicationVersion;
  return version && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version) ? { platform: Platform.OS, version } : null;
}

let shared: SpendV1Resources | null = null;

/** The app's v1 resources over the shared session seam. */
export function getSharedV1Resources(): SpendV1Resources {
  shared ??= createSpendV1Resources(createV1Transport({
    baseUrl: getMobileEnv().v1ApiUrl,
    client: v1ClientVersion(),
    credentials: {
      getAccessToken: async () => getSession()?.access_token ?? null,
      getSessionSnapshot: getV1SessionSnapshot,
    },
  }));
  return shared;
}
