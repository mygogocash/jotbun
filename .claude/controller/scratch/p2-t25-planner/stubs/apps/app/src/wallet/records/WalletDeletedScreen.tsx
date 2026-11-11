import { View } from 'react-native';

export type WalletDeletedScreenProps = { now?: Date };

export function formatDeletedDate(date: string, locale: string): string {
  return date;
}

export function WalletDeletedScreen({ now }: WalletDeletedScreenProps) {
  return <View testID="wallet-deleted-screen" />;
}
