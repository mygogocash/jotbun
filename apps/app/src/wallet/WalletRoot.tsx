// The Bun Wallet's root (P2-T2), mounted once in app/_layout.tsx around the
// whole stack: Gesture Handler's root view (W3: the card stack and the trays
// take gestures), the wallet's one reduced-motion answer (W6) and private
// mode (P2-T10, W10), which every amount reads. P2-T33 adds the lock outside
// private mode, so nothing that shows an amount renders above it.
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { WalletMotionProvider } from './motion/reducedMotion';
import { PrivateModeProvider } from './privacy/PrivateModeProvider';

export function WalletRoot({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WalletMotionProvider>
        <PrivateModeProvider>{children}</PrivateModeProvider>
      </WalletMotionProvider>
    </GestureHandlerRootView>
  );
}
