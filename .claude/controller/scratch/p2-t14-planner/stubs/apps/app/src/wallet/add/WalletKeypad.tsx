// RED stub (P2-T14): the real props, and no keys.
import { View } from 'react-native';

import type { KeypadState } from '@mobile/ui/keypadExpression';

export function WalletKeypad(_props: { keypad: KeypadState; onKeypad(next: KeypadState): void; disabled?: boolean }) {
  return <View testID="wallet-keypad" />;
}
