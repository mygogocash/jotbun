import { useCallback } from 'react';

import { useActiveLocale } from '@mobile/i18n/useCopy';

import { draftText } from './draftText.ts';
import type { DraftTable, WalletT } from './draftText.ts';

/** Locale from `useActiveLocale`. Pass merged tables when a screen needs more than one area. */
export function useDraftCopy(table: DraftTable): WalletT {
  const locale = useActiveLocale();
  return useCallback((key: string, values) => draftText(table, key, locale, values), [table, locale]);
}
