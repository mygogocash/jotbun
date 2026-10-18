// An exact amount of money (redesign R2a). Satang strings go through
// `formatMinor` only, so nothing is ever rounded or floated. A type adds its
// sign, a pending state is written as a word beside the number (never colour
// alone), and the screen reader hears the whole thing: "Expense ฿65.00, saving".
import type { Minor } from '@gogospend/contracts';
import { useCallback } from 'react';
import { View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import type { BunTextRole } from '@mobile/theme/bunType';
import { receiptAmount } from '@mobile/theme/bunType';
import { BunText } from './BunText';
import type { BunTone } from './BunText';
import { BUN_SPACE } from './layout';

export type AmountType = 'expense' | 'income' | 'transfer';
export type AmountSize = 's' | 'm' | 'l' | 'xl';
/** `saving`: not yet confirmed by Jotbun. `conflict`: changed in two places and needs a look. */
export type AmountState = 'confirmed' | 'saving' | 'conflict';
/** What the amount sits on: a cream/paper/page surface, the lavender stage, or an ink fill. */
export type AmountGround = 'surface' | 'stage' | 'ink';

export type AmountProps = {
  /** Canonical satang string. With a `type`, this is the size of the movement and the type gives the sign. */
  minor: Minor;
  type?: AmountType;
  size?: AmountSize;
  /** The receipt serif, for slips and totals. */
  serif?: boolean;
  state?: AmountState;
  on?: AmountGround;
};

export type AmountWords = {
  /** What is drawn: `−฿65.00`, `+฿65.00`, `฿65.00` or, untyped, `-฿65.00`. */
  shown: string;
  /** "saving…" or "needs a look"; null when confirmed. */
  stateWord: string | null;
  /** The full spoken label: "Expense ฿65.00, saving". */
  spoken: string;
};

// U+2212, the true minus sign: it matches the plus sign's width, so signed columns line up.
const SIGN: Readonly<Record<AmountType, string>> = { expense: '\u2212', income: '+', transfer: '' };
const SPOKEN_TYPE: Readonly<Record<AmountType, string>> = { expense: 'Expense {amount}', income: 'Income {amount}', transfer: 'Transfer {amount}' };
const SIZE_ROLE: Readonly<Record<AmountSize, BunTextRole>> = { s: 'label', m: 'body', l: 'title', xl: 'hero' };
const SIZE_PX: Readonly<Record<AmountSize, number>> = { s: 15, m: 17, l: 28, xl: 34 };

const magnitude = (minor: Minor): Minor => (minor.startsWith('-') ? minor.slice(1) : minor);

/** The words for an amount, shared with components that fold it into a longer label. */
export function useAmountWords(): (minor: Minor, type?: AmountType, state?: AmountState) => AmountWords {
  const tc = useCopy();
  const locale = useActiveLocale() === 'th' ? 'th' : 'en';
  return useCallback((minor, type, state = 'confirmed') => {
    const exact = formatMinor(type ? magnitude(minor) : minor, locale);
    const shown = type ? `${SIGN[type]}${exact}` : exact;
    let spoken = type
      ? tc(SPOKEN_TYPE[type], { amount: exact })
      : minor.startsWith('-') ? tc('Minus {amount}', { amount: formatMinor(magnitude(minor), locale) }) : exact;
    let stateWord: string | null = null;
    if (state === 'saving') {
      stateWord = tc('saving…');
      spoken = tc('{amount}, saving', { amount: spoken });
    } else if (state === 'conflict') {
      stateWord = tc('needs a look');
      spoken = tc('{amount}, needs a look', { amount: spoken });
    }
    return { shown, stateWord, spoken };
  }, [locale, tc]);
}

export function Amount({ minor, type, size = 'm', serif = false, state = 'confirmed', on = 'surface' }: AmountProps) {
  const words = useAmountWords()(minor, type, state);
  const role = SIZE_ROLE[size];
  const numberTone: BunTone = on === 'ink' ? 'onInk' : 'ink';
  const stateTone: BunTone = on === 'ink' ? 'onInk' : on === 'stage' || state === 'conflict' ? 'ink' : 'accent';
  const figures = serif ? receiptAmount(SIZE_PX[size]) : { fontVariant: ['tabular-nums'] as ['tabular-nums'] };
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={words.spoken}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: BUN_SPACE.xs }}
    >
      <BunText variant={role} tone={numberTone} style={figures}>{words.shown}</BunText>
      {words.stateWord ? (
        <BunText
          variant={size === 'l' || size === 'xl' ? 'label' : 'caption'}
          tone={stateTone}
          style={state === 'conflict' ? { fontWeight: '700' } : undefined}
        >
          {words.stateWord}
        </BunText>
      ) : null}
    </View>
  );
}
