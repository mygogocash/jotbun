import type { ComponentProps, ComponentType } from "react";
import {
  Animated,
  Pressable,
  type EasingFunction,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { motion } from "@mobile/theme/motion";

type CompositorTimingConfig = {
  toValue: number;
  duration?: number;
  easing?: EasingFunction;
  useNativeDriver?: boolean;
};

function createCompositorTiming(
  value: Animated.Value,
  config: CompositorTimingConfig
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    duration: config.duration ?? motion.duration.base,
    easing: config.easing ?? motion.easing.out,
    toValue: config.toValue,
    useNativeDriver: config.useNativeDriver ?? motion.useNativeDriver,
  });
}

/** Opacity-only animation — compositor-safe on web and native. */
export function runOpacityTiming(
  value: Animated.Value,
  config: CompositorTimingConfig
): Animated.CompositeAnimation {
  return createCompositorTiming(value, config);
}

/** Transform-driven animation (translate/scale/rotate) — compositor-safe. */
export function runTransformTiming(
  value: Animated.Value,
  config: CompositorTimingConfig
): Animated.CompositeAnimation {
  return createCompositorTiming(value, config);
}

/**
 * Height is the one allowed layout property for house accordions. Native
 * driver cannot animate layout, so this always stays on the JS driver.
 */
export function runLayoutTiming(
  value: Animated.Value,
  config: Omit<CompositorTimingConfig, "useNativeDriver">
): Animated.CompositeAnimation {
  return createCompositorTiming(value, {
    ...config,
    useNativeDriver: false,
  });
}

/** Slide offset (px) for accordion hide/open — compositor `translateY`. */
export const ACCORDION_SLIDE_PX = 8;

type AccordionMotionConfig = {
  height: Animated.Value;
  opacity: Animated.Value;
  translateY: Animated.Value;
  open: boolean;
  measuredHeight: number;
  duration?: number;
};

/**
 * One interruptible accordion flight: height + fade + slide, all on the JS
 * driver so they stay in lockstep (height cannot use the native driver).
 */
export function runAccordionMotion({
  height,
  opacity,
  translateY,
  open,
  measuredHeight,
  duration = motion.duration.accordionExpand,
}: AccordionMotionConfig): Animated.CompositeAnimation {
  const easing = open ? motion.easing.out : motion.easing.in;
  const driverOff = { useNativeDriver: false as const };

  return Animated.parallel([
    runLayoutTiming(height, {
      duration,
      easing,
      toValue: open ? measuredHeight : 0,
    }),
    runOpacityTiming(opacity, {
      duration,
      easing,
      toValue: open ? 1 : 0,
      ...driverOff,
    }),
    runTransformTiming(translateY, {
      duration,
      easing,
      toValue: open ? 0 : ACCORDION_SLIDE_PX,
      ...driverOff,
    }),
  ]);
}

type FadeSlideConfig = {
  opacity: Animated.Value;
  translateY: Animated.Value;
  visible: boolean;
  durationIn?: number;
  durationOut?: number;
  slideOffset?: number;
  reducedMotion?: boolean;
};

/** Shared enter/exit for overlays, toasts, and popovers. */
export function runFadeSlideTiming({
  opacity,
  translateY,
  visible,
  durationIn = motion.duration.fast,
  durationOut = motion.duration.fast,
  slideOffset = 12,
  reducedMotion = false,
}: FadeSlideConfig): Animated.CompositeAnimation {
  if (reducedMotion) {
    opacity.setValue(visible ? 1 : 0);
    translateY.setValue(0);
    return Animated.parallel([]);
  }

  const duration = visible ? durationIn : durationOut;
  const easing = visible ? motion.easing.out : motion.easing.in;

  return Animated.parallel([
    runOpacityTiming(opacity, {
      duration,
      easing,
      toValue: visible ? 1 : 0,
    }),
    runTransformTiming(translateY, {
      duration,
      easing,
      toValue: visible ? 0 : slideOffset,
    }),
  ]);
}

/**
 * A Pressable whose own style can carry an Animated value.
 *
 * The house pattern so far wraps a pressable's CONTENT in an `Animated.View`
 * (CustomerAuthScreen's checkmarks, CustomerHomeScreen's chevron). That works
 * for a glyph inside a fixed box and is wrong for a segment pill or a category
 * chip, where the thing that should move is the pill itself — scaling only its
 * label leaves the border sitting still around a shrinking word.
 *
 * One shared animated component rather than one per screen: Animated caches
 * per wrapped component, and two wrappers of Pressable is two caches.
 *
 * Pressable's function-style `style` prop — `({ pressed }) => ...` — is NOT
 * supported here: `Animated.createAnimatedComponent` cannot read a function
 * style, and silently mis-renders if given one. `AnimatedPressableProps`
 * below narrows `style` to the array/object shape Animated can actually
 * read, so the function arm is a compile error here, not just a warning in
 * this comment.
 */
type AnimatedPressableProps = Omit<ComponentProps<typeof Pressable>, "style"> & {
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
};

export const AnimatedPressable: ComponentType<AnimatedPressableProps> =
  Animated.createAnimatedComponent(Pressable);

/** The three fields `motion.spring.*` carries; also what Animated.spring reads. */
type SpringPhysics = {
  readonly damping: number;
  readonly mass: number;
  readonly stiffness: number;
};

type SpringTransformConfig = {
  toValue: number;
  /** Defaults to `snappy` — arrives and stops. Overshoot is opt-in. */
  spring?: SpringPhysics;
  reducedMotion?: boolean;
};

/**
 * One spring flight on a transform value.
 *
 * These numbers trace back to reanimated's `withSpring` tuning conventions.
 * Animated.spring reads the same three fields, and these screens have no
 * reanimated: same physics, the house's own driver.
 *
 * Reduced motion snaps at CONSTRUCTION, not at start: the caller sets the dip
 * before starting the flight, so deferring the snap would show the dip for a
 * frame to exactly the member who asked not to see it.
 */
export function runSpringTransform(
  value: Animated.Value,
  {
    toValue,
    spring = motion.spring.snappy,
    reducedMotion = false,
  }: SpringTransformConfig,
): Animated.CompositeAnimation {
  if (reducedMotion) {
    value.setValue(toValue);
    return Animated.parallel([]);
  }

  return Animated.spring(value, {
    damping: spring.damping,
    mass: spring.mass,
    stiffness: spring.stiffness,
    toValue,
    useNativeDriver: motion.useNativeDriver,
  });
}
