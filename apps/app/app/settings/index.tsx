import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { SettingsScreen } from '@mobile/screens/redesign/account/SettingsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R6: only under the `account` area (E2 checkpoint 4). */
export default function SettingsRoute() {
  if (!isRedesignEnabled('account')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><SettingsScreen /></SpendV1Provider>;
}
