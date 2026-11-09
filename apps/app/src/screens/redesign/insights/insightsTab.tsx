// R5 Insights' tab (decision D7), behind the `insights` area (on since E2
// checkpoint 3): the tab shell asks for it, and gets nothing with the area off.
import type { ReactElement } from 'react';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { TabBarItem } from '@mobile/ui/TabBar';

export function insightsTab(tc: Translate, icon: (color: string) => ReactElement): TabBarItem | null {
  if (!isRedesignEnabled('insights')) return null;
  return { key: 'insights', label: tc('Insights'), icon: ({ color }) => icon(color) };
}
