// R7: the import journey (plan §6.5), behind the `import` area until E2
// checkpoint 5. A placeholder until the screen is built.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { StageHeader } from '@mobile/ui/StageHeader';

export function ImportScreen() {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View testID="import-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <StageHeader title={tc('Import')} />
    </View>
  );
}
