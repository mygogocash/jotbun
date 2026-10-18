import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled } from '@mobile/config/featureFlags';
import { CustomerSpendScreen } from '@mobile/screens/CustomerSpendScreen';
import { HomeScreen } from '@mobile/screens/v1/HomeScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

export default function SpendHomeRoute() {
  if (isLegacySpendEnabled()) return <CustomerSpendScreen />;
  return <SpendV1Provider resources={getSharedV1Resources()}><HomeScreen /></SpendV1Provider>;
}
