// R5 Insights (plan §6.3), the hub behind the Insights tab (decision D7) and
// the `insights` area (on since E2 checkpoint 3):
//
// - the lavender stage with the month switcher and the month's confirmed
//   money out (the number is the hero);
// - the calendar: a heatmap of money out per day for the month shown. Each
//   day up to today is a 44 pt button saying its date and exact money out (or
//   "Nothing logged") and opens History on that month; today is ringed and
//   named; days after today are inert;
// - the logging rhythm (decision D5): days logged in the month, and the last
//   seven days as dots. Forgiving and money-free: a skipped day is an open
//   ring and never resets anything. At full bun intensity a good week (five
//   days or more) gets the cheering bun; Quiet and Off never show it;
// - the ways on: the month's recap and the daily reminder.
//
// Every page of the month is read (`readAllPages`), and of the past week when
// it falls outside the month shown. Drafts on this device log their day, and
// their money out is said apart in the day's label, never added to the
// confirmed money. States: loading, each load problem (offline with the
// offline banner), an empty month (a kind empty state), a normal month, a
// past month, and "entries changed meanwhile" with Refresh. Coming back to
// the tab, or a draft resolving, refreshes in place.
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { formatMinor } from '@mobile/spend/v1/money';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { calendarModel, daysLoggedLine, readAllPages, rhythmModel, rhythmNeedsOwnRead, rhythmWindow } from '@mobile/spend/v1/redesign/insights/insightsModel';
import type { InsightsWords, RangeRead } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, monthRange, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { fullDateLabel, monthLabel } from '@mobile/ui/dateStep';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import { useLoad, useMoneyLocale } from '../../v1/parts';
import { LoadingBlock, Notice } from '../HistoryParts';
import { CalendarCard, LinkRow, RhythmCard } from './InsightsParts';

export type InsightsScreenProps = {
  /** The clock (tests and the catalogue pin it); today is its Bangkok date. */
  now?: Date;
};

/** What one load read: the month shown, and the past week when it lies outside that month. */
type InsightsData = { month: string; today: string; monthRead: RangeRead; weekRead: RangeRead | null };

const NO_DRAFTS: readonly OutboxCommand[] = [];

const historyOf = (month: string): Href => ({ pathname: '/spend/all', params: { month } });
const recapOf = (month: string): Href => ({ pathname: '/spend/recap/[month]', params: { month } });

/** Reloads in place whenever a draft the screen was showing resolves (sent, discarded or undone). */
function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

export function InsightsScreen({ now }: InsightsScreenProps) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useActiveLocale();
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);

  const loaded = useLoad<InsightsData>(async () => {
    const read = ({ from, through }: { from: string; through: string }) =>
      readAllPages((cursor) => resources.history({ from, through, sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT));
    const [monthRead, weekRead] = await Promise.all([
      read(monthRange(month)),
      rhythmNeedsOwnRead(month, today) ? read(rhythmWindow(today)) : Promise.resolve(null),
    ]);
    return { month, today, monthRead, weekRead };
  }, [resources, month, today]);
  const { refresh } = loaded;

  // Coming back to the tab refreshes in place; the first focus is the first load.
  const focusedBefore = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedBefore.current) refresh();
    focusedBefore.current = true;
  }, [refresh]));
  useRefreshOnResolve(diaryView.outbox, refresh);

  const drafts = diary && diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS;
  // Data read for another month or day is never shown as this one's (a month step renders once before its load starts).
  const data = loaded.state === 'ready' && loaded.data.month === month && loaded.data.today === today ? loaded.data : null;
  const words = useMemo<InsightsWords>(() => ({ tc, locale, fullDate: (date) => fullDateLabel(date, dateLocale) }), [tc, locale, dateLocale]);
  const calendar = useMemo(() => (data ? calendarModel({ month, today, records: data.monthRead.records, drafts, words }) : null), [data, month, today, drafts, words]);
  const rhythm = useMemo(() => (data ? rhythmModel({ today, records: (data.weekRead ?? data.monthRead).records, drafts, tc }) : null), [data, today, drafts, tc]);

  const monthName = monthLabel(month, dateLocale);
  const problem = loaded.state === 'error' ? classifyLoadProblem(loaded.error, tc) : null;
  const unreachable = loaded.state === 'error' && loaded.error instanceof V1Error && loaded.error.outcome === 'network';
  // Offline is said only where entries are kept on this phone.
  const offline = unreachable && diary !== null && diaryView.phase === 'ready';
  const changedMeanwhile = data !== null && (data.monthRead.refreshSuggested || (data.weekRead?.refreshSuggested ?? false));
  const moneyOut = data ? `${tc('Money out')} ${formatMinor(data.monthRead.summary.expense_minor, locale)}` : null;
  const daysLine = calendar ? daysLoggedLine(calendar.daysLogged, { month, thisMonth, monthName, tc }) : null;

  return (
    <View testID="insights-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }}>
        <StageHeader
          title={tc('Insights')}
          month={{
            label: monthName,
            onPrevious: () => setMonth(shiftMonth(month, -1)),
            // Entries are never in the future, so there is nothing after this month.
            onNext: month < thisMonth ? () => setMonth(shiftMonth(month, 1)) : undefined,
          }}
        >
          {moneyOut ? (
            <BunText testID="insights-month-out" variant="heading" tone="ink" accessibilityLabel={moneyOut} style={{ fontVariant: ['tabular-nums'] }}>{moneyOut}</BunText>
          ) : null}
        </StageHeader>
        <View style={{ paddingVertical: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {offline || problem || changedMeanwhile || !data ? (
            <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
              {offline ? <SyncBanner state="offline" /> : null}
              {problem ? <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} /> : null}
              {changedMeanwhile ? <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: refresh }} /> : null}
              {!problem && !data ? <LoadingBlock label={tc('Loading your diary')} /> : null}
            </View>
          ) : null}
          {calendar && !calendar.empty ? (
            <CalendarCard calendar={calendar} locale={dateLocale} onOpenDay={() => router.push(historyOf(month))} />
          ) : null}
          {calendar?.empty ? (
            <View style={{ paddingHorizontal: BUN_SPACE.md }}>
              <EmptyState
                // EmptyState leaves the art (and its space) out when the bun is off.
                art={<Bun pose="thinking" size="l" testID="insights-empty-bun" />}
                title={tc('No entries in this month')}
                body={tc('Entries you add for this month show up here.')}
                action={{ label: tc('Add an entry'), onPress: () => router.push('/spend/add') }}
              />
            </View>
          ) : null}
          <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
            {rhythm ? <RhythmCard rhythm={rhythm} daysLine={daysLine} cheer={intensity === 'full' && rhythm.goodWeek} locale={dateLocale} /> : null}
            <LinkRow label={month === thisMonth ? tc("This month's recap") : tc('Recap for {month}', { month: monthName })} onPress={() => router.push(recapOf(month))} />
            <LinkRow label={tc('Daily reminder')} onPress={() => router.push('/spend/reminders')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
