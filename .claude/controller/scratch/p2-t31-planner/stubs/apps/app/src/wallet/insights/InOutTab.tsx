import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { InsightsData } from './insightsData';

export function InOutTab(_props: {
  data: InsightsData;
  month: string;
  today: string;
}): ReactElement {
  return <View testID="in-out-tab" />;
}
