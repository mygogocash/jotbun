import type { CategoryDto, Minor, TransactionDto } from '@gogospend/contracts';

export function biggestDay(
  records: readonly TransactionDto[],
  month: string,
  salaryCategory?: string | readonly CategoryDto[],
): { date: string; outMinor: Minor; payday: boolean } | null {
  return null;
}
