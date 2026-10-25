// Categories, ported from apps/api/src/categories (CategoriesService). A category
// has a stable id and an immutable expense or income type. The built-ins are
// seeded once per account, with ids derived from the account so every device
// agrees; a custom one has a label. Renames, colours and archives keep the id, so
// history keeps its category. Nothing is ever deleted. Each write is a command
// (runCommand), and it reads its headers before its body, as the API does (R41).
import {
  BUILTIN_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_TYPES,
  ContractValidationError,
  assertKnownFields,
  isUuid,
  normalizeName,
} from '@gogospend/contracts'
import type { BuiltinCategoryKey, CategoryDto, CategoryType, CommandAck } from '@gogospend/contracts'

import { derivedUuid } from '@api/commands/derived-id'
import { routeId, stateProblem } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import { expectVersion } from '../commands/entity-state'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'

const ENTITY = 'category'
const COLUMNS = 'id, type, builtin_key, label, color, archived, version'
const BUILTIN_ORDER = JSON.stringify(BUILTIN_CATEGORIES.map((builtin) => builtin.key))

/** A categories row as SQLite holds it: `archived` is 0 or 1. */
export type CategoryRow = Omit<CategoryDto, 'archived'> & { archived: number }

const asCategory = (row: CategoryRow): CategoryDto => ({ ...row, archived: row.archived === 1 })

/** Every category of this account in the API's order: built-ins in their canonical order, then custom ones by creation. */
function categoryRows(c: VaultContext): CategoryRow[] {
  return c.sql
    .exec<CategoryRow>(
      `SELECT ${COLUMNS} FROM categories
        ORDER BY builtin_key IS NULL, (SELECT j.key FROM json_each(?) AS j WHERE j.value = categories.builtin_key), created_at, id`,
      BUILTIN_ORDER,
    )
    .toArray()
}

/** One category by id, or undefined when this account has no such category. */
export function categoryById(c: VaultContext, id: string): CategoryRow | undefined {
  return c.sql.exec<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE id = ?`, id).toArray()[0]
}

/** Inserts one category row, or returns undefined when its id or built-in key is already taken (ON CONFLICT DO NOTHING). */
function insertRow(
  c: VaultContext,
  row: { id: string; type: CategoryType; builtin_key: BuiltinCategoryKey | null; label: string | null; color: string | null },
): CategoryRow | undefined {
  const now = c.now.toISOString()
  return c.sql
    .exec<CategoryRow>(
      `INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?) ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      row.id,
      row.type,
      row.builtin_key,
      row.label,
      row.color,
      now,
      now,
    )
    .toArray()[0]
}

/** The category a versioned command edits: 404 when this account has no such category, 409 VERSION_CONFLICT when If-Match is stale. */
function lockedCategory(c: VaultContext, id: string, expected: number | undefined): CategoryRow {
  return expectVersion(categoryById(c, id), expected, asCategory)
}

/** The mutation that commits one category's new version: its change carries the persisted snapshot. */
function changed(category: CategoryDto): VaultMutation {
  return { entityId: category.id, version: category.version, changes: [{ entity: ENTITY, id: category.id, version: category.version, state: 'active', snapshot: category }] }
}

/** A colour from the palette, or null for a neutral chip. */
function paletteColor(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!(CATEGORY_COLORS as readonly unknown[]).includes(value)) throw new ContractValidationError('VALIDATION_FAILED', 'Colour must be one of the category palette.', 'color')
  return value as string
}

/** GET /v1/categories: every category of this account. */
export function listCategories(c: VaultContext): CategoryDto[] {
  return categoryRows(c).map(asCategory)
}

/**
 * POST /v1/categories/builtins: seeds the built-ins this account does not have
 * yet, as one command whose id is derived from the missing keys, then returns every
 * category. The API retries a seed that raced another device's; inside one vault
 * call there is no race, so one pass is enough. A call with nothing missing writes
 * nothing, so it never depends on an old receipt or digest key.
 */
