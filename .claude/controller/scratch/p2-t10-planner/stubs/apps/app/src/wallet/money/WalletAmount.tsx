// RED stub (P2-T10): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';

import { Text } from '@mobile/theme/AppText';
import type { MoneySign } from './walletMoney';

export type WalletAmountSize = 58 | 44 | 36 | 34 | 28 | 22 | 17 | 16 | 13;
export type WalletAmountTone = 'ink' | 'quiet' | 'violet' | 'under' | 'over';

export type WalletAmountProps = {
  minor: Minor;
  sign?: MoneySign;
  exact?: boolean;
  size: WalletAmountSize;
  tone?: WalletAmountTone;
  color?: string;
  label?: string;
  testID?: string;
};

export function WalletAmount({ minor, testID }: WalletAmountProps) {
  return <Text testID={testID}>{minor}</Text>;
}
