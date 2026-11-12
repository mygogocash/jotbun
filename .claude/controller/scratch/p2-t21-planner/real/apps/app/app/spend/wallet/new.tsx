import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { NewWalletFlow } from '@mobile/wallet/wallets/NewWalletFlow';
import type { NewWalletReturn } from '@mobile/wallet/wallets/NewWalletFlow';

/** Where the ceremony returns: the setup checklist for `?setup=1` (P2-T35), the wallets list it was opened from (`?returnTo=/spend/wallets`, P2-T20's add tile), else Home. */
function newWalletReturn(params: { setup?: string; returnTo?: string }): NewWalletReturn | undefined {
  if (params.setup === '1') return '/spend/setup';
  if (params.returnTo === '/spend/wallets') return '/spend/wallets';
  return undefined;
}

function BunWalletNew() {
  const params = useLocalSearchParams<{ setup?: string; returnTo?: string }>();
  return <SpendV1Provider resources={getSharedV1Resources()}><NewWalletFlow returnTo={newWalletReturn(params)} /></SpendV1Provider>;
}

/** The Bun Wallet's new-wallet flow (P2-T21) while the `wallet` area is on (W1); otherwise the wallets list. Never in the legacy build. */
export default function SpendNewWalletRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (!isRedesignEnabled('wallet')) return <Redirect href="/spend/wallets" />;
  return <BunWalletNew />;
}
