// R5 Reminders (plan §6.3): the screen's pure pieces. The time is chosen as
// an hour and a minute in 5-minute steps; the week runs Monday first with the
// days as ISO numbers (Monday = 1 … Sunday = 7, as notifications/reminders.ts
// keeps them); at least one day always stays chosen. Weekday names come from
// the locale's Intl data, like History's model dates (`shared.ts`), with
// Vietnamese in its own words.
import { EVERY_DAY } from '../../../../notifications/reminders.ts';
import type { Weekday } from '../../../../notifications/reminders.ts';

/** The minute choices are this many minutes apart. */
export const MINUTE_STEP = 5;
/** 00 to 23. */
export const REMINDER_HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);
/** 00, 05 … 55. */
export const REMINDER_MINUTES: readonly number[] = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);

/** Monday first. */
export const WEEK: readonly Weekday[] = EVERY_DAY;

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const pad = (value: number) => String(value).padStart(2, '0');

export function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

export function splitTime(localTime: string): { hour: number; minute: number } {
  const match = TIME.exec(localTime);
  if (!match) throw new RangeError(`A reminder time is HH:MM, got ${localTime}.`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** The same minute at another hour. */
export function withHour(localTime: string, hour: number): string {
  if (!REMINDER_HOURS.includes(hour)) throw new RangeError(`An hour is 0-23, got ${hour}.`);
  return formatTime(hour, splitTime(localTime).minute);
}

/** The same hour at another minute, one of the 5-minute steps. */
export function withMinute(localTime: string, minute: number): string {
  if (!REMINDER_MINUTES.includes(minute)) throw new RangeError(`A minute is a ${MINUTE_STEP}-minute step, got ${minute}.`);
  return formatTime(splitTime(localTime).hour, minute);
}

export type DayToggle = {
  readonly weekdays: readonly Weekday[];
  /** The press would have left no day, so the day stays chosen (and the screen says why). */
  readonly kept: boolean;
};

/** Turns `day` on or off, kept Monday first. The last chosen day stays chosen. */
export function toggleDay(days: readonly Weekday[], day: Weekday): DayToggle {
  if (!days.includes(day)) return { weekdays: WEEK.filter((each) => each === day || days.includes(each)), kept: false };
  if (days.length === 1) return { weekdays: days, kept: true };
  return { weekdays: WEEK.filter((each) => each !== day && days.includes(each)), kept: false };
}

/** The BCP 47 tag the weekday names are read in: Thai and Vietnamese in their own words, else en-GB. */
export function weekdayTag(locale: string): 'th-TH' | 'vi-VN' | 'en-GB' {
  return locale === 'th' ? 'th-TH' : locale === 'vi' ? 'vi-VN' : 'en-GB';
}

export type WeekdayName = {
  readonly day: Weekday;
  /** "Monday", "วันจันทร์": what a screen reader says. */
  readonly long: string;
  /** "Mon", "จันทร์": in a list of days. */
  readonly short: string;
  /** "M", "จ": on the day's toggle. */
  readonly narrow: string;
};

// 1 January 2024 was a Monday, so day N of that week is ISO weekday N.
const dayOfWeek = (day: Weekday) => Date.UTC(2024, 0, day);

/** The week's names in `locale`, Monday first. */
export function weekdayNames(locale: string): readonly WeekdayName[] {
  const tag = weekdayTag(locale);
  const format = (weekday: 'long' | 'short' | 'narrow') => new Intl.DateTimeFormat(tag, { weekday, timeZone: 'UTC' });
  const [long, short, narrow] = [format('long'), format('short'), format('narrow')];
  return WEEK.map((day) => ({ day, long: long.format(dayOfWeek(day)), short: short.format(dayOfWeek(day)), narrow: narrow.format(dayOfWeek(day)) }));
}

/** `date`'s ISO weekday on the phone's own calendar (the reminders fire in local time). */
export function isoWeekday(date: Date): Weekday {
  return (((date.getDay() + 6) % 7) + 1) as Weekday;
}

/**
 * Whose words the Reminders screen previews. Each chosen day's reminder has
 * its own wording (notifications/reminderWording.ts), so the preview shows one
 * of them: `days` are the chosen days (Monday first, never empty) and `today`
 * is today's ISO weekday. The answer must be one of `days`.
 */
export function previewDay(days: readonly Weekday[], today: Weekday): Weekday {
  // The next reminder this person will get: today's when today is chosen,
  // otherwise the next chosen day, wrapping past Sunday to Monday.
  for (let step = 0; step < 7; step += 1) {
    const day = (((today - 1 + step) % 7) + 1) as Weekday;
    if (days.includes(day)) return day;
  }
  return days[0];
}

/** The chosen days as the screen words them: the three named sets, or the short names in order. */
export type DaysSummary = { readonly kind: 'every_day' | 'weekdays' | 'weekends' } | { readonly kind: 'some'; readonly text: string };

const same = (days: readonly Weekday[], set: readonly Weekday[]) => days.length === set.length && set.every((day) => days.includes(day));

export function daysSummary(days: readonly Weekday[], names: readonly WeekdayName[]): DaysSummary {
  if (same(days, WEEK)) return { kind: 'every_day' };
  if (same(days, [1, 2, 3, 4, 5])) return { kind: 'weekdays' };
  if (same(days, [6, 7])) return { kind: 'weekends' };
  return { kind: 'some', text: names.filter((name) => days.includes(name.day)).map((name) => name.short).join(', ') };
}
