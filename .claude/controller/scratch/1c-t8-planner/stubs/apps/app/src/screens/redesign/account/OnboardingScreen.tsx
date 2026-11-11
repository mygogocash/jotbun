// R6: the Onboarding screen (plan §6.4), at `/` behind the `account` area
// (on since E2 checkpoint 4).
//
// - Three story steps, with Skip, Next and the dots: the coffee maths (today's
//   intro maths and copy, with coins piling up), "your diary stays private"
//   (the promises) and "log your first coffee", a tiny commitment.
// - Then the reminder question. It explains the daily reminder BEFORE the
//   phone's permission prompt and asks the phone nothing until Turn on, so the
//   prompt never sits on top of it. Turn on asks the reminder service for
//   20:00 (the service asks the OS at most once); each answer is said in words
//   and a denial is never asked again. Not now asks nothing.
// - Then sign-in (`/login`), or with a session already, Quick add
//   (`/spend/add`) to log that coffee. The first wallet and budget come later,
//   through Home.
//
// The bun: a pose on the stage at Full. Quiet and Off leave the stage plain,
// as Home's stage does: Quiet keeps the bun for empty states only.
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useAuthGuardSession } from '@mobile/auth/useAuthGuardSession';
import type { Locale } from '@mobile/i18n/locales';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import type { BunPoseName } from '@mobile/mascot/poses';
import { createAppReminderService } from '@mobile/notifications/useReminderUpkeep';
import type { LocalReminderService } from '@mobile/notifications/reminders';
import {
  FIRST_REMINDER, FIRST_REMINDER_TIME, PRIVACY_PROMISES, SKIP_TO, STORY_STEPS, afterOnboarding, primingAnswer, stepAfter, storyProgress,
} from '@mobile/spend/v1/redesign/account/onboardingModel';
import type { OnboardingStep, PrimingAnswer } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { announcePolitely } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter, ActionRow } from '../ActionFooter';
import { CoffeeMaths, PrimingOutcome, ReminderPreview, StoryDots } from './OnboardingParts';

/** The reminder service's one call onboarding makes. */
export type OnboardingReminders = Pick<LocalReminderService, 'setPreference'>;

export type OnboardingScreenProps = {
  /** Defaults to this device's reminder service, made when Turn on is pressed (on the web it has no reminders). */
  reminders?: OnboardingReminders;
  /** RED stub (R52): declared, ignored. */
  signinArea?: boolean;
};

/** The device's reminder, built as the root layout's upkeep and the Reminders screen build it, so upkeep sees nothing to redo. */
function deviceReminders(locale: Locale): OnboardingReminders {
  return createAppReminderService(locale);
}

type Priming = { readonly phase: 'asking' } | { readonly phase: 'waiting' } | { readonly phase: 'answered'; readonly answer: PrimingAnswer };

const POSES: Readonly<Record<OnboardingStep, BunPoseName>> = {
  coffee: 'hello',
  private: 'lock',
  'first-coffee': 'holding-receipt',
  reminder: 'sleepy',
};

export function OnboardingScreen({ reminders }: OnboardingScreenProps) {
  const tc = useCopy();
  const locale = useActiveLocale();
  const router = useRouter();
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  const { isAuthed } = useAuthGuardSession();
  const [step, setStep] = useState<OnboardingStep>(STORY_STEPS[0]);
  const [priming, setPriming] = useState<Priming>({ phase: 'asking' });
  // The reminder is asked for at most once, however fast Turn on is pressed.
  const asked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const titles: Readonly<Record<OnboardingStep, string>> = {
    coffee: tc('Your money has been sneaking off'),
    private: tc('Your diary stays private'),
    'first-coffee': tc('Log your first coffee'),
    reminder: tc('Daily reminder'),
  };
  const title = titles[step];

  // A new step is read out (iOS); the first one is read with the screen.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    announcePolitely(title);
  }, [step, title]);

  const finish = () => router.replace(afterOnboarding(isAuthed));

  const turnOn = async () => {
    if (asked.current) return;
    asked.current = true;
    setPriming({ phase: 'waiting' });
    let answer: PrimingAnswer;
    try {
      answer = primingAnswer(await (reminders ?? deviceReminders(locale)).setPreference({ ...FIRST_REMINDER }));
    } catch {
      answer = 'failed';
    }
    if (mounted.current) setPriming({ phase: 'answered', answer });
  };

  const progress = storyProgress(step);
  const stageBun = intensity === 'full' ? <Bun pose={POSES[step]} size="m" testID={`onboarding-bun-${POSES[step]}`} /> : undefined;

  return (
    <View testID="onboarding-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Keyed by step, so each step starts at its top. */}
      <ScrollView key={step} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg }}>
        <StageHeader title={title} bun={stageBun} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {step === 'coffee' ? (
            <>
              <CoffeeMaths />
              <BunText>{tc("Let's catch it. Seconds a day, and it stops getting away with it.")}</BunText>
            </>
          ) : null}
          {step === 'private' ? <PromiseList items={PRIVACY_PROMISES.map((promise) => ({ key: promise.key, text: tc(promise.text) }))} /> : null}
          {step === 'first-coffee' ? <BunText>{tc('Adding an entry takes a few seconds. Start with your next coffee.')}</BunText> : null}
          {step === 'reminder' ? (
            <>
              <BunText>{tc('One reminder each evening at {time}, to log what you spent.', { time: FIRST_REMINDER_TIME })}</BunText>
              <ReminderPreview />
              <BunText>{tc('If you turn it on, your phone asks you to allow notifications. You can change or stop it in Settings.')}</BunText>
              {priming.phase === 'answered' ? <PrimingOutcome answer={priming.answer} /> : null}
            </>
          ) : null}
        </View>
      </ScrollView>
      <ActionFooter testID="onboarding-footer">
        {progress ? <StoryDots step={progress.step} total={progress.total} /> : null}
        {step !== 'reminder' ? (
          <ActionRow
            secondary={<PillButton kind="secondary" label={tc('Skip')} onPress={() => setStep(SKIP_TO)} />}
            primary={<PillButton label={step === 'first-coffee' ? tc("Let's start!") : tc('Next')} onPress={() => setStep(stepAfter(step))} />}
          />
        ) : priming.phase === 'answered' ? (
          <PillButton label={tc('Continue')} onPress={finish} />
        ) : (
          <ActionRow
            secondary={<PillButton kind="secondary" label={tc('Not now')} onPress={finish} disabled={priming.phase === 'waiting'} />}
            primary={<PillButton label={tc('Turn on')} onPress={() => void turnOn()} busy={priming.phase === 'waiting'} />}
          />
        )}
      </ActionFooter>
    </View>
  );
}
