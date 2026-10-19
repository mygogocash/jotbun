// Pieces of the R5 Insights screen (plan §6.3): the month calendar with its
// heat, the logging rhythm's dots, and the rows that lead on. Built from the
// kit (src/ui), BunText and the useBunColors() tokens only.
//
// - A day is one 44 pt button whose label says the date and its exact money
//   out, or "Nothing logged"; its number is drawn on the card, and its heat
//   is a separate swatch under the number, so the number never sits on a
//   tint (ink on card keeps its AA contrast in both modes). The swatch, the
//   weekday heads and the rhythm's dots are decoration: the words carry it.
// - Heat is the accent in four steps of opacity. The stage is not used for
//   it: in lavender night it is too close to the card to read as a step.
// - Today is ringed in ink and named in its label. Days after today are drawn
//   but inert: no button, nothing read out.
// - Seven columns of 44 pt need 308 pt, so the calendar spans the screen with
//   a 4 pt margin and no side padding inside its card: 320 pt fits exactly.
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { BunPeek } from '@mobile/mascot/BunPeek';
import { BUN_POSES, BUN_SIZES, bunHeight } from '@mobile/mascot/poses';
import type { CalendarDay, CalendarModel, HeatStep, Rhythm } from '@mobile/spend/v1/redesign/insights/insightsModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { weekdayInitials } from '@mobile/ui/dateStep';
import type { DateLocale } from '@mobile/ui/dateStep';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';

/** The accent's opacity at each heat step (0: no money out). */
const HEAT_OPACITY: Readonly<Record<HeatStep, number>> = { 0: 1, 1: 0.3, 2: 0.55, 3: 0.8, 4: 1 };
const SWATCH = { width: 24, height: 8 } as const;
const DOT = 14;

/** How far the cheering bun rises over the rhythm card: the page keeps that much room above it. */
export const CHEER_ROOM = bunHeight(BUN_POSES.cheer, BUN_SIZES.s);

export function SectionTitle({ children }: { children: string }) {
  return <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{children}</BunText>;
}

/** A day's heat under its number: a filled step of the accent, a hollow one for a logged day with no money out, or nothing. */
function HeatSwatch({ day }: { day: CalendarDay }) {
  const colors = useBunColors();
  if (!day.logged) return <View style={SWATCH} />;
  const filled = day.step > 0;
  return (
    <View
      {...DECORATIVE}
      testID={`insights-heat-${day.date}`}
      style={{
        ...SWATCH,
        borderRadius: SWATCH.height / 2,
        backgroundColor: filled ? colors.accent : 'transparent',
        borderWidth: filled ? 0 : BUN_OUTLINE.control,
        borderStyle: 'solid',
        borderColor: colors.accent,
        opacity: HEAT_OPACITY[day.step],
      }}
    />
  );
}

