import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { RecapScreen } from '@mobile/screens/redesign/insights/RecapScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletRecapScreen } from '@mobile/wallet/recap/WalletRecapScreen';

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** R5 Insights: a month's recap, only under the `insights` area (E2 checkpoint 3) and for a real `YYYY-MM`. */
export default function SpendRecapRoute() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  if (isLegacySpendEnabled() || !isRedesignEnabled('insights')) return <Redirect href="/spend" />;
  if (typeof month !== 'string' || !MONTH.test(month)) return <Redirect href="/spend/insights" />;
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      {isRedesignEnabled('wallet') ? <WalletRecapScreen month={month} /> : <RecapScreen month={month} />}
    </SpendV1Provider>
  );
}
