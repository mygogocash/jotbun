// RED stub (1D-T8): the final exports, wrong behaviour: English in every
// language, and no line yet.
import { useCallback } from 'react';

import type { Locale } from '@mobile/i18n/locales';

export const ANALYTICS_CONSENT_COPY_DRAFT = {
  title: { th: '', en: '' },
  body: { th: '', en: '' },
  replay: { th: '', en: '' },
  never: { th: '', en: '' },
  later: { th: '', en: '' },
  yes: { th: '', en: '' },
  no: { th: '', en: '' },
  saveFailed: { th: '', en: '' },
  switchLabel: { th: '', en: '' },
  stoppedHere: { th: '', en: '' },
} as const;

export type ConsentCopyKey = keyof typeof ANALYTICS_CONSENT_COPY_DRAFT;

export function consentText(key: ConsentCopyKey, _locale: Locale): string {
  return ANALYTICS_CONSENT_COPY_DRAFT[key].en;
}

export function useConsentCopy(): (key: ConsentCopyKey) => string {
  return useCallback((key: ConsentCopyKey) => ANALYTICS_CONSENT_COPY_DRAFT[key].en, []);
}
