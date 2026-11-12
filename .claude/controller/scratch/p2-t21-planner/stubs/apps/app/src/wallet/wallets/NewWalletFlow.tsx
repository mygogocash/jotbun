// RED stub (P2-T21): the plan's interface, with no behaviour yet.
import { View } from 'react-native';

export type NewWalletReturn = '/spend/setup' | '/spend/wallets';

export function NewWalletFlow(_props: { returnTo?: NewWalletReturn; now?: Date }) {
  return <View testID="new-wallet" />;
}
