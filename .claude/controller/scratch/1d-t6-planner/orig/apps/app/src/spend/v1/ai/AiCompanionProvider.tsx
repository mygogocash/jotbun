// Bun's AI help for the signed-in screens (premium plan A3): the person's AI
// preferences (consent, cashback tips, today's uses left) read once and kept
// in step with every change. Screens read it with useAiCompanion(); tests
// pass fake resources.
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPreferencesDto, AiPreferencesUpdate } from '@gogospend/contracts';

import type { AiResources } from './aiResources';

export type AiCompanionValue = {
  readonly resources: AiResources | null;
  /** Null until read, or when it could not be read (offline): AI surfaces then use the phone's rules. */
  readonly preferences: AiPreferencesDto | null;
  /** Bun's AI help is on and the service is answering. */
  readonly enabled: boolean;
  readonly refresh: () => void;
  readonly update: (change: AiPreferencesUpdate) => Promise<AiPreferencesDto>;
};

const OFF: AiCompanionValue = {
  resources: null,
  preferences: null,
  enabled: false,
  refresh: () => undefined,
  update: async () => {
    throw new Error('Changing AI preferences needs <AiCompanionProvider>.');
  },
};

const AiCompanionContext = createContext<AiCompanionValue>(OFF);

export function AiCompanionProvider({ resources, children }: PropsWithChildren<{ resources: AiResources }>) {
  const [preferences, setPreferences] = useState<AiPreferencesDto | null>(null);
  const version = useRef(0);

  const refresh = useCallback(() => {
    const asked = ++version.current;
    resources.preferences().then(
      (read) => { if (asked === version.current) setPreferences(read); },
      () => undefined, // offline or signed out: the screens fall back to the phone's rules
    );
  }, [resources]);

  useEffect(refresh, [refresh]);

  const update = useCallback(async (change: AiPreferencesUpdate) => {
    version.current += 1;
    const saved = await resources.setPreferences(change);
    setPreferences(saved);
    return saved;
  }, [resources]);

  const value = useMemo<AiCompanionValue>(() => ({
    resources,
    preferences,
    enabled: preferences !== null && preferences.companion && preferences.available,
    refresh,
    update,
  }), [resources, preferences, refresh, update]);
  return <AiCompanionContext.Provider value={value}>{children}</AiCompanionContext.Provider>;
}

export function useAiCompanion(): AiCompanionValue {
  return useContext(AiCompanionContext);
}
