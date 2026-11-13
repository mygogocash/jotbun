import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { isLegacySpendEnabled, isRedesignEnabled } from '@mobile/config/featureFlags';
import { RecordScreen } from '@mobile/screens/redesign/RecordScreen';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';

/** One entry (redesign R3). Only with the `core` redesign flag; otherwise the list. */
export default function SpendRecordRoute() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  if (isLegacySpendEnabled() || !isRedesignEnabled('core') || typeof id !== 'string' || id === '') return <Redirect href="/spend/all" />;
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      <RecordScreen key={id} id={id} mode={mode === 'edit' ? 'edit' : 'view'} />
    </SpendV1Provider>
  );
}
