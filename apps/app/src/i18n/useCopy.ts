import { useCallback } from "react";
import { useIntl } from "react-intl";

import { isSupportedLocale, type Locale } from "@mobile/i18n/locales";
import { translateCopy, type CopyValues, formatCopyValues } from "@mobile/i18n/messages";

// Thin hook around `translateCopy`: reads the active locale from the IntlProvider (mounted by
// LocaleProvider) and returns a `tc(englishString)` translator that reuses the web catalogs and
// falls back to the input English. All the logic lives in `translateCopy` (pure, source-tested).
//
// #2245 — the optional second argument fills `{placeholder}` tokens after the lookup. Write
// `tc("Send again in {seconds}s", { seconds })`, never `tc(`Send again in ${seconds}s`)`: the
// latter is a distinct catalog key per value, so it can never resolve.
export function useCopy(): (english: string, values?: CopyValues) => string {
  const { locale } = useIntl();
  const active = isSupportedLocale(locale) ? locale : "en";
  return useCallback(
    (english: string, values?: CopyValues): string =>
      translateCopy(english, active, values),
    [active],
  );
}

/**
 * Render one copy line, honouring a line an operator wrote themselves.
 *
 * A `verbatim` line arrives from the API already in the reader's language, so
 * it only needs its numbers filled. Sending it through the catalogue would look
 * up the sentence the operator typed, and one that happens to collide with an
 * entry written for something else renders that entry's translation instead —
 * fluent, confident, and about a different subject.
 */
export function useCopyLine(): (line: {
  text: string;
  values?: CopyValues;
  verbatim?: true;
}) => string {
  const tc = useCopy();
  return useCallback(
    (line) =>
      line.verbatim
        ? formatCopyValues(line.text, line.values ?? {})
        : tc(line.text, line.values),
    [tc],
  );
}

/**
 * The locale the app is actually rendering in, already narrowed to one this
 * build ships. Exported so a caller that has to CHOOSE between pre-resolved
 * strings — the operator's referral wording, served per language — picks the
 * same one the rest of the screen is reading.
 */
export function useActiveLocale(): Locale {
  const { locale } = useIntl();
  return isSupportedLocale(locale) ? locale : "en";
}
