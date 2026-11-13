// The drop into the card (P2-T17; bw-saved, ax-motion's save, W6, R65, R114):
// when a save lands, a chip naming it, with its amount, travels from the bottom
// centre of the screen to its wallet's card on the gentle spring, shrinking and
// fading as it lands. Only at full motion (motionFor('save') says fly) and only
// while that card is on screen (useCardFrames, P2-T12); otherwise nothing
// travels.
//
// - It starts once the tray has left: onSaved comes before the tray closes
//   (P2-T16), and the tray's Modal covers the screen until its exit ends
//   (TRAY_EXIT_MS). Then it measures every card again, since a frame does not
//   follow a reorder, a swapped wallet, a moved ancestor or a scroll (P2-T12's
//   m2), and reads the frame once those measurements have landed (on the web,
//   at the next tick).
// - It lands on the card's top: a card behind the front one shows only its top
//   STACK_PEEK. Where it lands is its own place in the host's box, which the
//   shell lays over the whole window (P2-T18); it travels there from the bottom
//   centre as an offset that springs to nothing.
// - The chip is decorative (the toast says what happened). In private mode it
//   shows the mask for its amount and no title, which may quote the person
//   (R65, R114).
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@mobile/theme/AppText';
import { motion } from '@mobile/theme/motion';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { DECORATIVE } from '@mobile/ui/a11y';
import { useCardFrames } from '../card/cardFrames';
import { STACK_PEEK } from '../card/CardStack';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import type { MoneySign } from '../money/walletMoney';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { TRAY_EXIT_MS } from '../motion/useWalletMotion';
import { motionFor } from '../motion/walletMotion';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import type { SavedNotice } from './savedMoment';

/** How long a flight lasts: by then the gentle spring has all but landed (above 99%) and the chip has faded. */
export const FLIGHT_MS = 800;
/** Where the chip starts: this far above the screen's bottom safe area, about where the tray's Save was. */
export const FROM_BOTTOM = 96;
/** Half the chip's height (bw-saved's 36 pt), so its middle lands on the point. */
export const CHIP_HALF = 18;
/** The chip's room: the screen's width less a 16 pt margin on each side. */
export const CHIP_MARGIN = 16;

type Point = { x: number; y: number };
type Flight = { notice: SavedNotice; to: Point };

const SIGNS: Readonly<Record<SavedNotice['kind'], MoneySign>> = { expense: 'expense', income: 'income', transfer: 'none' };

export function SaveFlight({ notice }: { notice: SavedNotice | null }) {
  const reduced = useWalletReducedMotion();
  const { frameOf, measure } = useCardFrames();
  const [flight, setFlight] = useState<Flight | null>(null);
  useEffect(() => {
    const walletId = notice?.walletId ?? null;
    // Decided as the save lands, from the wallet's one answer (W6): under Reduce Motion nothing travels.
    if (notice === null || walletId === null || motionFor('save', reduced).motion.kind !== 'fly') return undefined;
    let live = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, run: () => void) => {
      timers.push(setTimeout(() => {
        if (live) run();
      }, ms));
    };
    after(TRAY_EXIT_MS, () => {
      measure();
      after(0, () => {
        const frame = frameOf(walletId);
        if (frame === null) return;
        setFlight({ notice, to: { x: frame.x + frame.width / 2, y: frame.y + STACK_PEEK / 2 } });
        after(FLIGHT_MS, () => setFlight(null));
      });
    });
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
    // Once per notice: the host keys this part by its notice, and the flight is decided as the save lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);
  return flight === null ? null : <FlyingChip flight={flight} />;
}

function FlyingChip({ flight }: { flight: Flight }) {
  const colors = useWalletColors();
  const { hidden } = usePrivateMode();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { notice, to } = flight;
  const room = width - 2 * CHIP_MARGIN;
  // From the bottom centre, as an offset from where it lands.
  const dx = width / 2 - to.x;
  const dy = height - insets.bottom - FROM_BOTTOM - to.y;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(1, { ...motion.spring.gentle, reduceMotion: ReduceMotion.Never });
  }, [progress]);
  // The dependency array names the shared value itself (R72).
  const travel = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * progress.value,
    transform: [{ translateX: dx * (1 - progress.value) }, { translateY: dy * (1 - progress.value) }, { scale: 1 - progress.value / 2 }],
  }), [progress, dx, dy]);
  return (
    <View
      {...DECORATIVE}
      testID="save-flight"
      pointerEvents="none"
      style={{ position: 'absolute', left: to.x - room / 2, top: to.y - CHIP_HALF, width: room, alignItems: 'center', zIndex: 20 }}
    >
      <Animated.View
        style={[
          {
            minHeight: 2 * CHIP_HALF,
            maxWidth: room,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: colors.isDark ? colors.raised : colors.card,
          },
          travel,
        ]}
      >
        {hidden ? null : <WalletText testID="save-flight-title" role="caption" style={{ fontWeight: '500', flexShrink: 1 }}>{notice.title}</WalletText>}
        <Text testID="save-flight-amount" style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: '700', fontSize: 13, color: colors.ink }}>
          {hidden ? HIDDEN_AMOUNT : walletMoneyText(notice.amountMinor, { sign: SIGNS[notice.kind] })}
        </Text>
      </Animated.View>
    </View>
  );
}
