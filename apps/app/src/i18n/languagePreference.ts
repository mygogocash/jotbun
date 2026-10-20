// The language Jotbun speaks (redesign R6, Settings): the phone's ("System"),
// or Thai or English, chosen. Vietnamese is not offered while its catalog
// waits for translation (owner, 19 October 2026); a phone set to Vietnamese
// still gets it under System, as before there was a choice.
import type { Locale } from './locales.ts';

export const LANGUAGE_PREFERENCES = ['system', 'th', 'en'] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

export function parseLanguagePreference(value: unknown): LanguagePreference | null {
  return value === 'system' || value === 'th' || value === 'en' ? value : null;
}

/** The locale the app renders in: the phone's under System (Vietnamese included), otherwise the choice. */
export function resolveLanguage(preference: LanguagePreference, device: Locale): Locale {
  return preference === 'system' ? device : preference;
}
