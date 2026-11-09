// The category line drawings (redesign R2b): 24×24 shapes, drawn as 2 pt
// strokes with round ends, one for each built-in key and one for a transfer.
// Moved out of categoryIcons.tsx unchanged (P2-T11), so the Bun Wallet's
// category glyphs draw the same built-ins. Pure: no React, no react-native-svg.
import type { BuiltinCategoryKey } from '@gogospend/contracts';

/**
 * One shape in a 24×24 box: a path, a circle (cx, cy, r) or a rectangle
 * (x, y, width, height). The Bun Wallet's board glyphs also use `filled` (a
 * dot filled with the stroke's colour) and `rx` (a corner radius of their
 * own); today's drawings use neither, and CategoryIcon draws each rectangle
 * with a 2 pt corner.
 */
export type DrawingShape =
  | { d: string }
  | { circle: readonly [number, number, number]; filled?: boolean }
  | { rect: readonly [number, number, number, number]; rx?: number };

// 24×24 line drawings, 2 pt strokes with round ends. Each key has its own.
export const CATEGORY_DRAWINGS: Readonly<Record<BuiltinCategoryKey | 'transfer', readonly DrawingShape[]>> = {
  food: [{ d: 'M4 12h16a8 8 0 0 1-16 0z' }, { d: 'M13 9l3-6' }, { d: 'M16 9l4-5' }],
  travel: [{ rect: [4, 4, 16, 13] }, { d: 'M4 11h16' }, { circle: [8, 19, 1.5] }, { circle: [16, 19, 1.5] }],
  household: [{ d: 'M3 11l9-7 9 7' }, { d: 'M6 9.5V20h12V9.5' }, { d: 'M10 20v-5h4v5' }],
  bills: [{ d: 'M6 3h12v18l-3-2-3 2-3-2-3 2z' }, { d: 'M9 8h6' }, { d: 'M9 12h6' }, { d: 'M9 16h3' }],
  shopping: [{ d: 'M5 8h14l-1.2 12H6.2z' }, { d: 'M9 8V6a3 3 0 0 1 6 0v2' }],
  fun: [{ d: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.3l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z' }],
  salary: [{ rect: [3, 6, 18, 12] }, { circle: [12, 12, 2.5] }, { d: 'M6.5 9.5v5M17.5 9.5v5' }],
  bonus: [{ d: 'M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z' }, { d: 'M19 3v3M17.5 4.5h3' }],
  side_job: [{ rect: [3, 8, 18, 12] }, { d: 'M9 8V5h6v3' }, { d: 'M3 13h18' }],
  gift: [{ rect: [4, 10, 16, 10] }, { rect: [3, 7, 18, 3] }, { d: 'M12 7v13' }, { d: 'M12 7C10 4 7 4 7 5.5S9.5 7 12 7c2.5 0 5-.5 5-1.5S14 4 12 7z' }],
  transfer: [{ d: 'M4 8h14M14 4l4 4-4 4' }, { d: 'M20 16H6M10 12l-4 4 4 4' }],
};
