// The Bun Wallet 6-month compare bars chart (P2-T31, bw-insights, W4, W24).
// Drawn using react-native-svg: barPast for past months, barNow for this month,
// dashed guideLine for the budget line. One accessible element with spoken label.
import type { Minor } from '@gogospend/contracts';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { compareBars, type CompareBar } from '@mobile/spend/v1/redesign/insights/recapModel';
import { monthLabel } from '@mobile/ui/dateStep';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export function MonthBars(props: {
  bars: readonly CompareBar[];
  budgetMinor: Minor | null;
  hidden: boolean;
}): ReactElement {
  const { bars, budgetMinor, hidden } = props;
  const colors = useWalletColors();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);

  const fromMonth = bars.length > 0 ? monthLabel(bars[0].month, dateLocale) : '';
  const toMonth = bars.length > 0 ? monthLabel(bars[bars.length - 1].month, dateLocale) : '';
  const chartName = t('insights.chartName', { from: fromMonth, to: toMonth });

  const spokenLabel = useMemo(() => {
    if (hidden) {
      // In private mode: only the chart's name and the months, with no amount (R65).
      return `${chartName}: ${bars.map((b) => b.label).join(', ')}`;
    }
    return `${chartName}: ${bars.map((b) => b.spoken).join(', ')}`;
  }, [hidden, chartName, bars]);

  // Compute budget y position relative to the bars' scale
  const budgetLineY = useMemo(() => {
    if (!budgetMinor || BigInt(budgetMinor) <= 0n) return null;
    const maxVal = bars.reduce((top, b) => (BigInt(b.minor) > top ? BigInt(b.minor) : top), 0n);
    const ceiling = BigInt(budgetMinor) > maxVal ? BigInt(budgetMinor) : maxVal;
    if (ceiling === 0n) return 100;
    const ratio = Number((BigInt(budgetMinor) * 1000n) / ceiling) / 1000;
    // Map ratio 0..1 to SVG y 125..20 (higher value = smaller y)
    return Math.round(125 - ratio * 105);
  }, [bars, budgetMinor]);

  return (
    <View
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={spokenLabel}
      testID="insights-month-bars"
      style={{
        position: 'relative',
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
      }}
    >
      {budgetMinor && BigInt(budgetMinor) > 0n ? (
        <WalletText
          aria-hidden={true}
          style={{
            position: 'absolute',
            right: 16,
            top: 14,
            fontSize: 11,
            color: colors.quiet,
          }}
        >
          {t('insights.budget', {
            amount: hidden ? '฿••••' : formatMinor(budgetMinor, 'th'),
          })}
        </WalletText>
      ) : null}

      <Svg width="100%" height={140} viewBox="0 0 300 140" aria-hidden={true}>
        {budgetLineY !== null ? (
          <Line
            x1="8"
            y1={budgetLineY}
            x2="292"
            y2={budgetLineY}
            stroke={colors.guideLine}
            strokeWidth="1.5"
            strokeDasharray="4 4"
            testID="budget-guideline"
          />
        ) : null}

        {bars.map((bar, index) => {
          const barWidth = 32;
          const spacing = 16;
          const x = 12 + index * (barWidth + spacing);
          const barHeight = Math.max(6, Math.round((bar.permille / 1000) * 105));
          const y = 130 - barHeight;
          const fill = bar.current ? colors.barNow : colors.barPast;

          return (
            <Rect
              key={bar.month}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={8}
              ry={8}
              fill={fill}
              testID={`month-bar-${bar.month}`}
            />
          );
        })}
      </Svg>

      <View
        aria-hidden={true}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 6,
          paddingHorizontal: 12,
        }}
      >
        {bars.map((bar) => {
          const shortName = monthLabel(bar.month, dateLocale).slice(0, 4);
          return (
            <WalletText
              key={bar.month}
              style={{
                fontSize: 12,
                color: bar.current ? colors.ink : colors.quiet,
                fontWeight: bar.current ? '700' : '400',
                textAlign: 'center',
                width: 32,
              }}
            >
              {shortName}
            </WalletText>
          );
        })}
      </View>
    </View>
  );
}
