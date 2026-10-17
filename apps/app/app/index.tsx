import { useRouter } from 'expo-router';
import { SpendIntro } from '@mobile/spend/SpendIntroScreen';
import { createSpendStyles } from '@mobile/spend/spendStyles';
import { useThemedStyles } from '@mobile/theme/useThemedStyles';
import { useCopy } from '@mobile/i18n/useCopy';

export default function Welcome() {
  const router = useRouter();
  const styles = useThemedStyles(createSpendStyles);
  const tc = useCopy();
  return <SpendIntro styles={styles} tc={tc} onLeave={() => router.push('/spend')} />;
}
