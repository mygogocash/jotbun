// R5 Reminders (plan §6.3): the pieces of the screen. An on/off switch, the
// time chip and its sheet (an hour and a minute in 5-minute steps: no system
// keyboard), the seven day checks (Monday first), and the live preview of the
// notification with the bun peeking over its top edge. Built from the kit
// (src/ui), BunText and the useBunColors() tokens only.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { BunPeek } from '@mobile/mascot/BunPeek';
import { BUN_POSES, BUN_SIZES, bunHeight } from '@mobile/mascot/poses';
import type { Weekday } from '@mobile/notifications/reminders';
import { REMINDER_HOURS, REMINDER_MINUTES, splitTime, withHour, withMinute } from '@mobile/spend/v1/redesign/insights/remindersModel';
import type { WeekdayName } from '@mobile/spend/v1/redesign/insights/remindersModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';

/** A section's name: a heading for screen readers, a quiet bold label to the eye. */
export function SectionLabel({ children }: { children: string }) {
  return <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{children}</BunText>;
}

/** A quiet line in a card, such as why something cannot be done here. */
export function PlainNotice({ testID, message }: { testID: string; message: string }) {
  const colors = useBunColors();
  return (
    <View testID={testID} style={{ padding: BUN_SPACE.sm, borderRadius: BUN_RADIUS.chip, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.card }}>
      <BunText>{message}</BunText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The switch

const TRACK = { width: 52, height: 32 };
const KNOB = 24;

/**
 * On or off, named by its visible words. The track is outlined in ink and
 * filled when on, and the knob moves across, so the state never rests on
 * colour alone.
 */
export function ReminderSwitch({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ minHeight: BUN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm, opacity: disabled ? 0.5 : 1 }}
    >
      <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{label}</BunText>
      <View
        {...DECORATIVE}
        style={{
          ...TRACK,
          padding: (TRACK.height - KNOB) / 2 - BUN_OUTLINE.control,
          borderRadius: BUN_RADIUS.pill,
          borderWidth: BUN_OUTLINE.control,
          borderColor: colors.ink,
          backgroundColor: value ? colors.ink : colors.card,
          alignItems: value ? 'flex-end' : 'flex-start',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: KNOB, height: KNOB, borderRadius: BUN_RADIUS.pill, backgroundColor: value ? colors.onInk : colors.ink }} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// The time

/** The chosen time as a chip (styled like DateChip's); a tap opens the time sheet. */
export function TimeChip({ time, onOpen, open, disabled = false }: { time: string; onOpen: () => void; open: boolean; disabled?: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <Pressable
      testID="reminders-time"
      accessibilityRole="button"
      accessibilityLabel={`${tc('Reminder time')}, ${time}`}
      aria-expanded={open}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onOpen}
      style={{
        alignSelf: 'flex-start',
        minHeight: BUN_TOUCH,
        minWidth: BUN_TOUCH,
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
      <BunText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{time}</BunText>
    </Pressable>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Rows of `size`, so a grid's cells share each row evenly and touch. */
function rows<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

/**
 * One choice of a set, six to a row, drawn like DateChip's calendar days:
 * the cells touch, so in the sheet on a 320 pt phone each is about 44 pt wide
 * with no dead space between targets. The chosen one is filled with ink and
 * bold, never colour alone.
 */
function ChoiceGrid({ label, values, chosen, onChoose }: { label: string; values: readonly number[]; chosen: number | null; onChoose: (value: number) => void }) {
  const colors = useBunColors();
  return (
    <View role="radiogroup" accessibilityLabel={label}>
      {rows(values, 6).map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row' }}>
          {row.map((value) => {
            const on = value === chosen;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={pad(value)}
                aria-checked={on}
                onPress={() => onChoose(value)}
                style={{ flex: 1, minHeight: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill, backgroundColor: on ? colors.ink : 'transparent' }}
              >
                <BunText variant="label" tone={on ? 'onInk' : 'ink'} style={{ fontVariant: ['tabular-nums'], ...(on ? { fontWeight: '700' } : null) }}>{pad(value)}</BunText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The time, picked without a keyboard: an hour 00-23, then a minute in
 * 5-minute steps. Each pick changes the time at once (the preview behind
 * follows); Done or Close puts the sheet away. A time saved off the steps
 * keeps its minute until one is picked.
 */
export function TimeSheet({ visible, time, onChange, onClose }: { visible: boolean; time: string; onChange: (next: string) => void; onClose: () => void }) {
  const tc = useCopy();
  const { hour, minute } = splitTime(time);
  return (
    <Sheet visible={visible} onClose={onClose} title={tc('Reminder time')}>
      <BunText testID="reminders-time-shown" variant="hero" {...POLITE_LIVE_REGION} style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>{time}</BunText>
      <View style={{ gap: BUN_SPACE.xs }}>
        <SectionLabel>{tc('Hour')}</SectionLabel>
        <ChoiceGrid label={tc('Hour')} values={REMINDER_HOURS} chosen={hour} onChoose={(next) => onChange(withHour(time, next))} />
      </View>
      <View style={{ gap: BUN_SPACE.xs }}>
        <SectionLabel>{tc('Minute')}</SectionLabel>
        <ChoiceGrid label={tc('Minute')} values={REMINDER_MINUTES} chosen={REMINDER_MINUTES.includes(minute) ? minute : null} onChoose={(next) => onChange(withMinute(time, next))} />
      </View>
      <PillButton label={tc('Done')} onPress={onClose} />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The days

/**
 * Seven checks, Monday first, in one outlined strip like TypeSwitch: the
 * narrow name shows ("M", "จ"), the whole name is read ("Monday",
 * "วันจันทร์"). The cells touch, as DateChip's calendar days do: across a
 * 320 pt phone each is about 41 pt wide and 44 tall, with no dead space
 * between targets. Chosen days are filled with ink and bold, never colour
 * alone. The last chosen day says, as its hint, why it stays.
 */
export function DayChecks({ names, chosen, onToggle, disabled = false, lastDayHint }: {
  names: readonly WeekdayName[];
  chosen: readonly Weekday[];
  onToggle: (day: Weekday) => void;
  disabled?: boolean;
  lastDayHint: string;
}) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <View
      role="group"
      accessibilityLabel={tc('Days')}
      style={{ flexDirection: 'row', borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.card, opacity: disabled ? 0.5 : 1 }}
    >
      {names.map((name) => {
        const on = chosen.includes(name.day);
        const last = on && chosen.length === 1;
        return (
          <Pressable
            key={name.day}
            accessibilityRole="checkbox"
            accessibilityLabel={name.long}
            accessibilityHint={last ? lastDayHint : undefined}
            accessibilityState={{ checked: on, disabled }}
            aria-checked={on}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onToggle(name.day)}
            style={{ flex: 1, minHeight: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill, backgroundColor: on ? colors.ink : colors.card }}
          >
            <BunText variant="label" tone={on ? 'onInk' : 'ink'} style={on ? { fontWeight: '700' } : undefined}>{name.narrow}</BunText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Said when a press would have left no day chosen. */
export function DayNote({ message }: { message: string }) {
  useAnnouncement(message);
  return <BunText testID="reminders-day-note" variant="caption" {...POLITE_LIVE_REGION} style={{ fontWeight: '700' }}>{message}</BunText>;
}

// ---------------------------------------------------------------------------
// The preview

const PEEK_POSE = 'sleepy';
const PEEK_SIZE = 'm';
/** How far the bun rises above the card: the room kept free above it. */
export const PEEK_DEPTH = bunHeight(BUN_POSES[PEEK_POSE], BUN_SIZES[PEEK_SIZE]);

/**
 * The notification as the phone will show it: the app's name, the time, and
 * the reminder's own title and body in the person's language. At full
 * intensity the sleepy bun peeks over the card's top edge (decoration; the
 * room above the card is kept for it, so it covers nothing).
 */
export function NotificationPreview({ title, body, time, bun }: { title: string; body: string; time: string; bun: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <View testID="reminders-preview" style={{ paddingTop: bun ? PEEK_DEPTH : 0 }}>
      <Card padding="sm" style={{ gap: BUN_SPACE.xxs }}>
        {bun ? <BunPeek edge="top" align="end" pose={PEEK_POSE} size={PEEK_SIZE} testID="reminders-bun" /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
          <View {...DECORATIVE} style={{ width: 20, height: 20, borderRadius: 6, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.stage }} />
          <BunText variant="caption" tone="muted" style={{ flex: 1 }}>{tc('Jotbun')}</BunText>
          <BunText variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{time}</BunText>
        </View>
        <BunText variant="label" style={{ fontWeight: '700' }}>{title}</BunText>
        <BunText>{body}</BunText>
      </Card>
    </View>
  );
}

/** A labelled block of the page. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}
