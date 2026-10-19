import { useRouter } from 'expo-router';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { OnboardingScreen } from '@mobile/screens/redesign/account/OnboardingScreen';
import { SpendIntro } from '@mobile/spend/SpendIntroScreen';
import { createSpendStyles } from '@mobile/spend/spendStyles';
import { useThemedStyles } from '@mobile/theme/useThemedStyles';
import { useCopy } from '@mobile/i18n/useCopy';

export default function Welcome() {
  // R6: the redesigned first run under the `account` area (E2 checkpoint 4).
  if (isRedesignEnabled('account')) return <OnboardingScreen />;
  return <CurrentWelcome />;
}

function CurrentWelcome() {
  const router = useRouter();
  const styles = useThemedStyles(createSpendStyles);
  const tc = useCopy();
  return <SpendIntro styles={styles} tc={tc} onLeave={() => router.push('/spend')} />;
}
