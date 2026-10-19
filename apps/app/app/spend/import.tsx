import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { CustomerSpendImportScreen } from '@mobile/screens/CustomerSpendImportScreen';
import { ImportScreen } from '@mobile/screens/redesign/import/ImportScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/**
 * The development legacy build keeps its import screen. The redesigned
 * journey (R7) shows only under the `import` area (E2 checkpoint 5); uploads
 * themselves stay off on the server until the import release.
 */
export default function SpendImportRoute() {
  if (isLegacySpendEnabled()) return <CustomerSpendImportScreen />;
  if (!isRedesignEnabled('import')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><ImportScreen /></SpendV1Provider>;
}
