// The dimmed page behind a bottom sheet (redesign R2a), drawn by `Sheet` (and
// so by DateChip's calendar). Ink by day and the night ground at night, so the
// page always darkens and is never washed with a light veil. Decorative: the
// sheet's Close button is how screen readers leave.
import type { BunColors } from '@mobile/theme/bunPalette';

/** How much the backdrop dims the screen behind the sheet. */
export const SHEET_BACKDROP_OPACITY = 0.55;

export function sheetBackdrop(colors: BunColors): { backgroundColor: string; opacity: number } {
  return { backgroundColor: colors.isDark ? colors.background : colors.ink, opacity: SHEET_BACKDROP_OPACITY };
}
