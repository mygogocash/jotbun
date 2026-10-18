import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import { AddTransactionScreen } from '@mobile/screens/v1/AddTransactionScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

// The redesigned Quick add stays behind the `core` redesign flag until its
// screenshots are approved (E2); the current form remains the default.
export default function SpendAddRoute() {
  const redesign = isRedesignEnabled('core');
  return <SpendV1Provider resources={getSharedV1Resources()}>{redesign ? <QuickAddScreen /> : <AddTransactionScreen />}</SpendV1Provider>;
}
