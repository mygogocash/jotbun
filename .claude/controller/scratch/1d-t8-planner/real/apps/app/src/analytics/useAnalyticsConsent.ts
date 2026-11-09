// This phone's analytics answer for D34's consent question and Privacy's
// switch (plan 1D-T8). It follows the installed controller (getAnalytics(),
// read at each render: 1D-T6 installs it at app start) through `subscribe`.
// With none installed the answer is `signed_out`, `installed` is false, and
// answering rejects. A new controller is `loading` until its first account,
// so `signed_out` with `installed` true means no one is signed in yet:
// P2-T35's setup redirect waits through that and through `loading` (P2's W34).
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import { getAnalytics } from './bus';
import type { Analytics, ConsentAnswer, ConsentStatus } from './controller';

export type AnalyticsConsent = {
  status: ConsentStatus;
  /** getAnalytics() holds an instance (P2-T35 reads it). */
  installed: boolean;
  /** The no in force here has not reached the server yet (Privacy's "stopped on this phone"). */
  pendingNo: boolean;
  /** The controller's answer: a no is in force at once, a yes waits for the server. It rejects as the controller does; callers catch every rejection. */
  answer(answer: ConsentAnswer): Promise<void>;
};

/**
 * A controller to use in place of the installed one, for the catalogue's
 * sections only (development): they draw the question and Privacy's switch on
 * a fake, so the app's own answer is never touched. The app never provides it.
 */
export const ConsentAnalyticsContext = createContext<Analytics | null | undefined>(undefined);

const notInstalled = () => Promise.reject(new Error('Analytics is not installed'));

export function useAnalyticsConsent(): AnalyticsConsent {
  const scoped = useContext(ConsentAnalyticsContext);
  const analytics = scoped === undefined ? getAnalytics() : scoped;
  // A stable subscribe, so React does not resubscribe on every render.
  const subscribe = useCallback((listener: () => void) => (analytics ? analytics.subscribe(listener) : () => undefined), [analytics]);
  const status = useSyncExternalStore(subscribe, () => analytics?.status() ?? 'signed_out', () => 'signed_out' as const);
  const pendingNo = useSyncExternalStore(subscribe, () => analytics?.pendingNo() ?? false, () => false);
  const answer = useCallback((value: ConsentAnswer) => (analytics ? analytics.answer(value) : notInstalled()), [analytics]);
  return { status, installed: analytics !== null, pendingNo, answer };
}
