// A rollout for a component (plan P6B-T14). It follows the installed
// controller (getAnalytics(), read at each render, as useAnalyticsConsent
// does) through `subscribe`, which hears every flag push and every change of
// the answer, so it reads again when the flags load after yes and falls back
// to the default after a no.
import { useCallback, useSyncExternalStore } from 'react';

import { getAnalytics } from '@mobile/analytics/bus';
import { ROLLOUT_FLAGS, rolloutOn } from './rollout';
import type { RolloutKey } from './rollout';

export function useRollout(key: RolloutKey): boolean {
  const analytics = getAnalytics();
  // A stable subscribe, so React does not resubscribe on every render.
  const subscribe = useCallback((listener: () => void) => (analytics ? analytics.subscribe(listener) : () => undefined), [analytics]);
  const value = useSyncExternalStore(subscribe, () => analytics?.flag(ROLLOUT_FLAGS[key]), () => undefined);
  return rolloutOn(key, value);
}
