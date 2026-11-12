// RED stub (P2-T29): the plan's interface, with no behaviour yet.
import { View } from 'react-native';

export type WalletCategoriesScreenProps = {
  now?: Date;
  onBack?: () => void;
};

export function WalletCategoriesScreen(_props: WalletCategoriesScreenProps = {}) {
  return <View testID="wallet-categories-screen" />;
}
