// RED stub (P2-T9): the plan's interface, with no behaviour yet: an empty
// track and fill, under the test ids the tests find them by.
import { View } from 'react-native';

export type GrowBarProps = { fraction: number; color: string; track: string; height?: number };

export function GrowBar(_props: GrowBarProps) {
  return (
    <View testID="grow-bar">
      <View testID="grow-bar-fill" />
    </View>
  );
}
