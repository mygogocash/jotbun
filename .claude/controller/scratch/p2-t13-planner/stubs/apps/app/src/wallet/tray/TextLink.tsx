// RED stub (P2-T13): the interface, a plain named button. The real one is in the planner's real/.
import { Pressable, Text } from 'react-native';

export function TextLink({ label, onPress }: { label: string; onPress: () => void; tone?: 'violet' | 'ink' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
}
