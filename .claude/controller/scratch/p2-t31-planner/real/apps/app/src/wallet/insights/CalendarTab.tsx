// Calendar tab of Bun Wallet insights (P2-T31, wc-calendar, R65).
import type { EntryDto, Minor, TransactionDto } from '@gogospend/contracts';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { daysInMonth } from '@mobile/spend/v1/redesign/shared';
import { calendarModel, type CalendarDay } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { monthLabel } from '@mobile/ui/dateStep';
import { monthOf, shiftMonth } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { calendarPaint, type CalendarStep } from '@mobile/theme/walletPalette';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { calendarShade } from './calendarShade';
import { COPY } from './copy';
import type { InsightsData } from './insightsData';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
const LEGEND_STEPS: readonly CalendarStep[] = [0, 1, 2, 3, 4, 5];
const LEGEND_LABELS = ['0', '≤200', '≤500', '≤1,000', '≤2,000', '2,000+'] as const;

export function CalendarTab({
  data,
  month,
  today,
  onMonthChange,
}: {
  data: InsightsData;
  month: string;
  today: string;
  onMonthChange: (month: string) => void;
}): ReactElement {
  const colors = useWalletColors();
  const isDark = colors.isDark;
  const tc = useCopy();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);
  const { hidden } = usePrivateMode();

  const currentMonth = monthOf(today);
  const isCurrentMonth = month === currentMonth;

  // Selected date defaults to today if current month, else first day of month
  const [selectedDay, setSelectedDay] = useState<string>(
    isCurrentMonth ? today : `${month}-01`,
  );

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

  const totalDays = daysInMonth(month);
  const daysCounted = isCurrentMonth ? Number.parseInt(today.slice(8), 10) : totalDays;
  const spentMinor = data.summary?.expense_minor ?? '0';

  // Transactions on the chosen day
  const dayRecords = useMemo(
    () =>
      data.records.filter(
        (r): r is EntryDto =>
          r.occurred_on === selectedDay && r.deleted_at === null && r.type === 'expense',
      ),
    [data.records, selectedDay],
  );

  const dayTotalMinor = useMemo(() => {
    let sum = 0n;
    for (const r of dayRecords) sum += BigInt(r.amount_minor);
    return sum.toString() as Minor;
  }, [dayRecords]);

  const monthName = monthLabel(month, dateLocale);
  const canGoNext = month < currentMonth;

  return (
    <View testID="calendar-tab" style={{ gap: 14 }}>
      {/* Month line and navigation */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 2 }}>
          <WalletText style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>
            {monthName}
          </WalletText>
          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
            {t('insights.monthLine', {
              amount: hidden ? '฿••••' : `฿${Math.round(Number(spentMinor) / 100).toLocaleString()}`,
              n: cal.daysLogged,
              d: daysCounted,
            })}
          </WalletText>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('insights.previousMonth')}
            testID="calendar-prev-month"
            onPress={() => onMonthChange(shiftMonth(month, -1))}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WalletText style={{ color: colors.ink, fontSize: 16 }}>‹</WalletText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('insights.nextMonth')}
            accessibilityState={{ disabled: !canGoNext }}
            testID="calendar-next-month"
            disabled={!canGoNext}
            onPress={() => {
              if (canGoNext) onMonthChange(shiftMonth(month, 1));
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.hairline,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canGoNext ? 1 : 0.4,
            }}
          >
            <WalletText style={{ color: colors.ink, fontSize: 16 }}>›</WalletText>
          </Pressable>
        </View>
      </View>

      {/* Weekday initials */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {WEEKDAYS.map((day, idx) => (
          <WalletText
            key={idx}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 12,
              color: colors.quiet,
            }}
          >
            {day}
          </WalletText>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={{ gap: 6 }}>
        {cal.weeks.map((week, wIdx) => (
          <View key={wIdx} style={{ flexDirection: 'row', gap: 6 }}>
            {week.map((day, dIdx) => {
              if (!day) {
                return <View key={dIdx} style={{ flex: 1, minHeight: 50 }} />;
              }

              if (day.isFuture) {
                // Future days: drawn and inert
                return (
                  <View
                    key={day.date}
                    testID={`calendar-future-day-${day.dayOfMonth}`}
                    style={{
                      flex: 1,
                      minHeight: 50,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: colors.hairline,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <WalletText style={{ fontSize: 14, color: colors.quiet }}>
                      {day.dayOfMonth}
                    </WalletText>
                  </View>
                );
              }

              // Active/Past day button (at least 50 pt)
              const step = calendarShade(day.outMinor);
              const paint = calendarPaint(step, isDark);
              const outNum = Math.round(Number(day.outMinor) / 100);
              const bahtText = outNum > 0 ? outNum.toLocaleString() : '';
              const isToday = day.isToday;

              const bg = hidden ? colors.raised : paint.fill;
              const textColor = hidden ? colors.ink : paint.text;
              const borderColor = isToday ? colors.ink : paint.border ?? 'transparent';
              const borderWidth = isToday ? 2 : paint.border ? 1 : 0;

              const spoken = isToday
                ? `${day.dayOfMonth} ${monthName} วันนี้`
                : `${day.dayOfMonth} ${monthName}`;

              return (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={spoken}
                  testID={`calendar-day-${day.dayOfMonth}`}
                  onPress={() => setSelectedDay(day.date)}
                  style={{
                    flex: 1,
                    minHeight: 50,
                    borderRadius: 12,
                    backgroundColor: bg,
                    borderWidth,
                    borderColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                  }}
                >
                  <WalletText style={{ fontSize: 14, fontWeight: '700', color: textColor }}>
                    {day.dayOfMonth}
                  </WalletText>
                  {!hidden && bahtText ? (
                    <WalletText
                      style={{ fontSize: 10, fontWeight: '500', color: textColor }}
                      testID={`calendar-day-amount-${day.dayOfMonth}`}
                    >
                      {bahtText}
                    </WalletText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={t('insights.legend')}
        testID="calendar-legend"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 6,
          marginTop: 4,
        }}
      >
        <WalletText style={{ fontSize: 11, color: colors.quiet, minWidth: 32 }}>
          {hidden ? '' : 'บาท\nต่อวัน'}
        </WalletText>
        {LEGEND_STEPS.map((step, idx) => {
          const paint = calendarPaint(step, isDark);
          return (
            <View key={step} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View
                style={{
                  width: '100%',
                  height: 12,
                  borderRadius: 4,
                  backgroundColor: paint.fill,
                  borderWidth: paint.border ? 1 : 0,
                  borderColor: paint.border ?? 'transparent',
                }}
                testID={`legend-swatch-${step}`}
              />
              {!hidden ? (
                <WalletText
                  style={{ fontSize: 10, color: colors.quiet }}
                  testID={`legend-label-${step}`}
                >
                  {LEGEND_LABELS[idx]}
                </WalletText>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Chosen Day's Records */}
      <View
        testID="calendar-chosen-day-section"
        style={{
          backgroundColor: colors.card,
          borderRadius: 22,
          padding: 16,
          gap: 12,
          marginTop: 6,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <WalletText style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
            {selectedDay === today
              ? `${selectedDay.slice(8)} ${monthName} · วันนี้`
              : `${selectedDay.slice(8)} ${monthName}`}
          </WalletText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <WalletText style={{ fontSize: 13, color: colors.quiet }}>
              {t('insights.entries', { count: dayRecords.length })}
            </WalletText>
            <WalletAmount minor={dayTotalMinor} size={16} />
          </View>
        </View>

        {dayRecords.map((record, idx) => {
          const categoryObj = data.categories.find((c) => c.id === record.category_id);
          const isLast = idx === dayRecords.length - 1;

          return (
            <View
              key={record.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: colors.hairline,
              }}
              testID={`day-record-${record.id}`}
            >
              {categoryObj ? (
                <WalletCategoryIcon
                  category={categoryObj}
                  name={categoryObj.label ?? categoryObj.builtin_key ?? ''}
                  size={36}
                />
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
                <WalletText style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                  {record.merchant ?? record.note ?? categoryObj?.label ?? 'รายการ'}
                </WalletText>
                <WalletText style={{ fontSize: 12, color: colors.quiet }}>
                  {categoryObj?.label ?? ''}
                </WalletText>
              </View>
              <WalletAmount minor={record.amount_minor} size={16} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
