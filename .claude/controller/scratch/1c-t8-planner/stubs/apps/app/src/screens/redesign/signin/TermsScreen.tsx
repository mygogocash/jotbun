// 1C-T8 RED stub (R52): the terms step draws an empty View.
import { View } from 'react-native';

import type { PendingPolicy, PolicyClient } from '@mobile/spend/v1/policies';

export type TermsScreenProps = { pending: readonly PendingPolicy[]; client: PolicyClient; onAccepted(): void };

export function TermsScreen(_props: TermsScreenProps) {
  return <View />;
}
