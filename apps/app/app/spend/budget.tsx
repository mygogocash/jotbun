import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { BudgetScreen } from '@mobile/screens/redesign/planning/BudgetScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R4 Planning: only under the `planning` area (E2 checkpoint 2), never in the legacy build. */
export default function SpendBudgetRoute() {
  if (isLegacySpendEnabled() || !isRedesignEnabled('planning')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><BudgetScreen /></SpendV1Provider>;
}
