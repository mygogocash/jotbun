// Private mode's tip (bw-private): while amounts are hidden, a note says what
// happened and how to undo it, until the person closes it once. It is a polite
// status, so Android and the web read it as it appears; iOS hears the eye's
// own announcement. The fill is the palette's toast pair, and the close is
// 44 pt (§4).
import { Pressable, View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { usePrivateMode } from './PrivateModeProvider';

const CLOSE = 44;

export function PrivateTip() {
  const { hidden, tipSeen, dismissTip } = usePrivateMode();
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  if (!hidden || tipSeen) return null;
  return (
    <View
      {...POLITE_LIVE_REGION}
      testID="private-tip"
      style={{ backgroundColor: colors.toast, borderRadius: 16, paddingVertical: 14, paddingLeft: 16, paddingRight: CLOSE }}
    >
      <WalletText role="label" tone="onToast" style={{ fontWeight: '700' }}>{t('privacy.tipTitle')}</WalletText>
      <WalletText role="label" tone="onToast" style={{ fontWeight: '400' }}>{t('privacy.tipBody')}</WalletText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('privacy.tipClose')}
        onPress={dismissTip}
        style={{ position: 'absolute', top: 2, right: 0, width: CLOSE, height: CLOSE, alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="close" size={14} color={colors.onToast} />
      </Pressable>
    </View>
  );
}
