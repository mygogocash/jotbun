// The month's pace as a ring (redesign R2b), drawn with react-native-svg.
// Presentational: the numbers and the state arrive worked out. The arc is the
// share of the budget spent (full when over); the centre carries the one
// number that matters ("฿420.00 a day left", or "฿120.00 over"), and the
// words beside it spell the state out, so the under and over colours are
// never the only signal (WCAG 1.4.1). No animation, so nothing to reduce.
import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { budgetWords } from './budgetWords';
import type { BudgetPace } from './budgetWords';
import { Decorative, MoneyText, useMoneyLocale } from './entryKitPrivate';
import { BUN_SPACE } from './layout';

export type PaceRingProps = BudgetPace & {
  /** The ring's width at default text size; it grows with larger text so the centre fits. */
  readonly size?: number;
};

const STROKE = 10;

export function PaceRing({ size = 128, ...pace }: PaceRingProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const { fontScale } = useWindowDimensions();
  const words = budgetWords(pace, tc, useMoneyLocale());
  const drawn = Math.round(size * Math.min(Math.max(fontScale || 1, 1), 2));
  const radius = (drawn - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = words.spentPermille;
  const arc = share === null ? 0 : (circumference * share) / 1000;
  const tone = words.tone === 'over' ? 'over' : 'ink';

  const ring = (
    <View style={{ width: drawn, height: drawn, alignItems: 'center', justifyContent: 'center' }}>
      <Decorative style={{ position: 'absolute', top: 0, left: 0 }}>
        <Svg width={drawn} height={drawn} viewBox={`0 0 ${drawn} ${drawn}`}>
          <Circle cx={drawn / 2} cy={drawn / 2} r={radius} stroke={colors.rule} strokeWidth={STROKE} fill="none" />
          {share !== null ? (
            <Circle
              cx={drawn / 2}
              cy={drawn / 2}
              r={radius}
              stroke={words.tone === 'over' ? colors.over : colors.under}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference}`}
              transform={`rotate(-90 ${drawn / 2} ${drawn / 2})`}
              fill="none"
            />
          ) : null}
        </Svg>
      </Decorative>
      <View style={{ alignItems: 'center', paddingHorizontal: STROKE + BUN_SPACE.xxs }}>
        <MoneyText variant="label" tone={tone} style={{ fontWeight: '700', textAlign: 'center' }}>{words.figure}</MoneyText>
        <BunText variant="caption" tone={tone === 'over' ? 'over' : 'muted'} style={{ textAlign: 'center' }}>{words.figureWord}</BunText>
      </View>
    </View>
  );

  const side = share === null ? [words.headline, words.detail] : words.tone === 'over' ? [words.days, words.detail] : [words.detail];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BUN_SPACE.md }}>
      {share !== null ? (
        <View role="progressbar" accessibilityLabel={tc('Budget')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(share / 10)} aria-valuetext={words.spoken}>
          {ring}
        </View>
      ) : ring}
      <View style={{ flex: 1, minWidth: 140, gap: BUN_SPACE.xxs }}>
        {side.filter((line): line is string => line !== null).map((line, index) => (
          <BunText key={index} variant={index === 0 && share === null ? 'label' : 'caption'} tone={index === 0 && share === null ? 'ink' : 'muted'}>{line}</BunText>
        ))}
      </View>
    </View>
  );
}
