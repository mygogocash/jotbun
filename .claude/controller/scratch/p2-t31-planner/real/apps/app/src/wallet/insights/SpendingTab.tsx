import type { Minor } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
import { compareBars, topCategories } from '@mobile/spend/v1/redesign/insights/recapModel';
import { calendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { monthOf } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { InfoTray } from './InfoTray';
import type { InsightsData } from './insightsData';
import { MonthBars } from './MonthBars';

export function SpendingTab({
  data,
  month,
  today,
}: {
  data: InsightsData;
  month: string;
  today: string;
}): ReactElement {
  const router = useRouter();
  const colors = useWalletColors();
  const tc = useCopy();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);
  const { hidden } = usePrivateMode();
  const [infoOpen, setInfoOpen] = useState(false);

  const spentMinor = data.summary?.expense_minor ?? '0';
  const currentMonth = monthOf(today);
  const isCurrentMonth = month === currentMonth;

  // Days left calculation
  const totalDays = daysInMonth(month);
  const todayDayNum = isCurrentMonth ? Number.parseInt(today.slice(8), 10) : totalDays;
  const daysLeft = Math.max(0, totalDays - todayDayNum);

  // Calendar model to check days logged
  const words = useMemo(
    () => ({
      tc,
      locale: 'th' as const,
      fullDate: (date: string) => date,
    }),
    [tc],
  );

  const cal = useMemo(
    () =>
      calendarModel({
        month,
        today,
        records: data.records,
        drafts: data.drafts,
        words,
      }),
    [month, today, data.records, data.drafts, words],
  );

  const daysLogged = cal.daysLogged;
  const isEarly = daysLogged < 3;

  // Compare bars for MonthBars
  const bars = useMemo(() => {
    const monthSpends = data.compare.map((s) => ({
      month: s.month,
      expenseMinor: s.expense_minor,
    }));
    return compareBars(monthSpends, {
      shown: month,
      today,
      tc,
      locale: 'th',
      dateLocale,
    });
  }, [data.compare, month, today, tc, dateLocale]);

  // Top categories
  const categoriesList = useMemo(() => {
    let categoryTotals = data.summary?.categories ?? [];
    if (categoryTotals.length === 0 && data.records.length > 0) {
      const sumByCat = new Map<string, bigint>();
      for (const r of data.records) {
        if (!r.deleted_at && r.type === 'expense' && r.category_id) {
          sumByCat.set(r.category_id, (sumByCat.get(r.category_id) ?? 0n) + BigInt(r.amount_minor));
        }
      }
      categoryTotals = [...sumByCat.entries()].map(([category_id, total]) => ({
        category_id,
        type: 'expense' as const,
        total_minor: total.toString() as Minor,
      }));
    }
    return topCategories(categoryTotals, data.categories, tc, 'th');
  }, [data.summary?.categories, data.records, data.categories, tc]);

  // Count active transactions per category from records
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of data.records) {
      if (record.deleted_at === null && record.type === 'expense' && record.category_id) {
        counts.set(record.category_id, (counts.get(record.category_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [data.records]);

  // Check if earlier months exist for early state
  const hasEarlierMonth = data.compare.some(
    (m) => m.month < month && BigInt(m.expense_minor) > 0n,
  );

  return (
    <View style={{ gap: 14 }}>
      {/* Spent amount at 36 with Info button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <WalletAmount minor={spentMinor} size={36} testID="spending-hero-amount" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('insights.whatIsThis')}
          testID="spending-info-button"
          onPress={() => setInfoOpen(true)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: colors.quiet,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WalletText style={{ fontSize: 14, fontWeight: '700', color: colors.quiet }}>i</WalletText>
          </View>
        </Pressable>
      </View>

      {/* Days left in month */}
      <WalletText style={{ fontSize: 14, color: colors.quiet, marginTop: -4 }}>
        {t('insights.daysToEnd', { n: daysLeft })}
      </WalletText>

      {/* Chart: Early state or MonthBars */}
      {isEarly ? (
        <View
          testID="insights-early-state"
          style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            gap: 12,
          }}
        >
          <View style={{ gap: 4 }}>
            <WalletText style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
              {t('insights.earlyTitle', { n: 3 - daysLogged })}
            </WalletText>
            <WalletText style={{ fontSize: 14, color: colors.quiet, lineHeight: 20 }}>
              {t('insights.earlyBody')}
            </WalletText>
          </View>

          {/* Progress segments: 3 days */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {[0, 1, 2].map((idx) => {
              const filled = idx < daysLogged;
              return (
                <View key={idx} style={{ flex: 1, gap: 4 }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: filled ? colors.ink : colors.raised,
                    }}
                  />
                  <WalletText
                    style={{
                      fontSize: 12,
                      color: filled ? colors.ink : colors.quiet,
                      textAlign: 'center',
                    }}
                  >
                    {filled ? `${today.slice(8)} ${month.slice(5)}` : t('insights.nextDay')}
                  </WalletText>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <MonthBars
          bars={bars}
          budgetMinor={data.summary?.budget?.overall_limit_minor ?? null}
          hidden={hidden}
        />
      )}

      {/* Categories header and list */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <WalletText style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>
          {t('insights.categories')}
        </WalletText>
        {isEarly && !hasEarlierMonth ? (
          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
            {t('insights.noPrevious')}
          </WalletText>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 2,
        }}
      >
        {categoriesList.map((cat, idx) => {
          const categoryObj = data.categories.find((c) => c.id === cat.categoryId);
          const count = categoryCounts.get(cat.categoryId) ?? 1;
          const isLast = idx === categoriesList.length - 1;

          return (
            <Pressable
              key={cat.categoryId}
              accessibilityRole="link"
              testID={`category-row-${cat.categoryId}`}
              onPress={() => router.push({ pathname: '/spend/all', params: { category: cat.categoryId } })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: colors.hairline,
              }}
            >
              {categoryObj ? (
                <WalletCategoryIcon category={categoryObj} name={cat.name} size={36} />
              ) : (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: colors.raised,
                  }}
                />
              )}
              <View style={{ flex: 1 }}>
                <WalletText style={{ fontSize: 15, fontWeight: '500', color: colors.ink }}>
                  {cat.name}
                </WalletText>
                <WalletText style={{ fontSize: 12, color: colors.quiet }}>
                  {t('insights.entries', { count })}
                </WalletText>
              </View>
              <WalletAmount minor={cat.minor} size={16} />
            </Pressable>
          );
        })}
      </View>

      <InfoTray visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </View>
  );
}
