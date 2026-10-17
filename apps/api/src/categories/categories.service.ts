import { Injectable } from '@nestjs/common';
import { BUILTIN_CATEGORIES, CATEGORY_COLORS, CATEGORY_TYPES, ContractValidationError, assertKnownFields, isCategorySnapshot, isUuid, normalizeName } from '@gogospend/contracts';
import type { CategoryDto, CategoryType, CommandAck, CommandOutcome, SessionContext } from '@gogospend/contracts';

import { CommandExecutor } from '../commands/command-executor';
import type { MutationResult } from '../commands/command-executor';
import type { CommandHeaders } from '../commands/command-headers';
import { CommandRegistry } from '../commands/command-registry';
import { derivedUuid } from '../commands/derived-id';
import { expectVersion, routeId, stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';

const ENTITY = 'category';
const COLUMNS = 'id, type, builtin_key, label, color, archived, version';
const BUILTIN_ORDER = BUILTIN_CATEGORIES.map((builtin) => builtin.key);
const COMMANDS: [string, CommandOutcome][] = [
  ['category.seed_builtins', 'created'],
  ['category.create', 'created'],
  ['category.update', 'updated'],
  ['category.archive', 'archived'],
  ['category.unarchive', 'unarchived'],
];

const change = (category: CategoryDto) => ({ entity: ENTITY, id: category.id, version: category.version, state: 'active' as const, snapshot: category });
const changed = (category: CategoryDto): MutationResult => ({ entityId: category.id, version: category.version, changes: [change(category)] });

function color(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!(CATEGORY_COLORS as readonly unknown[]).includes(value)) throw new ContractValidationError('VALIDATION_FAILED', 'Colour must be one of the category palette.', 'color');
  return value as string;
}

/**
 * Categories: an account's built-ins (seeded once, with ids derived from the
 * account so every device agrees) and explicit custom ones. The type never
 * changes; renames and archives keep the id, so history keeps its category.
 * Nothing is ever deleted.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
  ) {
    registry.defineEntity({ entity: ENTITY, validate: isCategorySnapshot });
    for (const [kind, outcome] of COMMANDS) registry.defineCommand({ kind, entity: ENTITY, outcome, schemaVersions: [1], policy: 'current' });
  }

  list(ctx: SessionContext): Promise<CategoryDto[]> {
    return this.db.withOwnerTransaction(ctx, (tx) =>
      tx.query<CategoryDto>(
        `SELECT ${COLUMNS} FROM categories
          ORDER BY builtin_key IS NULL, array_position($1::text[], builtin_key), created_at, id`,
        [BUILTIN_ORDER],
      ),
    );
  }

  /**
   * Seeds the built-ins. The command id and category ids are derived from the
   * account, so repeats and concurrent devices replay one command; the
   * client's schema header is irrelevant (the server writes the payload).
   */
  seedBuiltins(ctx: SessionContext): Promise<CommandAck> {
    const builtins = BUILTIN_CATEGORIES.map((builtin) => ({ ...builtin, id: derivedUuid(ctx.accountId, 'builtin-category', builtin.key) }));
    const commandId = derivedUuid(ctx.accountId, 'seed-builtin-categories', 'v1');
    return this.executor.run(ctx, { commandId, kind: 'category.seed_builtins', schemaVersion: 1, payload: { id: builtins[0].id } }, async (tx) => {
      const rows = await tx.query<CategoryDto>(
        `INSERT INTO categories (account_id, id, type, builtin_key, color)
         SELECT $1, b.id, b.type, b.key, b.color FROM jsonb_to_recordset($2::jsonb) AS b(id uuid, type text, key text, color text)
         ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
        [tx.accountId, JSON.stringify(builtins)],
      );
      // Only possible if the receipt is gone but the built-ins remain.
      if (rows.length !== builtins.length) throw new ProblemException(409, 'VERSION_CONFLICT', { messageKey: 'errors.builtins_already_seeded' });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return { entityId: builtins[0].id, version: 1, changes: builtins.map((builtin) => change(byId.get(builtin.id) as CategoryDto)) };
    });
  }

  create(ctx: SessionContext, command: CommandHeaders, body: unknown): Promise<CommandAck> {
    const input = assertKnownFields(body, ['id', 'type', 'label', 'color']);
    if (!isUuid(input.id)) throw new ContractValidationError('VALIDATION_FAILED', 'id must be a lower-case UUID.', 'id');
    if (!CATEGORY_TYPES.includes(input.type as CategoryType)) throw new ContractValidationError('VALIDATION_FAILED', 'type must be expense or income.', 'type');
    const payload = { id: input.id, type: input.type as CategoryType, label: normalizeName(input.label, 'label'), color: color(input.color) };
    return this.executor.run(ctx, { ...command, kind: 'category.create', payload }, async (tx) => {
      const [row] = await tx.query<CategoryDto>(
        `INSERT INTO categories (account_id, id, type, label, color) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
        [tx.accountId, payload.id, payload.type, payload.label, payload.color],
      );
      if (!row) throw new ProblemException(409, 'VERSION_CONFLICT', { current: (await this.rows(tx, payload.id))[0] });
      return changed(row);
    });
  }

  update(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const categoryId = routeId(id);
    const input = assertKnownFields(body, ['label', 'color']);
    if (input.label === undefined && input.color === undefined) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'label');
    const payload: { id: string; label?: string | null; color?: string | null } = { id: categoryId };
    if (input.label !== undefined) payload.label = input.label === null ? null : normalizeName(input.label, 'label');
    if (input.color !== undefined) payload.color = color(input.color);
    return this.executor.run(ctx, { ...command, kind: 'category.update', payload }, async (tx) => {
      const category = await this.locked(tx, categoryId, command.expectedVersion);
      if (category.archived) throw stateProblem('errors.category_archived', 'archived');
      if (payload.label === null && category.builtin_key === null) throw stateProblem('errors.custom_category_needs_label', 'label');
      const [row] = await tx.query<CategoryDto>(
        `UPDATE categories
            SET label = CASE WHEN $2 THEN $3 ELSE label END,
                color = CASE WHEN $4 THEN $5 ELSE color END,
                version = version + 1, updated_at = now()
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [categoryId, 'label' in payload, payload.label ?? null, 'color' in payload, payload.color ?? null],
      );
      return changed(row);
    });
  }

  archive(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    return this.setArchived(ctx, command, id, body, true);
  }

  unarchive(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    return this.setArchived(ctx, command, id, body, false);
  }

  private setArchived(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown, archived: boolean): Promise<CommandAck> {
    const categoryId = routeId(id);
    assertKnownFields(body ?? {}, []);
    const kind = archived ? 'category.archive' : 'category.unarchive';
    return this.executor.run(ctx, { ...command, kind, payload: { id: categoryId } }, async (tx) => {
      const category = await this.locked(tx, categoryId, command.expectedVersion);
      if (category.archived === archived) throw stateProblem(archived ? 'errors.already_archived' : 'errors.not_archived', 'archived');
      const [row] = await tx.query<CategoryDto>(
        `UPDATE categories SET archived = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
        [categoryId, archived],
      );
      return changed(row);
    });
  }

  private rows(tx: OwnerTx, id: string, forUpdate = false): Promise<CategoryDto[]> {
    return tx.query<CategoryDto>(`SELECT ${COLUMNS} FROM categories WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  }

  private async locked(tx: OwnerTx, id: string, expected: number | undefined): Promise<CategoryDto> {
    const [category] = await this.rows(tx, id, true);
    return expectVersion(category, expected, async (row) => row);
  }
}
