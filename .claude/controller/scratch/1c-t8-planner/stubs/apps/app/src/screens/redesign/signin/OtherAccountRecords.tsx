// 1C-T8 RED stub (R52): the keep-or-erase choice draws an empty View.
import { View } from 'react-native';

import type { OtherAccountChoice } from '@mobile/auth/sessionEnded';

export type OtherAccountRecordsProps = { unsent: number; onChoice(choice: OtherAccountChoice): Promise<void> };

export function OtherAccountRecords(_props: OtherAccountRecordsProps) {
  return <View />;
}
