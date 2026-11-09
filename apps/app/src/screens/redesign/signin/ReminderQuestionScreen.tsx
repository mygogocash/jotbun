// 1C-T8: today's reminder question (R6, approved at E2 checkpoint 4), moved
// to right after sign-in (R55, K16): OnboardingScreen's last step on a screen
// of its own, with the same words, preview and answers, unrouted until 1C-T9
// (`/onboarding/reminder`, behind the terms step while terms are pending).
// It explains the reminder before the phone asks anything. Turn on asks the
// reminder service once for 20:00 and says its answer, then Continue goes
// on; Not now asks nothing and goes on (`onDone`: Quick add, 1C-T9).
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { createAppReminderService } from '@mobile/notifications/useReminderUpkeep';
import { FIRST_REMINDER, FIRST_REMINDER_TIME, primingAnswer } from '@mobile/spend/v1/redesign/account/onboardingModel';
import type { PrimingAnswer } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter, ActionRow } from '../ActionFooter';
import { PrimingOutcome, ReminderPreview } from '../account/OnboardingParts';
import type { OnboardingReminders } from '../account/OnboardingScreen';

export type ReminderQuestionScreenProps = {
  /** Defaults to this device's reminder service, made when Turn on is pressed (on the web it has no reminders). */
  reminders?: OnboardingReminders;
  onDone(): void;
};

type Priming = { readonly phase: 'asking' } | { readonly phase: 'waiting' } | { readonly phase: 'answered'; readonly answer: PrimingAnswer };

export function ReminderQuestionScreen({ reminders, onDone }: ReminderQuestionScreenProps) {
  const tc = useCopy();
  const locale = useActiveLocale();
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  const [priming, setPriming] = useState<Priming>({ phase: 'asking' });
  // The reminder is asked for at most once, however fast Turn on is pressed, and the screen goes on once.
  const asked = useRef(false);
  const left = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const goOn = () => {
    if (left.current) return;
    left.current = true;
    onDone();
  };

  const turnOn = async () => {
    if (asked.current) return;
    asked.current = true;
    setPriming({ phase: 'waiting' });
    let answer: PrimingAnswer;
    try {
      answer = primingAnswer(await (reminders ?? createAppReminderService(locale)).setPreference({ ...FIRST_REMINDER }));
    } catch {
      answer = 'failed';
    }
    if (mounted.current) setPriming({ phase: 'answered', answer });
  };

  const bun = intensity === 'full' ? <Bun pose="sleepy" size="m" testID="reminder-question-bun" /> : undefined;

  return (
    <View testID="reminder-question-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg }}>
        <StageHeader title={tc('Daily reminder')} bun={bun} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <BunText>{tc('One reminder each evening at {time}, to log what you spent.', { time: FIRST_REMINDER_TIME })}</BunText>
          <ReminderPreview />
          <BunText>{tc('If you turn it on, your phone asks you to allow notifications. You can change or stop it in Settings.')}</BunText>
          {priming.phase === 'answered' ? <PrimingOutcome answer={priming.answer} /> : null}
        </View>
      </ScrollView>
      <ActionFooter testID="reminder-question-footer">
        {priming.phase === 'answered' ? (
          <PillButton label={tc('Continue')} onPress={goOn} />
        ) : (
          <ActionRow
            secondary={<PillButton kind="secondary" label={tc('Not now')} onPress={goOn} disabled={priming.phase === 'waiting'} />}
            primary={<PillButton label={tc('Turn on')} onPress={() => void turnOn()} busy={priming.phase === 'waiting'} />}
          />
        )}
      </ActionFooter>
    </View>
  );
}
