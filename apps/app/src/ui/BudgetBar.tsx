// "Left to spend" as a bar (redesign R2b). Presentational: the numbers and the
// state arrive worked out. The words lead ("฿420.00 a day left"), the bar
// only repeats them, and its colour is the one place green (under) and red
// (over) appear. The state is always spelled out too, so colour is never the
// only signal (WCAG 1.4.1).
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { budgetWords } from './budgetWords';
import type { BudgetPace } from './budgetWords';
import { useMoneyLocale } from './entryKitPrivate';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';

export type BudgetBarProps = BudgetPace;

export function BudgetBar(props: BudgetBarProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const words = budgetWords(props, tc, useMoneyLocale());
  const share = words.spentPermille;
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <BunText variant="heading" tone={words.tone === 'over' ? 'over' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>{words.headline}</BunText>
      {share !== null ? (
        <View
          role="progressbar"
          accessibilityLabel={tc('Budget')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(share / 10)}
          aria-valuetext={words.spoken}
          style={{ height: 14, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' }}
        >
          <View testID="budget-fill" style={{ width: `${share / 10}%`, height: '100%', backgroundColor: words.tone === 'over' ? colors.over : colors.under }} />
        </View>
      ) : null}
      <BunText variant="caption" tone="muted">{words.detail}</BunText>
    </View>
  );
}
