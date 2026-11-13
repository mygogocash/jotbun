// Day stepping and day labels for the entry kit (redesign R2b). Pure
// Gregorian arithmetic on `YYYY-MM-DD` Bangkok calendar dates: no Date object
// crosses a time zone, and nothing depends on the device's Intl data, so a
// label reads the same on every phone.
//
// - Stepping never goes past `today` (records cannot be in the future, the
//   same rule as `validateOccurredOn`) nor before `earliest` (a wallet's
//   tracking start; 1970-01-01 when none is given).
// - Labels: "Today", "Yesterday", or the day written out. The year is shown
//   only when it is not today's year.
// - Thai shows Buddhist-era years (Gregorian + 543), the way Thai calendars
//   do. The stored date is always Gregorian.
// - The words below are locale data, like month names, not English UI copy.
import { TRACKING_START_MIN } from '@gogospend/contracts';

export type DateLocale = 'en' | 'th' | 'vi';
export type DayKind = 'today' | 'yesterday' | 'date';

type LocaleWords = {
  readonly today: string;
  readonly yesterday: string;
  readonly monthsLong: readonly string[];
  readonly monthsShort: readonly string[];
  readonly weekdaysLong: readonly string[];
  readonly weekdaysShort: readonly string[];
  readonly weekdaysNarrow: readonly string[];
};

const WORDS: Readonly<Record<DateLocale, LocaleWords>> = {
  en: {
    today: 'Today',
    yesterday: 'Yesterday',
    monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    weekdaysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdaysNarrow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  },
  th: {
    today: 'วันนี้',
    yesterday: 'เมื่อวาน',
    monthsLong: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
    monthsShort: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    weekdaysLong: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
    weekdaysShort: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'],
    weekdaysNarrow: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
  },
  vi: {
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    monthsLong: ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6', 'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'],
    monthsShort: ['thg 1', 'thg 2', 'thg 3', 'thg 4', 'thg 5', 'thg 6', 'thg 7', 'thg 8', 'thg 9', 'thg 10', 'thg 11', 'thg 12'],
    weekdaysLong: ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
    weekdaysShort: ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
    weekdaysNarrow: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  },
};

const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const ISO_MONTH = /^([0-9]{4})-([0-9]{2})$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIn(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

type Parts = { readonly year: number; readonly month: number; readonly day: number };

function parts(value: unknown): Parts | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  return { year, month, day };
}

function partsOf(date: string): Parts {
  const parsed = parts(date);
  if (!parsed) throw new TypeError(`Expected a real Gregorian YYYY-MM-DD date, got ${date}.`);
  return parsed;
}

