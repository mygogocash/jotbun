// Expense, income and transfer records, ported from apps/api/src/transactions
// (TransactionsService and TransactionsRepository). Each record is one row. A
// transfer is one row between two wallets, so it can never be half-written.
// Edits, delete and restore need the current version (If-Match). Deletion is
// soft and restorable for 30 days. A command reads its headers first
// (commandInput), then the route id, then the body, as the API does (R41).
// Amounts are stored as INTEGER and read back with CAST AS TEXT, so a balance
// never passes through a JavaScript number.
import {
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  RESTORE_WINDOW_DAYS,
  TRACKING_START_MIN,
  TRANSACTION_TYPES,
  assertKnownFields,
  bangkokDate,
  isUuid,
  normalizeMerchant,
  normalizeNote,
  parseMinor,
  validateOccurredOn,
} from '@gogospend/contracts'
import type { CommandAck, TransactionDto, TransactionType } from '@gogospend/contracts'

import { routeId, stateProblem } from '@api/commands/versioned-entity'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultCall } from '../../v1/protocol'
import { entityHead, expectVersion } from '../commands/entity-state'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'
import { categoryById } from './categories'

const ENTITY = 'transaction'
const AMOUNT = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX }
const DAY_MS = 86_400_000
const COMMON_FIELDS = ['amount_minor', 'occurred_on', 'note', 'merchant'] as const
const ENTRY_REFS = ['wallet_id', 'category_id'] as const
const TRANSFER_REFS = ['source_wallet_id', 'destination_wallet_id'] as const
type RefField = (typeof ENTRY_REFS)[number] | (typeof TRANSFER_REFS)[number]

/** A transactions row as the vault reads it: money is text, and a missing reference is null. */
export type TransactionRow = {
  id: string
  type: TransactionType
  amount_minor: string
  occurred_on: string
  wallet_id: string | null
  category_id: string | null
  source_wallet_id: string | null
  destination_wallet_id: string | null
  note: string | null
  merchant: string | null
  deleted_at: string | null
  version: number
}

/** The record's editable state, before it is written. */
type Draft = Omit<TransactionRow, 'deleted_at' | 'version'>

// Money as text: the SQL API would otherwise return INTEGER as a JavaScript number.
const COLUMNS = `id, type, CAST(amount_minor AS TEXT) AS amount_minor, occurred_on, wallet_id, category_id,
  source_wallet_id, destination_wallet_id, note, merchant, deleted_at, version`

const refsOf = (type: TransactionType): readonly RefField[] => (type === 'transfer' ? TRANSFER_REFS : ENTRY_REFS)

/** The persisted record. `attachment_id` arrives with receipts, so 1A omits it. */
export function toDto(row: TransactionRow): TransactionDto {
  const common = {
    id: row.id,
    amount_minor: row.amount_minor,
    occurred_on: row.occurred_on,
    note: row.note,
    merchant: row.merchant,
    deleted_at: row.deleted_at,
    version: row.version,
  }
  return row.type === 'transfer'
    ? { ...common, type: 'transfer', source_wallet_id: row.source_wallet_id as string, destination_wallet_id: row.destination_wallet_id as string }
    : { ...common, type: row.type, wallet_id: row.wallet_id as string, category_id: row.category_id as string }
}

function uuidField(value: unknown, field: string): string {
  if (!isUuid(value)) throw new ContractValidationError('VALIDATION_FAILED', `${field} must be a lower-case UUID.`, field)
  return value
}

/** Format checks for a date. The wallet's tracking start is checked under the call, once the wallet is known. */
function dateField(value: unknown, today: string): string {
  return validateOccurredOn(value, TRACKING_START_MIN, today)
}

function sameWallet(draft: Draft): void {
  if (draft.type === 'transfer' && draft.source_wallet_id === draft.destination_wallet_id) {
    throw new ContractValidationError('VALIDATION_FAILED', 'A transfer needs two different wallets.', 'destination_wallet_id')
  }
}

/** The mutation that commits one record's new version. A deleted row's head state is `deleted`. */
function changed(row: TransactionRow): VaultMutation {
  return {
    entityId: row.id,
    version: row.version,
    changes: [{ entity: ENTITY, id: row.id, version: row.version, state: row.deleted_at ? 'deleted' : 'active', snapshot: toDto(row) }],
  }
}

/** One record by id, or undefined. Task 8's purge reads the row through this. */
export function transactionRow(c: VaultContext, id: string): TransactionRow | undefined {
  return c.sql.exec<TransactionRow>(`SELECT ${COLUMNS} FROM transactions WHERE id = ?`, id).toArray()[0]
}

