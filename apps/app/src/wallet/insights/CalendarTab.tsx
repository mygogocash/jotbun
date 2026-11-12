// The calendar tab (P2-T31, wc-calendar; W9, W22, R65).
//
// - The month with previous and next (the kit's IconButton; next is disabled
//   once the month is this month) and the month line: its money out in the
//   wallet's money text (W9), the days logged and the days so far.
// - Sunday-first weekday initials, in the person's language (dateStep).
// - A 50 pt button for each day up to today, at least 44 pt wide on a 375 pt
//   phone: its number and its money out in whole baht without ฿ (by BigInt,
//   rounded down, as W9's per-day figures are), shaded by
//   calendarPaint(calendarShade(out)), in DM Sans as wc-calendar draws them.
//   Its label is calendarModel's: the whole date, today named, the day's money
//   out and any drafts said apart. Today is framed 2 pt in ink. Days after
//   today are drawn and inert, and hidden from screen readers.
// - Private mode (W10, D41, R65): every day is one neutral fill (`raised` with
//   `ink` numbers) with no amount and no border but today's frame, and says
//   its date alone; the month line masks its amount; the legend keeps its
//   swatches, with no values and no unit.
// - The largest text sizes: the grid's numbers stop at iOS's largest standard
//   size, as a fixed bar's words do (largeTextScale.ts), and a cell grows
//   taller rather than cut them. The chosen day below, in the wallet's roles,
//   carries the same facts at every size.
// - The chosen day: its date as wc-calendar writes it (dateStep), its entries
//   and money out, and each record with its category and wallet.
import type { CategoryDto, EntryDto, Minor, WalletDto } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { CalendarDay, CalendarModel } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { categoryName, monthOf, shiftMonth } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { CALENDAR_STEP_LIMITS_BAHT, calendarPaint } from '@mobile/theme/walletPalette';
import type { CalendarStep } from '@mobile/theme/walletPalette';
import { walletLineHeight } from '@mobile/theme/walletType';
import { DECORATIVE } from '@mobile/ui/a11y';
import { fullDateLabel, monthLabel, shortDateLabel, weekdayInitials } from '@mobile/ui/dateStep';
import { LARGEST_STANDARD_SCALE } from '@mobile/ui/largeTextScale';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletCategoryIcon } from '../looks/WalletCategoryIcon';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, perDayText, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { calendarShade } from './calendarShade';
import { COPY } from './copy';
import { isMoneyOut, unknownCategory } from './insightsData';
import type { InsightsData } from './insightsData';

/** Seven columns on a 375 pt phone: 375 less two 18 pt gutters and six 4 pt gaps leaves 45 pt a day. */
const CELL_GAP = 4;
const CELL = { flex: 1, minWidth: 44, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 } as const;
const STEPS: readonly CalendarStep[] = [0, 1, 2, 3, 4, 5];

/** A day's money out in whole baht, without ฿: W9's per-day figure, rounded down by BigInt. */
const dayBaht = (minor: Minor): string => perDayText(minor).slice(1);

/** The legend's values, from the steps' own limits: 0, ≤200, ≤500, ≤1,000, ≤2,000 and 2,000+. */
function legendValue(step: CalendarStep): string {
  const limits: readonly number[] = CALENDAR_STEP_LIMITS_BAHT;
  if (step === 0) return '0';
  if (step < limits.length) return `≤${dayBaht(`${limits[step]}00`)}`;
  return `${dayBaht(`${limits[limits.length - 1]}00`)}+`;
}

/** The grid's numbers in DM Sans (wc-calendar). They stop at iOS's largest standard size; the cell grows instead. */
function GridText({ size, weight, color, testID, children }: { size: 14 | 11 | 10; weight: '500' | '700'; color: string; testID?: string; children: string }) {
  return (
    <Text
      testID={testID}
      maxFontSizeMultiplier={LARGEST_STANDARD_SCALE}
      style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: weight, fontSize: size, lineHeight: walletLineHeight(size, 'latin'), color, textAlign: 'center' }}
    >
      {children}
    </Text>
  );
}

