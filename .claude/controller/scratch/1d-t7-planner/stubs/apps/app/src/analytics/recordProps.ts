// RED stub (1D-T7): the plan's interface, with no behaviour yet.
import type { CategoryDto, TransactionDto, UpdateTransactionRequest } from '@gogospend/contracts';

import type { RecordKind } from './events.ts';

export function categoryKeyOf(categoryId: string | null | undefined, categories: Iterable<CategoryDto>): string | null {
  void categoryId;
  void categories;
  return null;
}

export function recordEventOf(
  record: TransactionDto,
  categories: Iterable<CategoryDto>,
  changes?: Pick<UpdateTransactionRequest, 'category_id'>,
): { kind: RecordKind; categoryKey: string | null } {
  void categories;
  void changes;
  return { kind: record.type, categoryKey: null };
}
