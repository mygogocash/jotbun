// A category's tile in the Bun Wallet (wc-categories, bw-record, rh-history):
// its glyph (useCategoryIcons: the kept icon, the pack's glyph or the
// built-in drawing) in the mode's ink, or else the name's initial, on the
// category's hue tinted for the mode (tileTint), or on `raised` when it has
// none. 36 pt with an 11 pt corner and an 18 pt glyph, each in proportion at
// another size, as the boards draw 40, 52 and 64. Decorative: the row beside
// it says the name.
import type { CategoryDto } from '@gogospend/contracts';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { tileTint } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { categoryInitial } from '@mobile/ui/categoryIcons';
import { WalletText } from '../WalletText';
import { glyphShapes } from './categoryGlyphs';
import type { GlyphKey } from './categoryGlyphs';
import { useCategoryIcons } from './WalletLooksProvider';

/** One glyph in a `size` box: 2 pt round strokes in `color`, a `filled` dot filled with it. Decorative. */
export function CategoryGlyph({ glyph, size, color }: { glyph: GlyphKey; size: number; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {glyphShapes(glyph).map((shape, index) => {
          if ('d' in shape) return <Path key={index} d={shape.d} {...stroke} />;
          if ('circle' in shape) {
            const [cx, cy, r] = shape.circle;
            return shape.filled ? <Circle key={index} cx={cx} cy={cy} r={r} fill={color} /> : <Circle key={index} cx={cx} cy={cy} r={r} {...stroke} />;
          }
          const [x, y, width, height] = shape.rect;
          // Today's drawings round every rectangle by 2, as CategoryIcon does.
          return <Rect key={index} x={x} y={y} width={width} height={height} rx={shape.rx ?? 2} {...stroke} />;
        })}
      </Svg>
    </View>
  );
}

export function WalletCategoryIcon({ category, name, size = 36 }: {
  category: Pick<CategoryDto, 'id' | 'builtin_key' | 'color' | 'label' | 'type'>;
  /** The shown name, already in the person's language: the initial comes from it. */
  name: string;
  size?: number;
}) {
  const colors = useWalletColors();
  const { iconOf } = useCategoryIcons();
  const glyph = iconOf(category);
  const initial = Math.round((size * 15) / 36);
  return (
    <View
      {...DECORATIVE}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round((size * 11) / 36),
        backgroundColor: category.color === null ? colors.raised : tileTint(category.color, colors.isDark),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {glyph === null ? (
        // The tile is a fixed square, so the initial never grows with the text size.
        <WalletText role="label" allowFontScaling={false} style={{ fontSize: initial, lineHeight: walletLineHeight(initial, 'thai'), fontWeight: '700' }}>
          {categoryInitial(name)}
        </WalletText>
      ) : (
        <CategoryGlyph glyph={glyph} size={size / 2} color={colors.ink} />
      )}
    </View>
  );
}
