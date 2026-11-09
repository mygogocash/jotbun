// "‹ Today ›" on the entry sheet (redesign R2b). The arrows step one day and
// never go past today or before the earliest date (the wallet's tracking
// start); tapping the chip opens a month calendar in the kit's `Sheet`, which
// is one named dialog, pads the bottom safe area and closes like every sheet.
//
// Why not SpendDatePicker: that component draws its own "Date" heading and
// field as the trigger, uses the legacy green palette, has no way to be opened
// from another control, and has no earliest-date bound. This file draws a
// small month calendar of its own, built on the same pure grid
// (`spendCalendarWeeks`) and on `dateStep` for the labels, so Thai shows
// Buddhist-era years.
import { TRACKING_START_MIN } from '@gogospend/contracts';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { spendCalendarWeeks } from '@mobile/spend/spendCalendar';
import { shiftMonth } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { canStepBack, canStepForward, dayLabel, fullDateLabel, monthLabel, stepDay, weekdayInitials } from './dateStep';
import { Glyph } from './Glyph';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';
import { Sheet } from './Sheet';

/**
 * The chosen day's state. On the web it is a pressed toggle button: ARIA
 * ignores `aria-selected` on a button, so browsers would never say it. Native
 * readers say "selected" for the selected state, so they keep that.
 */
function chosenState(chosen: boolean): object {
  return Platform.OS === 'web' ? { 'aria-pressed': chosen } : { 'aria-selected': chosen };
}

export type DateChipProps = {
  /** The chosen Bangkok date, `YYYY-MM-DD`. */
  readonly value: string;
  /** Today in Bangkok: nothing after it can be chosen. */
  readonly today: string;
  /** The earliest date allowed, such as the wallet's tracking start (default 1970-01-01). */
  readonly earliest?: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
};

export function DateChip({ value, today, earliest, onChange, disabled = false }: DateChipProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const locale = useActiveLocale();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const label = dayLabel(value, today, locale);
  const full = fullDateLabel(value, locale);
  const back = !disabled && canStepBack(value, earliest);
  const forward = !disabled && canStepForward(value, today);
  const floor = earliest ?? TRACKING_START_MIN;

  const step = (direction: -1 | 1) => {
    const next = stepDay(value, direction, { today, earliest });
    if (next === null) return;
    playHaptic('dateStep');
    onChange(next);
  };
  const arrow = { minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: BUN_RADIUS.pill };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xxs }}>
      <Pressable accessibilityRole="button" accessibilityLabel={tc('Previous day')} disabled={!back} onPress={() => step(-1)} style={{ ...arrow, opacity: back ? 1 : 0.35 }}>
        <Glyph name="chevron-left" color={colors.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tc('Pick another date')}, ${full}`}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => {
          setMonth(value.slice(0, 7));
          setOpen(true);
        }}
        style={{
          minHeight: BUN_TOUCH,
          justifyContent: 'center',
          paddingHorizontal: BUN_SPACE.md,
          paddingVertical: BUN_SPACE.xxs,
          borderRadius: BUN_RADIUS.pill,
          borderWidth: BUN_OUTLINE.control,
          borderColor: colors.ink,
          backgroundColor: colors.card,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <BunText variant="label">{label.text}</BunText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tc('Next day')} disabled={!forward} onPress={() => step(1)} style={{ ...arrow, opacity: forward ? 1 : 0.35 }}>
        <Glyph name="chevron-right" color={colors.ink} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={tc('Pick another date')}>
        <CalendarMonth
          month={month}
          value={value}
          today={today}
          floor={floor}
          onMonth={setMonth}
          onPick={(date) => {
            setOpen(false);
            onChange(date);
          }}
        />
      </Sheet>
    </View>
  );
}

function CalendarMonth({ month, value, today, floor, onMonth, onPick }: { month: string; value: string; today: string; floor: string; onMonth: (next: string) => void; onPick: (date: string) => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  const locale = useActiveLocale();
  const weeks = spendCalendarWeeks(month, today);
  const earlier = month > floor.slice(0, 7);
  const later = month < today.slice(0, 7);
  const nav = { minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tc('Previous month')} disabled={!earlier} onPress={() => onMonth(shiftMonth(month, -1))} style={{ ...nav, opacity: earlier ? 1 : 0.35 }}>
          <Glyph name="chevron-left" color={colors.ink} />
        </Pressable>
        <BunText accessibilityRole="header" variant="label" style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}>{monthLabel(month, locale)}</BunText>
        <Pressable accessibilityRole="button" accessibilityLabel={tc('Next month')} disabled={!later} onPress={() => onMonth(shiftMonth(month, 1))} style={{ ...nav, opacity: later ? 1 : 0.35 }}>
          <Glyph name="chevron-right" color={colors.ink} />
        </Pressable>
      </View>
      {/* Each day button says its full date, so the initials are decoration. */}
      <View {...DECORATIVE} style={{ flexDirection: 'row' }}>
        {weekdayInitials(locale).map((initial, index) => (
          <BunText key={index} variant="micro" tone="muted" style={{ flex: 1, textAlign: 'center' }}>{initial}</BunText>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} style={{ flexDirection: 'row' }}>
          {week.map((day) => {
            const chosen = day.date === value;
            const shut = day.future || day.date < floor;
            return (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={fullDateLabel(day.date, locale)}
                {...chosenState(chosen)}
                disabled={shut}
                onPress={() => onPick(day.date)}
                // Seven across a 320 pt phone leaves each day about 41 pt wide;
                // the cells touch, so there is no dead space between targets.
                style={{ flex: 1, minHeight: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill, backgroundColor: chosen ? colors.ink : 'transparent', opacity: shut ? 0.35 : 1 }}
              >
                {/* The chosen day is bold as well as filled, so the choice never rests on the fill alone. */}
                <BunText variant="label" tone={chosen ? 'onInk' : day.inMonth ? 'ink' : 'muted'} style={chosen ? { fontWeight: '700' } : undefined}>{String(Number(day.date.slice(8, 10)))}</BunText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
