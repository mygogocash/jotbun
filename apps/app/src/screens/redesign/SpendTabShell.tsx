// The redesign's navigation shell (R3, decision D7): the kit TabBar under the
// spend screens, with Home and History as tabs and the centre add button
// opening Add. Budget joins under the `planning` area (R4); Insights joins in
// R5. The bar is a row of the layout, below the screen, never over it. It is
// hidden while adding, on a record, and on Wallets and Categories (opened
// from Budget), so those screens have the whole height and their own way back.
import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { TabBar } from '@mobile/ui/TabBar';
import type { TabBarItem } from '@mobile/ui/TabBar';

export type SpendTabKey = 'home' | 'history' | 'budget';
export type SpendTab = { visible: boolean; active: SpendTabKey | '' };

const ROUTES: Readonly<Record<SpendTabKey, '/spend' | '/spend/all' | '/spend/budget'>> = { home: '/spend', history: '/spend/all', budget: '/spend/budget' };
/** Screens that take the whole height: Add, a record (with its edit screens), and Wallets and Categories. */
const BAR_HIDDEN = new Set(['add', 'record', 'wallets', 'categories']);

/** Whether the bar shows on `pathname`, and which tab it selects ('' for none). */
export function spendTab(pathname: string): SpendTab {
  const parts = pathname.split('/').filter((part) => part !== '');
  if (parts[0] === 'spend' && parts.length > 1 && BAR_HIDDEN.has(parts[1])) return { visible: false, active: '' };
  const path = `/${parts.join('/')}`;
  if (path === ROUTES.home) return { visible: true, active: 'home' };
  if (path === ROUTES.history) return { visible: true, active: 'history' };
  if (path === ROUTES.budget) return { visible: true, active: 'budget' };
  return { visible: true, active: '' };
}

/** 24-unit line drawings in the colour of their ground; the tab's label carries the meaning. */
function TabIcon({ name, color }: { name: SpendTabKey; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {name === 'home' ? (
        <>
          <Path d="M3 11l9-7 9 7" {...stroke} />
          <Path d="M6 9.5V20h12V9.5" {...stroke} />
          <Path d="M10 20v-5h4v5" {...stroke} />
        </>
      ) : name === 'budget' ? (
        <>
          <Path d="M12 3a9 9 0 1 0 9 9h-9z" {...stroke} />
          <Path d="M15 3.5A9 9 0 0 1 20.5 9H15z" {...stroke} />
        </>
      ) : (
        <>
          <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" {...stroke} />
          <Path d="M9 8h6M9 12h6M9 16h3" {...stroke} />
        </>
      )}
    </Svg>
  );
}

export function SpendTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tc = useCopy();
  const colors = useBunColors();
  const tab = spendTab(pathname);
  const items: TabBarItem[] = [
    { key: 'home', label: tc('Home'), icon: ({ color }) => <TabIcon name="home" color={color} /> },
    { key: 'history', label: tc('History'), icon: ({ color }) => <TabIcon name="history" color={color} /> },
    ...(isRedesignEnabled('planning') ? [{ key: 'budget', label: tc('Budget'), icon: ({ color }: { color: string }) => <TabIcon name="budget" color={color} /> }] : []),
  ];
  const select = (key: string) => {
    if (key === tab.active || !(key in ROUTES)) return;
    router.navigate(ROUTES[key as SpendTabKey]);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>{children}</View>
      {tab.visible ? <TabBar items={items} active={tab.active} onSelect={select} onAdd={() => router.push('/spend/add')} addLabel={tc('Add an entry')} /> : null}
    </View>
  );
}
