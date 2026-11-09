// The spend layout's keep for History's view (historyKeep.ts), above the
// `Slot`: it lasts for this visit to the spend area. It follows the session
// (a moved epoch drops the view at once) and the route: once the person goes
// anywhere other than History and the screens it comes back from, the view
// is forgotten, so Home, a tab or a link into History always starts clean.
import { usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { getV1SessionSnapshot, subscribeSession } from '@mobile/auth/session';
import { createHistoryKeep, mountHistoryKeep, onTheWayBack } from './historyKeep';
import type { HistoryKeep } from './historyKeep';

const HistoryKeepContext = createContext<HistoryKeep | null>(null);

export function HistoryKeepProvider({ children }: { children: ReactNode }) {
  const [keep] = useState(() => createHistoryKeep(() => getV1SessionSnapshot().epoch));
  const pathname = usePathname();
  useEffect(() => {
    const unmount = mountHistoryKeep(keep);
    // Dropped as the session moves, not only when History next asks.
    const unsubscribe = subscribeSession(() => keep.sessionChanged());
    return () => {
      unsubscribe();
      unmount();
      keep.forget();
    };
  }, [keep]);
  useEffect(() => {
    if (!onTheWayBack(pathname)) keep.forget();
  }, [keep, pathname]);
  return <HistoryKeepContext.Provider value={keep}>{children}</HistoryKeepContext.Provider>;
}

/** The spend layout's keep; null outside it, where History keeps nothing. */
export function useHistoryKeep(): HistoryKeep | null {
  return useContext(HistoryKeepContext);
}