function iso({ year, month, day }: Parts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Day of the week, 0 = Sunday (Zeller's congruence, Gregorian). */
function weekday({ year, month, day }: Parts): number {
  const m = month < 3 ? month + 12 : month;
  const y = month < 3 ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h = (day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  // Zeller counts 0 = Saturday.
  return (h + 6) % 7;
}

/** True for a real Gregorian `YYYY-MM-DD` date. */
export function isCalendarDate(value: unknown): value is string {
  return parts(value) !== null;
}

/** The day before (-1) or after (+1), across month and year ends and leap days. */
export function stepDate(date: string, direction: -1 | 1): string {
  const { year, month, day } = partsOf(date);
  if (direction === 1) {
    if (day < daysIn(year, month)) return iso({ year, month, day: day + 1 });
    if (month < 12) return iso({ year, month: month + 1, day: 1 });
    if (year === 9999) throw new RangeError('Dates end at 9999-12-31.');
    return iso({ year: year + 1, month: 1, day: 1 });
  }
  if (day > 1) return iso({ year, month, day: day - 1 });
  if (month > 1) return iso({ year, month: month - 1, day: daysIn(year, month - 1) });
  if (year === 1) throw new RangeError('Dates start at 0001-01-01.');
  return iso({ year: year - 1, month: 12, day: 31 });
}

/** "Next" is allowed only while the date is before today: never into the future. */
export function canStepForward(date: string, today: string): boolean {
  partsOf(date);
  partsOf(today);
  return date < today;
}

/** "Previous" is allowed only while the date is after the earliest (default 1970-01-01). */
export function canStepBack(date: string, earliest: string = TRACKING_START_MIN): boolean {
  partsOf(date);
  partsOf(earliest);
  return date > earliest;
}

/** One day back or forward within the bounds, or null when that step is not allowed. */
export function stepDay(date: string, direction: -1 | 1, bounds: { today: string; earliest?: string }): string | null {
  if (direction === 1) return canStepForward(date, bounds.today) ? stepDate(date, 1) : null;
  return canStepBack(date, bounds.earliest) ? stepDate(date, -1) : null;
}

/** The year as the locale's calendar shows it: Buddhist era in Thai. */
export function displayYear(year: number, locale: DateLocale): number {
  return locale === 'th' ? year + 543 : year;
}

function shortDate(date: Parts, locale: DateLocale, withYear: boolean): string {
  const words = WORDS[locale];
  const day = words.weekdaysShort[weekday(date)];
  const month = words.monthsShort[date.month - 1];
  const year = displayYear(date.year, locale);
  if (locale === 'vi') return `${day}, ${date.day} ${month}${withYear ? `, ${year}` : ''}`;
  return `${day} ${date.day} ${month}${withYear ? ` ${year}` : ''}`;
}

/**
 * The chip and day-header label: "Today", "Yesterday", or "Thu 15 Oct" (with
 * the year when it is not this year).
 *
 * Screens draw every day label with this one (through DayHeader and DateChip,
 * or directly), and the whole date with `fullDateLabel`: the words are the
 * same on every phone, Vietnamese gets its own, and the chip and the history
 * headers always agree. The view models' `dayLabel` in
 * `spend/v1/redesign/shared.ts` stays for their own strings (`DayGroup.label`
 * and its spoken summary) and is not drawn.
 */
export function dayLabel(date: string, today: string, locale: DateLocale): { kind: DayKind; text: string } {
  const day = partsOf(date);
  const now = partsOf(today);
  if (date === today) return { kind: 'today', text: WORDS[locale].today };
  if (stepDate(today, -1) === date) return { kind: 'yesterday', text: WORDS[locale].yesterday };
  return { kind: 'date', text: shortDate(day, locale, day.year !== now.year) };
}

/** The whole date, for screen readers and headings: "Saturday 17 October 2026", "วันเสาร์ที่ 17 ตุลาคม 2569". */
export function fullDateLabel(date: string, locale: DateLocale): string {
  const day = partsOf(date);
  const words = WORDS[locale];
  const name = words.weekdaysLong[weekday(day)];
  const month = words.monthsLong[day.month - 1];
  const year = displayYear(day.year, locale);
  if (locale === 'th') return `วัน${name}ที่ ${day.day} ${month} ${year}`;
  if (locale === 'vi') return `${name}, ${day.day} ${month}, ${year}`;
  return `${name} ${day.day} ${month} ${year}`;
}

/** A calendar heading: "October 2026", "ตุลาคม 2569", "Tháng 10 năm 2026". */
export function monthLabel(month: string, locale: DateLocale): string {
  const match = ISO_MONTH.exec(month);
  const [year, number] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  if (!match || year < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);
  const name = WORDS[locale].monthsLong[number - 1];
  const shown = displayYear(year, locale);
  if (locale === 'vi') return `${name.charAt(0).toUpperCase()}${name.slice(1)} năm ${shown}`;
  return `${name} ${shown}`;
}

/** Column heads for a Sunday-first calendar grid. */
export function weekdayInitials(locale: DateLocale): readonly string[] {
  return WORDS[locale].weekdaysNarrow;
}

/** A month's short name, without its year, under a chart's bar: "Oct", "ต.ค.", "thg 10" (bw-insights). */
export function monthShortLabel(month: string, locale: DateLocale): string {
  const match = ISO_MONTH.exec(month);
  const number = match ? Number(match[2]) : 0;
  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);
  return WORDS[locale].monthsShort[number - 1];
}

/**
 * The day written out even when it is today or yesterday: "Sat 24 Oct",
 * "เสาร์ 24 ต.ค.", with the year only when it is not today's year. For a
 * heading that says Today beside the date (wc-calendar: "เสาร์ 24 ต.ค. ·
 * วันนี้") and for a row of dates (es-empty-insights); chips and day headers
 * keep `dayLabel`.
 */
export function shortDateLabel(date: string, today: string, locale: DateLocale): string {
  const day = partsOf(date);
  return shortDate(day, locale, day.year !== partsOf(today).year);
}

/** A month's place in the year, 0 to 11. Anything but a `YYYY-MM` month from year 1 throws a TypeError. */
function monthIndex(month: string): number {
  const match = ISO_MONTH.exec(month);
  const number = match ? Number(match[2]) : 0;
  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);
  return number - 1;
}

/**
 * A month's name without its year, short or long: "ต.ค." or "ตุลาคม", "Oct"
 * or "October", "thg 10" or "tháng 10". The widget's gauge (P6A-T2) says
 * "งบ ต.ค." and VoiceOver "งบเดือนตุลาคม".
 */
export function monthName(month: string, locale: DateLocale, form: 'short' | 'long'): string {
  const words = WORDS[locale];
  return (form === 'long' ? words.monthsLong : words.monthsShort)[monthIndex(month)];
}

/**
 * The day on a widget face (ox-widget-lock): a short weekday, then the day
 * of the month: "ส. 24", "Sat 24", "T7, 24". Thai shortens the weekday as
 * Thai calendars do, with a full stop.
 */
export function shortDayName(date: string, locale: DateLocale): string {
  const day = partsOf(date);
  const words = WORDS[locale];
  const index = weekday(day);
  if (locale === 'th') return `${words.weekdaysNarrow[index]}. ${day.day}`;
  if (locale === 'vi') return `${words.weekdaysNarrow[index]}, ${day.day}`;
  return `${words.weekdaysShort[index]} ${day.day}`;
}

/** RED stub (P2-T26): the record's date, not written yet. */
export function shortDateWithYear(_date: string, _locale: DateLocale): string {
  return '';
}
