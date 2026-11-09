// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { BuiltinCategoryKey } from '@gogospend/contracts';

import type { DrawingShape } from '../../ui/categoryDrawings.ts';

export type GlyphKey = BuiltinCategoryKey | 'transfer' | 'coffee' | 'car' | 'bag' | 'home' | 'receipt' | 'heart' | 'lotus' | 'gift' | 'phone' | 'paw' | 'book';

export const CATEGORY_PICKER_GLYPHS: readonly GlyphKey[] = [];

export function isGlyphKey(_value: unknown): _value is GlyphKey {
  return false;
}

export function glyphShapes(_key: GlyphKey): readonly DrawingShape[] {
  return [];
}
