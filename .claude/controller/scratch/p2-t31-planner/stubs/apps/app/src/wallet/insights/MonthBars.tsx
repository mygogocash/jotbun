import type { Minor } from '@gogospend/contracts';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { CompareBar } from '@mobile/spend/v1/redesign/insights/recapModel';

export function MonthBars(_props: {
  bars: readonly CompareBar[];
  budgetMinor: Minor | null;
  hidden: boolean;
}): ReactElement {
  return <View testID="insights-month-bars" />;
}
