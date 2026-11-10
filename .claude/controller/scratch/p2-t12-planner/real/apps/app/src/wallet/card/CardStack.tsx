// The wallet card stack (P2-T12; bw-home, dk-home, ax-large-home,
// ax-voiceover, ax-motion). The cards come in the order given, each
// STACK_PEEK below the one before, and the last, the front card, is whole:
// the stack is STACK_PEEK × (n − 1) + CARD_HEIGHT tall. The front card sits in
// the stack's flow, so if its words ever need more than CARD_HEIGHT the stack
// grows with it and covers nothing under it. Only the front card shows today's
// money out. By day each card casts bw-home's shadow up onto the card behind
// it, the front card a deeper one; at night none (dk-home). At the largest
// text sizes (useLargeText) the stack is one column of spine cards, front card
// first (ax-large-home). Screen readers meet the cards in the order drawn,
// each one button that says its card's words (ax-voiceover).
//
// Pressing a card plays walletOpen (motionFor): its selection tick, then at
// full motion a 12 pt lift on the gentle spring and back down, so the card is
// in its place when the person comes back. Under Reduce Motion, and before the
// phone answers (R66), nothing moves. The wallet's answer is read at the
// press, and onOpen is called at once, never at the spring's end. The stack
// plays no entering animation: a new wallet's card drops in on P2-T21's
// bw-adding step, and is simply in the stack when Home shows again. Each card
// registers its place for the saved moment's flight (cardFrames.tsx), and the
// stack measures its cards again after each of its own layouts.
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { motion } from '@mobile/theme/motion';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useLargeText } from '@mobile/ui/largeText';
import type { WalletLook } from '../looks/walletLooks';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { motionFor } from '../motion/walletMotion';
import { useCardFrames, useRegisterCardFrame } from './cardFrames';
import { WalletCard } from './WalletCard';
import type { WalletCardModel } from './WalletCard';

export { CARD_HEIGHT } from './WalletCard';

export type StackWallet = WalletCardModel & { look: WalletLook };

/** How much of each card behind the front one shows (bw-home). */
export const STACK_PEEK = 54;
/** How far a pressed card lifts at full motion. */
export const CARD_LIFT = 12;
/** The space between the cards of the largest text sizes' list (ax-large-home). */
const LIST_GAP = 14;
/** The card's corner (WalletCard), which its shadow follows. */
const CARD_RADIUS = 22;
/** bw-home's shadows, by day: a card behind the front one casts `back` up onto the card behind it, the front card `front`. */
const SHADOW = { back: '0px -4px 14px rgba(17, 16, 20, 0.1)', front: '0px -6px 18px rgba(17, 16, 20, 0.12)' } as const;

export function CardStack({ wallets, onOpen }: { wallets: readonly StackWallet[]; onOpen: (walletId: string) => void }) {
  const large = useLargeText();
  const { isDark } = useWalletColors();
  const { measure } = useCardFrames();
  const last = wallets.length - 1;

  if (large) {
    // ax-large-home: one column of spine cards, front card first, with no shadows.
    return (
      <View testID="card-stack" onLayout={measure} style={{ gap: LIST_GAP }}>
        {[...wallets].reverse().map((wallet, index) => (
          <StackCard key={wallet.id} wallet={wallet} front={index === 0} variant="spine" frame={null} onOpen={onOpen} />
        ))}
      </View>
    );
  }
  return (
    <View testID="card-stack" onLayout={measure}>
      {wallets.map((wallet, index) => (
        <StackCard key={wallet.id} wallet={wallet} front={index === last} variant="stack" frame={stackFrame(index, last, isDark)} onOpen={onOpen} />
      ))}
    </View>
  );
}

/** Where a card sits in the stack: the cards behind are placed STACK_PEEK apart over the front card, which is in the flow. */
function stackFrame(index: number, last: number, isDark: boolean): ViewStyle {
  const place: ViewStyle = index === last
    ? { marginTop: STACK_PEEK * index }
    : { position: 'absolute', top: STACK_PEEK * index, left: 0, right: 0 };
  // The first card has no card behind it to cast a shadow on.
  const shadow = isDark || index === 0 ? undefined : index === last ? SHADOW.front : SHADOW.back;
  return { ...place, borderRadius: CARD_RADIUS, boxShadow: shadow };
}

function StackCard({ wallet, front, variant, frame, onOpen }: {
  wallet: StackWallet;
  front: boolean;
  variant: 'stack' | 'spine';
  frame: ViewStyle | null;
  onOpen: (walletId: string) => void;
}) {
  const reduced = useWalletReducedMotion();
  const register = useRegisterCardFrame(wallet.id);
  const lift = useSharedValue(0);
  // The dependency array names the shared value itself (R72).
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }), [lift]);

  const open = () => {
    const plan = motionFor('walletOpen', reduced);
    if (plan.haptic !== null) playHaptic(plan.haptic);
    if (plan.motion.kind === 'spring') {
      const spring = { ...motion.spring[plan.motion.spring], reduceMotion: ReduceMotion.Never };
      lift.value = withSequence(withSpring(-CARD_LIFT, spring), withSpring(0, spring));
    }
    onOpen(wallet.id);
  };

  return (
    <Animated.View testID={`card-stack-${wallet.id}`} style={[frame, lifted]}>
      <View ref={register} collapsable={false}>
        <WalletCard wallet={front ? wallet : { ...wallet, todayOutMinor: null }} look={wallet.look} variant={variant} onPress={open} />
      </View>
    </Animated.View>
  );
}
