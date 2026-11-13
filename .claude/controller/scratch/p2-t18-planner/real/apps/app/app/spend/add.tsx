import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { QuickAddScreen } from '@mobile/screens/redesign/QuickAddScreen';
import { AddTransactionScreen } from '@mobile/screens/v1/AddTransactionScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { useAddTray } from '@mobile/wallet/add/AddTrayHost';
import { addRequestOf } from '@mobile/wallet/home/shellRoutes';

// The redesigned Quick add is the default since its screenshots were approved
// (E2 checkpoint 1); `-core` in the redesign flag brings back the v1 form. In
// the wallet area (P2-T18), where the spend layout mounts the wallet shell, a
// link to /spend/add opens the add tray over Home instead.
export default function SpendAddRoute() {
  if (isRedesignEnabled('wallet') && !isLegacySpendEnabled()) return <WalletAdd />;
  const redesign = isRedesignEnabled('core');
  return <SpendV1Provider resources={getSharedV1Resources()}>{redesign ? <QuickAddScreen /> : <AddTransactionScreen />}</SpendV1Provider>;
}

/** Opens the shell's add tray with what the link names, then goes to Home under it; once. */
function WalletAdd() {
  const tray = useAddTray();
  const router = useRouter();
  const params = useLocalSearchParams();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    tray.open(addRequestOf(params));
    router.replace('/spend');
  }, [tray, router, params]);
  return null;
}
