import { Injectable } from '@nestjs/common';
import {
  ContractValidationError,
  MAX_BUDGET_CATEGORY_LIMITS,
  MINOR_AMOUNT_MAX,
  assertKnownFields,
  isBudgetSnapshot,
  isUuid,
  parseMinor,
  parseMonth,
} from '@gogospend/contracts';
import type { BudgetCategoryLimit, BudgetDto, CommandAck, SessionContext } from '@gogospend/contracts';

import { CommandExecutor } from '../commands/command-executor';
import type { CommandHeaders } from '../commands/command-headers';
import { CommandRegistry } from '../commands/command-registry';
import { derivedUuid } from '../commands/derived-id';
import { stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';

const ENTITY = 'budget';
const LIMIT = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX };
const LIMITS_FIELD = 'category_limits';

/** The month's budget with its sublimits (sorted by category id), or undefined. */
export async function readBudget(tx: OwnerTx, month: string, forUpdate = false): Promise<BudgetDto | undefined> {
  const [budget] = await tx.query<{ id: string; overall_limit_minor: string; version: number }>(
    `SELECT id, overall_limit_minor::text AS overall_limit_minor, version FROM monthly_budgets WHERE month = ($1 || '-01')::date ${forUpdate ? 'FOR UPDATE' : ''}`,
    [month],
  );
  if (!budget) return undefined;
  const limits = await tx.query<BudgetCategoryLimit>(
    `SELECT category_id, limit_minor::text AS limit_minor FROM budget_category_limits WHERE month = ($1 || '-01')::date ORDER BY category_id`,
    [month],
  );
  return { id: budget.id, month, overall_limit_minor: budget.overall_limit_minor, category_limits: limits, version: budget.version };
}

/**
 * Monthly budgets. PUT replaces a month's whole budget in one M1 command:
 * without If-Match it creates (a second create is a conflict), with the
 * current version it replaces. Sublimits are positive, unique, for owned
 * expense categories (active when newly added) and never add up to more
 * than the overall limit; a deferred database trigger backs that up.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
  ) {
    registry.defineEntity({ entity: ENTITY, validate: isBudgetSnapshot });
    registry.defineCommand({ kind: 'budget.create', entity: ENTITY, outcome: 'created', schemaVersions: [1], policy: 'current' });
    registry.defineCommand({ kind: 'budget.replace', entity: ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' });
  }

  get(ctx: SessionContext, month: string): Promise<BudgetDto> {
    const parsed = parseMonth(month);
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const budget = await readBudget(tx, parsed);
      if (!budget) throw new ProblemException(404, 'NOT_FOUND');
      return budget;
    });
  }

  set(ctx: SessionContext, command: CommandHeaders, month: string, body: unknown): Promise<CommandAck> {
    const parsed = parseMonth(month);
    const input = assertKnownFields(body, ['overall_limit_minor', LIMITS_FIELD]);
    const overall = parseMinor(input.overall_limit_minor, LIMIT, 'overall_limit_minor');
    const rawLimits = input.category_limits === undefined ? [] : input.category_limits;
    if (!Array.isArray(rawLimits) || rawLimits.length > MAX_BUDGET_CATEGORY_LIMITS) {
      throw new ContractValidationError('VALIDATION_FAILED', `Expected at most ${MAX_BUDGET_CATEGORY_LIMITS} category limits.`, LIMITS_FIELD);
    }
    const limits = rawLimits.map((raw) => {
      const item = assertKnownFields(raw, ['category_id', 'limit_minor'], LIMITS_FIELD);
      if (!isUuid(item.category_id)) throw new ContractValidationError('VALIDATION_FAILED', 'category_id must be a lower-case UUID.', LIMITS_FIELD);
      return { category_id: item.category_id, limit: parseMinor(item.limit_minor, LIMIT, LIMITS_FIELD) };
    });
    if (new Set(limits.map((limit) => limit.category_id)).size !== limits.length) {
      throw new ContractValidationError('VALIDATION_FAILED', 'Each category may have one limit.', LIMITS_FIELD);
    }
    if (limits.reduce((sum, limit) => sum + limit.limit, 0n) > overall) {
      throw new ContractValidationError('VALIDATION_FAILED', 'Category limits add up to more than the overall budget.', LIMITS_FIELD);
    }
    const categoryLimits = limits
      .map((limit) => ({ category_id: limit.category_id, limit_minor: limit.limit.toString() }))
      .sort((a, b) => a.category_id.localeCompare(b.category_id));
    const id = derivedUuid(ctx.accountId, 'monthly-budget', parsed);
    const creating = command.expectedVersion === undefined;
    const payload = { id, month: parsed, overall_limit_minor: overall.toString(), category_limits: categoryLimits };
    return this.executor.run(ctx, { ...command, kind: creating ? 'budget.create' : 'budget.replace', payload }, async (tx) => {
      const existing = await readBudget(tx, parsed, true);
      if (!creating && !existing) throw new ProblemException(404, 'NOT_FOUND');
      if (creating ? existing !== undefined : existing?.version !== command.expectedVersion) {
        throw new ProblemException(409, 'VERSION_CONFLICT', { current: existing });
      }
      await this.checkCategories(tx, categoryLimits, new Set(existing?.category_limits.map((limit) => limit.category_id)));
      if (existing) {
        await tx.query(`UPDATE monthly_budgets SET overall_limit_minor = $2, version = version + 1, updated_at = now() WHERE month = ($1 || '-01')::date`, [parsed, payload.overall_limit_minor]);
        await tx.query(`DELETE FROM budget_category_limits WHERE month = ($1 || '-01')::date`, [parsed]);
      } else {
        await tx.query(`INSERT INTO monthly_budgets (account_id, month, id, overall_limit_minor) VALUES ($1, ($2 || '-01')::date, $3, $4)`, [tx.accountId, parsed, id, payload.overall_limit_minor]);
      }
      if (categoryLimits.length > 0) {
        await tx.query(
          `INSERT INTO budget_category_limits (account_id, month, category_id, limit_minor)
           SELECT $1, ($2 || '-01')::date, l.category_id, l.limit_minor FROM jsonb_to_recordset($3::jsonb) AS l(category_id uuid, limit_minor bigint)`,
          [tx.accountId, parsed, JSON.stringify(categoryLimits)],
        );
      }
      const saved = (await readBudget(tx, parsed)) as BudgetDto;
      return { entityId: id, version: saved.version, changes: [{ entity: ENTITY, id, version: saved.version, state: 'active', snapshot: saved }] };
    });
  }

  /** Owned expense categories; newly added ones must not be archived. */
  private async checkCategories(tx: OwnerTx, limits: readonly BudgetCategoryLimit[], previous: ReadonlySet<string>): Promise<void> {
    if (limits.length === 0) return;
    const rows = await tx.query<{ id: string; type: string; archived: boolean }>('SELECT id, type, archived FROM categories WHERE id = ANY($1::uuid[])', [limits.map((limit) => limit.category_id)]);
    const found = new Map(rows.map((row) => [row.id, row]));
    for (const limit of limits) {
      const category = found.get(limit.category_id);
      if (!category) throw stateProblem('errors.category_not_found', LIMITS_FIELD);
      if (category.type !== 'expense') throw stateProblem('errors.category_type_mismatch', LIMITS_FIELD);
      if (category.archived && !previous.has(limit.category_id)) throw stateProblem('errors.category_archived', LIMITS_FIELD);
    }
  }
}
