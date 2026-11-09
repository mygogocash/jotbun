// 1C-T8 RED stub (R52): no drafts yet; the copy hook answers the English as it is.
import { useCallback } from 'react';

import type { Locale } from '../../../i18n/locales.ts';

export type CopyValues = Readonly<Record<string, string | number>>;

export const DRAFT_TH: Readonly<Record<string, string>> = {};

export function signinText(english: string, _locale: Locale, _values?: CopyValues): string {
  return english;
}

export function useSigninCopy(): (english: string, values?: CopyValues) => string {
  return useCallback((english: string) => english, []);
}
