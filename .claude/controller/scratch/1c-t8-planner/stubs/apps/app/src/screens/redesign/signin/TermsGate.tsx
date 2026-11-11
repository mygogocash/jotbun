// 1C-T8 RED stub (R52): the gate always shows its children and reads nothing.
import type { ReactNode } from 'react';

import type { PolicyClient } from '@mobile/spend/v1/policies';

export type TermsGateProps = { client: PolicyClient; subscribe(listener: () => void): () => void; children: ReactNode };

export function TermsGate({ children }: TermsGateProps) {
  return <>{children}</>;
}
