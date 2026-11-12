import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { CategoriesScreen } from '@mobile/screens/redesign/planning/CategoriesScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R4 Planning: only under the `planning` area (E2 checkpoint 2), never in the legacy build. */
export default function SpendCategoriesRoute() {
  if (isLegacySpendEnabled() || !isRedesignEnabled('planning')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><CategoriesScreen /></SpendV1Provider>;
}
