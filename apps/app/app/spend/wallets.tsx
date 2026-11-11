import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { WalletsScreen } from '@mobile/screens/redesign/planning/WalletsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletsListScreen } from '@mobile/wallet/wallets/WalletsListScreen';

/** The Bun Wallet's wallets list (P2-T20); `?reorder=1` (Home's จัดเรียง) opens the reorder tray. */
function BunWalletWallets() {
  const { reorder } = useLocalSearchParams<{ reorder?: string }>();
  return <SpendV1Provider resources={getSharedV1Resources()}><WalletsListScreen openReorder={reorder === '1'} /></SpendV1Provider>;
}

/**
 * The Bun Wallet's list while the `wallet` area is on (W1). Otherwise R4
 * Planning's screen, only under the `planning` area (E2 checkpoint 2). Never
 * in the legacy build.
 */
export default function SpendWalletsRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (isRedesignEnabled('wallet')) return <BunWalletWallets />;
  if (!isRedesignEnabled('planning')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><WalletsScreen /></SpendV1Provider>;
}
