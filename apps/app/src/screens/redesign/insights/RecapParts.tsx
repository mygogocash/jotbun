// Pieces of the month recap (R5, plan §6.3): the printed slip and the compare
// bars. Built from the kit, BunText and the useBunColors() tokens only.
//
// - The slip is the kit's ReceiptSlip: spent, the budget line when the month
//   had one, earned, the top categories, the days logged, and kept as the
//   total (or in kind words when nothing was kept). Every row speaks its
//   label with its exact amount ("Spent, ฿13,962.51").
// - The bars are a named radio group, one row per month: the month and its
//   exact money out in words, then a bar that only repeats them (decoration,
//   hidden from screen readers). Each row is at least 44 pt. The month shown
//   is an ink bar under bold words with an ink outline, so the choice is never
//   colour alone; this month says "so far".
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import type { CompareBar, RecapFacts } from '@mobile/spend/v1/redesign/insights/recapModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { AmountText } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { ReceiptRow, ReceiptSlip, ReceiptTotal } from '@mobile/ui/ReceiptSlip';

const BOLD = { fontWeight: '700' } as const;
/** The bar's thickness; the row around it keeps the 44 pt target. */
const BAR = 10;

export function RecapSlip({ facts }: { facts: RecapFacts }) {
  const tc = useCopy();
  const { budget, top, kept } = facts;
  return (
    <ReceiptSlip title={facts.monthTitle}>
      <ReceiptRow label={tc('Spent')} value={facts.spentText} />
      {budget ? <ReceiptRow label={tc('Budget')} value={budget.value} /> : null}
      {budget?.note ? <BunText variant="caption">{budget.note}</BunText> : null}
      <ReceiptRow label={tc('Earned')} value={facts.earnedText} />
      {top.length > 0 ? (
        <View style={{ gap: BUN_SPACE.sm }}>
          <BunText variant="label" role="heading" accessibilityRole="header" style={BOLD}>{tc('Top categories')}</BunText>
          {top.map((category) => <ReceiptRow key={category.categoryId} label={category.name} value={category.amountText} />)}
        </View>
      ) : null}
      <ReceiptRow label={tc('Days logged')} value={facts.days.text} />
      {kept.kind === 'kept'
        ? <ReceiptTotal label={tc('Kept')} minor={kept.minor} />
        : <ReceiptRow label={tc('Kept')} value={kept.text} />}
    </ReceiptSlip>
  );
}

function BarRow({ bar, onChoose }: { bar: CompareBar; onChoose: (month: string) => void }) {
  const colors = useBunColors();
  const weight = bar.selected ? BOLD : undefined;
  return (
    <Pressable
      testID={`recap-bar-${bar.month}`}
      accessibilityRole="radio"
      accessibilityLabel={bar.spoken}
      accessibilityState={{ checked: bar.selected }}
      aria-checked={bar.selected}
      onPress={() => {
        if (!bar.selected) onChoose(bar.month);
      }}
      style={{
        minHeight: BUN_TOUCH,
        minWidth: BUN_TOUCH,
        justifyContent: 'center',
        gap: BUN_SPACE.xxs,
        paddingVertical: BUN_SPACE.xs,
        paddingHorizontal: BUN_SPACE.xs,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: BUN_OUTLINE.control,
        borderColor: bar.selected ? colors.ink : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: BUN_SPACE.xs }}>
        <BunText variant="label" style={[{ flexShrink: 1 }, weight]}>{bar.label}</BunText>
        <AmountText variant="label" style={weight}>{bar.amountText}</AmountText>
      </View>
      <View
        {...DECORATIVE}
        testID={`recap-bar-fill-${bar.month}`}
        style={{
          width: `${bar.permille / 10}%`,
          minWidth: 2,
          height: BAR,
          borderRadius: BUN_RADIUS.pill,
          borderWidth: 1,
          borderColor: colors.ink,
          backgroundColor: bar.selected ? colors.ink : colors.stage,
        }}
      />
    </Pressable>
  );
}

/** Six months of money out, oldest first, that double as the month picker. */
export function CompareBars({ bars, onChoose }: { bars: readonly CompareBar[]; onChoose: (month: string) => void }) {
  const tc = useCopy();
  return (
    <Card testID="recap-compare">
      <BunText variant="label" role="heading" accessibilityRole="header" style={BOLD}>{tc('Compare months')}</BunText>
      <View role="radiogroup" accessibilityLabel={tc('Choose a month')} style={{ gap: BUN_SPACE.xxs }}>
        {bars.map((bar) => <BarRow key={bar.month} bar={bar} onChoose={onChoose} />)}
      </View>
    </Card>
  );
}
