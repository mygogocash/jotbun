// The lock's cover (P2-T13, R63). A Modal draws above the app, so the lock's
// own screen cannot hide a tray or a sheet: each Modal hides its own content.
// P2-T33's LockGate provides the answer, hidden while the app is locked or only
// covered (W18), and a Tray (and, from P2-T33, a Sheet) then draws
// LockCoverArt in place of its backdrop and card. Outside a LockGate nothing is
// hidden.
import { createContext, useContext } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';

export type LockCover = { hidden: boolean };

const UNCOVERED: LockCover = { hidden: false };

/** LockGate provides it (P2-T33); the default hides nothing. */
export const LockCoverContext = createContext<LockCover>(UNCOVERED);

export function useLockCover(): LockCover {
  return useContext(LockCoverContext);
}

/** Fills its parent with the wallet's ground: no text, and hidden from screen readers. */
export function LockCoverArt() {
  const colors = useWalletColors();
  return (
    <View
      {...DECORATIVE}
      testID="lock-cover"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.ground }}
    />
  );
}
