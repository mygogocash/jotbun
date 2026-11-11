// The Bun Wallet's root (P2-T2), mounted once in app/_layout.tsx around the
// whole stack: Gesture Handler's root view (W3: the card stack and the trays
// take gestures), the wallet's one reduced-motion answer (W6), the Face ID
// lock (P2-T33, W18) while the `wallet` area is on, and private mode (P2-T10,
// W10), which every amount reads. The lock sits outside private mode, so
// nothing that shows an amount renders above it; with the area off, private
// mode sits directly inside the motion answer. lockModel.test.ts reads this
// order from the source.
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { getAppLocalAuth } from './lock/localAuthPort';
import { LockGate } from './lock/LockGate';
import { WalletMotionProvider } from './motion/reducedMotion';
import { PrivateModeProvider } from './privacy/PrivateModeProvider';

export function WalletRoot({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WalletMotionProvider>
        {isRedesignEnabled('wallet') ? (
          <LockGate port={getAppLocalAuth()}>
            <PrivateModeProvider>{children}</PrivateModeProvider>
          </LockGate>
        ) : (
          <PrivateModeProvider>{children}</PrivateModeProvider>
        )}
      </WalletMotionProvider>
    </GestureHandlerRootView>
  );
}
