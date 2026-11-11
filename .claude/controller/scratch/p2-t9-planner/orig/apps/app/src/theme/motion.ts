function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const sampleValues = Array.from({ length: 11 }, (_, index) =>
    calcBezier(index * 0.1, x1, x2),
  );

  function a(a1: number, a2: number) {
    return 1 - 3 * a2 + 3 * a1;
  }

  function b(a1: number, a2: number) {
    return 3 * a2 - 6 * a1;
  }

  function c(a1: number) {
    return 3 * a1;
  }

  function calcBezier(t: number, a1: number, a2: number) {
    return ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
  }

  function getSlope(t: number, a1: number, a2: number) {
    return 3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);
  }

  function getTForX(x: number) {
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = sampleValues.length - 1;

    for (
      ;
      currentSample !== lastSample && sampleValues[currentSample] <= x;
      currentSample += 1
    ) {
      intervalStart += 0.1;
    }

    currentSample -= 1;

    const distance =
      (x - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    let guessForT = intervalStart + distance * 0.1;

    for (let index = 0; index < 4; index += 1) {
      const currentSlope = getSlope(guessForT, x1, x2);

      if (currentSlope === 0) {
        return guessForT;
      }

      const currentX = calcBezier(guessForT, x1, x2) - x;
      guessForT -= currentX / currentSlope;
    }

    return guessForT;
  }

  return (x: number) => {
    if (x1 === y1 && x2 === y2) {
      return x;
    }

    if (x === 0 || x === 1) {
      return x;
    }

    return calcBezier(getTForX(x), y1, y2);
  };
}

const isWebRuntime =
  typeof (globalThis as typeof globalThis & { document?: unknown }).document !==
  "undefined";

/**
 * High-refresh motion contract (60 / 90 / 120 Hz displays):
 * - Prefer transform + opacity only (compositor layer, no layout/paint per frame).
 * - Avoid animating box-shadow, background-color, border-color, width, or height.
 * - Use `motion.useNativeDriver` on native; web Animated still composits transform/opacity.
 * - Respect `useReducedMotion` — snap to end state with duration 0.
 */
