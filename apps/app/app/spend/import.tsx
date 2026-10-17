import { Redirect } from 'expo-router';

import { isLegacySpendEnabled } from '@mobile/config/featureFlags';
import { CustomerSpendImportScreen } from '@mobile/screens/CustomerSpendImportScreen';

/** Imports are not on the v1 API yet (P-tasks): only the development legacy build shows them. */
export default function SpendImportRoute() {
  if (!isLegacySpendEnabled()) return <Redirect href="/spend" />;
  return <CustomerSpendImportScreen />;
}
