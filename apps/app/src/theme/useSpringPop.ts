import { useEffect, useMemo, useRef } from "react";
import { Animated } from "react-native";

import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { runSpringTransform } from "@mobile/theme/animatedMotion";
import { motion } from "@mobile/theme/motion";

/** How far a control dips before the spring returns it. */
export const SPRING_POP_FROM = 0.94;

/**
 * A control acknowledging that it is now the chosen one.
 *
 * ONE value per ROW, not one per item. Chips and segments are rendered by
 * `.map`, so a hook per item would be a rules-of-hooks violation the moment the
 * member adds a category. The row holds a single value and hands it to
 * whichever item is currently picked; the item losing the selection has nothing
 * to animate, because it is not arriving anywhere.
 *
 * `token` is whatever identifies the current selection — a category name, a
 * filter key, a save counter. The pop fires when that changes to something
 * truthy, and deliberately NOT on mount: the default chip is already picked
 * when the panel opens, and a page that pops as it appears reads as a glitch.
 */
export function useSpringPop(
  token: unknown,
  spring: (typeof motion.spring)[keyof typeof motion.spring] = motion.spring
    .snappy,
) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(token);

  useEffect(() => {
    if (token === previous.current) return;
    previous.current = token;
    // Leaving a selection is not an arrival, and neither is clearing one.
    if (!token) return;

    scale.setValue(SPRING_POP_FROM);
    const flight = runSpringTransform(scale, {
      reducedMotion,
      spring,
      toValue: 1,
    });
    flight.start();
    return () => flight.stop();
  }, [reducedMotion, scale, spring, token]);

  return useMemo(() => ({ transform: [{ scale }] }), [scale]);
}
