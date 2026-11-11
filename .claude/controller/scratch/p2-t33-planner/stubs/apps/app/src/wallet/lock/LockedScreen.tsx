// RED stub (P2-T33): the real props; draws nothing.
import { View } from 'react-native';

import type { LockMethod } from './lockModel';

export function LockedScreen(_props: { method: LockMethod; note: string | null; onUnlock(): void }) {
  return <View />;
}
