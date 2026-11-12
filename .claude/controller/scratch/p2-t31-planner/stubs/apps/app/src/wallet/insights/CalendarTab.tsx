import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { InsightsData } from './insightsData';

export function CalendarTab(_props: {
  data: InsightsData;
  month: string;
  today: string;
  onMonthChange: (month: string) => void;
}): ReactElement {
  return <View testID="calendar-tab" />;
}
