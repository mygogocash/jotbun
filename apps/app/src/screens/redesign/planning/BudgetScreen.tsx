// R4 Planning: the Budget screen (plan §6.2), behind the `planning` area
// until E2 checkpoint 2. A placeholder until the screen is built.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { StageHeader } from '@mobile/ui/StageHeader';

export function BudgetScreen() {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View testID="budget-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <StageHeader title={tc('Budget')} />
    </View>
  );
}
