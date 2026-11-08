import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getAnalytics } from '@mobile/analytics/bus';
import { createAnalyticsServer } from '@mobile/analytics/analyticsServer';
import type { AnalyticsDeps } from '@mobile/analytics/controller';
import { v1SessionCredentials } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { createSpendV1Resources, createSyncResources } from '@mobile/spend/v1/resources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { createAiResources } from '@mobile/spend/v1/ai/aiResources';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { isUuid } from '@gogospend/contracts';
import * as Crypto from 'expo-crypto';

import type { LiveTarget } from '@mobile/sync/liveChannel';
import type { SyncRemote } from '@mobile/sync/types';
import { createV1Transport } from './client';
import type { V1ClientVersion, V1Transport } from './client';

/**
 * `X-GoGoSpend-Client` for this build. The web preview has no native version,
 * so v1 requests from it report `unsupported_platform` (no real sign-in on web).
 */
export function v1ClientVersion(): V1ClientVersion | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const version = Application.nativeApplicationVersion;
  return version && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version) ? { platform: Platform.OS, version } : null;
}

let transport: V1Transport | null = null;
let shared: SpendV1Resources | null = null;
let sync: SyncRemote | null = null;
let ai: AiResources | null = null;
let analyticsServer: AnalyticsDeps['server'] | null = null;

/** The one v1 transport. Sign-out uses it so a second client is not opened. */
export function getSharedV1Transport(): V1Transport {
  return sharedTransport();
}

function sharedTransport(): V1Transport {
  transport ??= createV1Transport({
    baseUrl: getMobileEnv().v1ApiUrl,
    client: v1ClientVersion(),
    // The session seam: token, binding, epoch, refresh, and server-ended sessions reported back.
    credentials: v1SessionCredentials,
    // A development build may reach `wrangler dev` on the LAN; a release build never does (plan 1D, L8).
    allowLanHttp: __DEV__,
    // Server events stay off unless this phone's answer is yes (plan 1D, L4).
    analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,
  });
  return transport;
}

/** The live socket's target (plan 1D, L1): the base URL, client version and credentials the shared transport uses. */
export function getSharedLiveTarget(): LiveTarget {
  return {
    baseUrl: getMobileEnv().v1ApiUrl,
    client: v1ClientVersion(),
    token: () => v1SessionCredentials.getAccessToken(),
  };
}

/** The app's v1 resources over the shared session seam. */
export function getSharedV1Resources(): SpendV1Resources {
  shared ??= createSpendV1Resources(sharedTransport());
  return shared;
}

/** The sync side (outbox sends, command status, deltas, snapshots) over the same transport. */
export function getSharedSyncRemote(): SyncRemote {
  sync ??= createSyncResources(sharedTransport(), {
    sha256Hex: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
  });
  return sync;
}

/** The signed-in account's internal id (GET /v1/me): device diaries are keyed by it, never by email or provider subject. */
export async function fetchAccountId(): Promise<string> {
  const me = await sharedTransport().request('GET', '/v1/me', {
    validate: (value): value is { account_id: string } =>
      typeof value === 'object' && value !== null && typeof (value as { account_id?: unknown }).account_id === 'string' && isUuid((value as { account_id: string }).account_id),
  });
  return me.account_id;
}

/** Bun's AI help and the GoGoCash catalogue (the edge API), over the same session seam. */
export function getSharedAiResources(): AiResources {
  ai ??= createAiResources(sharedTransport());
  return ai;
}

/** The analytics answer and identity (1D-T11's GET /v1/me/analytics) and the consent call, over the same transport. */
export function getSharedAnalyticsServer(): AnalyticsDeps['server'] {
  analyticsServer ??= createAnalyticsServer(sharedTransport());
  return analyticsServer;
}
