// Large text (redesign R8): at the accessibility text sizes, layouts that sit
// text beside text or a button stack instead, so words stay whole and amounts
// stay on one line. iOS's largest standard size (xxxLarge) is 1.353x and its
// first accessibility size (AX1) 1.786x; Android's largest is 2x.

/** The text scale from which side-by-side layouts stack. */
export const LARGE_TEXT_SCALE = 1.5;

export function isLargeText(fontScale: number): boolean {
  return Number.isFinite(fontScale) && fontScale >= LARGE_TEXT_SCALE;
}
