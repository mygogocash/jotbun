// The lock's cover (P2-T13, R63; P2-T33). A Modal draws above the app, so the
// lock's own screen cannot hide a tray or a sheet: each Modal hides its own
// content. P2-T33's LockGate provides the answer, hidden while the app is
// locked or only covered (W18), and a Tray and a Sheet then draw LockCoverArt
// in place of their backdrop and card. While the app is locked the answer
// also carries the lock screen, which LockCoverArt draws over its ground: iOS
// presents no Modal over one that is already up, so the lock screen a person
// can see and press is the one inside the topmost cover (the gate's own over
// the app, or an open tray's or sheet's). Outside a LockGate nothing is
// hidden.
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';

export type LockCover = {
  hidden: boolean;
  /** While locked, the lock screen every cover draws; nothing while the app is only covered. */
  screen?: ReactNode;
};

const UNCOVERED: LockCover = { hidden: false };

/** LockGate provides it (P2-T33); the default hides nothing. */
export const LockCoverContext = createContext<LockCover>(UNCOVERED);

export function useLockCover(): LockCover {
  return useContext(LockCoverContext);
}

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Fills its parent with the wallet's ground, which has no text and is hidden from screen readers; over it, the lock screen while the app is locked. */
export function LockCoverArt() {
  const colors = useWalletColors();
  const { screen } = useLockCover();
  return (
    <>
      <View {...DECORATIVE} testID="lock-cover" style={{ ...FILL, backgroundColor: colors.ground }} />
      {screen ? <View style={FILL}>{screen}</View> : null}
    </>
  );
}
