// The Bun Wallet insights screen (P2-T31; bw-insights, wc-calendar,
// es-empty-insights).
//
// - The heading, three 44 pt tabs (role tab), and on the spending and
//   in-and-out tabs the month with `insights.monthly` as text (months only in
//   phase 2). The calendar names the month itself, with its steps.
// - The first tab shown, then each tab chosen, sends one insights_viewed with
//   its InsightsTab (R61), from the tab rule.
// - One load for every tab (useInsightsData). Loading says so. A problem says
//   so with its title and words (recapProblem), Try again when a retry can
//   help, and the offline banner where entries are kept on this phone. A
//   refresh is quiet, so the tabs, the chosen day and an open tray stay.
// - When a later history page says the diary changed, the screen says so and
//   offers Refresh.
// - The month is the tabs' one month; the calendar steps it.
// - The page keeps clear of the status bar and the home indicator (the safe
//   area), as the wallets list does.
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trackInsightsViewed } from '@mobile/analytics/events';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useMoneyLocale } from '@mobile/screens/v1/parts';
import { calendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { fullDateLabel, monthLabel } from '@mobile/ui/dateStep';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { CalendarTab } from './CalendarTab';
import { COPY } from './copy';
import { InOutTab } from './InOutTab';
import { useInsightsData } from './insightsData';
import type { InsightsData, InsightsTab } from './insightsData';
import { SpendingTab } from './SpendingTab';

const INSIGHTS_COPY = { ...COMMON_COPY, ...COPY };
/** bw-insights' side gutters, and the 12 pt between the status bar and the heading (its 56 pt top on a 44 pt status bar). */
const GUTTER = 18;
const BELOW_STATUS_BAR = 12;

const TABS: readonly { tab: InsightsTab; label: 'insights.tabSpending' | 'insights.tabInOut' | 'insights.tabCalendar' }[] = [
  { tab: 'spending', label: 'insights.tabSpending' },
  { tab: 'in_out', label: 'insights.tabInOut' },
  { tab: 'calendar', label: 'insights.tabCalendar' },
];

type ShownTabProps = { tab: InsightsTab; month: string; data: InsightsData; drafts: readonly OutboxCommand[]; onMonthChange: (month: string) => void };

/** The tab shown, over one calendar of the month shown: drawn from the data read for that month, never another's. */
function ShownTab({ tab, month, data, drafts, onMonthChange }: ShownTabProps) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useActiveLocale();
  const words = useMemo(() => ({ tc, locale, fullDate: (date: string) => fullDateLabel(date, dateLocale) }), [tc, locale, dateLocale]);
  const calendar = useMemo(() => calendarModel({ month, today: data.today, records: data.records, drafts, words }), [month, data, drafts, words]);
  if (tab === 'in_out') return <InOutTab data={data} />;
  // A month step unmounts the calendar while that month loads, so its chosen day starts afresh.
  if (tab === 'calendar') return <CalendarTab data={data} calendar={calendar} onMonthChange={onMonthChange} />;
  return <SpendingTab data={data} calendar={calendar} />;
}

export function WalletInsightsScreen({ now }: { now?: Date }): ReactElement {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const tc = useCopy();
  const t = useDraftCopy(INSIGHTS_COPY);
  const dateLocale = useActiveLocale();
  const today = todayInBangkok(now ?? new Date());
  const [month, setMonth] = useState(() => monthOf(today));
  const [tab, setTab] = useState<InsightsTab>('spending');
  const load = useInsightsData(month, today);

  // R61: the first tab shown, then each tab chosen, sends one insights_viewed.
  useEffect(() => {
    trackInsightsViewed({ tab });
  }, [tab]);

  let body: ReactNode;
  if (load.state === 'loading') {
    body = <WalletText role="body" tone="quietOnGround" testID="insights-loading">{tc('Loading your diary')}</WalletText>;
  } else if (load.state === 'error') {
    body = (
      <View testID="insights-problem" style={{ gap: 12 }}>
        {load.offline ? <SyncBanner state="offline" /> : null}
        <WalletText role="h2" accessibilityRole="header">{load.problem.title}</WalletText>
        <WalletText role="body" tone="quietOnGround">{load.problem.message}</WalletText>
        {load.problem.retry ? <PrimaryButton label={t('common.tryAgain')} onPress={load.reload} testID="insights-try-again" /> : null}
      </View>
    );
  } else {
    body = (
      <>
        {load.data.refreshSuggested ? (
          <View testID="insights-changed" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8 }}>
            <WalletText role="caption" tone="quietOnGround" style={{ flexShrink: 1 }}>{tc('Entries changed since you opened this list.')}</WalletText>
            <TextLink label={tc('Refresh')} onPress={load.refresh} />
          </View>
        ) : null}
        <ShownTab tab={tab} month={month} data={load.data} drafts={load.drafts} onMonthChange={setMonth} />
      </>
    );
  }

  return (
    <View testID="wallet-insights-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: insets.top + BELOW_STATUS_BAR, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <WalletText role="h1" accessibilityRole="header">{t('insights.title')}</WalletText>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          {TABS.map((item) => {
            const selected = item.tab === tab;
            return (
              <Pressable
                key={item.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                testID={`insights-tab-${item.tab}`}
                onPress={() => setTab(item.tab)}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', borderBottomWidth: selected ? 2.5 : 0, borderBottomColor: colors.ink }}
              >
                <WalletText role="label" tone={selected ? 'ink' : 'quietOnGround'} style={{ fontWeight: selected ? '700' : '400' }}>{t(item.label)}</WalletText>
              </Pressable>
            );
          })}
        </View>
        {tab === 'calendar' ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <WalletText role="h2" testID="insights-month">{monthLabel(month, dateLocale)}</WalletText>
            <View style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' }}>
              <WalletText role="caption" tone="violet" style={{ fontWeight: '500' }}>{t('insights.monthly')}</WalletText>
            </View>
          </View>
        )}
        {body}
      </ScrollView>
    </View>
  );
}
