// The six months' bars (P2-T31, bw-insights; W4, W9, W24, R65).
//
// - react-native-svg (W4): past months in `barPast`, this month in `barNow`,
//   and the dashed `guideLine` at the month's budget (W24).
// - One scale from one baseline for the bars and the line: the taller of the
//   largest month and the budget reaches the top, so a month under budget
//   stands below the line by its true share. Exact integer maths on satang;
//   only the drawn height, a whole number of units, is a JS number.
// - One accessible element named `insights.chartName` that reads each bar's
//   `compareBars().spoken`, or in private mode only the name and the months
//   (R65). The budget label is the wallet's money text (W9), ฿•••• in private
//   mode. The months under the bars are dateStep's short names (พ.ค.).
import type { Minor } from '@gogospend/contracts';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import type { CompareBar } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { monthLabel, monthShortLabel } from '@mobile/ui/dateStep';
import { useDraftCopy } from '../copy/useDraftCopy';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

/** The charts' drawing box: their bars stand on `baseline` and reach at most `rise` above it. */
export const CHART = { width: 300, height: 140, baseline: 130, rise: 110 } as const;
/** A month with money out never draws flat. */
const MIN_RISE = 3;

/** How far above the baseline `minor` reaches when `ceiling` (never below `minor`) reaches the full rise. */
export function riseOf(minor: Minor, ceiling: bigint): number {
  const value = BigInt(minor);
  if (value <= 0n) return 0;
  const rise = Number((value * BigInt(CHART.rise)) / ceiling);
  return rise < MIN_RISE ? MIN_RISE : rise;
}

/** The larger of two exact amounts. */
export function larger(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function MonthBars({ bars, budgetMinor, hidden }: { bars: readonly CompareBar[]; budgetMinor: Minor | null; hidden: boolean }): ReactElement {
  const colors = useWalletColors();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);
  // A budget's limit is always above zero (the contract's rule), so a month with one has a line.
  const budget = budgetMinor;
  // One scale for the bars and the line: the taller of the largest month and the budget is the top.
  const ceiling = bars.reduce((top, bar) => larger(top, BigInt(bar.minor)), budget === null ? 0n : BigInt(budget));
  const name = t('insights.chartName', { from: monthLabel(bars[0].month, dateLocale), to: monthLabel(bars[bars.length - 1].month, dateLocale) });
  const spoken = `${name}: ${bars.map((bar) => (hidden ? bar.label : bar.spoken)).join(', ')}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={spoken}
      testID="insights-month-bars"
      style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 6 }}
    >
      {budget !== null ? (
        <WalletText role="caption" tone="quiet" testID="insights-budget-label" style={{ alignSelf: 'flex-end' }}>
          {t('insights.budget', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(budget) })}
        </WalletText>
      ) : null}
      <Svg width="100%" height={CHART.height} viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
        {budget !== null ? (
          <Line
            testID="budget-guideline"
            x1={8}
            x2={CHART.width - 8}
            y1={CHART.baseline - riseOf(budget, ceiling)}
            y2={CHART.baseline - riseOf(budget, ceiling)}
            stroke={colors.guideLine}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        ) : null}
        {bars.map((bar, index) => {
          const rise = riseOf(bar.minor, ceiling);
          return (
            <Rect
              key={bar.month}
              testID={`month-bar-${bar.month}`}
              x={14 + index * 48}
              y={CHART.baseline - rise}
              width={32}
              height={rise}
              rx={8}
              fill={bar.current ? colors.barNow : colors.barPast}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {bars.map((bar) => (
          <WalletText
            key={bar.month}
            role="caption"
            tone={bar.current ? 'ink' : 'quiet'}
            testID={`month-name-${bar.month}`}
            style={{ flex: 1, textAlign: 'center', fontWeight: bar.current ? '700' : '400' }}
          >
            {monthShortLabel(bar.month, dateLocale)}
          </WalletText>
        ))}
      </View>
    </View>
  );
}
