// The haptics setting for the whole app, hydrated from the secure store on
// native like the bun intensity. playHaptic reads the module-level copy
// (hapticPreference.ts), which this provider keeps in step.
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_HAPTIC_PREFERENCE, setCurrentHapticPreference, type HapticPreference } from './hapticPreference';
import { readStoredHapticPreference, writeStoredHapticPreference } from './hapticPreferenceStorage';

export type HapticsContextValue = {
  readonly preference: HapticPreference;
  readonly setPreference: (next: HapticPreference) => void;
};

const OUTSIDE_PROVIDER: HapticsContextValue = {
  preference: DEFAULT_HAPTIC_PREFERENCE,
  setPreference: () => {
    throw new Error('Changing the haptics setting needs <HapticsProvider>.');
  },
};

const HapticsContext = createContext<HapticsContextValue>(OUTSIDE_PROVIDER);

export function HapticsProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<HapticPreference>(DEFAULT_HAPTIC_PREFERENCE);
  // A choice made before storage answers wins over the stored value.
  const versionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const hydrationVersion = versionRef.current;
    void (async () => {
      const stored = await readStoredHapticPreference().catch(() => null);
      if (active && stored !== null && versionRef.current === hydrationVersion) {
        setCurrentHapticPreference(stored);
        setPreferenceState(stored);
      }
    })();
    return () => { active = false; };
  }, []);

  const setPreference = useCallback((next: HapticPreference) => {
    versionRef.current += 1;
    setCurrentHapticPreference(next);
    setPreferenceState(next);
    // A choice that cannot be stored still applies for this session.
    writeStoredHapticPreference(next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): HapticsContextValue {
  return useContext(HapticsContext);
}
