// Category icons for the entry kit (redesign R2b). Built-in categories get
// their own line drawings (vectors, never emoji, which every platform draws
// differently); a user's own category gets a tile with its initial. Tiles sit
// on the category's own pastel with the mode's dark ink (BUN_TILE_TEXT, held
// to AA by bunPalette.test.ts), or on cream with an ink outline when the
// category has no colour.
import type { BuiltinCategoryKey, CategoryDto } from '@gogospend/contracts';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BUN_TILE_TEXT } from '@mobile/theme/bunPalette';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
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

// 24×24 line drawings, 2 pt strokes with round ends. Each key has its own.
const DRAWINGS: Readonly<Record<BuiltinCategoryKey | 'transfer', readonly ({ d: string } | { circle: readonly [number, number, number] } | { rect: readonly [number, number, number, number] })[]>> = {
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
  const drawing = look.builtinKey === null ? null : DRAWINGS[look.builtinKey];
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
