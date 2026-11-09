import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import { AddTransactionScreen } from '@mobile/screens/v1/AddTransactionScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

// The redesigned Quick add is the default since its screenshots were approved
// (E2 checkpoint 1); `-core` in the redesign flag brings back the v1 form.
export default function SpendAddRoute() {
  const redesign = isRedesignEnabled('core');
  return <SpendV1Provider resources={getSharedV1Resources()}>{redesign ? <QuickAddScreen /> : <AddTransactionScreen />}</SpendV1Provider>;
}
