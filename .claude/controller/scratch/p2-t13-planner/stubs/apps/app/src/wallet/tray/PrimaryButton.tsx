// RED stub (P2-T13): the interface, a plain named button. The real one is in the planner's real/.
import { Pressable, Text } from 'react-native';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  testID?: string;
};

export function PrimaryButton({ label, onPress, testID }: PrimaryButtonProps) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
}
