// R6's way into Settings from the header (decision D7), behind the `account`
// area until E2 checkpoint 4: with it off it draws nothing.
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { BUN_OUTLINE, BUN_RADIUS, BUN_TOUCH } from '@mobile/ui/layout';

export function SettingsLink() {
  const router = useRouter();
  const tc = useCopy();
  const colors = useBunColors();
  if (!isRedesignEnabled('account')) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tc('Settings')}
      onPress={() => router.push('/settings')}
      style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink }}
    >
      <View {...DECORATIVE}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={3} stroke={colors.ink} strokeWidth={2} fill="none" />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </View>
    </Pressable>
  );
}