function Chevron({ forward, color }: { forward: boolean; color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d={forward ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function DayButton({ day, chosen, onChoose }: { day: CalendarDay; chosen: boolean; onChoose: (date: string) => void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const dateLocale = useActiveLocale();
  const { hidden } = usePrivateMode();
  // In private mode every day is drawn alike, so none stands out by what was spent.
  const paint = hidden ? { fill: colors.raised, text: colors.ink, border: null } : calendarPaint(calendarShade(day.outMinor), colors.isDark);
  // Today is framed 2 pt in ink; otherwise only an empty day keeps its hairline.
  const frame = day.isToday ? { borderWidth: 2, borderColor: colors.ink } : paint.border !== null ? { borderWidth: 1, borderColor: paint.border } : { borderWidth: 0 };
  const date = fullDateLabel(day.date, dateLocale);
  const label = hidden ? (day.isToday ? `${tc('Today')}, ${date}` : date) : day.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
      aria-selected={chosen}
      testID={`calendar-day-${day.dayOfMonth}`}
      onPress={() => onChoose(day.date)}
      style={{ ...CELL, backgroundColor: paint.fill, ...frame }}
    >
      <GridText size={14} weight="700" color={paint.text}>{String(day.dayOfMonth)}</GridText>
      {!hidden && BigInt(day.outMinor) > 0n ? (
        <GridText size={10} weight="500" color={paint.text} testID={`calendar-day-amount-${day.dayOfMonth}`}>{dayBaht(day.outMinor)}</GridText>
      ) : null}
    </Pressable>
  );
}

function DayRecord({ record, first, categories, wallets }: { record: EntryDto; first: boolean; categories: readonly CategoryDto[]; wallets: readonly WalletDto[] }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const category = categories.find((item) => item.id === record.category_id);
  const categoryText = category ? categoryName(category, tc) : tc('Category');
  const wallet = wallets.find((item) => item.id === record.wallet_id);
  return (
    <View
      testID={`day-record-${record.id}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 7, borderTopWidth: first ? 0 : 1, borderTopColor: colors.hairline }}
    >
      <WalletCategoryIcon category={category ?? unknownCategory(record.category_id)} name={categoryText} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <WalletText role="label" style={{ fontWeight: '700' }}>{record.merchant ?? record.note ?? categoryText}</WalletText>
        <WalletText role="caption" tone="quiet">{wallet ? `${categoryText} · ${wallet.name}` : categoryText}</WalletText>
      </View>
      <WalletAmount minor={record.amount_minor} size={16} />
    </View>
  );
}

export function CalendarTab({ data, calendar, onMonthChange }: {
  data: InsightsData;
  calendar: CalendarModel;
  onMonthChange: (month: string) => void;
}): ReactElement {
  const colors = useWalletColors();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);
  const { hidden } = usePrivateMode();
  const { month, today } = data;
  const thisMonth = monthOf(today);
  const [chosen, setChosen] = useState(() => (month === thisMonth ? today : `${month}-01`));
  const daysSoFar = calendar.days.filter((day) => !day.isFuture).length;
  const chosenRecords = data.records.filter((record): record is EntryDto => isMoneyOut(record) && record.occurred_on === chosen);
  const chosenOut = chosenRecords.reduce((sum, record) => sum + BigInt(record.amount_minor), 0n).toString();
  const heading = shortDateLabel(chosen, today, dateLocale);

  return (
    <View testID="calendar-tab" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <WalletText role="h2" accessibilityRole="header">{monthLabel(month, dateLocale)}</WalletText>
          <WalletText role="caption" tone="quietOnGround" testID="calendar-month-line">
            {t('insights.monthLine', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(data.summary.expense_minor), n: calendar.daysLogged, d: daysSoFar })}
          </WalletText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton label={t('insights.previousMonth')} onPress={() => onMonthChange(shiftMonth(month, -1))}>
            <Chevron forward={false} color={colors.ink} />
          </IconButton>
          <IconButton label={t('insights.nextMonth')} disabled={month >= thisMonth} onPress={() => onMonthChange(shiftMonth(month, 1))}>
            <Chevron forward color={colors.ink} />
          </IconButton>
        </View>
      </View>

      <View {...DECORATIVE} style={{ flexDirection: 'row', gap: CELL_GAP }}>
        {weekdayInitials(dateLocale).map((initial, index) => (
          <WalletText key={index} role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} style={{ flex: 1, minWidth: 44, textAlign: 'center' }}>
            {initial}
          </WalletText>
        ))}
      </View>

      <View testID="calendar-grid" style={{ gap: CELL_GAP }}>
        {calendar.weeks.map((week, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: CELL_GAP }}>
            {week.map((day, index) => {
              if (day === null) return <View key={`blank-${index}`} {...DECORATIVE} style={{ flex: 1, minWidth: 44 }} />;
              if (day.isFuture) {
                return (
                  <View
                    key={day.date}
                    {...DECORATIVE}
                    testID={`calendar-future-day-${day.dayOfMonth}`}
                    style={{ ...CELL, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairline }}
                  >
                    <GridText size={14} weight="500" color={colors.quietOnGround}>{String(day.dayOfMonth)}</GridText>
                  </View>
                );
              }
              return <DayButton key={day.date} day={day} chosen={day.date === chosen} onChoose={setChosen} />;
            })}
          </View>
        ))}
      </View>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={hidden ? t('insights.legendToday') : `${t('insights.legend')} ${t('insights.legendToday')}`}
        testID="calendar-legend"
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
      >
        {hidden ? null : (
          <WalletText role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} testID="legend-unit">
            {t('insights.perDay')}
          </WalletText>
        )}
        {STEPS.map((step) => {
          const paint = calendarPaint(step, colors.isDark);
          return (
            <View key={step} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View
                testID={`legend-swatch-${step}`}
                style={{ alignSelf: 'stretch', height: 12, borderRadius: 4, backgroundColor: paint.fill, borderWidth: paint.border === null ? 0 : 1, borderColor: paint.border ?? 'transparent' }}
              />
              {hidden ? null : <GridText size={11} weight="500" color={colors.quietOnGround} testID={`legend-label-${step}`}>{legendValue(step)}</GridText>}
            </View>
          );
        })}
      </View>

      <View testID="calendar-chosen-day-section" style={{ backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8 }}>
          <WalletText role="label" accessibilityRole="header" testID="calendar-chosen-day" style={{ fontWeight: '700' }}>
            {chosen === today ? `${heading} · ${t('insights.today')}` : heading}
          </WalletText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <WalletText role="caption" tone="quiet">{t('insights.entries', { count: chosenRecords.length })}</WalletText>
            <WalletAmount minor={chosenOut} size={17} testID="calendar-chosen-day-total" />
          </View>
        </View>
        {chosenRecords.map((record, index) => (
          <DayRecord key={record.id} record={record} first={index === 0} categories={data.categories} wallets={data.wallets} />
        ))}
      </View>
    </View>
  );
}
