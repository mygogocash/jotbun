// The heading over one day of records (redesign R2b): "Today", "Yesterday"
// or the date, and the day's money out and money in, kept apart rather than
// netted. A side with nothing in it is left out. Screen readers hear the full
// date and the words "Money out" and "Money in" with each amount.
import type { Minor } from '@gogospend/contracts';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';

import { BunText } from './BunText';
import { dayLabel, fullDateLabel } from './dateStep';
import { MoneyText, useDateLocale, useMoneyLocale } from './entryKitPrivate';
import { BUN_SPACE } from './layout';

export type DayHeaderProps = {
  readonly date: string;
  readonly today: string;
  /** The day's money out, as non-negative satang. */
  readonly outMinor: Minor;
  /** The day's money in, as non-negative satang. */
  readonly inMinor: Minor;
};

export function DayHeader({ date, today, outMinor, inMinor }: DayHeaderProps) {
  const tc = useCopy();
  const dateLocale = useDateLocale();
  const moneyLocale = useMoneyLocale();
  const label = dayLabel(date, today, dateLocale);
  const full = fullDateLabel(date, dateLocale);
  const out = BigInt(outMinor) > 0n ? formatMinor(outMinor, moneyLocale) : null;
  const into = BigInt(inMinor) > 0n ? formatMinor(inMinor, moneyLocale) : null;
  const spoken = [
    ...(label.kind === 'date' ? [full] : [label.text, full]),
    out ? `${tc('Money out')} ${out}` : null,
    into ? `${tc('Money in')} ${into}` : null,
  ].filter((part): part is string => part !== null).join(', ');
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={spoken}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: BUN_SPACE.sm, paddingVertical: BUN_SPACE.xs }}
    >
      <BunText variant="label" style={{ fontWeight: '700' }}>{label.text}</BunText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.sm }}>
        {out ? <MoneyText variant="caption" tone="muted">{`-${out}`}</MoneyText> : null}
        {into ? <MoneyText variant="caption" tone="muted">{`+${into}`}</MoneyText> : null}
      </View>
    </View>
  );
}
