// In & Out tab of Bun Wallet insights (P2-T31, W21).
// Money in (violet, plus), money out (ink), kept/short from keptOf, six paired bars.
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { keptOf } from '@mobile/spend/v1/redesign/insights/recapModel';
import { monthLabel } from '@mobile/ui/dateStep';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletAmount } from '../money/WalletAmount';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import type { InsightsData } from './insightsData';

export function InOutTab({
  data,
  month,
  today,
}: {
  data: InsightsData;
  month: string;
  today: string;
}): ReactElement {
  const colors = useWalletColors();
  const tc = useCopy();
  const dateLocale = useActiveLocale();
  const t = useDraftCopy(COPY);
  const { hidden } = usePrivateMode();

  const incomeMinor = data.summary?.income_minor ?? '0';
  const expenseMinor = data.summary?.expense_minor ?? '0';

  const kept = useMemo(
    () => keptOf(incomeMinor, expenseMinor, tc, 'th'),
    [incomeMinor, expenseMinor, tc],
  );

  // Maximum value among all months' income and expense for chart scaling
  const maxMinor = useMemo(() => {
    let top = 0n;
    for (const s of data.compare) {
      const inc = BigInt(s.income_minor);
      const exp = BigInt(s.expense_minor);
      if (inc > top) top = inc;
      if (exp > top) top = exp;
    }
    return top === 0n ? 1n : top;
  }, [data.compare]);

  return (
    <View testID="in-out-tab" style={{ gap: 14 }}>
      {/* Cards for Money In and Money Out */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Money In: violet, plus */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            gap: 6,
          }}
        >
          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
            {t('insights.moneyIn')}
          </WalletText>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <WalletText style={{ fontSize: 28, fontWeight: '700', color: colors.violet }}>
              +
            </WalletText>
            <WalletAmount minor={incomeMinor} size={28} tone="violet" />
          </View>
        </View>

        {/* Money Out: ink */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            gap: 6,
          }}
        >
          <WalletText style={{ fontSize: 13, color: colors.quiet }}>
            {t('insights.moneyOut')}
          </WalletText>
          <WalletAmount minor={expenseMinor} size={28} tone="ink" />
        </View>
      </View>

      {/* Kept or short banner */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <WalletText style={{ fontSize: 14, color: colors.ink }}>
          {hidden ? '฿••••' : kept.text}
        </WalletText>
      </View>

      {/* Six paired bars */}
      <View
        accessible={true}
        accessibilityRole="image"
        testID="in-out-paired-bars"
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 16,
        }}
      >
        <Svg width="100%" height={140} viewBox="0 0 300 140" aria-hidden={true}>
          {data.compare.map((s, index) => {
            const pairWidth = 36;
            const barWidth = 14;
            const gap = 4;
            const spacing = 12;
            const x = 8 + index * (pairWidth + spacing);

            const incRatio = Number((BigInt(s.income_minor) * 1000n) / maxMinor) / 1000;
            const expRatio = Number((BigInt(s.expense_minor) * 1000n) / maxMinor) / 1000;

            const incHeight = Math.max(4, Math.round(incRatio * 110));
            const expHeight = Math.max(4, Math.round(expRatio * 110));

            const isCurrent = s.month === month;

            return (
              <G key={s.month}>
                {/* Money In bar: violet */}
                <Rect
                  x={x}
                  y={130 - incHeight}
                  width={barWidth}
                  height={incHeight}
                  rx={4}
                  ry={4}
                  fill={colors.violet}
                  testID={`paired-in-${s.month}`}
                />
                {/* Money Out bar: ink/barNow for current, barPast for others */}
                <Rect
                  x={x + barWidth + gap}
                  y={130 - expHeight}
                  width={barWidth}
                  height={expHeight}
                  rx={4}
                  ry={4}
                  fill={isCurrent ? colors.barNow : colors.barPast}
                  testID={`paired-out-${s.month}`}
                />
              </G>
            );
          })}
        </Svg>

        {/* Month labels */}
        <View
          aria-hidden={true}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 6,
            paddingHorizontal: 8,
          }}
        >
          {data.compare.map((s) => {
            const shortName = monthLabel(s.month, dateLocale).slice(0, 4);
            const isCurrent = s.month === month;
            return (
              <WalletText
                key={s.month}
                style={{
                  fontSize: 12,
                  color: isCurrent ? colors.ink : colors.quiet,
                  fontWeight: isCurrent ? '700' : '400',
                  textAlign: 'center',
                  width: 36,
                }}
              >
                {shortName}
              </WalletText>
            );
          })}
        </View>
      </View>
    </View>
  );
}
