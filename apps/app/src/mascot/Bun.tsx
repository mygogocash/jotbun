// The bun (redesign R1): a placeholder drawn from the pose data in poses.ts,
// coloured from the "Bun diary" palette. The bun is decoration by default and
// hidden from screen readers; a bun that means something takes a label.
// Honours the bun intensity: at `off` it draws nothing.
import { useMemo } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { showsBun } from './bunIntensity';
import { useBunIntensity } from './BunIntensityProvider';
import { BUN_POSES, BUN_SIZES, bunHeight, bunPaints, DEFAULT_BUN_POSE, type BunPaint, type BunPoseName, type BunShape, type BunSize } from './poses';

/** Decorative (the default, hidden from screen readers) or a labelled image. */
export type BunA11yProps =
  | { readonly decorative?: true; readonly accessibilityLabel?: undefined }
  | { readonly decorative: false; readonly accessibilityLabel: string };

export type BunProps = {
  readonly pose?: BunPoseName;
  readonly size?: BunSize;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
} & BunA11yProps;

type BunAccessibility = Pick<ViewProps, 'accessible' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityElementsHidden' | 'importantForAccessibility'> & { 'aria-hidden'?: boolean };

/**
 * Decorative: hidden on iOS (`accessibilityElementsHidden`), Android
 * (`importantForAccessibility`) and web (`aria-hidden`). Labelled: one image.
 */
export function bunAccessibilityProps(a11y: BunA11yProps): BunAccessibility {
  if (a11y.decorative === false) {
    return { accessible: true, accessibilityRole: 'image', accessibilityLabel: a11y.accessibilityLabel };
  }
  return { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true };
}

function BunShapeView({ shape, paints }: { shape: BunShape; paints: Readonly<Record<BunPaint, string>> }) {
  const paint = {
    fill: paints[shape.fill],
    stroke: shape.stroke === undefined ? undefined : paints[shape.stroke],
    strokeWidth: shape.strokeWidth,
    strokeLinecap: shape.strokeLinecap,
    strokeLinejoin: shape.strokeLinejoin,
  };
  switch (shape.kind) {
    case 'circle': return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
    case 'ellipse': return <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...paint} />;
    case 'rect': return <Rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...paint} />;
    case 'path': return <Path d={shape.d} {...paint} />;
  }
}

export function Bun({ pose = DEFAULT_BUN_POSE, size = 'm', style, testID, ...a11y }: BunProps) {
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  const paints = useMemo(() => bunPaints(colors), [colors]);
  if (!showsBun(intensity)) return null;

  const art = BUN_POSES[pose];
  const width = BUN_SIZES[size];
  const height = bunHeight(art, width);
  const { x, y, width: boxWidth, height: boxHeight } = art.viewBox;
  return (
    <View testID={testID} style={[{ width, height }, style]} {...bunAccessibilityProps(a11y as BunA11yProps)}>
      <Svg width={width} height={height} viewBox={`${x} ${y} ${boxWidth} ${boxHeight}`}>
        {art.shapes.map((shape, index) => <BunShapeView key={index} shape={shape} paints={paints} />)}
      </Svg>
    </View>
  );
}
