import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled } from '@mobile/config/featureFlags';
import { CustomerSpendAllScreen } from '@mobile/screens/CustomerSpendAllScreen';
import { TransactionsScreen } from '@mobile/screens/v1/TransactionsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

export default function SpendAllRoute() {
  if (isLegacySpendEnabled()) return <CustomerSpendAllScreen />;
  return <SpendV1Provider resources={getSharedV1Resources()}><TransactionsScreen /></SpendV1Provider>;
}
