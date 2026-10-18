// Supported mobile locales (jp is web-only). vi shipped with the VN launch
// (M2, SEA expansion): full catalog + mobile overlay, Claude-translated with
// placeholder-integrity verification and a human pass on money screens.
// Country OS Phase 4 locale packs (fil/lo/id/ms) are registry identity only.
// The picker stays these shipped catalogs until those catalogs land.
export const SUPPORTED_LOCALES = ["en", "th", "vi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Unknown/unsupported tags fall back here. gogocash.co's logged-out Thai
// chrome does NOT go through this constant — it comes from `<html lang="th">`
// via resolveGuestLocale so EN browsers still see Thai without login (GGC-370).
// Native EN phones keep following getLocales() → "en".
export const DEFAULT_LOCALE: Locale = "en";

// Derived from the array so adding a locale cannot silently miss the guard
// (the old hand-written `=== "en" || === "th"` was exactly that trap).
export function isSupportedLocale(
  value: string | null | undefined,
): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

// Map a device/browser locale tag (e.g. "th-TH", "en-US") to a supported locale, else default.
export function resolveLocale(tag: string | null | undefined): Locale {
  if (!tag) {
    return DEFAULT_LOCALE;
  }
  const base = tag.toLowerCase().split("-")[0];
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

/**
 * Locale when the member has not stored a picker choice.
 *
 * Document lang beats navigator/device so logged-out gogocash.co (lang=th)
 * shows Thai chrome to EN browsers without login. Empty html lang keeps the
 * device locale so the happy-dom render suite stays English-stable.
 */
export function resolveGuestLocale(
  htmlLang: string | null | undefined,
  deviceLocale: Locale,
): Locale {
  const trimmed = typeof htmlLang === "string" ? htmlLang.trim() : "";
  if (trimmed.length > 0) {
    return resolveLocale(trimmed);
  }
  return deviceLocale;
}
