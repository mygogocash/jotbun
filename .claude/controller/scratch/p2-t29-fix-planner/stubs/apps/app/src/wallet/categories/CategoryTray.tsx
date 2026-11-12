// RED stub (P2-T29 fix round): the real tray's exports and types, drawing nothing.
import type { BudgetDto, CategoryDto, CategoryType } from '@gogospend/contracts';
import { CATEGORY_COLORS } from '@gogospend/contracts';

import type { GlyphKey } from '../looks/categoryGlyphs';

export const TRAY_SWATCHES: readonly string[] = [0, 4, 5, 2, 3, 6, 8].map((index) => CATEGORY_COLORS[index]);

export function CategoryMark(_props: { glyph: GlyphKey | null; name: string; size: number }) {
  return null;
}

export type CategoryTrayProps = {
  visible: boolean;
  onClose(): void;
  category: CategoryDto | null;
  type: CategoryType;
  budget: BudgetDto | null;
};

export function CategoryTray(_props: CategoryTrayProps) {
  return null;
}
