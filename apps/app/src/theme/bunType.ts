// The redesign's type scale (R0). Anuphan for Thai, DM Sans for Latin and
// Vietnamese (both already bundled), and the platform serif for receipt
// amounts, so no font package is added. Thai stacks marks above and below the
// line, so its line height is larger than Latin's at every size.
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from './uiFontFamily.ts';

export type BunScript = 'latin' | 'thai';
export type BunTextRole = 'hero' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'micro';
export type BunWeight = '400' | '500' | '700';

export const BUN_TYPE_SCALE: Readonly<Record<BunTextRole, { size: number; weight: BunWeight }>> = {
  hero: { size: 34, weight: '700' },
  title: { size: 28, weight: '700' },
  heading: { size: 22, weight: '700' },
  body: { size: 17, weight: '400' },
  label: { size: 15, weight: '500' },
  caption: { size: 13, weight: '400' },
  micro: { size: 11, weight: '500' },
};

/**
 * How far each role grows with the person's text size (iOS Dynamic Type,
 * Android's font scale), as React Native's `maxFontSizeMultiplier`. Every
 * ceiling is above iOS's largest standard size (xxxLarge, 1.353x), so text
 * follows all the standard sizes untouched. Only the accessibility sizes, which
 * go up to 3.571x, meet a ceiling: reading text still more than doubles, and
 * display text stops near 42–48 pt, as Apple's large titles grow less than
 * body text. So at the largest size a heading stays above body text, words
 * stay whole and an amount stays on one line.
 */
export const BUN_MAX_FONT_SCALE: Readonly<Record<BunTextRole, number>> = {
  hero: 1.4,
  title: 1.5,
  heading: 1.8,
  body: 2.2,
  label: 2.2,
  caption: 2.4,
  micro: 2.6,
};

export type BunTextStyle = { fontSize: number; lineHeight: number; fontWeight: BunWeight; fontFamily: string };

// Leading as a multiple of the size. Thai needs room for marks above and below.
const LEADING: Readonly<Record<BunScript, number>> = { latin: 1.3, thai: 1.5 };

export function bunText(role: BunTextRole, script: BunScript): BunTextStyle {
  const { size, weight } = BUN_TYPE_SCALE[role];
  return {
    fontSize: size,
    lineHeight: Math.ceil(size * LEADING[script]),
    fontWeight: weight,
    fontFamily: script === 'thai' ? THAI_UI_FONT_FAMILY : LATIN_UI_FONT_FAMILY,
  };
}

/**
 * The serif used for receipt amounts and headings: the platform's own, so no
 * font package is added (decision D4). Missing glyphs such as ฿ fall back to
 * the system font on iOS and Android.
 */
export const RECEIPT_SERIF = process.env.EXPO_OS === 'ios' ? 'Georgia' : process.env.EXPO_OS === 'android' ? 'serif' : 'Georgia, "Times New Roman", serif';

export function receiptAmount(size: number): { fontFamily: string; fontSize: number; lineHeight: number; fontVariant: ['tabular-nums'] } {
  return { fontFamily: RECEIPT_SERIF, fontSize: size, lineHeight: Math.ceil(size * 1.25), fontVariant: ['tabular-nums'] };
}
