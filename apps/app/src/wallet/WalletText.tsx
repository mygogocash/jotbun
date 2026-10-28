// Wallet copy in the Bun Wallet type scale. Anuphan in every language (§5.1):
// Thai gets the taller leading, every other locale the Latin one.
import type { TextProps } from 'react-native';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { WALLET_TYPE, walletLineHeight, type WalletTextRole } from '@mobile/theme/walletType';

export type WalletTone = 'ink' | 'quiet' | 'quietOnGround' | 'violet' | 'under' | 'over' | 'onPrimary' | 'onToast';

// TextProps.role is the ARIA role. This role is the type scale, so the two
// cannot share one property: their intersection is never.
type WalletTextProps = Omit<TextProps, 'role'> & { role?: WalletTextRole; tone?: WalletTone };

export function WalletText({ role = 'body', tone = 'ink', style, ...rest }: WalletTextProps) {
  const colors = useWalletColors();
  const locale = useActiveLocale();
  const { size, weight, maxScale } = WALLET_TYPE[role];
  return (
    <Text
      maxFontSizeMultiplier={maxScale}
      {...rest}
      style={[{
        fontFamily: THAI_UI_FONT_FAMILY,
        fontSize: size,
        fontWeight: weight,
        lineHeight: walletLineHeight(size, locale === 'th' ? 'thai' : 'latin'),
        color: colors[tone],
      }, style]}
    />
  );
}
