import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getSession, getV1SessionSnapshot } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { createSpendV1Resources, createSyncResources } from '@mobile/spend/v1/resources';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { isUuid } from '@gogospend/contracts';
import * as Crypto from 'expo-crypto';

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

function sharedTransport(): V1Transport {
  transport ??= createV1Transport({
    baseUrl: getMobileEnv().v1ApiUrl,
    client: v1ClientVersion(),
    credentials: {
      getAccessToken: async () => getSession()?.access_token ?? null,
      getSessionSnapshot: getV1SessionSnapshot,
    },
  });
  return transport;
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
