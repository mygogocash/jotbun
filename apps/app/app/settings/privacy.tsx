import { Redirect } from 'expo-router';
import { useState } from 'react';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { PrivacyScreen } from '@mobile/screens/redesign/account/PrivacyScreen';
import { appPrivacyServices } from '@mobile/screens/redesign/account/privacyServices';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R6: only under the `account` area (E2 checkpoint 4), with the app's own export and deletion services. */
export default function PrivacyRoute() {
  if (!isRedesignEnabled('account')) return <Redirect href="/spend" />;
  return <PrivacyWithServices />;
}

function PrivacyWithServices() {
  const [services] = useState(appPrivacyServices);
  return <SpendV1Provider resources={getSharedV1Resources()}><PrivacyScreen services={services} /></SpendV1Provider>;
}
