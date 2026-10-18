import { useLocalSearchParams, useRouter } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { CustomerSpendAllScreen } from '@mobile/screens/CustomerSpendAllScreen';
import { HistoryScreen } from '@mobile/screens/redesign/HistoryScreen';
import { TransactionsScreen } from '@mobile/screens/v1/TransactionsScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** The redesigned History behind the `core` redesign flag; the current list otherwise. */
function RedesignedHistory() {
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month?: string }>();
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      {/* The month lives in the URL, so Back from a record returns to the same month. */}
      <HistoryScreen initialMonth={typeof month === 'string' ? month : undefined} onMonthChange={(next) => router.setParams({ month: next })} />
    </SpendV1Provider>
  );
}

export default function SpendAllRoute() {
  if (isLegacySpendEnabled()) return <CustomerSpendAllScreen />;
  if (isRedesignEnabled('core')) return <RedesignedHistory />;
  return <SpendV1Provider resources={getSharedV1Resources()}><TransactionsScreen /></SpendV1Provider>;
}
