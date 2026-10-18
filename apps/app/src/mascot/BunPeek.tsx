// A bun peeking over one edge of its parent (redesign R1). It sits wholly
// outside the parent's box, absolutely positioned, so the parent lays out as if
// it were not there and the bun never covers the parent's content. It slides
// out from behind the edge with a small spring; under reduced motion it simply
// appears. Honours the bun intensity: at `off` it draws nothing.
//
// Put it inside the parent it peeks over, and leave room outside that edge
// (a margin or the screen's padding), since it covers whatever lies there.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { runSpringTransform } from '@mobile/theme/animatedMotion';
import { motion } from '@mobile/theme/motion';
import { BUN_SPACE } from '@mobile/ui/layout';
import { Bun, type BunA11yProps } from './Bun';
import { showsBun } from './bunIntensity';
import { useBunIntensity } from './BunIntensityProvider';
import { BUN_POSES, BUN_SIZES, bunHeight, type BunPoseName, type BunSize } from './poses';

export type BunPeekEdge = 'top' | 'left' | 'right';
/** Where along the edge: `start` is the left (top edge) or the top (side edges). */
export type BunPeekAlign = 'start' | 'center' | 'end';

export type BunPeekProps = {
  readonly edge: BunPeekEdge;
  /** Defaults to `peek`, which shows only the eyes and the top of the bun. */
  readonly pose?: BunPoseName;
  readonly size?: BunSize;
  readonly align?: BunPeekAlign;
  readonly testID?: string;
} & BunA11yProps;

/**
 * 0 (behind the edge) to 1 (peeking). It waits for the OS reduced-motion answer
 * before moving, so a person who asked for less motion never sees the first
 * frames of a spring; `useReducedMotion` then keeps it in step if the setting
 * changes while the bun is on screen.
 */
function usePeekProgress(): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const [reducedAtStart, setReducedAtStart] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => { if (active) setReducedAtStart(enabled); },
      () => { if (active) setReducedAtStart(false); },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (reducedAtStart === null) return;
    const flight = runSpringTransform(progress, {
      toValue: 1,
      spring: motion.spring.gentle,
      reducedMotion: reducedAtStart || reducedMotion,
    });
    flight.start();
    return () => flight.stop();
  }, [progress, reducedAtStart, reducedMotion]);

  return progress;
}

/** The host box, just outside `edge`, placed along it by `align`. */
function placement(edge: BunPeekEdge, align: BunPeekAlign, across: number): ViewStyle {
  const outside: ViewStyle = edge === 'top' ? { bottom: '100%' } : edge === 'left' ? { right: '100%' } : { left: '100%' };
  const [start, end, margin] = edge === 'top' ? (['left', 'right', 'marginLeft'] as const) : (['top', 'bottom', 'marginTop'] as const);
  const along: ViewStyle = align === 'start' ? { [start]: BUN_SPACE.md } : align === 'end' ? { [end]: BUN_SPACE.md } : { [start]: '50%', [margin]: -across / 2 };
  return { ...outside, ...along };
}

export function BunPeek({ edge, pose = 'peek', size = 'm', align = 'end', testID, ...a11y }: BunPeekProps) {
  const { intensity } = useBunIntensity();
  const progress = usePeekProgress();
  if (!showsBun(intensity)) return null;

  const across = BUN_SIZES[size];
  const out = bunHeight(BUN_POSES[pose], across);
  const onTop = edge === 'top';
  const box = onTop ? { width: across, height: out } : { width: out, height: across };
  const host: ViewStyle = { position: 'absolute', overflow: 'hidden', pointerEvents: 'none', ...box, ...placement(edge, align, across) };

  // Hidden: pushed back past the edge, where the host clips it.
  const hidden = edge === 'right' ? -out : out;
  const shift = progress.interpolate({ inputRange: [0, 1], outputRange: [hidden, 0] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const slide = { ...box, opacity, transform: onTop ? [{ translateY: shift }] : [{ translateX: shift }] };

  // On a side edge the bun turns so its top points away from the parent.
  const turn: ViewStyle = onTop
    ? {}
    : { position: 'absolute', left: (out - across) / 2, top: (across - out) / 2, transform: [{ rotate: edge === 'left' ? '-90deg' : '90deg' }] };

  return (
    <View testID={testID} style={host}>
      <Animated.View style={slide}>
        <View style={turn}>
          <Bun pose={pose} size={size} {...(a11y as BunA11yProps)} />
        </View>
      </Animated.View>
    </View>
  );
}
