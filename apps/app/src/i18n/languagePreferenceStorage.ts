// Where the language choice lives: the same stores as the theme preference
// (browser storage on web, the secure store on native), under its own key.
// Like the theme preference it belongs to the phone, not the diary, so the
// sign-out erase leaves it alone.
import { Platform } from 'react-native';
import { parseLanguagePreference, type LanguagePreference } from './languagePreference';

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'gogospend.language.preference';

export function readStoredLanguagePreferenceSync(): LanguagePreference | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { return parseLanguagePreference(window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)); }
  catch { return null; /* Browser storage can be blocked; the phone's language remains usable. */ }
}

export async function readStoredLanguagePreference(): Promise<LanguagePreference | null> {
  if (Platform.OS === 'web') return readStoredLanguagePreferenceSync();
  const store = await import('expo-secure-store');
  return parseLanguagePreference(await store.getItemAsync(LANGUAGE_PREFERENCE_STORAGE_KEY));
}

export async function writeStoredLanguagePreference(preference: LanguagePreference): Promise<void> {
  if (Platform.OS === 'web') {
    try { window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, preference); }
    catch { console.warn('Language choice could not be saved.'); }
    return;
  }
  const store = await import('expo-secure-store');
  await store.setItemAsync(LANGUAGE_PREFERENCE_STORAGE_KEY, preference);
}
