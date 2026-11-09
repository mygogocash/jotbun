// The Bun Wallet's main button (P2-T13; bw-style, the trays' footers): one per
// screen or tray, at least 54 pt tall with radius 16, in `primary` with its
// `onPrimary` words, so ink with white words by day and light with ink words
// at night. It grows with the text size, so its words are never cut. Busy, it
// says its busy label and ignores presses; disabled, it dims as the wallet's
// icon button does.
import { Pressable } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { WalletText } from '../WalletText';

const HEIGHT = 54;
const RADIUS = 16;

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  /** Working: presses are ignored and the button says `busyLabel`. */
  busy?: boolean;
  /** What it says while busy, e.g. กำลังบันทึก…; defaults to `label`. */
  busyLabel?: string;
  disabled?: boolean;
  testID?: string;
};

export function PrimaryButton({ label, onPress, busy = false, busyLabel, disabled = false, testID }: PrimaryButtonProps) {
  const colors = useWalletColors();
  const words = busy && busyLabel ? busyLabel : label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityState={{ disabled, busy }}
      aria-disabled={disabled}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: HEIGHT,
        borderRadius: RADIUS,
        backgroundColor: colors.primary,
        paddingHorizontal: 18,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <WalletText role="body" tone="onPrimary" style={{ fontWeight: '700', textAlign: 'center' }}>{words}</WalletText>
    </Pressable>
  );
}
