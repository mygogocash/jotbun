// The kit's small line icons (redesign R2b), drawn as vectors so they look
// the same on every platform. Always decorative: the control that holds one
// carries the label, so screen readers skip the drawing.
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { DECORATIVE } from './a11y';

export type GlyphName = 'backspace' | 'swap' | 'chevron-left' | 'chevron-right' | 'dots' | 'alert' | 'close';

export type GlyphProps = {
  readonly name: GlyphName;
  /** Width and height in points; 20 by default. */
  readonly size?: number;
  /** A palette colour from `useBunColors()`, usually `ink`. */
  readonly color: string;
};

export function Glyph({ name, size = 20, color }: GlyphProps) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'backspace' ? (
          <>
            <Path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" {...stroke} />
            <Path d="M12 9l6 6M18 9l-6 6" {...stroke} />
          </>
        ) : null}
        {name === 'swap' ? (
          <>
            <Path d="M4 8h15M15 4l4 4-4 4" {...stroke} />
            <Path d="M20 16H5M9 12l-4 4 4 4" {...stroke} />
          </>
        ) : null}
        {name === 'chevron-left' ? <Path d="M15 5l-7 7 7 7" {...stroke} /> : null}
        {name === 'chevron-right' ? <Path d="M9 5l7 7-7 7" {...stroke} /> : null}
        {name === 'close' ? <Path d="M6 6l12 12M18 6L6 18" {...stroke} /> : null}
        {name === 'dots' ? (
          <>
            <Circle cx={6} cy={12} r={1.6} fill={color} />
            <Circle cx={12} cy={12} r={1.6} fill={color} />
            <Circle cx={18} cy={12} r={1.6} fill={color} />
          </>
        ) : null}
        {name === 'alert' ? (
          <>
            <Circle cx={12} cy={12} r={9} {...stroke} />
            <Line x1={12} y1={7.5} x2={12} y2={13} {...stroke} />
            <Circle cx={12} cy={16.5} r={1.2} fill={color} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
