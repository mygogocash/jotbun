// A record's analytics properties (1D-T7): its kind and its category key, the
// only things a record event says about it. Never its amount, note, merchant,
// wallet or the category's name (§7). A category is its built-in key, its Thai
// pack key, or `custom` (P2-T7's analyticsCategoryKey). Pure, so Node's test
// runner loads it.
import type { CategoryDto, TransactionDto, UpdateTransactionRequest } from '@gogospend/contracts';

import { analyticsCategoryKey } from '../spend/v1/redesign/planning/thaiPack.ts';
import type { RecordKind } from './events.ts';

/** Null for no category (a transfer); else the key of the category found; an unknown id is `custom`. */
export function categoryKeyOf(categoryId: string | null | undefined, categories: Iterable<CategoryDto>): string | null {
  if (categoryId === null || categoryId === undefined) return null;
  for (const category of categories) {
    if (category.id === categoryId) return analyticsCategoryKey(category);
  }
  return 'custom';
}

/** A record event's kind and category key. An edit's new category, when it changes one, is the one sent. */
export function recordEventOf(
  record: TransactionDto,
  categories: Iterable<CategoryDto>,
  changes?: Pick<UpdateTransactionRequest, 'category_id'>,
): { kind: RecordKind; categoryKey: string | null } {
  const categoryId = record.type === 'transfer' ? null : changes?.category_id ?? record.category_id;
  return { kind: record.type, categoryKey: categoryKeyOf(categoryId, categories) };
}
