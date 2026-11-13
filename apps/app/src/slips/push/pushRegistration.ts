// Push registration on the phone (P4-T17; §6.13, B11, S8). This phone's Expo
// push token goes to PUT /v1/devices (P4-T5) only while the build names an
// EAS project (none until D33: `no_project`), a session is signed in, and the
// phone already allows notifications: registering only reads the permission,
// and the slip screens ask (P4-T21). It goes again only when the token, the
// platform, the language, the slip-notice switch or the session differs from
// the record kept in the device store, or that record is a week old. The
// record keeps the SHA-256 of the session's binding, never the binding, and
// nothing here is logged. expo-notifications loads only when used (the
// pattern of src/lib/haptics.ts), so Node loads this module.
import { isUuid } from '@gogospend/contracts';
import type { DeviceRegistration } from '@gogospend/contracts';

import type { KeyValueStore } from '../../wallet/store/walletStore.ts';
import type { Sha256 } from '../slipRefs.ts';
import type { SlipResources } from '../slipResources.ts';

type NotificationsModule = typeof import('expo-notifications');

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushTokenPort = {
  permission(): Promise<PushPermission>;
  request(): Promise<PushPermission>;
  token(projectId: string): Promise<string>;
};

/** The part of expo-notifications' permission answer (NotificationPermissionsStatus) that decides. */
type PermissionAnswer = { granted: boolean; canAskAgain: boolean; ios?: { status?: number } | null };

// expo-notifications' IosAuthorizationStatus.PROVISIONAL.
const IOS_PROVISIONAL = 3;

/**
 * The permission as the reminders read it (notificationsPort.ts): quiet
 * (provisional) delivery on iOS counts as granted, and a refusal the phone
 * still lets the app ask about again counts as undetermined.
 */
export function permissionOf(answer: PermissionAnswer): PushPermission {
  if (answer.granted || answer.ios?.status === IOS_PROVISIONAL) return 'granted';
  return answer.canAskAgain ? 'undetermined' : 'denied';
}

let notifications: Promise<NotificationsModule> | null = null;

/** expo-notifications, loaded once for the app's life and shared by every port and the push host. */
export const loadNotifications = (): Promise<NotificationsModule> => (notifications ??= import('expo-notifications'));

/**
 * The port over expo-notifications 58.1.5. `request` asks iOS for alerts and
 * sounds, not the badge (no push sets one), and Android for its notification
 * permission; `token` is Expo's push token for the project.
 */
export function expoPushTokens(loadModule: () => Promise<NotificationsModule> = loadNotifications): PushTokenPort {
  return {
    permission: async () => permissionOf(await (await loadModule()).getPermissionsAsync()),
    request: async () => permissionOf(await (await loadModule()).requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } })),
    token: async (projectId) => (await (await loadModule()).getExpoPushTokenAsync({ projectId })).data,
  };
}

function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

/** The EAS project id the build's config names (`extra.eas.projectId`, which expo-constants' expoConfig carries): a UUID, or none until D33. */
export function pushProjectId(extra: unknown): string | null {
  const id = field(field(extra, 'eas'), 'projectId');
  return isUuid(id) ? id : null;
}

/** The slip-notice switch in the device store (P4-T21 sets it): on unless it holds '0'; a switch that cannot be read counts as on. */
export const SLIP_NOTICES_NAME = 'slip-notices';

export async function readSlipNotices(store: KeyValueStore): Promise<boolean> {
  return (await store.get(SLIP_NOTICES_NAME).catch(() => null)) !== '0';
}

/** The device store's record of the registration last sent; the sign-out erase removes it with the other device settings. */
export const PUSH_RECORD_NAME = 'push-device';

/** A registration goes again at least once a week, so the server can drop the tokens no phone renews (S8). */
export const PUSH_RENEW_MS = 7 * 24 * 60 * 60 * 1000;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** The SHA-256 of the session binding, as lowercase hex: what the record keeps in place of the binding. */
export async function sessionHash(binding: string, sha256: Sha256): Promise<string> {
  return toHex(await sha256(new TextEncoder().encode(binding)));
}

type Kept = { token: string; platform: 'ios' | 'android'; language: 'th' | 'en'; slipNotices: boolean; session: string };

/** True when the kept record says the same and is under a week old; a damaged record, or one dated after now, is no record. */
function stillCurrent(stored: string | null, kept: Kept, nowMs: number): boolean {
  let value: unknown;
  try {
    value = JSON.parse(stored ?? 'null');
  } catch {
    return false;
  }
  const at = field(value, 'at');
  return (
    field(value, 'token') === kept.token &&
    field(value, 'platform') === kept.platform &&
    field(value, 'language') === kept.language &&
    field(value, 'slipNotices') === kept.slipNotices &&
    field(value, 'session') === kept.session &&
    typeof at === 'number' &&
    at <= nowMs &&
    nowMs - at < PUSH_RENEW_MS
  );
}

/**
 * Sends this phone's registration when it is new or has changed (the rules
 * are at the top of this file). It never asks for the permission and never
 * throws: a failure answers `failed` and keeps no record, so the next run
 * sends again.
 */
export async function registerPushIfNeeded(deps: {
  port: PushTokenPort;
  projectId: string | null;
  resources: Pick<SlipResources, 'registerDevice'>;
  store: KeyValueStore;
  platform: 'ios' | 'android';
  language: 'th' | 'en' | 'vi';
  slipNotices: boolean;
  /** The SHA-256 hex of the session binding (sessionHash); null while signed out. */
  session: string | null;
  nowMs: number;
}): Promise<'registered' | 'unchanged' | 'no_project' | 'not_allowed' | 'failed'> {
  if (deps.projectId === null) return 'no_project';
  if (deps.session === null) return 'not_allowed';
  try {
    if ((await deps.port.permission()) !== 'granted') return 'not_allowed';
    const token = await deps.port.token(deps.projectId);
    // The server sends Thai or English (P4-T5): Vietnamese reads English.
    const language = deps.language === 'th' ? 'th' : 'en';
    const kept: Kept = { token, platform: deps.platform, language, slipNotices: deps.slipNotices, session: deps.session };
    if (stillCurrent(await deps.store.get(PUSH_RECORD_NAME), kept, deps.nowMs)) return 'unchanged';
    const registration: DeviceRegistration = { push_token: token, platform: deps.platform, language, slip_notices: deps.slipNotices };
    await deps.resources.registerDevice(registration);
    await deps.store.set(PUSH_RECORD_NAME, JSON.stringify({ ...kept, at: deps.nowMs }));
    return 'registered';
  } catch {
    return 'failed';
  }
}
