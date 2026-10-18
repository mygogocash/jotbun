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
