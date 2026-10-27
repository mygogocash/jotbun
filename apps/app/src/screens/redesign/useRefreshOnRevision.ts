// A change another phone made is pulled into the diary, and the screen that shows
// it refreshes in place when the applied revision grows (plan 1D, L2). The first
// value a screen sees never refreshes it: the screen's own load reads that.
import { useEffect, useRef } from 'react';

import { revisionGrew } from '@mobile/sync/liveChannel';

export function useRefreshOnRevision(revision: string, refresh: () => void): void {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = revision;
    if (previous !== null && revisionGrew(revision, previous)) refresh();
  }, [revision, refresh]);
}
