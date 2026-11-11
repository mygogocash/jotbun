// The add tray's keypad (W29; bw-tray-amount, rh-income, ax-large-tray): 1 to
// 9, then 000, 0 and delete, three to a row. It types through today's exact
// rules (applyKey, src/ui/keypadExpression.ts, by way of walletKey), so an
// amount stays satang and a key that would pass ฿999,999,999.99 is refused,
// its problem set for the host to show. On an amount the person did not type
// (a fill), the first key starts it over (R106). No operators and no decimal
// point: Quick add keeps those. The keys are buttons in DM Sans, as the boards
// draw them, at least 46 pt tall (§4's 44 pt), with nothing behind them until
// pressed. At the largest text sizes they are 56 pt on `raised` with the
// digits capped at 34 pt, so each reads as a target and keeps its digits (the
// host pins the keypad in the tray's footer, so it never scrolls). Each press
// ticks once (keyTap).
import { Pressable, View } from 'react-native';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { walletLineHeight } from '@mobile/theme/walletType';
import { Glyph } from '@mobile/ui/Glyph';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { useLargeText } from '@mobile/ui/largeText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { walletKey } from './addFlow';
import type { WalletKey } from './addFlow';
import { COPY } from './copy';

const ROWS: readonly (readonly WalletKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['000', '0', 'backspace'],
];

/** A key's height (bw-tray-amount; ax-large-tray at the largest text sizes). */
const KEY = 46;
const LARGE_KEY = 56;
/** Digits at 24 pt and 000 at 20 (the boards), at most 34 and 28 pt (ax-large-tray). */
const DIGIT = 24;
const TRIPLE = 20;
const DIGIT_CAP = 34 / 24;

export function WalletKeypad({ keypad, onKeypad, disabled = false }: { keypad: KeypadState; onKeypad(next: KeypadState): void; disabled?: boolean }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const large = useLargeText();
  const press = (key: WalletKey) => {
    playHaptic('keyTap');
    onKeypad(walletKey(keypad, key));
  };
  return (
    <View testID="wallet-keypad" style={{ gap: 4 }}>
      {ROWS.map((row) => (
        <View key={row.join(' ')} style={{ flexDirection: 'row', gap: large ? 6 : 8 }}>
          {row.map((key) => {
            const size = key === '000' ? TRIPLE : DIGIT;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === 'backspace' ? t('add.deleteKey') : key}
                accessibilityState={{ disabled }}
                aria-disabled={disabled}
                disabled={disabled}
                onPress={() => press(key)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: large ? LARGE_KEY : KEY,
                  borderRadius: 14,
                  backgroundColor: large || pressed ? colors.raised : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: disabled ? 0.4 : 1,
                })}
              >
                {key === 'backspace' ? (
                  <Glyph name="backspace" size={large ? 32 : 24} color={colors.ink} />
                ) : (
                  <Text
                    maxFontSizeMultiplier={DIGIT_CAP}
                    style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '500', fontSize: size, lineHeight: walletLineHeight(size, 'latin'), color: colors.ink }}
                  >
                    {key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
