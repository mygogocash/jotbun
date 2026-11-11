// The month recap's confetti (W20, bw-recap): 24 pieces in four materials'
// colours (palette values only, so P2-T37's sweep finds no colour literal
// here), over the top of the screen for 1.2 s, then gone. Decorative and
// untouchable. The recap draws it only at full motion (the `recap` moment of
// motionFor); under Reduce Motion the moment is its haptic alone.
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { materialPaint } from '@mobile/theme/walletPalette';
import type { WalletMaterial } from '@mobile/theme/walletPalette';
import { DECORATIVE } from '@mobile/ui/a11y';

/** The device store's mark of a month celebrated on this phone. */
export const CONFETTI_NAME = (month: string) => `recap-confetti-${month}`;

/** How long the pieces stay (W20). */
const SHOWN_MS = 1200;

/** bw-recap's colours: silk's middle and peach's, sky's and paper's ends. */
const MATERIALS: readonly WalletMaterial[] = ['silk', 'peach', 'sky', 'paper'];
const COLOURS = MATERIALS.map((material) => materialPaint(material, false).stops[1].color);

/** A fixed scatter over the hero, so every opening looks the same. */
const PIECES = Array.from({ length: 24 }, (_, index) => ({
  key: index,
  color: COLOURS[index % COLOURS.length],
  round: index % 2 === 0,
  top: 60 + ((index * 27) % 200),
  left: 20 + ((index * 37) % 320),
  size: 6 + (index % 5),
  rotate: `${((index * 35) % 90) - 45}deg`,
}));

export function Confetti(): ReactElement | null {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), SHOWN_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <View {...DECORATIVE} pointerEvents="none" testID="recap-confetti" style={StyleSheet.absoluteFill}>
      {PIECES.map((piece) => (
        <View
          key={piece.key}
          testID="confetti-piece"
          style={{
            position: 'absolute',
            top: piece.top,
            left: piece.left,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.5,
            borderRadius: piece.round ? piece.size / 2 : 2,
            backgroundColor: piece.color,
            transform: [{ rotate: piece.rotate }],
          }}
        />
      ))}
    </View>
  );
}
