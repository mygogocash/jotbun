// The app's language (redesign R6): the person's choice from Settings
// (System, ไทย or English), stored like the bun intensity and the theme
// preference: read synchronously on web so the first paint is right,
// hydrated from the secure store on native. It holds the app's IntlProvider,
// so a new choice re-renders every screen in that language at once. System
// is the phone's language (`device`, which the root layout reads once at
// launch), Vietnamese included.
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IntlProvider } from 'react-intl';
import { Platform } from 'react-native';

import { DEFAULT_LANGUAGE_PREFERENCE, resolveLanguage } from '@mobile/i18n/languagePreference';
import type { LanguagePreference } from '@mobile/i18n/languagePreference';
import { readStoredLanguagePreference, readStoredLanguagePreferenceSync, writeStoredLanguagePreference } from '@mobile/i18n/languagePreferenceStorage';
import type { Locale } from '@mobile/i18n/locales';

/**
 * How long native startup waits for the stored choice. A secure store that
 * never answers would otherwise hold every screen, /login included, on the
 * loading spinner; past this the app goes on in the phone's language.
 */
export const LANGUAGE_READ_TIMEOUT_MS = 1_500;

type LanguageContextValue = {
  readonly preference: LanguagePreference;
  /** False on native until the stored choice has been read (or the read has taken too long), so nothing starts in the wrong language. */
  readonly ready: boolean;
  readonly setPreference: (next: LanguagePreference) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialPreference(): LanguagePreference {
  return (Platform.OS === 'web' ? readStoredLanguagePreferenceSync() : null) ?? DEFAULT_LANGUAGE_PREFERENCE;
}

export function LanguageProvider({ device, children }: PropsWithChildren<{ device: Locale }>) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(initialPreference);
  const [ready, setReady] = useState(Platform.OS === 'web');
  // A choice made before native storage answers wins over the stored value.
  const versionRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const hydrationVersion = versionRef.current;
    const timer = setTimeout(() => { if (active) setReady(true); }, LANGUAGE_READ_TIMEOUT_MS);
    void (async () => {
      // A store that cannot be read (a locked keychain) keeps the phone's language; it is never an unhandled rejection.
      const stored = await readStoredLanguagePreference().catch(() => null);
      clearTimeout(timer);
      if (!active) return;
      // Even after the wait the stored choice applies, but only while it is the latest: a choice made since (System too) is newer.
      if (stored !== null && versionRef.current === hydrationVersion) setPreferenceState(stored);
      setReady(true);
    })();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  const setPreference = useCallback((next: LanguagePreference) => {
    versionRef.current += 1;
    setPreferenceState(next);
    setReady(true);
    // A choice that cannot be stored still applies for this session.
    writeStoredLanguagePreference(next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preference, ready, setPreference }), [preference, ready, setPreference]);
  return (
    <LanguageContext.Provider value={value}>
      <IntlProvider locale={resolveLanguage(preference, device)}>{children}</IntlProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within <LanguageProvider>');
  return ctx;
}

/**
 * Shows `preference` as the subtree's choice without changing the stored one
 * (the catalogue's locale switch, as ThemePreferenceOverride does for the
 * theme). What the subtree renders in stays its own IntlProvider's; choosing
 * there still sets the app's language.
 */
export function LanguagePreferenceOverride({ preference, children }: PropsWithChildren<{ preference: LanguagePreference }>) {
  const parent = useLanguage();
  const value = useMemo(() => ({ ...parent, preference }), [parent, preference]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
