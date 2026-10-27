// Monthly budgets, ported from apps/api/src/budgets (BudgetService). One month
// has one overall limit and optional expense-category sublimits that are part
// of it. PUT replaces the month as a whole: no If-Match creates (a second
// create conflicts), the current version replaces. Headers are read before the
// body (R41). A put deletes the month's limits, writes the overall, then
// inserts the limits, because the Task 1 triggers check each step immediately
// (the API's equivalent fires only at commit).
import {
  ContractValidationError,
  MAX_BUDGET_CATEGORY_LIMITS,
  MINOR_AMOUNT_MAX,
  assertKnownFields,
  isUuid,
  parseMinor,
  parseMonth,
} from '@gogospend/contracts'
import type { BudgetCategoryLimit, BudgetDto, CommandAck } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { stateProblem } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'
import { categoryById } from './categories'

const ENTITY = 'budget'
const LIMIT = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX }
const LIMITS_FIELD = 'category_limits'

type BudgetRow = { id: string; overall_limit_minor: string; version: number }

/** The first of the month, as monthly_budgets stores it (`YYYY-MM-01`). */
const monthKey = (month: string) => `${month}-01`

/**
 * The month's budget with its sublimits (sorted by category id), or undefined.
 * `month` is `YYYY-MM`. Amounts are read as text, so they never pass through a
 * JS number. Task 7's summary reads through this, as SummaryQuery does.
 */
export function readBudget(c: VaultContext, month: string): BudgetDto | undefined {
  const key = monthKey(month)
  const [budget] = c.sql
    .exec<BudgetRow>('SELECT id, CAST(overall_limit_minor AS TEXT) AS overall_limit_minor, version FROM monthly_budgets WHERE month = ?', key)
    .toArray()
  if (!budget) return undefined
  const category_limits = c.sql
    .exec<BudgetCategoryLimit>('SELECT category_id, CAST(limit_minor AS TEXT) AS limit_minor FROM budget_category_limits WHERE month = ? ORDER BY category_id', key)
    .toArray()
  return { id: budget.id, month, overall_limit_minor: budget.overall_limit_minor, category_limits, version: budget.version }
}

/** Owned expense categories; one already on this budget may stay after it is archived. */
function checkCategories(c: VaultContext, limits: readonly BudgetCategoryLimit[], previous: ReadonlySet<string>): void {
  for (const limit of limits) {
    const category = categoryById(c, limit.category_id)
    if (!category) throw stateProblem('errors.category_not_found', LIMITS_FIELD)
    if (category.type !== 'expense') throw stateProblem('errors.category_type_mismatch', LIMITS_FIELD)
    if (category.archived === 1 && !previous.has(limit.category_id)) throw stateProblem('errors.category_archived', LIMITS_FIELD)
  }
}

/** The mutation that commits the month's new version: its change carries the persisted budget. */
function changed(budget: BudgetDto): VaultMutation {
  return { entityId: budget.id, version: budget.version, changes: [{ entity: ENTITY, id: budget.id, version: budget.version, state: 'active', snapshot: budget }] }
}

/** GET /v1/budgets/:month. A month this account has not set is 404. */
export function getBudget(c: VaultContext, month: string): BudgetDto {
  const budget = readBudget(c, parseMonth(month))
  if (!budget) throw new ProblemException(404, 'NOT_FOUND')
  return budget
}

/**
 * PUT /v1/budgets/:month. Without If-Match this creates; with the current
 * version it replaces. A second create, or a stale version, is 409 with the
 * current budget. Replacing a month that has none is 404.
 */
export function putBudget(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'budget.create', undefined, 'optional')
  const month = parseMonth(call.params.month)
  const input = assertKnownFields(call.body, ['overall_limit_minor', LIMITS_FIELD])
  const overall = parseMinor(input.overall_limit_minor, LIMIT, 'overall_limit_minor')
  const rawLimits = input.category_limits === undefined ? [] : input.category_limits
  if (!Array.isArray(rawLimits) || rawLimits.length > MAX_BUDGET_CATEGORY_LIMITS) {
    throw new ContractValidationError('VALIDATION_FAILED', `Expected at most ${MAX_BUDGET_CATEGORY_LIMITS} category limits.`, LIMITS_FIELD)
  }
  const limits = rawLimits.map((raw) => {
    const item = assertKnownFields(raw, ['category_id', 'limit_minor'], LIMITS_FIELD)
    if (!isUuid(item.category_id)) throw new ContractValidationError('VALIDATION_FAILED', 'category_id must be a lower-case UUID.', LIMITS_FIELD)
    return { category_id: item.category_id, limit: parseMinor(item.limit_minor, LIMIT, LIMITS_FIELD) }
  })
  if (new Set(limits.map((limit) => limit.category_id)).size !== limits.length) {
    throw new ContractValidationError('VALIDATION_FAILED', 'Each category may have one limit.', LIMITS_FIELD)
  }
  if (limits.reduce((sum, limit) => sum + limit.limit, 0n) > overall) {
    throw new ContractValidationError('VALIDATION_FAILED', 'Category limits add up to more than the overall budget.', LIMITS_FIELD)
  }
  const categoryLimits = limits
    .map((limit) => ({ category_id: limit.category_id, limit_minor: limit.limit.toString() }))
    .sort((a, b) => a.category_id.localeCompare(b.category_id))
  const id = derivedUuid(c.claims.accountId, 'monthly-budget', month)
  const creating = command.expectedVersion === undefined
  const payload = { id, month, overall_limit_minor: overall.toString(), category_limits: categoryLimits }
  return runCommand(c, { ...command, kind: creating ? 'budget.create' : 'budget.replace', payload }, () => {
    const existing = readBudget(c, month)
    if (!creating && !existing) throw new ProblemException(404, 'NOT_FOUND')
    if (creating ? existing !== undefined : existing?.version !== command.expectedVersion) {
      throw new ProblemException(409, 'VERSION_CONFLICT', { current: existing })
    }
    checkCategories(c, categoryLimits, new Set(existing?.category_limits.map((limit) => limit.category_id)))
    const key = monthKey(month)
    const now = c.now.toISOString()
    c.sql.exec('DELETE FROM budget_category_limits WHERE month = ?', key).toArray()
    if (existing) {
      c.sql
        .exec('UPDATE monthly_budgets SET overall_limit_minor = CAST(? AS INTEGER), version = version + 1, updated_at = ? WHERE month = ?', payload.overall_limit_minor, now, key)
        .toArray()
    } else {
      c.sql
        .exec(
          'INSERT INTO monthly_budgets (month, id, overall_limit_minor, version, created_at, updated_at) VALUES (?, ?, CAST(? AS INTEGER), 1, ?, ?)',
          key,
          id,
          payload.overall_limit_minor,
          now,
          now,
        )
        .toArray()
    }
    for (const limit of categoryLimits) {
      c.sql.exec('INSERT INTO budget_category_limits (month, category_id, limit_minor) VALUES (?, ?, CAST(? AS INTEGER))', key, limit.category_id, limit.limit_minor).toArray()
    }
    return changed(readBudget(c, month) as BudgetDto)
  })
}
