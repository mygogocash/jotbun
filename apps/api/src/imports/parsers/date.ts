// Exact date parsing for imported text (runs in the parser child). Every
// result is a Gregorian `YYYY-MM-DD` or a refusal with a reason - a date is
// never guessed:
//   - Buddhist-era years (2400 and later) become Gregorian (year - 543)
//     before the calendar check, so leap days are judged on the Gregorian
//     year (29/02/2567 = 2024-02-29 is valid; 29/02/2566 = 2023 is not);
//   - day/month order is never assumed: a numeric date whose first two parts
//     are both 12 or less needs the file's order (detectDateOrder), or it is
//     ambiguous_date;
//   - two-digit years are ambiguous_date; an instant with a zone is placed on
//     its Asia/Bangkok calendar day; a time of day without a zone is dropped,
//     but it must be one (hours 0-23, minutes and seconds 0-59) in every form;
//   - dates before 1970-01-01 or after today (Bangkok) are date_out_of_range.
// Ported concepts: the legacy importers' Thai export formats and the slip
// reader's Thai month names.

export type DateOrder = 'dmy' | 'mdy' | null;
export type DateResult = { ok: true; date: string } | { ok: false; code: string };

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const MIN_DATE = '1970-01-01';
const THAI_DIGITS = /[๐-๙]/g;

const MONTHS: Readonly<Record<string, number>> = {
  'ม.ค.': 1, มกราคม: 1, 'ก.พ.': 2, กุมภาพันธ์: 2, 'มี.ค.': 3, มีนาคม: 3, 'เม.ย.': 4, เมษายน: 4,
  'พ.ค.': 5, พฤษภาคม: 5, 'มิ.ย.': 6, มิถุนายน: 6, 'ก.ค.': 7, กรกฎาคม: 7, 'ส.ค.': 8, สิงหาคม: 8,
  'ก.ย.': 9, กันยายน: 9, 'ต.ค.': 10, ตุลาคม: 10, 'พ.ย.': 11, พฤศจิกายน: 11, 'ธ.ค.': 12, ธันวาคม: 12,
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/\./g, '\\.'))
  .join('|');

const TIME = '(?:[T ]+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})(?:\\.[0-9]{1,9})?)?)?';
const ZONE = '(Z|[+-][0-9]{2}:?[0-9]{2})?';
const YEAR_FIRST = new RegExp(`^([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})${TIME}${ZONE}$`, 'i');
const NUMERIC = new RegExp(`^([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{2}|[0-9]{4})${TIME}$`);
const DAY_NAMED = new RegExp(`^([0-9]{1,2})\\s*(${MONTH_NAMES})\\.?\\s*,?\\s*([0-9]{2}|[0-9]{4})$`, 'i');
const NAMED_DAY = new RegExp(`^(${MONTH_NAMES})\\.?\\s+([0-9]{1,2}),?\\s+([0-9]{2}|[0-9]{4})$`, 'i');

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** A Gregorian year from a written one: Buddhist era from 2400 on; null for two-digit years. */
function gregorianYear(written: string): number | null {
  if (written.length !== 4) return null;
  const year = Number(written);
  return year >= 2400 ? year - 543 : year;
}

/** A written time of day (absent parts are fine) is a real one. */
function validTime(hour: string | undefined, minute: string | undefined, second: string | undefined): boolean {
  if (hour === undefined) return true;
  return Number(hour) <= 23 && Number(minute) <= 59 && (second === undefined || Number(second) <= 59);
}

/** `YYYY-MM-DD`, or null when the calendar has no such day. */
function calendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function inRange(date: string, today: string): DateResult {
  return date < MIN_DATE || date > today ? { ok: false, code: 'date_out_of_range' } : { ok: true, date };
}

