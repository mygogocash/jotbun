// The Bun Wallet's text link (P2-T13; sa-locked, bw-welcome, rh-conflict):
// words that act, with no fill, at least 44 pt tall in their own box (§4;
// react-native-web drops hitSlop and the tests measure the box). Violet by
// default, as links are (§5.1); ink for the quiet second choice under a main
// button, as sa-locked's ใช้รหัสผ่าน is.
import { Pressable } from 'react-native';

import { WalletText } from '../WalletText';

const TOUCH = 44;

export function TextLink({ label, onPress, tone = 'violet' }: { label: string; onPress: () => void; tone?: 'violet' | 'ink' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TOUCH,
        minWidth: TOUCH,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <WalletText role="label" tone={tone} style={{ textAlign: 'center' }}>{label}</WalletText>
    </Pressable>
  );
}
