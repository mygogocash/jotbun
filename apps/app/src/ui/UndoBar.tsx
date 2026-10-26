// The undo bar (redesign R2a): a dark strip with a specific verb ("Entry
// deleted") and an Undo pill. It is a polite live region and never takes
// focus, so the person carries on where they were. It can dismiss itself after
// a while, except while a screen reader runs: reaching the Undo pill by swipe
// takes longer, and a timed-out undo would fail WCAG 2.2.1. It fades and
// slides in; under reduced motion it simply appears.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable } from 'react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { runFadeSlideTiming } from '@mobile/theme/animatedMotion';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from './a11y';
import { BunText } from './BunText';
import { BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type UndoBarProps = {
  /** What just happened, with a specific verb: "Entry deleted". */
  message: string;
  onUndo: () => void;
  /** Defaults to "Undo". */
  undoLabel?: string;
  /** Dismiss after this many milliseconds (6000 or more reads comfortably). Leave out to wait for the person. */
  autoDismissMs?: number;
  onDismiss?: () => void;
};

/** How far below its place the bar starts. */
const SLIDE_FROM = 12;

/** null until known, so nothing is timed out before the answer arrives. */
function useScreenReaderRunning(): boolean | null {
  const [running, setRunning] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => { if (live) setRunning(enabled); },
      () => { if (live) setRunning(false); },
    );
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => setRunning(enabled));
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return running;
}

export function UndoBar({ message, onUndo, undoLabel, autoDismissMs, onDismiss }: UndoBarProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const reducedMotion = useReducedMotion();
  const screenReader = useScreenReaderRunning();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const offset = useRef(new Animated.Value(reducedMotion ? 0 : SLIDE_FROM)).current;
  useAnnouncement(message);

  useEffect(() => {
    const flight = runFadeSlideTiming({ opacity, translateY: offset, visible: true, reducedMotion, slideOffset: SLIDE_FROM });
    flight.start();
    return () => flight.stop();
  }, [offset, opacity, reducedMotion]);

  useEffect(() => {
    if (autoDismissMs === undefined || !onDismiss || screenReader !== false) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss, screenReader]);

  const label = undoLabel ?? tc('Undo');
  return (
    <Animated.View
      {...POLITE_LIVE_REGION}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: BUN_SPACE.sm,
        paddingVertical: BUN_SPACE.xs,
        paddingLeft: BUN_SPACE.md,
        paddingRight: BUN_SPACE.xs,
        borderRadius: BUN_RADIUS.card,
        backgroundColor: colors.ink,
        opacity,
        transform: [{ translateY: offset }],
      }}
    >
      <BunText tone="onInk" style={{ flex: 1 }}>{message}</BunText>
      {/* Drawn here, not with PillButton: on the ink bar the pill is cream with ink, the reverse of the kit's primary. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          playHaptic('undoDone');
          onUndo();
        }}
        style={({ pressed }) => ({
          minHeight: BUN_TOUCH,
          minWidth: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.md,
          borderRadius: BUN_RADIUS.pill,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <BunText variant="label" tone="ink" style={{ fontWeight: '700' }}>{label}</BunText>
      </Pressable>
    </Animated.View>
  );
}
