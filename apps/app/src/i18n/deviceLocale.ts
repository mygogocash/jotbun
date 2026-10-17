import { getLocales } from 'expo-localization';

import { resolveLocale, type Locale } from '@mobile/i18n/locales';

/** The device's preferred supported locale (Thai, English or Vietnamese), else English. */
export function deviceLocale(): Locale {
  try {
    return resolveLocale(getLocales()[0]?.languageTag);
  } catch {
    return resolveLocale(undefined);
  }
}
