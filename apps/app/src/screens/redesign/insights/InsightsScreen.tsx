// R5 Insights: the Insights screen (plan §6.3), behind the `insights` area
// until E2 checkpoint 3. A placeholder until the screen is built.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { StageHeader } from '@mobile/ui/StageHeader';

export function InsightsScreen() {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View testID="insights-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <StageHeader title={tc('Insights')} />
    </View>
  );
}
