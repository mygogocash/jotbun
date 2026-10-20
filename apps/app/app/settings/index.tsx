import { Redirect } from 'expo-router';
import { useState } from 'react';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { appAccountServices } from '@mobile/screens/redesign/account/accountServices';
import { SettingsScreen } from '@mobile/screens/redesign/account/SettingsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** R6: only under the `account` area (E2 checkpoint 4), with the app's own account services. */
export default function SettingsRoute() {
  if (!isRedesignEnabled('account')) return <Redirect href="/spend" />;
  return <SettingsWithServices />;
}

function SettingsWithServices() {
  const [services] = useState(appAccountServices);
  return <SpendV1Provider resources={getSharedV1Resources()}><SettingsScreen services={services} /></SpendV1Provider>;
}
