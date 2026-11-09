// RED stub (P2-T10): the plan's interface, with no behaviour yet.
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

export function IconButton({ label, onPress, children }: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {children}
    </Pressable>
  );
}
