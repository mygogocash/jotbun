import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { InsightsScreen } from '@mobile/screens/redesign/insights/InsightsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R5 Insights: only under the `insights` area (E2 checkpoint 3), never in the legacy build. */
export default function SpendInsightsRoute() {
  if (isLegacySpendEnabled() || !isRedesignEnabled('insights')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><InsightsScreen /></SpendV1Provider>;
}
