// Category icons for the entry kit (redesign R2b). Built-in categories get
// their own line drawings (vectors, never emoji, which every platform draws
// differently); a user's own category gets a tile with its initial. Tiles sit
// on the category's own pastel with the mode's dark ink (BUN_TILE_TEXT, held
// to AA by bunPalette.test.ts), or on cream with an ink outline when the
// category has no colour. The drawings live in categoryDrawings.ts, which the
// Bun Wallet's category glyphs share (P2-T11).
import type { BuiltinCategoryKey, CategoryDto } from '@gogospend/contracts';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BUN_TILE_TEXT } from '@mobile/theme/bunPalette';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { CATEGORY_DRAWINGS } from './categoryDrawings';
import { BUN_OUTLINE, BUN_RADIUS } from './layout';

/** What an icon needs to know about a category; 'transfer' draws a move between wallets. */
export type CategoryLook = {
  readonly builtinKey: BuiltinCategoryKey | 'transfer' | null;
  /** The shown name, already localized; a user category's initial comes from it. */
  readonly name: string;
  /** The category's own pastel (one of CATEGORY_COLORS), or null for a plain tile. */
  readonly color: string | null;
};

export function categoryLook(category: Pick<CategoryDto, 'builtin_key' | 'color'>, name: string): CategoryLook {
  return { builtinKey: category.builtin_key, name, color: category.color };
}

/**
 * The first letter of a name, for a user category's tile: emoji and symbols
 * are skipped, and so are Thai vowels written before their consonant, so
 * "เที่ยว" shows ท. Latin letters are upper-cased.
 */
export function categoryInitial(label: string): string {
  for (const char of label.normalize('NFC')) {
    if (/[เ-ไ]/u.test(char)) continue;
    if (/[\p{L}\p{N}]/u.test(char)) return char.toLocaleUpperCase();
  }
  return '?';
}

export function CategoryIcon({ look, size = 40, selected = false }: { readonly look: CategoryLook; readonly size?: number; readonly selected?: boolean }) {
  const colors = useBunColors();
  const onHue = look.color !== null;
  const ink = onHue ? colors[BUN_TILE_TEXT[colors.isDark ? 'dark' : 'light']] : colors.ink;
  const drawing = look.builtinKey === null ? null : CATEGORY_DRAWINGS[look.builtinKey];
  const glyph = Math.round(size * 0.6);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: BUN_RADIUS.chip,
        backgroundColor: look.color ?? colors.card,
        borderColor: colors.ink,
        borderWidth: selected ? BUN_OUTLINE.card : BUN_OUTLINE.control,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {drawing ? (
        <View {...DECORATIVE}>
          <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
            {drawing.map((part, index) => {
              const stroke = { stroke: ink, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
              if ('d' in part) return <Path key={index} d={part.d} {...stroke} />;
              if ('circle' in part) return <Circle key={index} cx={part.circle[0]} cy={part.circle[1]} r={part.circle[2]} {...stroke} />;
              return <Rect key={index} x={part.rect[0]} y={part.rect[1]} width={part.rect[2]} height={part.rect[3]} rx={2} {...stroke} />;
            })}
          </Svg>
        </View>
      ) : (
        <View {...DECORATIVE}>
          {/* The tile is a fixed square, so the initial stays a single line at any text size. */}
          <BunText variant="label" allowFontScaling={false} style={{ color: ink, fontWeight: '700' }}>{categoryInitial(look.name)}</BunText>
        </View>
      )}
    </View>
  );
}
