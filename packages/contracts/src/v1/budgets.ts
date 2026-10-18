/**
 * v1 monthly budgets: one overall limit per account and month, with optional
 * expense-category sublimits that are part of the overall budget (never
 * extra). Only expenses consume a budget; transfers and opening balances
 * never do. Months are Asia/Bangkok calendar months (`YYYY-MM`).
 */
import type { Minor } from "./common.ts";
import { ContractValidationError } from "./errors.ts";

export type BudgetCategoryLimit = { category_id: string; limit_minor: Minor };

/** The persisted budget (also the change-log snapshot); limits sorted by category id. */
export type BudgetDto = {
  id: string;
  month: string;
  overall_limit_minor: Minor;
  category_limits: BudgetCategoryLimit[];
  version: number;
};

/**
 * PUT /v1/budgets/:month replaces the month's whole budget in one command.
 * Creating sends no If-Match; changing an existing budget needs its version.
 */
export type SetMonthlyBudgetRequest = {
  overall_limit_minor: Minor;
  category_limits?: BudgetCategoryLimit[];
};

/** At most this many category sublimits in one budget. */
export const MAX_BUDGET_CATEGORY_LIMITS = 100;

const MONTH = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

/** A calendar month `YYYY-MM` from 1970-01. */
export function parseMonth(value: unknown, field = "month"): string {
  if (typeof value !== "string" || !MONTH.test(value) || value < "1970-01") {
    throw new ContractValidationError("VALIDATION_FAILED", "Expected a month as YYYY-MM.", field);
  }
  return value;
}

const BUDGET_KEYS = ["category_limits", "id", "month", "overall_limit_minor", "version"].join(",");
const POSITIVE = /^[1-9][0-9]{0,10}$/;

export function isBudgetSnapshot(value: unknown): value is BudgetDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const budget = value as Record<string, unknown>;
  return (
    Object.keys(budget).sort().join(",") === BUDGET_KEYS &&
    typeof budget.id === "string" &&
    typeof budget.month === "string" && MONTH.test(budget.month) &&
    typeof budget.overall_limit_minor === "string" && POSITIVE.test(budget.overall_limit_minor) &&
    Array.isArray(budget.category_limits) &&
    budget.category_limits.every((limit: unknown) => {
      const item = limit as Record<string, unknown> | null;
      return item !== null && typeof item === "object" && Object.keys(item).sort().join(",") === "category_id,limit_minor" &&
        typeof item.category_id === "string" && typeof item.limit_minor === "string" && POSITIVE.test(item.limit_minor);
    }) &&
    Number.isSafeInteger(budget.version) && (budget.version as number) >= 1
  );
}
