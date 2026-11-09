// The eye (bw-home, bw-private, ax-voiceover): one tap hides every amount, the
// next shows them again. It says what it will do, ซ่อนยอดเงิน or แสดงยอดเงิน,
// and is drawn open or shut (the boards' 24-unit eye and slashed eye).
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COPY } from './copy';
import { usePrivateMode } from './PrivateModeProvider';

function EyeGlyph({ shut, color }: { shut: boolean; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <View {...DECORATIVE}>
      <Svg width={24} height={24} viewBox="0 0 24 24">
        {shut ? (
          <Path d="M2 12s3.6-7 10-7c2 0 3.8.7 5.2 1.6M22 12s-3.6 7-10 7c-2 0-3.8-.7-5.2-1.6M4 4l16 16" {...stroke} />
        ) : (
          <>
            <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" {...stroke} />
            <Circle cx={12} cy={12} r={3} {...stroke} />
          </>
        )}
      </Svg>
    </View>
  );
}

export function PrivateEyeButton() {
  const { hidden, toggle } = usePrivateMode();
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  return (
    <IconButton label={t(hidden ? 'privacy.show' : 'privacy.hide')} onPress={toggle}>
      <EyeGlyph shut={hidden} color={colors.ink} />
    </IconButton>
  );
}
