// RED stub (P2-T33): the real exports; the gate draws its children and nothing else, and provides nothing.
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { LocalAuthPort } from './localAuthPort';
import type { LockAvailability } from './lockModel';

export type LockSetting = {
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly availability: LockAvailability | null;
  readonly busy: boolean;
  readonly change: (on: boolean) => Promise<void>;
  readonly answer: () => void;
  readonly recheck: () => void;
};

const OUTSIDE: LockSetting = {
  ready: true,
  enabled: false,
  availability: { canLock: false, method: null },
  busy: false,
  change: async () => undefined,
  answer: () => undefined,
  recheck: () => undefined,
};

export const LockSettingContext = createContext<LockSetting>(OUTSIDE);

export function useLockSetting(): LockSetting {
  return useContext(LockSettingContext);
}

export function LockGate({ children }: { port: LocalAuthPort; children: ReactNode }) {
  return <>{children}</>;
}
