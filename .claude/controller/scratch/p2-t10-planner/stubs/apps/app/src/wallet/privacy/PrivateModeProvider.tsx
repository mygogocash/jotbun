// RED stub (P2-T10): the plan's interface, with no behaviour yet.
import type { ReactNode } from 'react';

import type { KeyValueStore } from '../store/walletStore';

export const PRIVATE_MODE_NAME = '';
export const PRIVATE_TIP_NAME = '';

export type PrivateMode = {
  readonly hidden: boolean;
  readonly ready: boolean;
  readonly toggle: () => void;
  readonly tipSeen: boolean;
  readonly dismissTip: () => void;
};

const SHOWN: PrivateMode = { hidden: false, ready: true, tipSeen: true, toggle: () => undefined, dismissTip: () => undefined };

export function PrivateModeProvider({ children }: { children: ReactNode; store?: KeyValueStore }) {
  return <>{children}</>;
}

export function usePrivateMode(): PrivateMode {
  return SHOWN;
}
