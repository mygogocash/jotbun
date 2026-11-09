// Bun's face on a wallet (bw-home, bw-adding, wc-wallet-edit): a cream body
// with an ink outline and ink features, the same in light and dark, as every
// board draws it. Decorative: the card says its own words. With
// walletPalette.ts, the one wallet file with colour literals (P2-T37's
// sweep): these are the mascot's own colours, not the theme's.
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { DECORATIVE } from '@mobile/ui/a11y';
import type { BunFaceName } from './walletLooks';

const CREAM = '#FFF6E6';
const INK = '#111014';
const BLUSH = '#F6B6CE';

/** The boards' box: 56 by 50 units from (4, 6). */
const VIEW_BOX = '4 6 56 50';
const BODY = 'M6 44C6 22 18 8 32 8C46 8 58 22 58 44C58 51 52 54 44 54H20C12 54 6 51 6 44Z';

/** A feature: an ink dot (cx, cy, r), a blush cheek (cx, cy), an ink stroke, or an ink-filled mouth. */
type Feature =
  | { readonly dot: readonly [number, number, number] }
  | { readonly cheek: readonly [number, number] }
  | { readonly stroke: string; readonly width: number }
  | { readonly mouth: string };

const LEFT_EYE: Feature = { dot: [24, 30, 3.4] };
const RIGHT_EYE: Feature = { dot: [40, 30, 3.4] };

/** wc-wallet-edit's five, feature by feature. */
const FEATURES: Readonly<Record<BunFaceName, readonly Feature[]>> = {
  smile: [LEFT_EYE, RIGHT_EYE, { cheek: [18.5, 36] }, { cheek: [45.5, 36] }, { stroke: 'M29 36Q32 39 35 36', width: 2.6 }],
  wink: [LEFT_EYE, { stroke: 'M37 30h7', width: 3 }, { mouth: 'M28 35Q32 41 36 35Z' }],
  calm: [{ stroke: 'M20 30h7M37 30h7', width: 3 }, { stroke: 'M29 37Q32 39 35 37', width: 2.6 }],
  happy: [{ stroke: 'M20 30Q24 25 28 30M36 30Q40 25 44 30', width: 2.8 }, { mouth: 'M28 35Q32 42 36 35Z' }],
  wow: [LEFT_EYE, RIGHT_EYE, { dot: [32, 38, 2.6] }],
};

function drawFeature(feature: Feature, index: number) {
  if ('dot' in feature) return <Circle key={index} cx={feature.dot[0]} cy={feature.dot[1]} r={feature.dot[2]} fill={INK} />;
  if ('cheek' in feature) return <Ellipse key={index} cx={feature.cheek[0]} cy={feature.cheek[1]} rx={4} ry={2.4} fill={BLUSH} />;
  if ('stroke' in feature) return <Path key={index} d={feature.stroke} fill="none" stroke={INK} strokeWidth={feature.width} strokeLinecap="round" />;
  return <Path key={index} d={feature.mouth} fill={INK} />;
}

/** `size` is the face's width; its height keeps the boards' 56 by 50 box. */
export function BunFace({ face, size }: { face: BunFaceName; size: number }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={(size * 50) / 56} viewBox={VIEW_BOX}>
        <Path d={BODY} fill={CREAM} stroke={INK} strokeWidth={3} />
        {FEATURES[face].map(drawFeature)}
      </Svg>
    </View>
  );
}
