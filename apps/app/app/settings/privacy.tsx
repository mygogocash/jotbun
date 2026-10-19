import { Redirect } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { PrivacyScreen } from '@mobile/screens/redesign/account/PrivacyScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R6: only under the `account` area (E2 checkpoint 4). */
export default function PrivacyRoute() {
  if (!isRedesignEnabled('account')) return <Redirect href="/spend" />;
  return <SpendV1Provider resources={getSharedV1Resources()}><PrivacyScreen /></SpendV1Provider>;
}
