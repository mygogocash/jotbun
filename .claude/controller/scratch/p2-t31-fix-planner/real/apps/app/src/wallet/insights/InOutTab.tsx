// The in-and-out tab (P2-T31, W21: no board, a draft for E2-C).
//
// - The month's money in (violet, with a plus) and money out (ink), in the
//   wallet's money text (W9).
// - What was kept, or how much more went out, as a sentence from keptOf's
//   kind. Private mode masks the amount, never the sentence (W10).
// - Six paired bars on one scale, money in (violet) beside money out (ink).
//   One accessible element named `insights.inOutName` that reads each month's
//   money in and out, or in private mode only the name and the months (R65).
import type { MonthSummary } from '@gogospend/contracts';
import { Fragment } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { useMoneyLocale } from '@mobile/screens/v1/parts';
import { formatMinor } from '@mobile/spend/v1/money';
import { keptOf } from '@mobile/spend/v1/redesign/insights/recapModel';
import type { Kept } from '@mobile/spend/v1/redesign/insights/recapModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { monthLabel, monthShortLabel } from '@mobile/ui/dateStep';
import type { WalletT } from '../copy/draftText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletAmount } from '../money/WalletAmount';
import { HIDDEN_AMOUNT, walletMoneyText } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import type { CompareMonth, InsightsData } from './insightsData';
import { CHART, larger, riseOf } from './MonthBars';

/** "เก็บได้ ฿21,027.50", "จ่ายออกมากกว่ารับเข้า ฿1,200" or the even line, with the amount masked in private mode. */
function keptLine(kept: Kept, hidden: boolean, t: WalletT, tc: Translate): string {
  if (kept.kind === 'even') return kept.text;
  // A short month's difference is below zero; the money text with no sign draws its size.
  const amount = hidden ? HIDDEN_AMOUNT : walletMoneyText(kept.minor);
  return kept.kind === 'kept' ? t('insights.kept', { amount }) : tc('{amount} more went out than came in', { amount });
}

function PairedBars({ compare, month, hidden }: { compare: readonly CompareMonth[]; month: string; hidden: boolean }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const dateLocale = useActiveLocale();
  const locale = useMoneyLocale();
  const ceiling = compare.reduce((top, other) => larger(larger(top, BigInt(other.incomeMinor)), BigInt(other.expenseMinor)), 0n);
  const name = t('insights.inOutName', { from: monthLabel(compare[0].month, dateLocale), to: monthLabel(compare[compare.length - 1].month, dateLocale) });
  const months = compare.map((other) => (hidden
    ? monthLabel(other.month, dateLocale)
    : t('insights.inOutMonth', { month: monthLabel(other.month, dateLocale), in: formatMinor(other.incomeMinor, locale), out: formatMinor(other.expenseMinor, locale) })));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}: ${months.join(', ')}`}
      testID="in-out-paired-bars"
      style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 6 }}
    >
      <Svg width="100%" height={CHART.height} viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
        {compare.map((other, index) => {
          const x = 14 + index * 48;
          const inRise = riseOf(other.incomeMinor, ceiling);
          const outRise = riseOf(other.expenseMinor, ceiling);
          return (
            <Fragment key={other.month}>
              <Rect testID={`paired-in-${other.month}`} x={x} y={CHART.baseline - inRise} width={15} height={inRise} rx={4} fill={colors.violet} />
              <Rect testID={`paired-out-${other.month}`} x={x + 17} y={CHART.baseline - outRise} width={15} height={outRise} rx={4} fill={colors.barNow} />
            </Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {compare.map((other) => (
          <WalletText
            key={other.month}
            role="caption"
            tone={other.month === month ? 'ink' : 'quiet'}
            style={{ flex: 1, textAlign: 'center', fontWeight: other.month === month ? '700' : '400' }}
          >
            {monthShortLabel(other.month, dateLocale)}
          </WalletText>
        ))}
      </View>
    </View>
  );
}

export function InOutTab({ data }: { data: InsightsData }): ReactElement {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const locale = useMoneyLocale();
  const { hidden } = usePrivateMode();
  const summary: MonthSummary = data.summary;
  const kept = keptOf(summary.income_minor, summary.expense_minor, tc, locale);
  const card = { flexGrow: 1, flexBasis: 140, backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 4 } as const;
  return (
    <View testID="in-out-tab" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={card}>
          <WalletText role="caption" tone="quiet">{t('insights.moneyIn')}</WalletText>
          <WalletAmount minor={summary.income_minor} sign="income" size={28} testID="in-out-income" />
        </View>
        <View style={card}>
          <WalletText role="caption" tone="quiet">{t('insights.moneyOut')}</WalletText>
          <WalletAmount minor={summary.expense_minor} size={28} testID="in-out-expense" />
        </View>
      </View>
      <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
        <WalletText role="label" testID="in-out-kept">{keptLine(kept, hidden, t, tc)}</WalletText>
      </View>
      <PairedBars compare={data.compare} month={data.month} hidden={hidden} />
    </View>
  );
}
