import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@mobile/theme/AppText";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { ProfileSubPageFrame } from "@mobile/components/ProfileSubPageFrame";
import {
  formatIntroBaht,
  introCountValue,
  SPEND_INTRO_COUNT_MS,
  SPEND_INTRO_CUP,
  SPEND_INTRO_DROPS,
  SPEND_INTRO_FRAME,
  SPEND_INTRO_YEARLY_BAHT,
} from "@mobile/spend/spendIntro";
import {
  INTRO_SUM_GRADIENT_ID,
  INTRO_SUM_RADIUS,
} from "@mobile/spend/spendLayout";
import type { createSpendStyles } from "@mobile/spend/spendStyles";
/*
 * The one-off first look, moved out of `CustomerSpendScreen` unchanged. It
 * shares nothing with the rest of the page but the stylesheet: it renders
 * INSTEAD of the screen until the phone has dismissed it once.
 */

/**
 * The figure counting up from zero, once, when the page opens.
 *
 * Driven off the clock rather than a frame counter so a slow device lands on
 * the real number at the same moment a fast one does — it just gets there in
 * fewer steps. `introCountValue` owns the arithmetic and is pinned separately.
 */
function useIntroCount(): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(() =>
    reducedMotion ? SPEND_INTRO_YEARLY_BAHT : 0,
  );

  useEffect(() => {
    if (reducedMotion) {
      setValue(SPEND_INTRO_YEARLY_BAHT);
      return;
    }
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      setValue(
        introCountValue(elapsed, SPEND_INTRO_COUNT_MS, SPEND_INTRO_YEARLY_BAHT),
      );
      if (elapsed < SPEND_INTRO_COUNT_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return value;
}

/**
 * The first look, shown once per phone (owner call 2026-08-30). It argues for
 * the habit rather than describing the buttons: the sum at the top is the whole
 * case, and the three lines under it are what recording gives back.
 *
 * Both ways out mark it seen — a member who skips is not asked twice.
 */
export function SpendIntro({
  onLeave,
  styles,
  tc,
}: {
  onLeave: () => void;
  styles: ReturnType<typeof createSpendStyles>;
  tc: (value: string) => string;
}) {
  const counted = useIntroCount();
  const points = [
    ["Where did it all go?", "We sort your month out so you do not have to."],
    [
      "The small stuff is not small",
      "The ones you forget about are exactly the ones adding up.",
    ],
    [
      "No more payday surprises",
      "Find out while there is still time to do something.",
    ],
  ] as const;

  return (
    <ProfileSubPageFrame title={tc("Jotbun")}>
      {/*
       * ONE child, on purpose. The frame puts its shared 24 between every child
       * it is given, and that rhythm is locked across all the profile sub-pages
       * — so the only way this page can have a rhythm of its own is to hand the
       * frame a single wrapper and set the spacing inside it. Adding a sibling
       * here would quietly put the shared 24 back between these blocks.
       */}
      <View style={styles.introPage}>
        <View style={styles.introSum}>
          {/*
           * RN has no CSS gradient, so the wash is an absolutely positioned Svg —
           * the same way the add panel above draws its own. `rx` rounds it to the
           * block's corner so no square edge shows through.
           */}
          <Svg height="100%" style={styles.introSumWash} width="100%">
            <Defs>
              <LinearGradient
                id={INTRO_SUM_GRADIENT_ID}
                x1="0"
                y1="0"
                x2="0.35"
                y2="1"
              >
                <Stop offset="0" stopColor={SPEND_INTRO_FRAME.gradientFrom} />
                <Stop offset="1" stopColor={SPEND_INTRO_FRAME.gradientTo} />
              </LinearGradient>
            </Defs>
            <Rect
              fill={`url(#${INTRO_SUM_GRADIENT_ID})`}
              height="100%"
              rx={INTRO_SUM_RADIUS}
              width="100%"
            />
          </Svg>

          {/*
           * The knocked-over cup and what came out of it. Drawn before the text
           * so the text paints over it, and clipped by the block's own
           * `overflow: hidden` — the cup is deliberately bigger than its corner.
           */}
          <View style={styles.introSpill}>
            <Text style={styles.introCup}>{SPEND_INTRO_CUP}</Text>
            {SPEND_INTRO_DROPS.map((drop) => (
              <View
                key={`${drop.left}-${drop.top}`}
                style={[
                  styles.introDrop,
                  {
                    borderRadius: drop.size / 2,
                    height: drop.size,
                    left: drop.left,
                    opacity: drop.opacity,
                    top: drop.top,
                    width: drop.size,
                  },
                ]}
              />
            ))}
          </View>

          <Text style={styles.introSumSmall}>
            {tc("One ฿60 coffee, every day")}
          </Text>
          {/*
           * Computed, not written into the copy: the figure is `60 × 365` in one
           * place, so it cannot drift away from the line above it, and it reads
           * the same in all three languages.
           *
           * The label is the settled figure, not the ticking one — a screen
           * reader announcing every frame of a count-up is unusable.
           */}
          <Text
            accessibilityLabel={formatIntroBaht(SPEND_INTRO_YEARLY_BAHT)}
            style={styles.introSumBig}
          >
            {formatIntroBaht(counted)}
          </Text>
          <Text style={styles.introSumSmall}>{tc("a year")}</Text>
        </View>

        <View style={styles.introHeadGroup}>
          <Text style={styles.introHeadline}>
            {tc("Your money has been sneaking off")}
          </Text>
          <Text style={styles.introSub}>
            {tc(
              "Let's catch it. Seconds a day, and it stops getting away with it.",
            )}
          </Text>
        </View>

        <View style={styles.introPoints}>
          {points.map(([title, line]) => (
            <View key={title} style={styles.introPoint}>
              <View style={styles.introMark}>
                <Text style={styles.introMarkGlyph}>→</Text>
              </View>
              <View style={styles.introPointBody}>
                <Text style={styles.introPointTitle}>{tc(title)}</Text>
                <Text style={styles.introPointLine}>{tc(line)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/*
         * One control, on purpose (owner call 2026-08-30). This sat next to a
         * "Skip" that ran the exact same handler — two labels promising
         * different things and doing the same one. The title bar's back arrow
         * is the way out, and the page never asks twice either way.
         */}
        <Pressable
          accessibilityRole="button"
          onPress={onLeave}
          style={styles.introStart}
        >
          <Text style={styles.introStartLabel}>{tc("Let's start!")}</Text>
        </Pressable>
      </View>
    </ProfileSubPageFrame>
  );
}
