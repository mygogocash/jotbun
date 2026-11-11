import type { CategoryDto, Minor, TransactionDto } from '@gogospend/contracts';

/**
 * Finds the day with the most confirmed money out in the given month (YYYY-MM).
 * - Only confirmed records (deleted_at === null).
 * - Occurred in the month (occurred_on.startsWith(month + '-')).
 * - Money out: record.type === 'expense'.
 * - Ties in total expense amount choose the earlier day.
 * - Returns null if no money out occurred in the month.
 * - payday is true when that day also holds a live income in the built-in salary category.
 */
export function biggestDay(
  records: readonly TransactionDto[],
  month: string,
  salaryCategory?: string | readonly CategoryDto[],
): { date: string; outMinor: Minor; payday: boolean } | null {
  const salaryId =
    typeof salaryCategory === 'string'
      ? salaryCategory
      : Array.isArray(salaryCategory)
        ? salaryCategory.find((c) => c.builtin_key === 'salary')?.id ?? 'salary'
        : 'salary';

  const dayTotals = new Map<string, bigint>();
  const dayHasSalary = new Set<string>();

  for (const record of records) {
    if (record.deleted_at !== null) continue;
    if (!record.occurred_on.startsWith(month + '-')) continue;

    if (record.type === 'expense') {
      const current = dayTotals.get(record.occurred_on) ?? 0n;
      dayTotals.set(record.occurred_on, current + BigInt(record.amount_minor));
    } else if (record.type === 'income') {
      if (record.category_id === salaryId || record.category_id === 'salary') {
        dayHasSalary.add(record.occurred_on);
      }
    }
  }

  if (dayTotals.size === 0) return null;

  const sortedDates = Array.from(dayTotals.keys()).sort();
  let maxDate: string | null = null;
  let maxOut = 0n;

  for (const date of sortedDates) {
    const total = dayTotals.get(date)!;
    if (total > maxOut) {
      maxOut = total;
      maxDate = date;
    }
  }

  if (maxDate === null || maxOut <= 0n) return null;

  return {
    date: maxDate,
    outMinor: String(maxOut) as Minor,
    payday: dayHasSalary.has(maxDate),
  };
}
