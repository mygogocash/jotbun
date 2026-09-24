/**
 * The date control on the GoGoSpend add panel (owner call 2026-09-07).
 *
 * A field showing the chosen day in full, with our own calendar under it. The
 * browser's own calendar is what this replaces: it cannot be styled, Chrome and
 * Safari draw different ones, and on a phone it becomes the OS wheel — so the
 * same control looked like three different things and none of them looked like
 * GoGoSpend.
 *
 * Everything here is plain date arithmetic on `YYYY-MM-DD` strings. No Date
 * object crosses a timezone: `Date.UTC` in, ISO slice out, so a member in
 * Bangkok never sees the control land on yesterday.
 */

function parseIsoDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const [year, mon, date] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const when = new Date(Date.UTC(year, mon - 1, date));
  // Date.UTC rolls 31 February forward into March rather than refusing it.
  if (when.getUTCMonth() !== mon - 1 || when.getUTCDate() !== date) return null;
  return when;
}

function isoOf(when: Date): string {
  return when.toISOString().slice(0, 10);
}

function shiftDays(day: string, by: number): string {
  const when = parseIsoDay(day);
  if (!when) return day;
  when.setUTCDate(when.getUTCDate() + by);
  return isoOf(when);
}

/**
 * The chosen day spelled out for the field: "7 September 2026".
 *
 * Assembled from parts rather than taken from `dateStyle`, because `en` orders
 * it "September 7, 2026" and every other date the app writes is day-first.
 * `calendar: "gregory"` keeps Thai on 2026 rather than the Buddhist 2569 — the
 * record itself carries the Gregorian year, and a control that disagrees with
 * what gets saved is worse than one in English.
 */
export function spendFullDateLabel(day: string, locale: string): string {
  const when = parseIsoDay(day);
  if (!when) return "";

  try {
    const parts = new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).formatToParts(when);
    const of = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const [d, m, y] = [of("day"), of("month"), of("year")];
    return d && m && y ? `${d} ${m} ${y}` : "";
  } catch {
    // No Intl data for this locale on this device — the ISO day still reads.
    return day;
  }
}

/**
 * The heading over the calendar grid: "September 2026".
 *
 * The year is always there. The arrows can walk back years, so a bare month
 * name would leave someone three taps deep with no way to tell which December
 * they are looking at.
 */
export function spendCalendarMonthLabel(
  month: string,
  locale: string,
): string {
  const when = parseIsoDay(`${month.trim()}-01`);
  if (!when) return "";

  try {
    return new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(when);
  } catch {
    // No Intl data for this locale on this device — the code still reads.
    return month;
  }
}

export type SpendCalendarDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** False for the days either side that only pad the grid out to whole weeks. */
  inMonth: boolean;
  /** After today, so it cannot be chosen — a spend that has not happened. */
  future: boolean;
};

/**
 * One month as whole weeks, Sunday first, padded from the months either side.
 *
 * Whole weeks so every row has seven cells and the grid never goes ragged; the
 * padding days are marked rather than blanked, because tapping 31 August from
 * September's grid is a reasonable thing to want to do.
 */
export function spendCalendarWeeks(
  month: string,
  today: string,
): SpendCalendarDay[][] {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return [];
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return [];

  const first = new Date(Date.UTC(year, mon - 1, 1));
  const lastDate = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  // Sunday = 0, which is where the grid's first column sits.
  const start = shiftDays(isoOf(first), -first.getUTCDay());

  const weeks: SpendCalendarDay[][] = [];
  let cursor = start;
  // Six rows covers every month; the loop stops as soon as the month is spent.
  for (let week = 0; week < 6; week += 1) {
    const row: SpendCalendarDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      row.push({
        date: cursor,
        inMonth: cursor.slice(0, 7) === month,
        future: cursor > today,
      });
      cursor = shiftDays(cursor, 1);
    }
    weeks.push(row);
    if (cursor > `${month}-${String(lastDate).padStart(2, "0")}`) break;
  }
  return weeks;
}
