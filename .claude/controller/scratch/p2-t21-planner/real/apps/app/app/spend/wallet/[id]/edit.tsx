import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletEditScreen } from '@mobile/wallet/wallets/WalletEditScreen';

function BunWalletEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpendV1Provider resources={getSharedV1Resources()}><WalletEditScreen walletId={id} /></SpendV1Provider>;
}

/** Editing a wallet in the Bun Wallet (P2-T21) while the `wallet` area is on (W1); otherwise the wallets list. Never in the legacy build. */
export default function SpendWalletEditRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (!isRedesignEnabled('wallet')) return <Redirect href="/spend/wallets" />;
  return <BunWalletEdit />;
}
