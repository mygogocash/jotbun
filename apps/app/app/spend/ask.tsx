import { Redirect } from 'expo-router';

import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { AskBunScreen } from '@mobile/screens/redesign/ai/AskBunScreen';

/** Ask Bun: only under the `companion` area (premium plan A3), never in the legacy build. */
export default function SpendAskRoute() {
  if (isLegacySpendEnabled() || !isRedesignEnabled('companion')) return <Redirect href="/spend" />;
  return <AskBunScreen />;
}
