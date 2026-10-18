// Quick add's saved moment may show the `cheer` bun at most once a day. This
// remembers the Bangkok day it last showed, in the same stores as the bun
// intensity (browser storage on web, the secure store on native), under its
// own key. Nothing here is sensitive: it is a date, never money or a record.
//
// A store that cannot be read errs towards no bun: `readCheerDay` rejects and
// the screen treats that as "already cheered today". A failed write is
// ignored; at worst the next Quick add opened that day cheers once more.
import { Platform } from 'react-native';

export const QUICK_ADD_CHEER_KEY = 'gogospend.bun.cheerDay';

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const parseDay = (value: unknown): string | null => (typeof value === 'string' && DAY.test(value) ? value : null);

/** The day the cheer last showed (`YYYY-MM-DD`), or null when it never has. Rejects when the store cannot be read. */
export async function readCheerDay(): Promise<string | null> {
  if (Platform.OS === 'web') return parseDay(window.localStorage.getItem(QUICK_ADD_CHEER_KEY));
  const store = await import('expo-secure-store');
  return parseDay(await store.getItemAsync(QUICK_ADD_CHEER_KEY));
}

export async function writeCheerDay(day: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(QUICK_ADD_CHEER_KEY, day);
      return;
    }
    const store = await import('expo-secure-store');
    await store.setItemAsync(QUICK_ADD_CHEER_KEY, day);
  } catch {
    // Never an error for the person; see the note at the top of this file.
  }
}
