// RED stub (P2-T13): the interface only. The real module is in the planner's real/.
import { createContext } from 'react';
import { View } from 'react-native';

export type LockCover = { hidden: boolean };

export const LockCoverContext = createContext<LockCover>({ hidden: false });

export function useLockCover(): LockCover {
  return { hidden: false };
}

export function LockCoverArt() {
  return <View testID="lock-cover" />;
}