/** The Bangkok calendar day of a wall-clock time at a UTC offset. */
function bangkokDay(date: string, hour: number, minute: number, second: number, zone: string): string | null {
  if (hour > 23 || minute > 59 || second > 59) return null;
  const match = /^([+-])([0-9]{2}):?([0-9]{2})$/.exec(zone);
  const offsetMinutes = zone.toUpperCase() === 'Z' ? 0 : match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : NaN;
  if (!Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) return null;
  const [y, m, d] = date.split('-').map(Number);
  const instant = Date.UTC(y, m - 1, d, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(instant + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** The first two numbers of a numeric day/month date (either order), or null. */
export function numericParts(raw: string): [number, number] | null {
  const match = NUMERIC.exec(normalize(raw));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function normalize(raw: string): string {
  return raw.replace(THAI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0e50)).replace(/\s+/g, ' ').trim();
}

/**
 * The day/month order a file's numeric dates prove: a first part over 12
 * proves day-first, a second part over 12 month-first; both is a conflict.
 * Without proof, the layout's own convention (or null).
 */
export function detectDateOrder(raws: readonly string[], fallback: DateOrder): DateOrder | 'conflict' {
  let dayFirst = false;
  let monthFirst = false;
  for (const raw of raws) {
    const parts = numericParts(raw);
    if (!parts) continue;
    if (parts[0] > 12) dayFirst = true;
    if (parts[1] > 12) monthFirst = true;
  }
  if (dayFirst && monthFirst) return 'conflict';
  if (dayFirst) return 'dmy';
  if (monthFirst) return 'mdy';
  return fallback;
}

export function parseDateText(raw: string, options: { order: DateOrder | 'conflict'; today: string }): DateResult {
  const text = normalize(raw);
  if (text === '' || text === '-') return { ok: false, code: 'missing_date' };

  const yearFirst = YEAR_FIRST.exec(text);
  if (yearFirst) {
    const year = gregorianYear(yearFirst[1]);
    const date = year === null ? null : calendarDate(year, Number(yearFirst[2]), Number(yearFirst[3]));
    if (!date) return { ok: false, code: 'invalid_date' };
    if (yearFirst[7]) {
      if (yearFirst[4] === undefined) return { ok: false, code: 'invalid_date' };
      const day = bangkokDay(date, Number(yearFirst[4]), Number(yearFirst[5]), Number(yearFirst[6] ?? 0), yearFirst[7]);
      return day ? inRange(day, options.today) : { ok: false, code: 'invalid_date' };
    }
    if (!validTime(yearFirst[4], yearFirst[5], yearFirst[6])) return { ok: false, code: 'invalid_date' };
    return inRange(date, options.today);
  }

  const numeric = NUMERIC.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = gregorianYear(numeric[3]);
    if (!validTime(numeric[4], numeric[5], numeric[6])) return { ok: false, code: 'invalid_date' };
    if (year === null) return { ok: false, code: 'ambiguous_date' };
    let day: number;
    let month: number;
    if (options.order === 'conflict') return { ok: false, code: 'ambiguous_date' };
    if (first === second) {
      day = first;
      month = second;
    } else if (first > 12 || second > 12) {
      // Only one reading is a date; the file's order must agree with it.
      if (first > 12 && options.order === 'mdy') return { ok: false, code: 'invalid_date' };
      if (second > 12 && options.order === 'dmy') return { ok: false, code: 'invalid_date' };
      [day, month] = first > 12 ? [first, second] : [second, first];
    } else if (options.order === 'dmy') {
      [day, month] = [first, second];
    } else if (options.order === 'mdy') {
      [day, month] = [second, first];
    } else {
      return { ok: false, code: 'ambiguous_date' };
    }
    const date = calendarDate(year, month, day);
    return date ? inRange(date, options.today) : { ok: false, code: 'invalid_date' };
  }

  const dayNamed = DAY_NAMED.exec(text);
  const namedDay = dayNamed ? null : NAMED_DAY.exec(text);
  if (dayNamed || namedDay) {
    const [dayText, monthText, yearText] = dayNamed ? [dayNamed[1], dayNamed[2], dayNamed[3]] : [namedDay![2], namedDay![1], namedDay![3]];
    const month = MONTHS[monthText] ?? MONTHS[monthText.toLowerCase()];
    const year = gregorianYear(yearText);
    if (year === null) return { ok: false, code: 'ambiguous_date' };
    const date = month ? calendarDate(year, month, Number(dayText)) : null;
    return date ? inRange(date, options.today) : { ok: false, code: 'invalid_date' };
  }
  return { ok: false, code: 'invalid_date' };
}

/**
 * An Excel date serial (the integer part; a time fraction is dropped) as
 * `YYYY-MM-DD`, exactly, in the 1900 or 1904 date system. Null for anything
 * that is not a plain non-negative serial, and for 1900-system serials before
 * 1 March 1900 (Excel's fictitious 29 February 1900 makes those ambiguous).
 */
export function excelSerialToIso(text: string, date1904: boolean): string | null {
  const match = /^([0-9]{1,7})(?:\.[0-9]+)?$/.exec(text.trim());
  if (!match) return null;
  const serial = Number(match[1]);
  if (!date1904 && serial < 61) return null;
  // Days since 1970-01-01: serial 25569 (1900 system) / 24107 (1904 system) is 1970-01-01.
  const days = serial - (date1904 ? 24_107 : 25_569);
  return civilFromDays(days);
}

/** Howard Hinnant's days-to-civil algorithm: exact integer arithmetic. */
function civilFromDays(days: number): string | null {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return calendarDate(year, month, day);
}
