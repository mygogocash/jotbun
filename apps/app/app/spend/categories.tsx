import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { CategoriesScreen } from '@mobile/screens/redesign/planning/CategoriesScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletCategoriesScreen } from '@mobile/wallet/categories/WalletCategoriesScreen';

/**
 * The Bun Wallet's categories while the `wallet` area is on (W1, P2-T29).
 * Otherwise R4 Planning's screen, only under the `planning` area (E2
 * checkpoint 2). Never in the legacy build.
 */
export default function SpendCategoriesRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (isRedesignEnabled('wallet')) return <SpendV1Provider resources={getSharedV1Resources()}><WalletCategoriesScreen /></SpendV1Provider>;
  if (!isRedesignEnabled('planning')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><CategoriesScreen /></SpendV1Provider>;
}
