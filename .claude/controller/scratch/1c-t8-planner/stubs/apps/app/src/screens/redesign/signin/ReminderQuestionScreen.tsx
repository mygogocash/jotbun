// 1C-T8 RED stub (R52): the reminder question draws an empty View.
import { View } from 'react-native';

import type { OnboardingReminders } from '../account/OnboardingScreen';

export type ReminderQuestionScreenProps = { reminders?: OnboardingReminders; onDone(): void };

export function ReminderQuestionScreen(_props: ReminderQuestionScreenProps) {
  return <View />;
}
