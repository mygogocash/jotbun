// The person's logging streak (W11, R59): one count, across every wallet, of
// the distinct days that have a live record or a draft. A skipped day pauses
// the count; it does not restart it and it does not lower it. A date still
// in the future has not been logged yet.
import { dayNumber } from './shared.ts';

/** A real calendar date on or before `today`. Later dates, and anything that is not a date, do not count yet. */
function onOrBeforeToday(day: string, today: string): boolean {
  if (day > today) return false;
  try {
    dayNumber(day);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return false;
  }
  return true;
}

/** Distinct valid dates up to today. A gap leaves the count where it is. */
export function streakCount(days: readonly string[], today: string): number {
  const seen = new Set<string>();
  for (const day of days) if (onOrBeforeToday(day, today)) seen.add(day);
  return seen.size;
}

/** Whether `day` is one of the logged dates, as written. */
export function loggedOn(days: readonly string[], day: string): boolean {
  return days.includes(day);
}
