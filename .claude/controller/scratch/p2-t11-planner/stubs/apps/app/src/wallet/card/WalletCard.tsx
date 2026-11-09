// RED stub (P2-T11): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';
import { Pressable, Text, View } from 'react-native';

import type { WalletT } from '../copy/draftText';
import type { WalletLook } from '../looks/walletLooks';

export const CARD_HEIGHT = 0;

export type WalletCardModel = {
  id: string;
  name: string;
  balanceMinor: Minor;
  todayOutMinor?: Minor | null;
  pendingMinor?: Minor | null;
};

export type WalletCardWords = {
  amountMinor: Minor;
  amountPrefix: string | null;
  kindLine: string | null;
  pendingLine: string | null;
  todayLine: string | null;
  spoken: string;
};

export function walletCardWords(wallet: WalletCardModel, _look: WalletLook, _hidden: boolean, _t: WalletT): WalletCardWords {
  return { amountMinor: wallet.balanceMinor, amountPrefix: null, kindLine: null, pendingLine: null, todayLine: null, spoken: '' };
}

export function WalletCard({ wallet, onPress }: {
  wallet: WalletCardModel;
  look: WalletLook;
  variant: 'stack' | 'full' | 'spine';
  onPress?: () => void;
}) {
  return onPress === undefined ? (
    <View><Text>{wallet.name}</Text></View>
  ) : (
    <Pressable accessibilityRole="button" onPress={onPress}><Text>{wallet.name}</Text></Pressable>
  );
}