/** The record this command edits: 404 when this account has none, 410 once purged. */
function locked(c: VaultContext, id: string): TransactionRow {
  const row = transactionRow(c, id)
  if (row) return row
  if (entityHead(c, ENTITY, id)?.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED')
  throw new ProblemException(404, 'NOT_FOUND')
}

/** An active record at the expected version (ENTITY_DELETED first, then VERSION_CONFLICT). */
function live(c: VaultContext, id: string, expected: number | undefined): TransactionRow {
  const row = locked(c, id)
  if (row.deleted_at) throw new ProblemException(409, 'ENTITY_DELETED')
  return expectVersion(row, expected, toDto)
}

type WalletRef = { archived: number; tracking_start: string }

function walletRef(c: VaultContext, id: string): WalletRef | undefined {
  return c.sql.exec<WalletRef>('SELECT archived, tracking_start FROM wallets WHERE id = ?', id).toArray()[0]
}

/**
 * Every wallet and category belongs to this account (it lives in this vault).
 * A newly referenced one is not archived. The category type matches. The date
 * is within every wallet's tracking period. Blame the wallet when only the
 * wallet changed, otherwise the date.
 */
function checkReferences(c: VaultContext, draft: Draft, newlyReferenced: ReadonlySet<RefField>, dateChanged = true): void {
  for (const field of refsOf(draft.type)) {
    const id = draft[field] as string
    if (field === 'category_id') {
      const category = categoryById(c, id)
      if (!category) throw stateProblem('errors.category_not_found', field)
      if (category.type !== draft.type) throw stateProblem('errors.category_type_mismatch', field)
      if (category.archived === 1 && newlyReferenced.has(field)) throw stateProblem('errors.category_archived', field)
      continue
    }
    const wallet = walletRef(c, id)
    if (!wallet) throw stateProblem('errors.wallet_not_found', field)
    if (wallet.archived === 1 && newlyReferenced.has(field)) throw stateProblem('errors.wallet_archived', field)
    if (draft.occurred_on < wallet.tracking_start) {
      const blame = !dateChanged && newlyReferenced.has(field) ? field : 'occurred_on'
      throw new ContractValidationError('DATE_BEFORE_TRACKING_START', 'Date is before the wallet started tracking.', blame)
    }
  }
}

function insertRow(c: VaultContext, draft: Draft): TransactionRow | undefined {
  const now = c.now.toISOString()
  return c.sql
    .exec<TransactionRow>(
      `INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note, merchant, version, created_at, updated_at)
       VALUES (?, ?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      draft.id,
      draft.type,
      draft.amount_minor,
      draft.occurred_on,
      draft.wallet_id,
      draft.category_id,
      draft.source_wallet_id,
      draft.destination_wallet_id,
      draft.note,
      draft.merchant,
      now,
      now,
    )
    .toArray()[0]
}

function writeRow(c: VaultContext, draft: Draft): TransactionRow {
  const [row] = c.sql
    .exec<TransactionRow>(
      `UPDATE transactions
          SET amount_minor = CAST(? AS INTEGER), occurred_on = ?, wallet_id = ?, category_id = ?, source_wallet_id = ?, destination_wallet_id = ?,
              note = ?, merchant = ?, version = version + 1, updated_at = ?
        WHERE id = ? RETURNING ${COLUMNS}`,
      draft.amount_minor,
      draft.occurred_on,
      draft.wallet_id,
      draft.category_id,
      draft.source_wallet_id,
      draft.destination_wallet_id,
      draft.note,
      draft.merchant,
      c.now.toISOString(),
      draft.id,
    )
    .toArray()
  return row
}

/** GET /v1/transactions/:id. Another account's id is NOT_FOUND, the same as a missing one. */
export function getTransaction(c: VaultContext, id: string): TransactionDto {
  const recordId = routeId(id)
  const row = transactionRow(c, recordId)
  if (!row) throw new ProblemException(404, 'NOT_FOUND')
  return toDto(row)
}

/** POST /v1/transactions: an expense, an income or a transfer, on a client-chosen id. */
export function createTransaction(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'transaction.create', undefined, 'forbidden')
  const type = (call.body as { type?: unknown } | null)?.type
  if (!TRANSACTION_TYPES.includes(type as TransactionType)) {
    throw new ContractValidationError('VALIDATION_FAILED', 'type must be expense, income or transfer.', 'type')
  }
  const refs = refsOf(type as TransactionType)
  const input = assertKnownFields(call.body, ['id', 'type', ...COMMON_FIELDS, ...refs])
  const today = bangkokDate(c.now)
  const draft: Draft = {
    id: uuidField(input.id, 'id'),
    type: type as TransactionType,
    amount_minor: parseMinor(input.amount_minor, AMOUNT, 'amount_minor').toString(),
    occurred_on: dateField(input.occurred_on, today),
    wallet_id: null,
    category_id: null,
    source_wallet_id: null,
    destination_wallet_id: null,
    note: normalizeNote(input.note),
    merchant: normalizeMerchant(input.merchant),
  }
  for (const ref of refs) draft[ref] = uuidField(input[ref], ref)
  sameWallet(draft)
  return runCommand(c, { ...command, payload: draft }, () => {
    // A purged record leaves no row but keeps its head: its id is spent.
    if (entityHead(c, ENTITY, draft.id)?.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED')
    checkReferences(c, draft, new Set(refs))
    const row = insertRow(c, draft)
    if (!row) {
      const existing = transactionRow(c, draft.id)
      throw new ProblemException(409, 'VERSION_CONFLICT', { current: existing ? toDto(existing) : undefined })
    }
    return changed(row)
  })
}

/** PATCH /v1/transactions/:id. The type never changes. If-Match is the current version. */
export function updateTransaction(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'transaction.update', undefined, 'required')
  const recordId = routeId(call.params.id)
  const input = assertKnownFields(call.body, [...COMMON_FIELDS, ...ENTRY_REFS, ...TRANSFER_REFS])
  const today = bangkokDate(c.now)
  const edits: Partial<Draft> = {}
  if (input.amount_minor !== undefined) edits.amount_minor = parseMinor(input.amount_minor, AMOUNT, 'amount_minor').toString()
  if (input.occurred_on !== undefined) edits.occurred_on = dateField(input.occurred_on, today)
  if (input.note !== undefined) edits.note = normalizeNote(input.note)
  if (input.merchant !== undefined) edits.merchant = normalizeMerchant(input.merchant)
  for (const ref of [...ENTRY_REFS, ...TRANSFER_REFS]) if (input[ref] !== undefined) edits[ref] = uuidField(input[ref], ref)
  if (Object.keys(edits).length === 0) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'amount_minor')
  return runCommand(c, { ...command, payload: { id: recordId, ...edits } }, () => {
    const row = live(c, recordId, command.expectedVersion)
    const refs = new Set<RefField>(refsOf(row.type))
    for (const field of [...ENTRY_REFS, ...TRANSFER_REFS]) {
      if (edits[field] !== undefined && !refs.has(field)) throw new ContractValidationError('UNKNOWN_FIELD', `A ${row.type} has no ${field}.`, field)
    }
    const draft: Draft = { ...row, ...edits }
    sameWallet(draft)
    checkReferences(
      c,
      draft,
      new Set(refsOf(row.type).filter((field) => edits[field] !== undefined && edits[field] !== row[field])),
      edits.occurred_on !== undefined,
    )
    return changed(writeRow(c, draft))
  })
}

/** DELETE /v1/transactions/:id. The row stays, with deleted_at set, and drops out of balances at once. */
export function deleteTransaction(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'transaction.delete', undefined, 'required')
  const recordId = routeId(call.params.id)
  return runCommand(c, { ...command, payload: { id: recordId } }, () => {
    live(c, recordId, command.expectedVersion)
    const [row] = c.sql
      .exec<TransactionRow>(
        `UPDATE transactions SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`,
        c.now.toISOString(),
        c.now.toISOString(),
        recordId,
      )
      .toArray()
    return changed(row)
  })
}

/** POST /v1/transactions/:id/restore. Within 30 days, and only while every reference is still usable. */
export function restoreTransaction(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'transaction.restore', undefined, 'required')
  const recordId = routeId(call.params.id)
  assertKnownFields(call.body ?? {}, [])
  return runCommand(c, { ...command, payload: { id: recordId } }, () => {
    const row = locked(c, recordId)
    expectVersion(row, command.expectedVersion, toDto)
    if (!row.deleted_at) throw stateProblem('errors.not_deleted', 'deleted_at')
    const cutoff = new Date(c.now.getTime() - RESTORE_WINDOW_DAYS * DAY_MS).toISOString()
    if (row.deleted_at < cutoff) throw new ProblemException(409, 'ENTITY_DELETED', { messageKey: 'errors.restore_expired' })
    // Restoring re-adds every reference, so all must still be valid.
    checkReferences(c, row, new Set(refsOf(row.type)))
    const [restored] = c.sql
      .exec<TransactionRow>(`UPDATE transactions SET deleted_at = NULL, version = version + 1, updated_at = ? WHERE id = ? RETURNING ${COLUMNS}`, c.now.toISOString(), recordId)
      .toArray()
    return changed(restored)
  })
}
