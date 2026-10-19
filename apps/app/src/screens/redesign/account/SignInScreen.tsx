// R6: the SignIn screen (plan §6.4), behind the `account` area until E2
// checkpoint 4. A placeholder until the screen is built.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { StageHeader } from '@mobile/ui/StageHeader';

export function SignInScreen() {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View testID="sign-in-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <StageHeader title={tc('Jotbun')} />
    </View>
  );
}
