// Bun AI's copy reader (P3-T14). P3's draft lines live in
// src/wallet/{photos,bunai,receipts}/drafts.ts, and every P3 screen reads them
// through this hook. It is self-contained on purpose: P2-T38 renames P2's
// useDraftCopy and rewrites its call sites, and that rename must not reach P3's
// lines before P3-T24 moves them into the catalogs. Thai for `th`; English for
// `en` and `vi`. `{token}` values are filled in one pass, as P2's draftText
// does, so a value that itself looks like a token is inserted and left alone.
import { useCallback } from 'react';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import type { WalletT } from '../copy/draftText';

export type BunAiLine = { readonly th: string; readonly en: string };

export type BunAiTable = Readonly<Record<string, BunAiLine>>;

/** Thai for `th`, English for `en` and `vi`. An unknown key is returned as itself; an unsupplied token stays `{name}`. */
export function bunAiText(table: BunAiTable, key: string, locale: 'th' | 'en' | 'vi', values?: Readonly<Record<string, string | number>>): string {
  const line = table[key];
  const text = line === undefined ? key : locale === 'th' ? line.th : line.en;
  if (!values) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}

/** A reader bound to one table and the app's language (useActiveLocale). */
export function useBunAiCopy(table: BunAiTable): WalletT {
  const locale = useActiveLocale();
  return useCallback((key: string, values?: Readonly<Record<string, string | number>>) => bunAiText(table, key, locale, values), [table, locale]);
}
