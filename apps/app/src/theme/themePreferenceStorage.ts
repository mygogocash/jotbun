import { Platform } from 'react-native';
import { parseThemePreference, type ThemePreference } from './themePreference';

export const THEME_PREFERENCE_STORAGE_KEY = 'gogospend.theme.preference';
export function readStoredThemePreferenceSync(): ThemePreference | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { return parseThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)); }
  catch { return null; /* Browser storage can be blocked; system theme remains usable. */ }
}
export async function readStoredThemePreference(): Promise<ThemePreference | null> {
  if (Platform.OS === 'web') return readStoredThemePreferenceSync();
  const store = await import('expo-secure-store');
  return parseThemePreference(await store.getItemAsync(THEME_PREFERENCE_STORAGE_KEY));
}
export async function writeStoredThemePreference(preference: ThemePreference): Promise<void> {
  if (Platform.OS === 'web') {
    try { window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference); }
    catch { console.warn('Theme preference could not be saved.'); }
    return;
  }
  const store = await import('expo-secure-store');
  await store.setItemAsync(THEME_PREFERENCE_STORAGE_KEY, preference);
}
