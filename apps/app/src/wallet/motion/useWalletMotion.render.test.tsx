// The Bun Wallet's Reanimated builders (P2-T9, W6). Each follows motionFor's
// table, each ends with ReduceMotion.Never (the wallet's answer decides, not
// Reanimated's), and the springs carry motion.spring's physics. Nothing is
// mounted: a builder says what it will play through Reanimated's own
// getAnimationAndConfig and getReduceMotion. This file is in the render suite
// because Node cannot load Reanimated.
import {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  SlideInDown,
  SlideInUp,
  SlideOutDown,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { expect, test } from 'vitest';

import { motion } from '@mobile/theme/motion';
import {
  stepEntering,
  stepLayout,
  toastEntering,
  TRAY_EXIT_MS,
  trayEntering,
  trayExiting,
  walletAddedEntering,
} from './useWalletMotion';
import { motionFor, type WalletMoment } from './walletMotion';

type Built = { getReduceMotion(): ReduceMotion; getAnimationAndConfig(): readonly [unknown, unknown] };

/** What a builder plays: its driver, its timing or physics, and whether Reanimated may cut it short. */
function plays(builder: Built) {
  const [driver, config] = builder.getAnimationAndConfig();
  return {
    driver: driver === withSpring ? 'spring' : driver === withTiming ? 'timing' : 'other',
    config,
    reduceMotion: builder.getReduceMotion(),
  };
}

/** The spring a moment names at full motion, as motion.spring holds it. */
function springOf(moment: WalletMoment) {
  const spec = motionFor(moment, false).motion;
  expect(spec.kind, `${moment} at full motion`).toBe('spring');
  return spec.kind === 'spring' ? { ...motion.spring[spec.spring] } : null;
}

/** How long a moment's fade lasts under Reduce Motion. */
function fadeOf(moment: WalletMoment) {
  const spec = motionFor(moment, true).motion;
  expect(spec.kind, `${moment} under Reduce Motion`).toBe('fade');
  return spec.kind === 'fade' ? spec.durationMs : null;
}

const NEVER = ReduceMotion.Never;

test('a tray springs up from below on the gentle spring, or fades in', () => {
  expect(trayEntering(false)).toBeInstanceOf(SlideInDown);
  expect(plays(trayEntering(false))).toEqual({ driver: 'spring', config: springOf('trayOpen'), reduceMotion: NEVER });
  expect(trayEntering(true)).toBeInstanceOf(FadeIn);
  expect(plays(trayEntering(true))).toEqual({ driver: 'timing', config: { duration: fadeOf('trayOpen') }, reduceMotion: NEVER });
});

test('a tray leaves downward in 220 ms, or fades out in 150 ms', () => {
  expect(TRAY_EXIT_MS).toBe(220);
  expect(trayExiting(false)).toBeInstanceOf(SlideOutDown);
  expect(plays(trayExiting(false))).toEqual({ driver: 'timing', config: { duration: 220 }, reduceMotion: NEVER });
  expect(trayExiting(true)).toBeInstanceOf(FadeOut);
  expect(plays(trayExiting(true))).toEqual({ driver: 'timing', config: { duration: 150 }, reduceMotion: NEVER });
});

test('the saved toast slides down from the top on the snappy spring, or fades in', () => {
  expect(toastEntering(false)).toBeInstanceOf(SlideInUp);
  expect(plays(toastEntering(false))).toEqual({ driver: 'spring', config: springOf('savedToast'), reduceMotion: NEVER });
  expect(toastEntering(true)).toBeInstanceOf(FadeIn);
  expect(plays(toastEntering(true))).toEqual({ driver: 'timing', config: { duration: fadeOf('savedToast') }, reduceMotion: NEVER });
});

test("a tray step's content fades in either way; its height morphs on the gentle spring, or jumps", () => {
  expect(stepEntering()).toBeInstanceOf(FadeIn);
  expect(plays(stepEntering())).toEqual({ driver: 'timing', config: { duration: fadeOf('trayStep') }, reduceMotion: NEVER });
  expect(motionFor('trayStep', false).motion).toEqual({ kind: 'morph' });
  const morph = stepLayout(false);
  expect(morph).toBeInstanceOf(LinearTransition);
  expect(plays(morph as LinearTransition)).toEqual({ driver: 'spring', config: { ...motion.spring.gentle }, reduceMotion: NEVER });
  expect(stepLayout(true)).toBeUndefined();
});

test("a new wallet's card drops into the stack on the bouncy spring, or fades in", () => {
  expect(walletAddedEntering(false)).toBeInstanceOf(SlideInUp);
  expect(plays(walletAddedEntering(false))).toEqual({ driver: 'spring', config: springOf('walletAdded'), reduceMotion: NEVER });
  expect(walletAddedEntering(true)).toBeInstanceOf(FadeIn);
  expect(plays(walletAddedEntering(true))).toEqual({ driver: 'timing', config: { duration: fadeOf('walletAdded') }, reduceMotion: NEVER });
});

test('each call builds its own animation, so one part changing its copy never changes another', () => {
  expect(trayEntering(false)).not.toBe(trayEntering(false));
  expect(trayEntering(true)).not.toBe(trayEntering(true));
  expect(stepEntering()).not.toBe(stepEntering());
});
