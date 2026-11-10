// RED stub (P2-T14): the real props, an empty step and footer, and Bun never offered.
import { View } from 'react-native';

import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import type { AddType, StepProps } from './addFlow';
import type { QuickChip } from './QuickChips';

export function useCanTellBun(): boolean {
  return false;
}

export function AmountStep(_props: StepProps & { type: AddType; lookups: Lookups; chips: readonly QuickChip[]; canTellBun: boolean; onTellBun(): void }) {
  return <View />;
}

export function AmountFooter(_props: StepProps & { type: AddType; problem: string | null }) {
  return <View />;
}
