// A wallet's material (W5): an absolute react-native-svg rect that fills its
// parent with a 135° LinearGradient through materialPaint's stops, plus dark
// titanium's 1 pt edge, drawn inside the corner. Decorative. The gradient's
// id names the material and the mode, so cards of one material share one
// definition and two materials never take each other's.
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { materialPaint } from '@mobile/theme/walletPalette';
import type { WalletMaterial } from '@mobile/theme/walletPalette';
import { DECORATIVE } from '@mobile/ui/a11y';

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
// `pointerEvents` belongs in the style: react-native-web 0.21 deprecates the prop.
const BEHIND = { ...FILL, pointerEvents: 'none' } as const;

export function MaterialFill({ material, radius }: { material: WalletMaterial; radius: number }) {
  const { isDark } = useWalletColors();
  const paint = materialPaint(material, isDark);
  const id = `wallet-material-${material}-${isDark ? 'dark' : 'light'}`;
  return (
    <View {...DECORATIVE} style={BEHIND}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {paint.stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />)}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
      </Svg>
      {paint.edge === null ? null : <View style={{ ...FILL, borderRadius: radius, borderWidth: 1, borderColor: paint.edge }} />}
    </View>
  );
}