export const motion = {
  useNativeDriver: !isWebRuntime,
  cssTransition: {
    duration: "220ms",
    property: "transform, opacity",
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  duration: {
    fast: 140,
    base: 220,
    bottomNavSelection: 220,
    emphasis: 320,
    heroAutoplayDelay: 3000,
    accordionChevron: 280,
    accordionExpand: 300,
    scorePulse: 1000,
    shimmer: 1500,
    /*
     * Toast dwell. Dwell time IS motion, so it lives beside every other
     * duration rather than as a constant only Toast.tsx can see.
     *
     * `toast` is the confirmation default — long enough to read "Copied!".
     * `toastLong` is the failure default: a failure carries a reason and a
     * next step, so it needs longer. 6000 is not a new number — it is what the
     * app's failure toasts already pass by hand (CustomerGoLinkScreen,
     * CustomerHomeScreen, CustomerCatalogScreens), lifted to a token so the
     * remaining literals have somewhere to point.
     */
    toast: 2500,
    toastLong: 6000,
  },
  easing: {
    in: cubicBezier(0.4, 0, 1, 1),
    out: cubicBezier(0.16, 1, 0.3, 1),
    spring: cubicBezier(0.34, 1.56, 0.64, 1),
    standard: cubicBezier(0.4, 0, 0.2, 1),
  },
  /*
   * Physics for a spring driver: these three fields are exactly what RN's
   * own `Animated.spring` reads, no separate physics engine required. The
   * bezier easings above cannot drive a spring: a cubic-bezier has no
   * damping to give it.
   *
   * GoGoSpend drives these through `Animated.spring`
   * (`theme/animatedMotion.ts`'s `runSpringTransform`); the spend screens
   * have no reanimated, and a second animation system in one screen is worse
   * than a slightly less ergonomic API.
   *
   * `bouncy` is RATIONED to moments that are genuinely good news (a save
   * landing, cashback arriving). Overshoot on an ordinary control is the
   * clearest tell of an app imitating premium rather than being it, so the
   * test beside this asserts the other two are critically damped or stiffer.
   */
  spring: {
    /*
     * Controls, chips, segments — arrives and stops.
     *
     * 38, not 26: critical damping for stiffness 340 is 2*sqrt(340) = 36.88,
     * and anything below that overshoots. "Arrives and stops" has to mean it.
     */
    snappy: { damping: 38, stiffness: 340, mass: 1 },
    /** Sheets, cards, layout — travels further, settles softly. */
    gentle: { damping: 30, stiffness: 180, mass: 1 },
    /** Celebratory only. Under-damped on purpose. */
    bouncy: { damping: 14, stiffness: 260, mass: 1 },
  },
  /*
   * WHICH verb a moment gets. `lib/haptics` has had the four verbs since the
   * bottom nav shipped; what it never had was a policy, and a policy is the
   * difference between tactile and irritating.
   *
   * `"none"` is a real answer and the most important one here. Silence by
   * default, feedback only where something COMMITTED — a phone that buzzes on
   * every touch feels cheap, not expensive.
   */
  haptic: {
    segmentChange: "selection",
    sheetOpen: "impact",
    primaryPress: "impact",
    saveLanded: "success",
    saveFailed: "error",
    scroll: "none",
    navigate: "none",
    listPage: "none",
    /*
     * The premium layer (premium and AI plan, A1). Each moment is something
     * the person did or something that happened to their money, never a
     * scroll or a page turn.
     *
     * - Typing an amount ticks like a good calculator; clearing it is a
     *   lighter tap, so the two feel different under the thumb.
     * - Choosing (type, category, day, tab) is a selection tick.
     * - Saved offline is light, not success: it has not reached the server,
     *   and "saving" must never feel saved.
     * - A delete lands with a rigid tap; its undo is light.
     * - Crossing 80% or 100% of a budget is a warning, said once.
     * - A logging milestone (a good week, the month recap) is the only
     *   celebration, a three-beat pattern, at most once a day.
     * - Bun's suggestions arrive lightly; accepting one is a press.
     */
    keyTap: "selection",
    amountCleared: "light",
    chipPick: "selection",
    dateStep: "selection",
    tabChange: "selection",
    saveQueued: "light",
    deleteDone: "rigid",
    undoDone: "light",
    thresholdCrossed: "warning",
    celebration: "celebrate",
    aiSuggestionReady: "light",
    aiAccepted: "impact",
  },
  scale: {
    hover: 1.01,
    hoverLiftY: -2,
    imageHover: 1.03,
    press: 0.97,
    subtlePress: 0.98,
  },
  bottomNavSelection: {
    inactiveIconOffsetY: 1,
    inactiveIconScale: 0.96,
    inactiveDotScale: 0.5,
  },
  staggerStep: 50,
} as const;

type InteractionTransformOptions = {
  hoverLift?: boolean;
  hovered?: boolean;
  pressed?: boolean;
  pressScale?: number;
  hoverScale?: number;
};

export function getInteractionTransformStyle({
  hoverLift = false,
  hovered = false,
  pressed = false,
  pressScale = motion.scale.press,
  hoverScale = motion.scale.hover,
}: InteractionTransformOptions) {
  const transform = [];

  if (hoverLift) {
    transform.push({ translateY: hovered ? motion.scale.hoverLiftY : 0 });
  }

  const restingScale = hovered && !pressed ? hoverScale : 1;
  transform.push({ scale: pressed ? pressScale : restingScale });

  return { transform };
}

export function getPressedScaleStyle(
  pressed: boolean,
  scale: number = motion.scale.press,
) {
  return getInteractionTransformStyle({ pressed, pressScale: scale });
}
