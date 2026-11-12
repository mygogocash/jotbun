// The spending tab (P2-T31; bw-insights, es-empty-insights; W9, W24, R65, R71).
//
// - The month's money out at 36 in the wallet's money text (W9), with the
//   kit's `i` IconButton that explains the number in a tray, and, for this
//   month, the days left with today counted (bw-insights: 8 on Saturday 24
//   October). A month gone by has no days left to count, so it has no line.
// - MonthBars: six months from compareBars, the budget line on their scale.
// - The early state (es-empty-insights): fewer than 3 logged days shows the
//   early lines, each logged day by its date (dateStep), the next day to log,
//   `insights.noPrevious` when no earlier month has any money out, and the
//   categories so far.
// - The categories: the month's totals from its summary, in topCategories'
//   order, each with the count of the month's live expenses in it, opening
//   History filtered to it (R71).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useMoneyLocale } from '@mobile/screens/v1/parts';
import type { CalendarDay, CalendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { compareBars, topCategories } from '@mobile/spend/v1/redesign/insights/recapModel';
import { monthOf } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { shortDateLabel } from '@mobile/ui/dateStep';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { InfoTray } from './InfoTray';
import { isMoneyOut, unknownCategory } from './insightsData';
import type { InsightsData } from './insightsData';
import { MonthBars } from './MonthBars';

/** The chart compares once this many days are logged (`insights.earlyBody`). */
export const EARLY_DAYS = 3;

function InfoGlyph({ color }: { color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={1.6} />
        <Path d="M12 11v5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={12} cy={7.8} r={1.2} fill={color} />
      </Svg>
    </View>
  );
}

/** Fewer than three logged days: what the chart needs, and the days logged so far by their dates. */
function EarlyState({ logged, today }: { logged: readonly CalendarDay[]; today: string }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const dateLocale = useActiveLocale();
  return (
    <View testID="insights-early-state" style={{ backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <WalletText role="label" accessibilityRole="header" style={{ fontWeight: '700' }}>{t('insights.earlyTitle', { n: EARLY_DAYS - logged.length })}</WalletText>
        <WalletText role="caption" tone="quiet">{t('insights.earlyBody')}</WalletText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: EARLY_DAYS }, (_, index) => {
          const day = logged[index];
          return (
            <View key={index} testID={`insights-early-day-${index}`} style={{ flex: 1, gap: 4 }}>
              <View {...DECORATIVE} style={{ height: 6, borderRadius: 3, backgroundColor: day ? colors.ink : colors.track }} />
              <WalletText role="caption" tone={day ? 'ink' : 'quiet'}>{day ? shortDateLabel(day.date, today, dateLocale) : t('insights.nextDay')}</WalletText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function SpendingTab({ data, calendar }: { data: InsightsData; calendar: CalendarModel }): ReactElement {
  const router = useRouter();
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const locale = useMoneyLocale();
  const dateLocale = useActiveLocale();
  const { hidden } = usePrivateMode();
  const [explaining, setExplaining] = useState(false);
  const { month, today, summary } = data;
  // Today is counted, as W9 counts the days left.
  const daysLeft = calendar.days.filter((day) => day.date >= today).length;
  const logged = calendar.days.filter((day) => day.logged);
  const early = logged.length < EARLY_DAYS;
  const bars = compareBars(data.compare, { shown: month, today, tc, locale, dateLocale });
  const earlier = data.compare.some((other) => other.month < month && BigInt(other.expenseMinor) > 0n);
  const top = topCategories(summary.categories, data.categories, tc, locale);
  const byId = new Map(data.categories.map((category) => [category.id, category]));

  return (
    <View testID="spending-tab" style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <WalletAmount minor={summary.expense_minor} size={36} testID="spending-hero-amount" />
          <IconButton label={t('insights.whatIsThis')} onPress={() => setExplaining(true)}>
            <InfoGlyph color={colors.quiet} />
          </IconButton>
        </View>
        {month === monthOf(today) ? (
          <WalletText role="label" tone="quietOnGround" testID="spending-days-left">{t('insights.daysToEnd', { n: daysLeft })}</WalletText>
        ) : null}
      </View>

      {early ? (
        <EarlyState logged={logged} today={today} />
      ) : (
        <MonthBars bars={bars} budgetMinor={summary.budget?.overall_limit_minor ?? null} hidden={hidden} />
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
        <WalletText role="h2" accessibilityRole="header">{t(early ? 'insights.soFar' : 'insights.categories')}</WalletText>
        {early && !earlier ? <WalletText role="caption" tone="quietOnGround" testID="insights-no-previous">{t('insights.noPrevious')}</WalletText> : null}
      </View>
      {top.length > 0 ? (
        <View testID="insights-categories" style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 }}>
          {top.map((item, index) => (
            <Pressable
              key={item.categoryId}
              accessibilityRole="link"
              testID={`category-row-${item.categoryId}`}
              onPress={() => router.push({ pathname: '/spend/all', params: { category: item.categoryId } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 9, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.hairline }}
            >
              <WalletCategoryIcon category={byId.get(item.categoryId) ?? unknownCategory(item.categoryId)} name={item.name} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <WalletText role="label">{item.name}</WalletText>
                <WalletText role="caption" tone="quiet">
                  {t('insights.entries', { count: data.records.filter((record) => isMoneyOut(record) && record.category_id === item.categoryId).length })}
                </WalletText>
              </View>
              <WalletAmount minor={item.minor} size={16} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <InfoTray visible={explaining} onClose={() => setExplaining(false)} />
    </View>
  );
}
