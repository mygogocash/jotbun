// RED stub (P2-T14): the real props, and no segments.
import { View } from 'react-native';

import type { AddType } from './addFlow';

export function TypeSwitchHeader(_props: { type: AddType; onType(type: AddType): void }) {
  return <View testID="type-switch" />;
}
