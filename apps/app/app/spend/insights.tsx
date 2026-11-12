import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { InsightsScreen } from '@mobile/screens/redesign/insights/InsightsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletInsightsScreen } from '@mobile/wallet/insights/WalletInsightsScreen';

/** R5 Insights: the wallet area (WalletInsightsScreen), whatever the insights area says; otherwise legacy redirect or InsightsScreen. */
export default function SpendInsightsRoute() {
  if (isLegacySpendEnabled()) return <Redirect href="/spend" />;
  if (isRedesignEnabled('wallet')) {
    return (
      <SpendV1Provider resources={getSharedV1Resources()}>
        <WalletInsightsScreen />
      </SpendV1Provider>
    );
  }
  if (!isRedesignEnabled('insights')) return <Redirect href="/spend" />;
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      <InsightsScreen />
    </SpendV1Provider>
  );
}
