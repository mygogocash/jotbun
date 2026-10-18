import { useSyncExternalStore } from "react";

import type { Locale } from "@mobile/i18n/locales";

const isNativeRuntime = process.env.EXPO_OS === "ios" || process.env.EXPO_OS === "android";

/** Default / English UI stack — DM Sans first (web includes Anuphan as glyph fallback). */
export const LATIN_UI_FONT_FAMILY = isNativeRuntime
  ? "DM Sans"
  : '"DM Sans", Anuphan, system-ui, sans-serif';

/** Thai UI stack — Anuphan first so body copy renders with the Thai face. */
export const THAI_UI_FONT_FAMILY = isNativeRuntime
  ? "Anuphan"
  : 'Anuphan, "DM Sans", system-ui, sans-serif';

let currentFamily = LATIN_UI_FONT_FAMILY;
let version = 0;
const listeners = new Set<() => void>();

export function resolveUiFontFamily(locale: Locale): string {
  return locale === "th" ? THAI_UI_FONT_FAMILY : LATIN_UI_FONT_FAMILY;
}

export function getUiFontFamily(): string {
  return currentFamily;
}

export function getUiFontFamilyVersion(): number {
  return version;
}

export function syncUiFontFamily(locale: Locale): void {
  const next = resolveUiFontFamily(locale);
  if (next === currentFamily) {
    return;
  }
  currentFamily = next;
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe style factories (via useThemedStyles) so locale flips rematerialize fonts. */
export function useUiFontFamilyVersion(): number {
  return useSyncExternalStore(subscribe, getUiFontFamilyVersion, getUiFontFamilyVersion);
}
