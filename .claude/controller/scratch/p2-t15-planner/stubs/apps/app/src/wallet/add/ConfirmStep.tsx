// RED stub (P2-T15): the plan's interface, with no behaviour yet.
import { View } from 'react-native';

import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import type { WalletT } from '../copy/draftText';
import type { AddType, ConfirmRow, StepProps } from './addFlow';

export function confirmTitle(_draft: QuickAddDraft, _rows: readonly ConfirmRow[], _t: WalletT): string {
  return '';
}

export function ConfirmStep(_props: StepProps & { rows: readonly ConfirmRow[]; title: string; bunSentence: string | null; type: AddType; lookups: Lookups }) {
  return <View testID="confirm-step" />;
}
