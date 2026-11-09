// A Bun Wallet amount (§5.1, W9, W10, W30): DM Sans 700 in every language,
// ฿ first with thousands commas, compact unless `exact`. It grows with the
// text size up to 64 pt and never more than body text, and is never clamped
// to a line. Income is violet unless a tone or a colour says otherwise. Its
// label is `label`, then the amount in words (฿ read as บาท). In private mode
// it is ฿•••• at its own size and line, so rows never change height, and it
// says only that the amount is hidden, never the dots.
import type { Minor } from '@gogospend/contracts';

import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { amountMaxScale, walletLineHeight } from '@mobile/theme/walletType';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { HIDDEN_AMOUNT, spokenMoney, walletMoneyText } from './walletMoney';
import type { MoneySign } from './walletMoney';

export type WalletAmountSize = 58 | 44 | 36 | 34 | 28 | 22 | 17 | 16 | 13;
export type WalletAmountTone = 'ink' | 'quiet' | 'violet' | 'under' | 'over';

export type WalletAmountProps = {
  /** Canonical satang. */
  minor: Minor;
  sign?: MoneySign;
  /** Keep `.00`. */
  exact?: boolean;
  size: WalletAmountSize;
  tone?: WalletAmountTone;
  /** Overrides the tone: the text colour of the material underneath. */
  color?: string;
  /** Said before the amount, such as ใช้ไปเดือนนี้. */
  label?: string;
  testID?: string;
};

/** The size of a canonical satang string. */
const magnitude = (minor: Minor): Minor => (minor.startsWith('-') ? minor.slice(1) : minor);

export function WalletAmount({ minor, sign = 'none', exact = false, size, tone, color, label, testID }: WalletAmountProps) {
  const colors = useWalletColors();
  const { hidden } = usePrivateMode();
  const t = useDraftCopy(COMMON_COPY);
  // The words follow what is drawn: only a balance says it is below zero; an
  // expense or income row says its kind in its own label.
  const spoken = hidden ? t('common.amountHidden') : spokenMoney(sign === 'balance' ? minor : magnitude(minor), t);
  // −0.02 em at 28 pt and above (the boards); the mask is spaced 0.12 em, as bw-private draws it.
  const letterSpacing = hidden ? (size * 12) / 100 : size >= 28 ? (size * -2) / 100 : undefined;
  return (
    <Text
      testID={testID}
      accessibilityLabel={label ? `${label} ${spoken}` : spoken}
      maxFontSizeMultiplier={amountMaxScale(size)}
      style={{
        fontFamily: LATIN_UI_FONT_FAMILY,
        fontWeight: '700',
        fontSize: size,
        lineHeight: walletLineHeight(size, 'latin'),
        letterSpacing,
        color: color ?? colors[tone ?? (sign === 'income' ? 'violet' : 'ink')],
      }}
    >
      {hidden ? HIDDEN_AMOUNT : walletMoneyText(minor, { sign, exact })}
    </Text>
  );
}
