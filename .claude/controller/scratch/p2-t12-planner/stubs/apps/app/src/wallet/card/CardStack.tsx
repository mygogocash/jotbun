// RED stub (P2-T12): CardStack.tsx's names, types and constants. The cards
// stand in a plain column in the order given, each passed as it came (today's
// money out included) and saying its words; a press opens nothing.
import { View } from 'react-native';

import type { WalletLook } from '../looks/walletLooks';
import { WalletCard } from './WalletCard';
import type { WalletCardModel } from './WalletCard';

export { CARD_HEIGHT } from './WalletCard';

export type StackWallet = WalletCardModel & { look: WalletLook };

export const STACK_PEEK = 54;
export const CARD_LIFT = 12;

export function CardStack({ wallets, onOpen }: { wallets: readonly StackWallet[]; onOpen: (walletId: string) => void }) {
  void onOpen;
  return (
    <View testID="card-stack">
      {wallets.map((wallet) => (
        <View key={wallet.id} testID={`card-stack-${wallet.id}`}>
          <View>
            <WalletCard wallet={wallet} look={wallet.look} variant="stack" onPress={() => undefined} />
          </View>
        </View>
      ))}
    </View>
  );
}
