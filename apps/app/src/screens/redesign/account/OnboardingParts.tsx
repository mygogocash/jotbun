// R6 Onboarding's pieces (plan §6.4): the coffee maths with its pile of coins,
// the story's dots, the reminder's preview and the reminder service's answer.
// Behind the `account` area (on since E2 checkpoint 4).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useCopy } from '@mobile/i18n/useCopy';
import { coffeeMaths, FIRST_REMINDER_TIME } from '@mobile/spend/v1/redesign/account/onboardingModel';
import type { PrimingAnswer } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { runOpacityTiming } from '@mobile/theme/animatedMotion';
import { motion } from '@mobile/theme/motion';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';

// ---------------------------------------------------------------------------
// The coins

/** Columns of 1, 2, 3 and 4 coins: the pile grows from left to right, as the days add up. */
const COIN_COLUMNS = [1, 2, 3, 4] as const;
const COIN_COUNT = COIN_COLUMNS.reduce((sum, column) => sum + column, 0);
const COIN = { width: 40, height: 12, overlap: 2 } as const;
/** How far a coin drops onto the pile. */
const COIN_FALL = 24;
/** One coin lands after another, this far apart. */
const COIN_STAGGER_MS = 80;

/**
 * 0 (above the pile, unseen) to 1 (landed), one value per coin. It waits for
 * the OS's reduced-motion answer before anything moves, so a person who asked
 * for less motion never sees a coin fall: under reduced motion every coin is
 * simply set down. `useReducedMotion` keeps it in step if the setting changes
 * while the coins are falling.
 */
function useCoinDrop(count: number): readonly Animated.Value[] {
  const coins = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
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
    if (reducedAtStart === null) return undefined;
    if (reducedAtStart || reducedMotion) {
      for (const coin of coins) coin.setValue(1);
      return undefined;
    }
    const pile = Animated.stagger(COIN_STAGGER_MS, coins.map((coin) => runOpacityTiming(coin, { toValue: 1, duration: motion.duration.base, easing: motion.easing.out })));
    pile.start();
    return () => pile.stop();
  }, [coins, reducedAtStart, reducedMotion]);

  return coins;
}

/** Coins piling up beside the sum. Decoration only: the sum says it in words. */
function CoinPile() {
  const colors = useBunColors();
  const coins = useCoinDrop(COIN_COUNT);
  let next = 0;
  return (
    <View {...DECORATIVE} testID="onboarding-coins" style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: BUN_SPACE.xs, paddingTop: COIN_FALL }}>
      {COIN_COLUMNS.map((height, column) => (
        <View key={column} style={{ flexDirection: 'column-reverse', alignItems: 'center' }}>
          {Array.from({ length: height }, () => {
            const index = next;
            next += 1;
            const landed = coins[index];
            return (
              <Animated.View
                key={index}
                testID={`onboarding-coin-${index}`}
                style={{
                  width: COIN.width,
                  height: COIN.height,
                  marginTop: -COIN.overlap,
                  borderRadius: BUN_RADIUS.pill,
                  borderWidth: BUN_OUTLINE.control,
                  borderColor: colors.ink,
                  backgroundColor: colors.stage,
                  opacity: landed,
                  transform: [{ translateY: landed.interpolate({ inputRange: [0, 1], outputRange: [-COIN_FALL, 0] }) }],
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Step 1: one ฿60 coffee every day, the coins, and ฿21,900 a year (today's intro maths and copy). */
export function CoffeeMaths() {
  const tc = useCopy();
  const { perYear } = coffeeMaths();
  return (
    <Card testID="onboarding-coffee" style={{ alignItems: 'center' }}>
      <BunText style={{ textAlign: 'center' }}>{tc('One ฿60 coffee, every day')}</BunText>
      <CoinPile />
      <BunText testID="onboarding-yearly" variant="hero" style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>{perYear}</BunText>
      <BunText style={{ textAlign: 'center' }}>{tc('a year')}</BunText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The dots

/**
 * The story's progress: dots for the eye, and for a screen reader one
 * progress bar that says "Step 2 of 3".
 */
export function StoryDots({ step, total }: { step: number; total: number }) {
  const tc = useCopy();
  const colors = useBunColors();
  const label = tc('Step {step} of {total}', { step, total });
  return (
    <View
      testID="onboarding-progress"
      accessible
      role="progressbar"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={label}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: BUN_SPACE.xs, paddingVertical: BUN_SPACE.xxs }}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          {...DECORATIVE}
          style={{
            width: index + 1 === step ? BUN_SPACE.lg : BUN_SPACE.xs,
            height: BUN_SPACE.xs,
            borderRadius: BUN_RADIUS.pill,
            borderWidth: BUN_OUTLINE.control,
            borderColor: colors.ink,
            backgroundColor: index < step ? colors.ink : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The reminder

/** What the reminder will say, in its own words (the ones the device schedules), at 20:00. */
export function ReminderPreview() {
  const tc = useCopy();
  return (
    <Card testID="onboarding-reminder-preview" padding="sm" style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{`${tc('Jotbun')} · ${FIRST_REMINDER_TIME}`}</BunText>
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc("Log today's spending")}</BunText>
      <BunText variant="caption">{tc('Add what you spent today in Jotbun.')}</BunText>
    </Card>
  );
}

/**
 * The reminder service's answer, in words. A denial is said once, plainly,
 * with no second ask: the question is over either way.
 */
export function PrimingOutcome({ answer }: { answer: PrimingAnswer }) {
  const tc = useCopy();
  const text = (() => {
    switch (answer) {
      case 'scheduled': return tc('Reminder on: every day at {time}.', { time: FIRST_REMINDER_TIME });
      case 'denied': return tc("Reminders stay off. You can allow notifications for Jotbun in your phone's settings at any time.");
      case 'unsupported': return tc('Reminders work in the Jotbun app on iOS and Android.');
      default: return tc("The reminder couldn't be set. You can turn it on later in Settings.");
    }
  })();
  useAnnouncement(text);
  return (
    <View {...POLITE_LIVE_REGION}>
      <BunText testID="onboarding-reminder-answer" style={{ fontWeight: '700' }}>{text}</BunText>
    </View>
  );
}
