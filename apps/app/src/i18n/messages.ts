import enCatalog from "@mobile/messages/en.json";
import thCatalog from "@mobile/messages/th.json";
import viCatalog from "@mobile/messages/vi.json";
import type { Locale } from "@mobile/i18n/locales";

export type FlatMessages = Record<string, string>;

export const MESSAGES: Record<Locale, FlatMessages> = { en: enCatalog, th: thCatalog, vi: viCatalog };

// Reverse index (English value -> first catalog key) so screens can reuse the web translations by
// looking up a shared English string instead of hand-authoring per-string ids. ~92% of catalog values
// are unique; ambiguous ones resolve to the same Thai for display, so first-key-wins is safe here.
export const EN_VALUE_TO_KEY: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [key, value] of Object.entries(MESSAGES.en)) {
    if (!index.has(value)) {
      index.set(value, key);
    }
  }
  return index;
})();

export type CopyValues = Readonly<Record<string, string | number>>;

/**
 * Fill `{placeholder}` tokens in an already-translated string.
 *
 * #2245 — the reason this exists rather than callers doing their own template
 * literal: `tc(`Send again in ${n}s`)` looks translated and cannot be. The
 * lookup is keyed by the English text, so an interpolated value produces a
 * distinct key per value ("Send again in 59s", "…58s", …) and none of them are
 * in any catalog. Every one silently rendered English.
 *
 * Substitution happens AFTER the lookup, so the translator controls where the
 * value lands. Thai and Vietnamese do not put a name where English puts it, and
 * "{name} invited you" is exactly the sentence that breaks if the placeholder
 * cannot move.
 *
 * One pass, not repeated `replace` calls: a value that itself looks like a
 * placeholder must be inserted, never re-substituted. An unsupplied key is left
 * as-is — a visible `{name}` is a bug report, `undefined` is a mystery.
 */
/**
 * Substitute `{token}` values WITHOUT looking anything up.
 *
 * Public because some copy is already resolved before it reaches the screen —
 * an operator's own referral wording, served per locale by the API. Sending
 * that through `translateCopy` would search the catalogue for the sentence they
 * typed, and a phrase that happens to collide with an entry written for
 * something else renders that entry's translation instead: fluent, confident,
 * and about a different subject.
 */
export function formatCopyValues(text: string, values: CopyValues): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}

// Pure reverse-lookup translation (no React, no ICU formatting): shared English copy -> catalog key
// -> active-locale value, falling back to the input English when nothing matches. `useCopy` is a thin
// hook wrapper around this; keeping the logic pure lets the source suite test it without rendering.
export function translateCopy(
  english: string,
  locale: Locale,
  values?: CopyValues,
): string {
  const id = EN_VALUE_TO_KEY.get(english);
  const resolved = id ? (MESSAGES[locale][id] ?? english) : english;
  return values ? formatCopyValues(resolved, values) : resolved;
}
