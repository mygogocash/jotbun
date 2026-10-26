// A good logging week is celebrated (the celebration haptic) at most once per
// ISO week. This remembers the week, like quickAddCheer remembers the day: a
// week label, never money or a record. A store that cannot be read errs
// towards no celebration.
import { Platform } from 'react-native';

export const CELEBRATION_WEEK_KEY = 'gogospend.bun.celebratedWeek';

const WEEK = /^[0-9]{4}-W[0-9]{2}$/;
const parseWeek = (value: unknown): string | null => (typeof value === 'string' && WEEK.test(value) ? value : null);

export async function readCelebratedWeek(): Promise<string | null> {
  if (Platform.OS === 'web') return parseWeek(window.localStorage.getItem(CELEBRATION_WEEK_KEY));
  const store = await import('expo-secure-store');
  return parseWeek(await store.getItemAsync(CELEBRATION_WEEK_KEY));
}

export async function writeCelebratedWeek(week: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(CELEBRATION_WEEK_KEY, week);
      return;
    }
    const store = await import('expo-secure-store');
    await store.setItemAsync(CELEBRATION_WEEK_KEY, week);
  } catch {
    // At worst the week is celebrated once more.
  }
}

/** Forgets the week (the explicit sign-out erase). Never throws. */
export async function eraseCelebratedWeek(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(CELEBRATION_WEEK_KEY);
      return;
    }
    const store = await import('expo-secure-store');
    await store.deleteItemAsync(CELEBRATION_WEEK_KEY);
  } catch {
    // Nothing kept, nothing to erase.
  }
}
