/**
 * v1 month summary (GET /v1/summary?month=YYYY-MM): totals, per-category
 * totals and budget usage for one Asia/Bangkok calendar month, read at one
 * account revision. Percentages are presentation only; clients never feed
 * them back into arithmetic.
 */
import type { Minor, Revision } from "./common.ts";
import type { CategoryType } from "./categories.ts";
import type { Totals } from "./history.ts";

export type CategoryTotal = { category_id: string; type: CategoryType; total_minor: Minor };

export type BudgetCategoryUsage = { category_id: string; limit_minor: Minor; spent_minor: Minor; remaining_minor: Minor };

export type BudgetUsage = {
  overall_limit_minor: Minor;
  /** Every expense in the month, capped categories or not. */
  spent_minor: Minor;
  /** May be negative when over budget. */
  remaining_minor: Minor;
  categories: BudgetCategoryUsage[];
};

export type MonthSummary = Totals & {
  month: string;
  categories: CategoryTotal[];
  /** Null when the month has no budget. */
  budget: BudgetUsage | null;
  as_of_revision: Revision;
};
