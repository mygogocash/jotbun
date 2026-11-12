// The outside lines (P6A-T2): Thai for `th`, English for `en` and `vi`, from
// the draft table until E2. P6A-T13 switches both readers to the catalogs.
import { tableT } from '../copy/draftText.ts';
import type { WalletT } from '../copy/draftText.ts';
import { useDraftCopy } from '../copy/useDraftCopy.ts';
import { OUTSIDE_DRAFT } from './outsideCopy.draft.ts';

/** The lines in the app's language (`useActiveLocale`), for a component: the bridge, the catalogue. */
export function useOutsideCopy(): WalletT {
  return useDraftCopy(OUTSIDE_DRAFT);
}

/** The same lines for code outside React (P6A-T3b's eraseOutside). */
export function outsideT(locale: 'th' | 'en' | 'vi'): WalletT {
  return tableT(OUTSIDE_DRAFT, locale);
}
