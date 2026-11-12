// The Bun Wallet's Reanimated animations (P2-T9, W6): every entering,
// exiting and layout animation a wallet part plays comes from here (P2-T37's
// sweep holds this). Each builder takes the wallet's one reduced-motion
// answer, read at mount (useWalletReducedMotion), and follows motionFor's
// table (walletMotion.ts). Each ends with ReduceMotion.Never, because the
// wallet's answer decides, not Reanimated's own start-up read. Springs use
// motion.spring's physics.
import {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  SlideInDown,
  SlideInUp,
  SlideOutDown,
} from 'react-native-reanimated';

import { motion } from '@mobile/theme/motion';

/** How long a tray takes to leave at full motion. Under Reduce Motion it fades out in 150 ms. P2-T13 hides the tray's Modal after the one that applies. */
export const TRAY_EXIT_MS = 220;

/** ax-motion's interface fade. */
const FADE_MS = 150;

type SpringName = keyof typeof motion.spring;

/** The builder methods a spring needs, shared by every slide and transition here. */
type Springable<B> = { springify(): B; damping(value: number): B; stiffness(value: number): B; mass(value: number): B };

/** A builder on one of motion.spring's springs. */
function sprung<B extends Springable<B>>(builder: B, spring: SpringName): B {
  const { damping, stiffness, mass } = motion.spring[spring];
  return builder.springify().damping(damping).stiffness(stiffness).mass(mass);
}

/** A tray opening (trayOpen): it springs up from below on the gentle spring, or fades in. */
export function trayEntering(reduced: boolean): FadeIn | SlideInDown {
  return reduced
    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)
    : sprung(new SlideInDown(), 'gentle').reduceMotion(ReduceMotion.Never);
}

/** A tray closing: it slides down and away in TRAY_EXIT_MS, or fades out. */
export function trayExiting(reduced: boolean): FadeOut | SlideOutDown {
  return reduced
    ? FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.Never)
    : SlideOutDown.duration(TRAY_EXIT_MS).reduceMotion(ReduceMotion.Never);
}

/** The saved toast (savedToast): it slides down from the top on the snappy spring, or fades in. */
export function toastEntering(reduced: boolean): FadeIn | SlideInUp {
  return reduced
    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)
    : sprung(new SlideInUp(), 'snappy').reduceMotion(ReduceMotion.Never);
}

/** A tray step's new content (trayStep): it fades in, at full motion and under Reduce Motion. */
export function stepEntering(): FadeIn {
  return FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never);
}

/** A tray step's height (trayStep): it morphs on the gentle spring, or jumps (no layout animation). */
export function stepLayout(reduced: boolean): LinearTransition | undefined {
  return reduced ? undefined : sprung(new LinearTransition(), 'gentle').reduceMotion(ReduceMotion.Never);
}

/**
 * How far a new wallet's card drops: about one card's height (the stack's and
 * full card's 200 pt), not a whole screen, so the bouncy spring overshoots by
 * about 44 pt, not about 190 (P2-T12's planner, P11; P2-T21's ceremony).
 */
const WALLET_DROP_PT = 200;

/** A new wallet's card (walletAdded): it drops in from about one card's height above on the bouncy spring, or fades in. */
export function walletAddedEntering(reduced: boolean): FadeIn | SlideInUp {
  return reduced
    ? FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.Never)
    : sprung(new SlideInUp(), 'bouncy').withInitialValues({ originY: -WALLET_DROP_PT }).reduceMotion(ReduceMotion.Never);
}
