// The floating + (P2-T18; bw-home, dk-home, ax-voiceover): 60 pt, `primary`
// with a + in `onPrimary`, at the bottom right of the screen, 16 pt above the
// bar, with bw-home's lift by day and none at night. It is named จดรายการ with
// the hint แตะสองครั้งเพื่อจดรายจ่ายใหม่, and is disabled while saving is
// blocked (C5). The shell draws it where it draws the bar.
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { useDraftCopy } from '../copy/useDraftCopy';
import { COPY } from './copy';

/** The +'s diameter (bw-home). */
export const ADD_BUTTON_SIZE = 60;
/** bw-home's lift; dk-home draws none. */
const ADD_SHADOW = '0 12px 26px rgba(17, 16, 20, 0.3)';

export function AddButton({ onPress, disabled }: { onPress(): void; disabled: boolean }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  return (
    <Pressable
      testID="wallet-add"
      accessibilityRole="button"
      accessibilityLabel={t('home.add')}
      accessibilityHint={t('home.addHint')}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        position: 'absolute',
        right: 18,
        bottom: 16,
        width: ADD_BUTTON_SIZE,
        height: ADD_BUTTON_SIZE,
        borderRadius: ADD_BUTTON_SIZE / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: colors.isDark ? undefined : ADD_SHADOW,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View {...DECORATIVE}>
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.onPrimary} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      </View>
    </Pressable>
  );
}
