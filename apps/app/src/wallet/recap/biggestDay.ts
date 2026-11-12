// The month recap's biggest day (bw-recap, P2-T32). Pure.
//
// - The day of `month` with the most confirmed money out: live expenses only.
//   A move between the person's own wallets is never money out, nor is income.
// - A tie goes to the earlier day, whatever order the records come in
//   (history lists them newest first).
// - `payday` when that day also holds a live income in the built-in salary
//   category (the category whose `builtin_key` is `salary`); with no such
//   category, no day is a payday.
// - Dates stay `YYYY-MM-DD` strings, so no time zone moves a record across a
//   day or a month edge, and amounts are satang strings through BigInt only.
import type { CategoryDto, Minor, TransactionDto } from '@gogospend/contracts';

export type BiggestDay = { date: string; outMinor: Minor; payday: boolean };

export function biggestDay(records: readonly TransactionDto[], month: string, categories: readonly CategoryDto[]): BiggestDay | null {
  const salaryId = categories.find((category) => category.builtin_key === 'salary')?.id ?? null;
  const outByDay = new Map<string, bigint>();
  const paydays = new Set<string>();
  for (const record of records) {
    if (record.deleted_at !== null || !record.occurred_on.startsWith(`${month}-`)) continue;
    if (record.type === 'expense') outByDay.set(record.occurred_on, (outByDay.get(record.occurred_on) ?? 0n) + BigInt(record.amount_minor));
    else if (record.type === 'income' && record.category_id === salaryId) paydays.add(record.occurred_on);
  }
  let best: { date: string; out: bigint } | null = null;
  // Earliest first, so a later day wins only with strictly more.
  for (const date of [...outByDay.keys()].sort()) {
    const out = outByDay.get(date) ?? 0n;
    if (best === null || out > best.out) best = { date, out };
  }
  return best === null ? null : { date: best.date, outMinor: best.out.toString(), payday: paydays.has(best.date) };
}
