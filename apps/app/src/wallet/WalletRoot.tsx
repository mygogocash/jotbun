// The Bun Wallet's root (P2-T2), mounted once in app/_layout.tsx around the
// whole stack: Gesture Handler's root view (W3: the card stack and the trays
// take gestures) and the wallet's one reduced-motion answer (W6). P2-T10 and
// P2-T33 each add one provider inside it.
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { WalletMotionProvider } from './motion/reducedMotion';

export function WalletRoot({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WalletMotionProvider>{children}</WalletMotionProvider>
    </GestureHandlerRootView>
  );
}
