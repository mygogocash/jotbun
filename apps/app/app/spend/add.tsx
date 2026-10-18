import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { AddTransactionScreen } from '@mobile/screens/v1/AddTransactionScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

export default function SpendAddRoute() {
  return <SpendV1Provider resources={getSharedV1Resources()}><AddTransactionScreen /></SpendV1Provider>;
}
