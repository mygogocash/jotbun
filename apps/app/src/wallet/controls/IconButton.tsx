// The Bun Wallet's round icon button: 44 × 44 pt in its own box (§4;
// react-native-web drops hitSlop and the tests measure the box), a card fill
// with a hairline ring, as ax-large-home draws its 44 pt buttons. The glyph
// is the caller's, 24 pt and decorative; `label` is what a screen reader says.
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';

const SIZE = 44;

export function IconButton({ label, onPress, children, disabled = false }: {
  label: string;
  onPress: () => void;
  /** The glyph: 24 pt, decorative. */
  children: ReactNode;
  disabled?: boolean;
}) {
  const colors = useWalletColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}
