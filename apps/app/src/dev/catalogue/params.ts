// The screen catalogue's deep link (redesign R2c), parsed from Expo Router's
// search params:
//
//   gogospend://dev/catalogue?section=receipt&theme=dark&locale=th
//
// Each value is optional. Case and surrounding spaces are ignored, a repeated
// param takes its first value, and anything the app does not ship (a theme
// that is not light, dark or system; a locale other than en, th or vi) reads
// as missing, so the catalogue keeps its default instead of guessing.
import { isSupportedLocale, type Locale } from '../../i18n/locales.ts';
import { parseThemePreference, type ThemePreference } from '../../theme/themePreference.ts';

export type CatalogueSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type CatalogueLink = {
  /** A section id; whether it exists is the registry's business. */
  readonly section: string | null;
  readonly theme: ThemePreference | null;
  readonly locale: Locale | null;
};

function first(params: CatalogueSearchParams, name: string): string | null {
  const raw = params[name];
  const value = (typeof raw === 'string' ? raw : raw?.[0] ?? '').trim().toLowerCase();
  return value.length > 0 ? value : null;
}

export function parseCatalogueParams(params: CatalogueSearchParams): CatalogueLink {
  const locale = first(params, 'locale');
  return {
    section: first(params, 'section'),
    theme: parseThemePreference(first(params, 'theme')),
    locale: isSupportedLocale(locale) ? locale : null,
  };
}
