// 1C-T8: the terms gate (K24, A11), unwired until 1C-T9 puts it inside the
// diary provider in the spend layout and on the reminder question.
//
// It reads `client.pending()` when it mounts and again whenever `subscribe`'s
// listener runs (a `policy_required` answer), one read at a time: a listener
// that fires during a read asks for one more read after it. It shows its
// children until a read answers with pending policies, then TermsScreen in
// their place until they are accepted or a later read answers none. A read
// that fails changes nothing, so an unknown answer (offline, unavailable)
// never blocks. Accepting shows the children again and asks the open diary
// to retry once, so the outbox and sync resume; a read begun before the
// acceptance cannot bring the terms back.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { PendingPolicy, PolicyClient } from '@mobile/spend/v1/policies';
import { useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { TermsScreen } from './TermsScreen';

export type TermsGateProps = {
  client: PolicyClient;
  /** Calls the listener for each `policy_required` answer; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  children: ReactNode;
};

const NONE: readonly PendingPolicy[] = [];

export function TermsGate({ client, subscribe, children }: TermsGateProps) {
  const diary = useSpendDiary();
  const [pending, setPending] = useState<readonly PendingPolicy[]>(NONE);
  const reading = useRef(false);
  const again = useRef(false);
  // Moves on each acceptance: a read begun before it is not applied.
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const read = useCallback(async () => {
    if (reading.current) {
      again.current = true;
      return;
    }
    reading.current = true;
    try {
      do {
        again.current = false;
        const asked = generation.current;
        try {
          const next = await client.pending();
          if (mounted.current && asked === generation.current) setPending(next.length === 0 ? NONE : next);
        } catch {
          // An unknown answer never blocks: whatever shows stays.
        }
      } while (again.current && mounted.current);
    } finally {
      reading.current = false;
    }
  }, [client]);

  useEffect(() => {
    void read();
    return subscribe(() => { void read(); });
  }, [read, subscribe]);

  const accepted = useCallback(() => {
    generation.current += 1;
    setPending(NONE);
    void diary?.retry().catch(() => undefined);
  }, [diary]);

  if (pending.length === 0) return <>{children}</>;
  return <TermsScreen pending={pending} client={client} onAccepted={accepted} />;
}
