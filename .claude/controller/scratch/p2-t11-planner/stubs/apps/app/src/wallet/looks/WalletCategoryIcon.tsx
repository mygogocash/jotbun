// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { CategoryDto } from '@gogospend/contracts';
import { View } from 'react-native';

import type { GlyphKey } from './categoryGlyphs';

export function CategoryGlyph(_props: { glyph: GlyphKey; size: number; color: string }) {
  return <View />;
}

export function WalletCategoryIcon(_props: { category: Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'>; name: string; size?: number }) {
  return <View />;
}
