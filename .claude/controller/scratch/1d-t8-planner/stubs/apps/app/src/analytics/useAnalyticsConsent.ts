// RED stub (1D-T8): the final interface, wrong behaviour. It never reads the
// installed controller: always `signed_out`, never installed, and answering
// does nothing.
import { createContext } from 'react';

import type { Analytics, ConsentAnswer, ConsentStatus } from './controller';

export type AnalyticsConsent = {
  status: ConsentStatus;
  installed: boolean;
  pendingNo: boolean;
  answer(answer: ConsentAnswer): Promise<void>;
};

export const ConsentAnalyticsContext = createContext<Analytics | null | undefined>(undefined);

export function useAnalyticsConsent(): AnalyticsConsent {
  return { status: 'signed_out', installed: false, pendingNo: false, answer: async () => undefined };
}
