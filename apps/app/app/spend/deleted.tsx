import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { RecentlyDeletedScreen } from '@mobile/screens/redesign/RecentlyDeletedScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** Recently deleted (redesign plan §6.1), opened from History. Only with the `core` redesign flag; otherwise the list. */
export default function SpendDeletedRoute() {
  if (isLegacySpendEnabled() || !isRedesignEnabled('core')) return <Redirect href="/spend/all" />;
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      <RecentlyDeletedScreen />
    </SpendV1Provider>
  );
}
