// Analytics upkeep for the whole app (plan 1D-T6), rendered once in the root
// layout. It installs the controller, sends each screen as its route pattern
// (`useSegments` gives `["spend", "record", "[id]"]`, never the values),
// keeps the language current, follows the session's account, and reads the
// answer again on every return to the foreground, so a "no" given on another
// phone applies here. Every failure is caught: the next session change or
// foreground tries again.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';

import { fetchAccountId } from '@mobile/api/sharedV1';
import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import { installAppAnalytics } from './appAnalytics';
import type { Analytics } from './controller';

const ignore = () => undefined;

/**
 * Sets the controller's account from the session. With no session, none. A
 * session other than the one last seen (its epoch moved: a sign-in or an
 * account switch) clears the account at once, before the new one is read, so a
 * yes still queued for the previous account cannot be sent under the new
 * session (1D-T1's review). Within one session the account is read once; a
 * failed read leaves it unset until the next call. Rejects when a read or the
 * controller fails.
 */
function accountFollower(analytics: Analytics): () => Promise<void> {
  // The epoch of the last session seen with a binding, and the epoch whose account the controller holds.
  let seenEpoch: number | null = null;
  let heldEpoch: number | null = null;
  let latest = 0;
  return async () => {
    const call = ++latest;
    const { binding, epoch } = getV1SessionSnapshot();
    if (binding === null) {
      // A session seen since the last null has ended: a sign-out, which drops what is held
      // even when its account was never read here (R120). With none seen yet, as at the
      // launch, a plain null keeps it (R119).
      const signedOut = seenEpoch !== null;
      seenEpoch = null;
      heldEpoch = null;
      if (signedOut) await analytics.setAccount(null, { signedOut: true });
      else await analytics.setAccount(null);
      return;
    }
    if (heldEpoch === epoch) return;
    if (seenEpoch !== null && seenEpoch !== epoch) {
      heldEpoch = null;
      // The session seen has ended here too, with another in its place: it drops what is held,
      // named or not (R120).
      await analytics.setAccount(null, { signedOut: true });
    }
    seenEpoch = epoch;
    const accountId = await fetchAccountId();
    const now = getV1SessionSnapshot();
    // A newer call, or a session that moved meanwhile, decides instead.
    if (call !== latest || now.epoch !== epoch || now.binding === null) return;
    heldEpoch = epoch;
    await analytics.setAccount(accountId);
  };
}

export function AnalyticsUpkeep() {
  const [analytics, setInstalled] = useState<Analytics | null>(null);
  const locale = useActiveLocale();
  const segments = useSegments();
  // By value: the same route rendered again is not a new screen.
  const route = JSON.stringify(segments);

  useEffect(() => {
    let live = true;
    installAppAnalytics().then((installed) => { if (live) setInstalled(installed); }, ignore);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    analytics?.setCommon({ language: locale });
  }, [analytics, locale]);

  useEffect(() => {
    analytics?.screen(JSON.parse(route) as string[]);
  }, [analytics, route]);

  useEffect(() => {
    if (!analytics) return;
    const follow = accountFollower(analytics);
    const unsubscribe = subscribeSession(() => { follow().catch(ignore); });
    // A session restored before this subscribed sends no notification.
    follow().catch(ignore);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      follow().catch(ignore).then(() => analytics.refresh()).catch(ignore);
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [analytics]);

  return null;
}
