// Where the haptics setting lives: the same stores as the bun intensity
// (browser storage on web, the secure store on native), under its own key.
import { Platform } from 'react-native';

import { parseHapticPreference, type HapticPreference } from './hapticPreference';

export const HAPTIC_PREFERENCE_STORAGE_KEY = 'gogospend.haptics';

export async function readStoredHapticPreference(): Promise<HapticPreference | null> {
  if (Platform.OS === 'web') return null; // the web build plays no haptics
  const store = await import('expo-secure-store');
  return parseHapticPreference(await store.getItemAsync(HAPTIC_PREFERENCE_STORAGE_KEY));
}

export async function writeStoredHapticPreference(preference: HapticPreference): Promise<void> {
  if (Platform.OS === 'web') return;
  const store = await import('expo-secure-store');
  await store.setItemAsync(HAPTIC_PREFERENCE_STORAGE_KEY, preference);
}

/** Forgets the stored setting (the explicit sign-out erase); the next read is the default. */
export async function eraseStoredHapticPreference(): Promise<void> {
  if (Platform.OS === 'web') return;
  const store = await import('expo-secure-store');
  await store.deleteItemAsync(HAPTIC_PREFERENCE_STORAGE_KEY);
}
