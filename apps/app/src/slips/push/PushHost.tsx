// The phone's push host (P4-T17; §6.13, B11, D41), mounted once in
// app/_layout.tsx as the first child inside WalletRoot, so useLockCover()
// reads P2-T33's gate. It keeps this phone registered for push: at mount,
// after each session change (subscribeSession) and when the app's language
// changes, never asking for the permission (P4-T21 asks). It sets the app's
// only notification handler. And it routes push taps: a tap, or the response
// that opened the app, keeps its route while the app is locked or covered,
// goes there once the cover lifts, and is then cleared. On the web there is
// no push, and nothing loads. Nothing here is logged or sent to analytics.
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { isPushData } from '@gogospend/contracts';
import type { PushData } from '@gogospend/contracts';
import { getSharedSlipResources } from '@mobile/api/sharedV1';
import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import type { Locale } from '@mobile/i18n/locales';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import { useLockCover } from '@mobile/ui/lockCover';
import { walletDeviceStore } from '@mobile/wallet/store/deviceWalletStore';
import { expoSha256 } from '../slipRefs';
import { expoPushTokens, loadNotifications, pushProjectId, readSlipNotices, registerPushIfNeeded, sessionHash } from './pushRegistration';
import { routeForPush } from './pushRouting';

type NotificationsModule = typeof import('expo-notifications');
type ConstantsModule = typeof import('expo-constants');

let constants: Promise<ConstantsModule> | null = null;
/** expo-constants, loaded once: the build's config does not change while the app runs. */
const loadConstants = (): Promise<ConstantsModule> => (constants ??= import('expo-constants'));

const onPhone = () => Platform.OS === 'ios' || Platform.OS === 'android';

const SILENT = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
const LIST_ONLY = { ...SILENT, shouldShowList: true };
const BANNER_AND_LIST = { ...LIST_ONLY, shouldShowBanner: true };

/**
 * How a notification shows while the app is open: slips ready only in the
 * list, the other pushes as a banner and in the list, never with a sound.
 * Anything that is not a push, such as P2-T36's local reminder, shows nothing
 * (expo-notifications 58 would show it in full without a handler).
 */
function presentation(data: unknown) {
  if (!isPushData(data)) return SILENT;
  return data.kind === 'slips_ready' ? LIST_ONLY : BANNER_AND_LIST;
}

/** One registration run with this phone's values now (pushRegistration.ts decides whether anything is sent). */
async function register(binding: string | null, language: Locale): Promise<void> {
  const store = walletDeviceStore();
  const extra = (await loadConstants()).default.expoConfig?.extra;
  await registerPushIfNeeded({
    port: expoPushTokens(),
    projectId: pushProjectId(extra),
    // The shared slip client is reached only when a registration is sent.
    resources: { registerDevice: (registration) => getSharedSlipResources().registerDevice(registration) },
    store,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    language,
    slipNotices: await readSlipNotices(store),
    session: binding === null ? null : await sessionHash(binding, expoSha256()),
    nowMs: Date.now(),
  });
}

export function PushHost(): null {
  const { hidden } = useLockCover();
  const language = useActiveLocale();
  const [waiting, setWaiting] = useState<Href | null>(null);
  const notifications = useRef<NotificationsModule | null>(null);
  // One registration at a time, in the order asked.
  const runs = useRef<Promise<void>>(Promise.resolve());
  // Each response is routed once, however it arrives: its listener and the last response can both carry it.
  const taken = useRef(new Set<string>());

  useEffect(() => {
    if (!onPhone()) return undefined;
    let last: string | null | undefined;
    const run = () => {
      const binding = getV1SessionSnapshot().binding;
      // A notice that leaves the session as it was (a token refresh) sends nothing.
      if (binding === last) return;
      last = binding;
      runs.current = runs.current.then(() => register(binding, language)).catch(() => undefined);
    };
    run();
    return subscribeSession(run);
  }, [language]);

  useEffect(() => {
    if (!onPhone()) return undefined;
    let live = true;
    let subscription: { remove(): void } | null = null;
    const take = (response: NotificationResponse) => {
      const { identifier, content } = response.notification.request;
      if (taken.current.has(identifier)) return;
      taken.current.add(identifier);
      // routeForPush checks the data's shape itself: a local reminder's opens nothing.
      const href = routeForPush(content.data as PushData);
      if (href !== null) setWaiting(href);
    };
    void loadNotifications()
      .then((module) => {
        if (!live) return;
        notifications.current = module;
        module.setNotificationHandler({ handleNotification: async (notification) => presentation(notification.request.content.data) });
        // The listener first, then the response that opened the app: one that lands between the two reaches both, and is taken once.
        subscription = module.addNotificationResponseReceivedListener(take);
        const opened = module.getLastNotificationResponse();
        if (opened !== null) take(opened);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);

  // A tap waits here while the lock's cover is up.
  useEffect(() => {
    if (waiting === null || hidden) return;
    setWaiting(null);
    router.push(waiting);
    notifications.current?.clearLastNotificationResponse();
  }, [waiting, hidden]);

  return null;
}
