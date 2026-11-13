// The notification permission for the slip screens (P4-T17, for P4-T21's
// sl-done, sl-settings and es-notifications-off): the phone's answer, read at
// mount and again each time the app comes back to the front (the person may
// have changed it in Settings), a request only when the screen asks, and the
// phone's settings for this app. Off the phone there is no push: the answer is
// denied and nothing is asked, as the reminders answer on the web.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { expoPushTokens } from './pushRegistration';
import type { PushPermission, PushTokenPort } from './pushRegistration';

type LinkingModule = typeof import('expo-linking');

const loadLinking = (): Promise<LinkingModule> => import('expo-linking');

const OFF_PHONE: Pick<PushTokenPort, 'permission' | 'request'> = {
  permission: async () => 'denied',
  request: async () => 'denied',
};

export function useNotificationPermission(): { status: PushPermission; ask(): Promise<PushPermission>; openSettings(): Promise<void> } {
  const port = useMemo(() => (Platform.OS === 'ios' || Platform.OS === 'android' ? expoPushTokens() : OFF_PHONE), []);
  const [status, setStatus] = useState<PushPermission>('undetermined');
  useEffect(() => {
    // A read the phone cannot answer leaves the answer as it was.
    const read = () => void port.permission().then(setStatus, () => undefined);
    read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => subscription.remove();
  }, [port]);
  const ask = useCallback(async () => {
    // A request the phone cannot answer counts as a refusal.
    const next = await port.request().catch((): PushPermission => 'denied');
    setStatus(next);
    return next;
  }, [port]);
  const openSettings = useCallback(async () => {
    try {
      await (await loadLinking()).openSettings();
    } catch {
      // Best effort: where settings cannot open (the web), nothing happens.
    }
  }, []);
  return { status, ask, openSettings };
}
