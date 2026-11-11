import { Redirect, useLocalSearchParams } from 'expo-router';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { LockSetupScreen } from '@mobile/wallet/lock/LockSetupScreen';

/** P2-T33: the Face ID lock's setup (sa-lock-setup), only under the `wallet` area; `?setup=1` is the setup checklist's step. */
export default function LockRoute() {
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  if (!isRedesignEnabled('wallet')) return <Redirect href="/settings" />;
  return <LockSetupScreen setup={setup === '1'} />;
}
