// The Bun Wallet insights screen (P2-T31, bw-insights, wc-calendar, es-empty-insights).
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { trackInsightsViewed } from '@mobile/analytics/events';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { LoadingBlock, Notice } from '@mobile/screens/redesign/HistoryParts';
import { monthLabel } from '@mobile/ui/dateStep';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_SPACE } from '@mobile/ui/layout';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import { CalendarTab } from './CalendarTab';
import { COPY } from './copy';
import { InOutTab } from './InOutTab';
import { useInsightsData, type InsightsTab } from './insightsData';
import { SpendingTab } from './SpendingTab';

const TABS: readonly { key: InsightsTab; labelKey: 'insights.tabSpending' | 'insights.tabInOut' | 'insights.tabCalendar' }[] = [
  { key: 'spending', labelKey: 'insights.tabSpending' },
  { key: 'in_out', labelKey: 'insights.tabInOut' },
  { key: 'calendar', labelKey: 'insights.tabCalendar' },
];

export function WalletInsightsScreen(props: { now?: Date }): ReactElement {
  const colors = useWalletColors();
  const tc = useCopy();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);

  const today = todayInBangkok(props.now ?? new Date());
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [tab, setTab] = useState<InsightsTab>('spending');

  // Analytics (R61): first tab shown, and each tab change, calls trackInsightsViewed({ tab })
  useEffect(() => {
    trackInsightsViewed({ tab });
  }, [tab]);

  const load = useInsightsData(month, today);
  const monthName = monthLabel(month, dateLocale);

  return (
    <View testID="wallet-insights-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 56, paddingBottom: 40, gap: 14 }}
      >
        {/* Screen Title */}
        <WalletText style={{ fontSize: 32, fontWeight: '700', color: colors.ink, lineHeight: 40 }}>
          {t('insights.title')}
        </WalletText>

        {/* Three 44 pt tabs (role="tab") */}
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            gap: 22,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
          }}
        >
          {TABS.map((item) => {
            const selected = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                testID={`insights-tab-${item.key}`}
                onPress={() => setTab(item.key)}
                style={{
                  minHeight: 44,
                  borderBottomWidth: selected ? 2.5 : 0,
                  borderBottomColor: colors.ink,
                  justifyContent: 'center',
                  paddingHorizontal: 0,
                }}
              >
                <WalletText
                  style={{
                    fontSize: 16,
                    fontWeight: selected ? '700' : '400',
                    color: selected ? colors.ink : colors.quiet,
                  }}
                >
                  {t(item.labelKey)}
                </WalletText>
              </Pressable>
            );
          })}
        </View>

        {/* Month and monthly text badge */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <WalletText style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
            {monthName}
          </WalletText>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: colors.raised,
            }}
          >
            <WalletText style={{ fontSize: 13, fontWeight: '500', color: colors.violet }}>
              {t('insights.monthly')}
            </WalletText>
          </View>
        </View>

        {/* State handling: loading / error / ready */}
        {load.state === 'loading' ? (
          <View style={{ paddingVertical: 20 }}>
            <LoadingBlock label={tc('Loading your diary')} />
          </View>
        ) : null}

        {load.state === 'error' ? (
          <View style={{ gap: BUN_SPACE.md, paddingVertical: 10 }}>
            {load.error instanceof Error && load.error.message.includes('network') ? (
              <SyncBanner state="offline" />
            ) : null}
            <Notice
              tone="alert"
              message={load.problem.message}
              action={load.problem.retry ? { label: tc('Try again'), onPress: load.reload } : undefined}
            />
          </View>
        ) : null}

        {load.state === 'ready' ? (
          <>
            {tab === 'spending' ? (
              <SpendingTab data={load.data} month={month} today={today} />
            ) : null}
            {tab === 'in_out' ? (
              <InOutTab data={load.data} month={month} today={today} />
            ) : null}
            {tab === 'calendar' ? (
              <CalendarTab
                data={load.data}
                month={month}
                today={today}
                onMonthChange={setMonth}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
