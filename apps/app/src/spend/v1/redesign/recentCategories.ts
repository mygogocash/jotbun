// Quick add's category chips: the categories of one type ranked by recent
// use, so the top few show inline and the rest sit behind "More".
import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import type { CategoryDto, CategoryType, TransactionDto } from '@gogospend/contracts';

import type { PendingEntry } from '../../../storage/types.ts';
import { daysBetween } from './shared.ts';

/** Uses older than this many days (today included) do not count. */
export const RECENT_WINDOW_DAYS = 60;
/** Chips shown inline before "More". */
export const RECENT_TOP = 3;

export type RecentCategoriesInput = {
  type: CategoryType;
  categories: readonly CategoryDto[];
  /** Confirmed records (deleted ones are ignored). */
  records: readonly TransactionDto[];
  /** Drafts on the device (`DiaryView.pending`); a draft already confirmed counts once. */
  drafts?: readonly PendingEntry[];
  today: string;
  top?: number;
  windowDays?: number;
};

export type RecentCategories = {
  /** The top N by score; when fewer were used, filled from the built-in order. */
  top: CategoryDto[];
  /** Every other open category of the type, in the stable default order (built-ins in order, then custom by label). */
  rest: CategoryDto[];
  /** Each ranked category's score (0 when unused in the window). */
  scores: ReadonlyMap<string, number>;
};

const BUILTIN_ORDER = new Map<string, number>(BUILTIN_CATEGORIES.map((category, index) => [category.key, index]));

/** The order the device diary lists categories in: built-ins in order, then custom by label, then id. */
function defaultOrder(a: CategoryDto, b: CategoryDto): number {
  const rank = (category: CategoryDto) => (category.builtin_key ? BUILTIN_ORDER.get(category.builtin_key) ?? 0 : BUILTIN_ORDER.size);
  return rank(a) - rank(b) || (a.label ?? '').localeCompare(b.label ?? '') || a.id.localeCompare(b.id);
}

/**
 * Scores each use by recency: a use today weighs `windowDays`, one
 * `windowDays − 1` days ago weighs 1, so frequency and recency both count, in
 * integers. Ties fall back to the built-in order (custom after built-ins),
 * then the label, then the id. Archived categories and other types are left out.
 */
export function rankRecentCategories(input: RecentCategoriesInput): RecentCategories {
  const window = input.windowDays ?? RECENT_WINDOW_DAYS;
  const top = input.top ?? RECENT_TOP;
  const open = input.categories.filter((category) => category.type === input.type && !category.archived).sort(defaultOrder);
  const scores = new Map<string, number>(open.map((category) => [category.id, 0]));
  const seen = new Set<string>();
  const count = (use: { id: string; category_id: string; occurred_on: string }) => {
    if (seen.has(use.id)) return;
    seen.add(use.id);
    const age = daysBetween(use.occurred_on, input.today);
    const score = scores.get(use.category_id);
    if (score === undefined || age < 0 || age >= window) return;
    scores.set(use.category_id, score + (window - age));
  };
  for (const record of input.records) if (record.type !== 'transfer' && record.deleted_at === null) count(record);
  for (const draft of input.drafts ?? []) if (draft.type !== 'transfer') count(draft);
  const ranked = [...open].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || defaultOrder(a, b));
  const chosen = new Set(ranked.slice(0, top).map((category) => category.id));
  return { top: ranked.slice(0, top), rest: open.filter((category) => !chosen.has(category.id)), scores };
}
