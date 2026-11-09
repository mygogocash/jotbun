// Where the bun intensity lives: the same stores as the theme preference
// (browser storage on web, the secure store on native), under its own key.
import { Platform } from 'react-native';
import { parseBunIntensity, type BunIntensity } from './bunIntensity';

export const BUN_INTENSITY_STORAGE_KEY = 'gogospend.bun.intensity';

export function readStoredBunIntensitySync(): BunIntensity | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try { return parseBunIntensity(window.localStorage.getItem(BUN_INTENSITY_STORAGE_KEY)); }
  catch { return null; /* Browser storage can be blocked; the default bun remains usable. */ }
}

export async function readStoredBunIntensity(): Promise<BunIntensity | null> {
  if (Platform.OS === 'web') return readStoredBunIntensitySync();
  const store = await import('expo-secure-store');
  return parseBunIntensity(await store.getItemAsync(BUN_INTENSITY_STORAGE_KEY));
}

/** Forgets the stored setting (the explicit sign-out erase); the next read is the default. */
export async function eraseStoredBunIntensity(): Promise<void> {
  if (Platform.OS === 'web') {
    try { window.localStorage.removeItem(BUN_INTENSITY_STORAGE_KEY); }
    catch { /* Browser storage can be blocked; nothing was kept there then. */ }
    return;
  }
  const store = await import('expo-secure-store');
  await store.deleteItemAsync(BUN_INTENSITY_STORAGE_KEY);
}

export async function writeStoredBunIntensity(intensity: BunIntensity): Promise<void> {
  if (Platform.OS === 'web') {
    try { window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity); }
    catch { console.warn('Bun setting could not be saved.'); }
    return;
  }
  const store = await import('expo-secure-store');
  await store.setItemAsync(BUN_INTENSITY_STORAGE_KEY, intensity);
}