const CELL = { flex: 1, minWidth: BUN_TOUCH, minHeight: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', gap: BUN_SPACE.xxs } as const;

/** One day: a button to History for days up to today; drawn and inert after it. */
function DayCell({ day, onOpen }: { day: CalendarDay; onOpen: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  if (day.isFuture) {
    return (
      <View {...DECORATIVE} testID={`insights-future-${day.date}`} style={CELL}>
        <BunText variant="label" tone="muted">{String(day.dayOfMonth)}</BunText>
        <View style={SWATCH} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={day.label}
      accessibilityHint={tc('Opens this month in History')}
      onPress={onOpen}
      style={({ pressed }) => ({
        ...CELL,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: BUN_OUTLINE.card,
        borderStyle: 'solid',
        // Today is ringed in ink (and named in its label), never marked by colour alone.
        borderColor: day.isToday ? colors.ink : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <BunText variant="label" tone="ink" style={[{ fontVariant: ['tabular-nums'] }, day.isToday ? { fontWeight: '700' } : null]}>{String(day.dayOfMonth)}</BunText>
      <HeatSwatch day={day} />
    </Pressable>
  );
}

/** The month as a heatmap of money out: Sunday-first weeks, a 44 pt button per day up to today. */
export function CalendarCard({ calendar, locale, onOpenDay }: { calendar: CalendarModel; locale: DateLocale; onOpenDay: () => void }) {
  const tc = useCopy();
  return (
    <View style={{ marginHorizontal: BUN_SPACE.xxs }}>
      <Card testID="insights-calendar" style={{ paddingHorizontal: 0, gap: BUN_SPACE.xs }}>
        <View style={{ paddingHorizontal: BUN_SPACE.sm }}>
          <SectionTitle>{tc('Money out by day')}</SectionTitle>
        </View>
        <View {...DECORATIVE} testID="insights-weekdays" style={{ flexDirection: 'row' }}>
          {weekdayInitials(locale).map((initial, index) => (
            <BunText key={index} variant="caption" tone="muted" style={{ flex: 1, minWidth: BUN_TOUCH, textAlign: 'center' }}>{initial}</BunText>
          ))}
        </View>
        {calendar.weeks.map((week) => (
          <View key={week.find((cell) => cell !== null)?.date} style={{ flexDirection: 'row' }}>
            {week.map((day, index) => (day ? <DayCell key={day.date} day={day} onOpen={onOpenDay} /> : <View key={`blank-${index}`} {...DECORATIVE} style={CELL} />))}
          </View>
        ))}
      </Card>
    </View>
  );
}

/** The last seven days as dots: filled where something was logged, a soft open ring otherwise. Decoration: the line above says it. */
function RhythmDots({ rhythm, locale }: { rhythm: Rhythm; locale: DateLocale }) {
  const colors = useBunColors();
  const initials = weekdayInitials(locale);
  return (
    <View {...DECORATIVE} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {rhythm.days.map((day) => (
        <View key={day.date} style={{ alignItems: 'center', gap: BUN_SPACE.xxs, minWidth: BUN_SPACE.lg }}>
          <View
            testID={`insights-dot-${day.date}`}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              borderWidth: BUN_OUTLINE.control,
              borderStyle: 'solid',
              borderColor: day.logged ? colors.accent : colors.rule,
              backgroundColor: day.logged ? colors.accent : 'transparent',
            }}
          />
          <BunText variant="caption" tone="muted" style={day.isToday ? { fontWeight: '700' } : undefined}>{initials[day.weekday]}</BunText>
        </View>
      ))}
    </View>
  );
}

/**
 * The logging rhythm (decision D5): days logged in the month shown, then the
 * last seven days. Self-care, never a money signal: no amount appears here,
 * and a skipped day is an open ring, never a failure. At full bun intensity
 * a good week gets the cheering bun peeking over the card.
 */
export function RhythmCard({ rhythm, daysLine, cheer, locale }: { rhythm: Rhythm; daysLine: string | null; cheer: boolean; locale: DateLocale }) {
  const tc = useCopy();
  return (
    <View style={{ marginTop: cheer ? CHEER_ROOM : 0 }}>
      <Card testID="insights-rhythm">
        {cheer ? (
          <View {...DECORATIVE} testID="insights-bun-cheer" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 0 }}>
            <BunPeek edge="top" align="end" pose="cheer" size="s" />
          </View>
        ) : null}
        <SectionTitle>{tc('Your logging rhythm')}</SectionTitle>
        {daysLine ? <BunText>{daysLine}</BunText> : null}
        <BunText>{rhythm.line}</BunText>
        <RhythmDots rhythm={rhythm} locale={locale} />
      </Card>
    </View>
  );
}

/** A row that leads to another screen: one 44 pt button, its name the visible words. */
export function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: BUN_TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: BUN_SPACE.sm,
        paddingHorizontal: BUN_SPACE.md,
        paddingVertical: BUN_SPACE.xs,
        borderRadius: BUN_RADIUS.card,
        borderWidth: BUN_OUTLINE.control,
        borderStyle: 'solid',
        borderColor: colors.ink,
        backgroundColor: colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{label}</BunText>
      <BunText variant="heading" aria-hidden>›</BunText>
    </Pressable>
  );
}