export function seedBuiltins(c: VaultContext): CategoryDto[] {
  const present = new Set(c.sql.exec<{ builtin_key: string }>('SELECT builtin_key FROM categories WHERE builtin_key IS NOT NULL').toArray().map((row) => row.builtin_key))
  const missing = BUILTIN_CATEGORIES.filter((builtin) => !present.has(builtin.key))
  if (missing.length > 0) {
    const builtins = missing.map((builtin) => ({ ...builtin, id: derivedUuid(c.claims.accountId, 'builtin-category', builtin.key) }))
    const keys = missing.map((builtin) => builtin.key)
    const commandId = derivedUuid(c.claims.accountId, 'seed-builtin-categories', ...keys)
    runCommand(c, { commandId, kind: 'category.seed_builtins', schemaVersion: 1, payload: { id: builtins[0].id, keys } }, () => {
      const changes = builtins.map((builtin) => {
        const row = insertRow(c, { id: builtin.id, type: builtin.type, builtin_key: builtin.key, label: null, color: builtin.color })
        if (!row) throw new Error('A built-in category was present while the seed found it missing.')
        return { entity: ENTITY, id: row.id, version: row.version, state: 'active' as const, snapshot: asCategory(row) }
      })
      return { entityId: builtins[0].id, version: 1, changes }
    })
  }
  return listCategories(c)
}

/** POST /v1/categories: a custom category with a client-chosen id, a type, a label and an optional colour. */
export function createCategory(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'category.create', undefined, 'forbidden')
  const body = assertKnownFields(call.body, ['id', 'type', 'label', 'color'])
  if (!isUuid(body.id)) throw new ContractValidationError('VALIDATION_FAILED', 'id must be a lower-case UUID.', 'id')
  if (!CATEGORY_TYPES.includes(body.type as CategoryType)) throw new ContractValidationError('VALIDATION_FAILED', 'type must be expense or income.', 'type')
  const payload = { id: body.id, type: body.type as CategoryType, label: normalizeName(body.label, 'label'), color: paletteColor(body.color) }
  return runCommand(c, { ...command, payload }, () => {
    // Checked before the insert: a row with another type would make the insert's
    // guard abort the call, where the API answers the conflict below.
    const existing = categoryById(c, payload.id)
    if (existing) throw new ProblemException(409, 'VERSION_CONFLICT', { current: asCategory(existing) })
    const row = insertRow(c, { ...payload, builtin_key: null })
    if (!row) throw new Error('A category id was free when checked and taken when inserted.')
    return changed(asCategory(row))
  })
}

/** PATCH /v1/categories/:id: a rename or a colour, with the current version. A custom category keeps its label; the type never changes. */
export function updateCategory(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'category.update', undefined, 'required')
  const categoryId = routeId(call.params.id)
  const input = assertKnownFields(call.body, ['label', 'color'])
  if (input.label === undefined && input.color === undefined) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'label')
  const payload: { id: string; label?: string | null; color?: string | null } = { id: categoryId }
  if (input.label !== undefined) payload.label = input.label === null ? null : normalizeName(input.label, 'label')
  if (input.color !== undefined) payload.color = paletteColor(input.color)
  return runCommand(c, { ...command, payload }, () => {
    const category = lockedCategory(c, categoryId, command.expectedVersion)
    if (category.archived === 1) throw stateProblem('errors.category_archived', 'archived')
    if (payload.label === null && category.builtin_key === null) throw stateProblem('errors.custom_category_needs_label', 'label')
    const [row] = c.sql
      .exec<CategoryRow>(
        `UPDATE categories SET label = ?, color = ?, version = version + 1, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`,
        payload.label !== undefined ? payload.label : category.label,
        payload.color !== undefined ? payload.color : category.color,
        c.now.toISOString(),
        categoryId,
      )
      .toArray()
    return changed(asCategory(row))
  })
}

/** POST /v1/categories/:id/archive: hides a category from new use and keeps it for history. */
export function archiveCategory(c: VaultContext, call: VaultCall): CommandAck {
  return setArchived(c, call, true)
}

/** POST /v1/categories/:id/unarchive: an archived category is usable again. */
export function unarchiveCategory(c: VaultContext, call: VaultCall): CommandAck {
  return setArchived(c, call, false)
}

function setArchived(c: VaultContext, call: VaultCall, archived: boolean): CommandAck {
  const command = commandInput(call, archived ? 'category.archive' : 'category.unarchive', undefined, 'required')
  const categoryId = routeId(call.params.id)
  assertKnownFields(call.body ?? {}, [])
  return runCommand(c, { ...command, payload: { id: categoryId } }, () => {
    const category = lockedCategory(c, categoryId, command.expectedVersion)
    if ((category.archived === 1) === archived) throw stateProblem(archived ? 'errors.already_archived' : 'errors.not_archived', 'archived')
    const [row] = c.sql
      .exec<CategoryRow>(`UPDATE categories SET archived = ?, version = version + 1, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`, archived ? 1 : 0, c.now.toISOString(), categoryId)
      .toArray()
    return changed(asCategory(row))
  })
}
