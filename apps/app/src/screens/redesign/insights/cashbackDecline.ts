// "No thanks" to cashback tips is remembered on this phone, so the question
// is asked once. A flag, never money or a record; erased on sign-out.
import { Platform } from 'react-native';

export const CASHBACK_DECLINED_KEY = 'gogospend.cashback.declined';

export async function readCashbackDeclined(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return window.localStorage.getItem(CASHBACK_DECLINED_KEY) === '1';
    const store = await import('expo-secure-store');
    return (await store.getItemAsync(CASHBACK_DECLINED_KEY)) === '1';
  } catch {
    return true; // a store that cannot be read errs towards not asking
  }
}

export async function writeCashbackDeclined(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(CASHBACK_DECLINED_KEY, '1');
      return;
    }
    const store = await import('expo-secure-store');
    await store.setItemAsync(CASHBACK_DECLINED_KEY, '1');
  } catch {
    // At worst the question is asked once more.
  }
}

export async function eraseCashbackDeclined(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(CASHBACK_DECLINED_KEY);
      return;
    }
    const store = await import('expo-secure-store');
    await store.deleteItemAsync(CASHBACK_DECLINED_KEY);
  } catch {
    // Nothing kept, nothing to erase.
  }
}
