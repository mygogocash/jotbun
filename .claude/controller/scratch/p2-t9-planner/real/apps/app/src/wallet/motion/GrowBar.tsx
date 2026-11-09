// The Bun Wallet's grow bar (P2-T9; ax-motion's budget bar): a thin rounded
// fill on a track, for the budget card and the budget screen. Decorative: the
// words beside it carry the numbers, so screen readers skip it. It reads the
// wallet's reduced-motion answer once, at mount (W6), and keeps what
// motionFor('budgetBar') said then: at full motion the fill grows from nothing
// to its value; under Reduce Motion, and before the phone has answered (R66),
// it is drawn at its value and never moves, even once the answer arrives.
// The fill animates its width, not a scale, so its rounded end keeps its shape
// as it grows (bw-home draws the fill with the track's radius).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useWalletReducedMotion } from './reducedMotion';
import { motionFor } from './walletMotion';

export type GrowBarProps = { fraction: number; color: string; track: string; height?: number };

/** The fill's share of the track, 0 to 100: a fraction outside 0..1 (or not a number) is clamped. */
function percentOf(fraction: number): number {
  return fraction > 0 ? Math.min(fraction, 1) * 100 : 0;
}

export function GrowBar({ fraction, color, track, height = 6 }: GrowBarProps) {
  const reduced = useWalletReducedMotion();
  // Decided at mount, never after: a still bar does not start growing when the phone answers.
  const [plan] = useState(() => motionFor('budgetBar', reduced).motion);
  const percent = percentOf(fraction);
  const radius = height / 2;
  return (
    <View testID="grow-bar" aria-hidden style={{ height, borderRadius: radius, backgroundColor: track }}>
      {plan.kind === 'grow' ? (
        <GrowingFill percent={percent} durationMs={plan.durationMs} radius={radius} color={color} />
      ) : (
        <View testID="grow-bar-fill" style={{ width: `${percent}%`, height: '100%', borderRadius: radius, backgroundColor: color }} />
      )}
    </View>
  );
}

/** The fill at full motion: from nothing to its value, and on to a new value when it changes. */
function GrowingFill({ percent, durationMs, radius, color }: { percent: number; durationMs: number; radius: number; color: string }) {
  const grown = useSharedValue(0);
  useEffect(() => {
    grown.value = withTiming(percent, { duration: durationMs, reduceMotion: ReduceMotion.Never });
  }, [grown, percent, durationMs]);
  // The dependency array names the shared value itself (R72).
  const growth = useAnimatedStyle(() => ({ width: `${grown.value}%` }), [grown]);
  return <Animated.View testID="grow-bar-fill" style={[{ height: '100%', borderRadius: radius, backgroundColor: color }, growth]} />;
}
