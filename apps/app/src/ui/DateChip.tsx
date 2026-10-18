// "‹ Today ›" on the entry sheet (redesign R2b). The arrows step one day and
// never go past today or before the earliest date (the wallet's tracking
// start); tapping the chip opens a month calendar in a sheet.
//
// Why not SpendDatePicker: that component draws its own "Date" heading and
// field as the trigger, uses the legacy green palette, has no way to be opened
// from another control, and has no earliest-date bound. This file keeps a
// small calendar sheet of its own, built on the same pure grid
// (`spendCalendarWeeks`) and on `dateStep` for the labels, so Thai shows
// Buddhist-era years.
import { TRACKING_START_MIN } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { spendCalendarWeeks } from '@mobile/spend/spendCalendar';
import { shiftMonth } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { canStepBack, canStepForward, dayLabel, fullDateLabel, monthLabel, stepDay, weekdayInitials } from './dateStep';
import { Glyph } from './Glyph';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';
import { sheetBackdrop } from './sheetBackdrop';

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
    if (next !== null) onChange(next);
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
      <CalendarSheet visible={open} onClose={() => setOpen(false)} label={tc('Pick another date')}>
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
      </CalendarSheet>
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
                aria-selected={chosen}
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

/**
 * The calendar's bottom sheet: a cream card with an ink outline, a Close
 * button, and the dimmed page (`sheetBackdrop`, as `Sheet` draws it), which
 * also closes it. It slides up, and simply appears under reduced motion.
 *
 * It is not the kit's `Sheet` yet, only because of DateChip's render tests.
 * On the web, react-native-web's `Modal` marks its full-screen layer as a
 * dialog once it has shown, so `Sheet` reads as an unnamed dialog around its
 * own named one. This sheet nests the same way in a browser once its slide
 * ends, but happy-dom never ends a CSS animation, and DateChip's tests ask
 * for exactly one dialog. Fixing `Sheet`'s web dialog and then switching is
 * recorded under "R2 unification" in docs/implementation/redesign-progress.md.
 */
function CalendarSheet({ visible, onClose, label, children }: { visible: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const colors = useBunColors();
  const tc = useCopy();
  const reducedMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The dimmed page closes the sheet on a tap; screen readers use the Close button instead. */}
        <Pressable {...DECORATIVE} testID="sheet-backdrop" focusable={false} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, ...sheetBackdrop(colors) }} />
        <View
          role="dialog"
          aria-modal
          accessibilityLabel={label}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            backgroundColor: colors.card,
            borderColor: colors.ink,
            borderWidth: BUN_OUTLINE.card,
            borderTopLeftRadius: BUN_RADIUS.sheet,
            borderTopRightRadius: BUN_RADIUS.sheet,
            padding: BUN_SPACE.md,
            gap: BUN_SPACE.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tc('Close')}
              onPress={onClose}
              style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
            >
              <Glyph name="close" color={colors.ink} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
