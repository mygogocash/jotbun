// The Bun Wallet's category glyphs: every built-in key and a transfer draw
// today's line drawings (CATEGORY_DRAWINGS), and the icon picker's other ten
// are wc-category-edit's 24-unit shapes, copied unchanged (each board path is
// one `d`). The picker's food and gift are the built-in keys, so they draw the
// built-in food and gift, one drawing per key. Every shape is drawn as a 2 pt
// round stroke; a `filled` dot takes the stroke's colour. Pure: a Node test reads it.
import type { BuiltinCategoryKey } from '@gogospend/contracts';

import { CATEGORY_DRAWINGS } from '../../ui/categoryDrawings.ts';
import type { DrawingShape } from '../../ui/categoryDrawings.ts';

export type GlyphKey = BuiltinCategoryKey | 'transfer' | 'coffee' | 'car' | 'bag' | 'home' | 'receipt' | 'heart' | 'lotus' | 'gift' | 'phone' | 'paw' | 'book';

/** The picker's ten that are not built-in keys. */
type BoardGlyph = Exclude<GlyphKey, BuiltinCategoryKey | 'transfer'>;

/** The icon picker's twelve, in the board's order: อาหาร, กาแฟ, รถ, ถุงช้อปปิ้ง, บ้าน, ใบเสร็จ, หัวใจ, ดอกบัว, ของขวัญ, มือถือ, รอยเท้าสัตว์, หนังสือ. */
export const CATEGORY_PICKER_GLYPHS: readonly GlyphKey[] = ['food', 'coffee', 'car', 'bag', 'home', 'receipt', 'heart', 'lotus', 'gift', 'phone', 'paw', 'book'];

const BOARD_GLYPHS: Readonly<Record<BoardGlyph, readonly DrawingShape[]>> = {
  coffee: [{ d: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16 M9 3.5c0 1-1 1.5-1 2.5M12.5 3.5c0 1-1 1.5-1 2.5' }],
  car: [
    { d: 'M6 4h12a2 2 0 0 1 2 2v11H4V6a2 2 0 0 1 2-2Z M4 11h16 M6.5 17v2.5M17.5 17v2.5' },
    { circle: [8, 14, 1.2], filled: true },
    { circle: [16, 14, 1.2], filled: true },
  ],
  bag: [{ d: 'M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9Z M9 10V7a3 3 0 0 1 6 0v3' }],
  home: [{ d: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5' }],
  receipt: [{ d: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z M9 8h6M9 12h6M9 16h3' }],
  heart: [{ d: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z' }],
  lotus: [{ d: 'M12 4.5c2.2 3 2.2 7.5 0 11.5-2.2-4-2.2-8.5 0-11.5Z M4.5 9c3.5.6 6 3.5 7.5 7-4.2.3-7.5-2.8-7.5-7Z M19.5 9c-3.5.6-6 3.5-7.5 7 4.2.3 7.5-2.8 7.5-7Z M5.5 19.5h13' }],
  phone: [{ rect: [6.5, 2.5, 11, 19], rx: 2.5 }, { d: 'M12 8.5v6M9 11.5h6 M10.5 18.5h3' }],
  paw: [
    { d: 'M8.5 17.2c0-2.6 1.6-5 3.5-5s3.5 2.4 3.5 5c0 1.6-1.5 2.3-3.5 2.3s-3.5-.7-3.5-2.3Z' },
    { circle: [6.6, 11.4, 1.7] },
    { circle: [10, 7.8, 1.7] },
    { circle: [14, 7.8, 1.7] },
    { circle: [17.4, 11.4, 1.7] },
  ],
  book: [{ d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 0 4 21Z M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 1 20 21Z' }],
};

const isBoardGlyph = (key: string): key is BoardGlyph => Object.hasOwn(BOARD_GLYPHS, key);

/** Whether a kept value names a glyph. */
export function isGlyphKey(value: unknown): value is GlyphKey {
  return typeof value === 'string' && (isBoardGlyph(value) || Object.hasOwn(CATEGORY_DRAWINGS, value));
}

/** A glyph's shapes in a 24-unit box. */
export function glyphShapes(key: GlyphKey): readonly DrawingShape[] {
  return isBoardGlyph(key) ? BOARD_GLYPHS[key] : CATEGORY_DRAWINGS[key];
}
