// RED stub (P2-T15): the plan's interface, with no behaviour yet.
import type { Minor, WalletSnapshot } from '@gogospend/contracts';
import { View } from 'react-native';

import type { StepProps } from './addFlow';

export function TransferStep(_props: StepProps & { wallets: readonly WalletSnapshot[]; balances: ReadonlyMap<string, Minor> | null }) {
  return <View testID="transfer-step" />;
}

export function TransferFooter(_props: StepProps) {
  return null;
}
