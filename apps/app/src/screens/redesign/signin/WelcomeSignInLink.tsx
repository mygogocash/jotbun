// 1C-T8: bw-welcome's "มีบัญชีแล้ว เข้าสู่ระบบ" (K16, C15, decided Q7), on the
// story's first step while the `signin` area is on: straight to sign-in, which
// knows it came from onboarding, so an active sign-in goes on to the reminder
// question (R55). A text action, as on the board.
import { useRouter } from 'expo-router';

import { afterStory } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { useSigninCopy } from './draftCopy';
import { TextButton } from './SigninParts';

export function WelcomeSignInLink() {
  const sc = useSigninCopy();
  const router = useRouter();
  return <TextButton testID="welcome-sign-in-link" label={sc('Already have an account? Sign in')} onPress={() => router.replace(afterStory(false))} />;
}
