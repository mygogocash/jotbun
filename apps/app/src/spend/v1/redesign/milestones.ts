// When the phone answers back about money (premium plan A1): a budget
// threshold crossed, and a good logging week. Pure; the screens play the
// haptic moments (thresholdCrossed, celebration) these decide.
//
// - A threshold is said once, when the estimate moves past 80% or 100% of
//   the month's limit while the person watches; never on opening a screen
//   that is already over, and never again for the same month and level.
// - A good week (5 of the last 7 days logged, decision D5) is celebrated at
//   most once per ISO week.

export type BudgetLevel = 0 | 80 | 100;

/** How far through the limit the spending estimate is: under 80%, from 80%, or from 100%. */
export function budgetLevel(spentMinor: string, limitMinor: string | null): BudgetLevel {
  if (limitMinor === null) return 0;
  const limit = BigInt(limitMinor);
  if (limit <= 0n) return 0;
  const spent = BigInt(spentMinor);
  if (spent >= limit) return 100;
  return spent * 100n >= limit * 80n ? 80 : 0;
}

export type LevelSeen = { readonly month: string; readonly level: BudgetLevel };

/**
 * The level newly crossed between two readings of the same month, or null.
 * The first reading (nothing seen yet) and a new month are never a crossing.
 */
export function crossedLevel(previous: LevelSeen | null, next: LevelSeen): 80 | 100 | null {
  if (!previous || previous.month !== next.month || next.level <= previous.level) return null;
  return next.level === 100 ? 100 : 80;
}

/** The ISO week of a Bangkok date, `YYYY-Www` (weeks start on Monday). */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Whether a good week should be celebrated now, given the week last celebrated. */
export function celebrateGoodWeek(goodWeek: boolean, today: string, lastCelebrated: string | null): boolean {
  return goodWeek && isoWeek(today) !== lastCelebrated;
}
