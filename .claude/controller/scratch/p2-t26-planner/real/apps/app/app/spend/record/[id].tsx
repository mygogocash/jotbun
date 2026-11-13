import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { RecordScreen } from '@mobile/screens/redesign/RecordScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { WalletRecordScreen } from '@mobile/wallet/records/WalletRecordScreen';

/** One entry (redesign R3; wallet plan P2-T26). Only with the `core` redesign flag; otherwise the list. The wallet area shows the Bun Wallet's record. */
export default function SpendRecordRoute() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  if (isLegacySpendEnabled() || !isRedesignEnabled('core') || typeof id !== 'string' || id === '') return <Redirect href="/spend/all" />;
  const opened = mode === 'edit' ? 'edit' : 'view';
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      {isRedesignEnabled('wallet') ? <WalletRecordScreen key={id} id={id} mode={opened} /> : <RecordScreen key={id} id={id} mode={opened} />}
    </SpendV1Provider>
  );
}
