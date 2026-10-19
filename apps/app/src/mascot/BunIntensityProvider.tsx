// The bun intensity for the whole app, stored like the theme preference: read
// synchronously on web so the first paint is right, hydrated from the secure
// store on native.
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { type BunIntensity, DEFAULT_BUN_INTENSITY } from './bunIntensity';
import { readStoredBunIntensity, readStoredBunIntensitySync, writeStoredBunIntensity } from './bunIntensityStorage';

export type BunIntensityContextValue = {
  readonly intensity: BunIntensity;
  readonly setIntensity: (next: BunIntensity) => void;
};

/**
 * Outside a provider (a component test, a screen rendered on its own) the bun
 * reads the default, so it can be dropped in anywhere. Changing the setting
 * there is a wiring mistake, so it throws instead of being silently lost.
 */
const OUTSIDE_PROVIDER: BunIntensityContextValue = {
  intensity: DEFAULT_BUN_INTENSITY,
  setIntensity: () => {
    throw new Error('Changing the bun intensity needs <BunIntensityProvider>.');
  },
};

const BunIntensityContext = createContext<BunIntensityContextValue>(OUTSIDE_PROVIDER);

function initialIntensity(): BunIntensity {
  return (Platform.OS === 'web' ? readStoredBunIntensitySync() : null) ?? DEFAULT_BUN_INTENSITY;
}

export function BunIntensityProvider({ children }: PropsWithChildren) {
  const [intensity, setIntensityState] = useState<BunIntensity>(initialIntensity);
  // A choice made before native storage answers wins over the stored value.
  const versionRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const hydrationVersion = versionRef.current;
    void (async () => {
      // A store that cannot be read (a locked keychain) keeps the default bun; it is never an unhandled rejection.
      const stored = await readStoredBunIntensity().catch(() => null);
      if (active && stored !== null && versionRef.current === hydrationVersion) setIntensityState(stored);
    })();
    return () => { active = false; };
  }, []);

  const setIntensity = useCallback((next: BunIntensity) => {
    versionRef.current += 1;
    setIntensityState(next);
    // A choice that cannot be stored still applies for this session.
    writeStoredBunIntensity(next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ intensity, setIntensity }), [intensity, setIntensity]);
  return <BunIntensityContext.Provider value={value}>{children}</BunIntensityContext.Provider>;
}

export function useBunIntensity(): BunIntensityContextValue {
  return useContext(BunIntensityContext);
}
