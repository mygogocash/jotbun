// Owned THB wallets, ported from apps/api/src/wallets (WalletsService and
// WalletsRepository). Each write is a command on a client-chosen UUID; edits,
// archive and unarchive need the current version (If-Match). Balances are derived.
// A command reads its headers first (commandInput, which runs commandHeaders), then
// the route id, then the body, as the API's controllers and services do (R41). Its
// payload is set once the body is parsed: `{ ...command, payload }`.
import {
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  WALLET_CORRECTION_REASONS,
  assertKnownFields,
  bangkokDate,
  isUuid,
  normalizeName,
  parseMinor,
  validateTrackingStart,
} from '@gogospend/contracts'
import type { CommandAck, Minor, WalletCorrectionReason, WalletDto, WalletSnapshot } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { routeId, stateProblem } from '@api/commands/versioned-entity'

import type { VaultCall } from '../../v1/protocol'
import { expectVersion } from '../commands/entity-state'
import { commandInput, runCommand } from '../commands/executor'
import type { VaultMutation } from '../commands/executor'
import type { VaultContext } from '../context'
import { firstRecordOn, walletBalances } from '../reads/balances'

const ENTITY = 'wallet'
const OPENING = { allowZero: true, allowNegative: false, max: MINOR_AMOUNT_MAX }

type WalletRow = Omit<WalletSnapshot, 'archived'> & { archived: number }
type WalletChange = { name?: string; opening_minor?: Minor; tracking_start?: string; archived?: boolean }

// Money and dates as text: never a JS number on the way out.
const COLUMNS = 'id, name, currency, CAST(opening_minor AS TEXT) AS opening_minor, tracking_start, archived, version'

const asSnapshot = (row: WalletRow): WalletSnapshot => ({ ...row, archived: row.archived === 1 })

/** The account's wallets in the API's order, or one wallet by id, as persisted snapshots. */
function walletRows(c: VaultContext, id?: string): WalletSnapshot[] {
  const where = id === undefined ? '' : 'WHERE id = ?'
  return c.sql
    .exec<WalletRow>(`SELECT ${COLUMNS} FROM wallets ${where} ORDER BY archived, created_at, id`, ...(id === undefined ? [] : [id]))
    .toArray()
    .map(asSnapshot)
}

/** Each snapshot with its derived balance (the opening balance when it has no records). */
function walletDtos(c: VaultContext, wallets: readonly WalletSnapshot[]): WalletDto[] {
  const balances = walletBalances(c, wallets.map((wallet) => wallet.id))
  return wallets.map((wallet) => ({ ...wallet, balance_minor: balances.get(wallet.id) ?? wallet.opening_minor }))
}

function insertWalletRow(c: VaultContext, wallet: { id: string; name: string; opening_minor: Minor; tracking_start: string }): WalletSnapshot | undefined {
  const now = c.now.toISOString()
  const [row] = c.sql
    .exec<WalletRow>(
      `INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at)
       VALUES (?, ?, 'THB', CAST(? AS INTEGER), ?, 0, 1, ?, ?) ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      wallet.id,
      wallet.name,
      wallet.opening_minor,
      wallet.tracking_start,
      now,
      now,
    )
    .toArray()
  return row === undefined ? undefined : asSnapshot(row)
}

/** Applies a change, bumps the version and returns the wallet; the caller has checked the expected version. */
function updateWalletRow(c: VaultContext, id: string, change: WalletChange): WalletSnapshot {
  c.sql
    .exec(
      `UPDATE wallets
          SET name = coalesce(?, name),
              opening_minor = coalesce(CAST(? AS INTEGER), opening_minor),
              tracking_start = coalesce(?, tracking_start),
              archived = coalesce(?, archived),
              version = version + 1,
              updated_at = ?
        WHERE id = ?`,
      change.name ?? null,
      change.opening_minor ?? null,
      change.tracking_start ?? null,
      change.archived === undefined ? null : change.archived ? 1 : 0,
      c.now.toISOString(),
      id,
    )
    .toArray()
  const [wallet] = walletRows(c, id)
  return wallet
}

/** The wallet a versioned command edits: 404 when this account has no such wallet, 409 VERSION_CONFLICT when If-Match is stale. */
function lockedWallet(c: VaultContext, id: string, expected: number | undefined): WalletSnapshot {
  const [wallet] = walletRows(c, id)
  return expectVersion(wallet, expected, (row) => walletDtos(c, [row])[0])
}

function currentDto(c: VaultContext, id: string): WalletDto | undefined {
  const [wallet] = walletRows(c, id)
  return wallet === undefined ? undefined : walletDtos(c, [wallet])[0]
}

/** The mutation that commits one wallet's new version: its change carries the persisted snapshot. */
function changed(wallet: WalletSnapshot): VaultMutation {
  return { entityId: wallet.id, version: wallet.version, changes: [{ entity: ENTITY, id: wallet.id, version: wallet.version, state: 'active', snapshot: wallet }] }
}

/** GET /v1/wallets: every wallet of this account with its balance. */
export function listWallets(c: VaultContext): WalletDto[] {
  return walletDtos(c, walletRows(c))
}

/** GET /v1/wallets/:id: 404 for a wallet this account does not own, as for a missing one. */
export function getWallet(c: VaultContext, id: string): WalletDto {
  const walletId = routeId(id)
  const [wallet] = walletRows(c, walletId)
  if (!wallet) throw new ProblemException(404, 'NOT_FOUND')
  return walletDtos(c, [wallet])[0]
}

/** POST /v1/wallets: a client-chosen id, a name, an opening balance and a tracking start. */
export function createWallet(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'wallet.create', undefined, 'forbidden')
  const body = assertKnownFields(call.body, ['id', 'name', 'opening_minor', 'tracking_start'])
  if (!isUuid(body.id)) throw new ContractValidationError('VALIDATION_FAILED', 'id must be a lower-case UUID.', 'id')
  const payload = {
    id: body.id,
    name: normalizeName(body.name, 'name'),
    opening_minor: parseMinor(body.opening_minor, OPENING, 'opening_minor').toString(),
    tracking_start: validateTrackingStart(body.tracking_start, bangkokDate(c.now)),
  }
  return runCommand(c, { ...command, payload }, () => {
    const wallet = insertWalletRow(c, payload)
    if (!wallet) throw new ProblemException(409, 'VERSION_CONFLICT', { current: currentDto(c, payload.id) })
    return changed(wallet)
  })
}

/** PATCH /v1/wallets/:id: a rename, or an opening balance or tracking start correction with its reason. */
export function updateWallet(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'wallet.update', undefined, 'required')
  const walletId = routeId(call.params.id)
  const body = assertKnownFields(call.body, ['name', 'opening_minor', 'tracking_start', 'correction_reason'])
  const change: WalletChange = {}
  if (body.name !== undefined) change.name = normalizeName(body.name, 'name')
  if (body.opening_minor !== undefined) change.opening_minor = parseMinor(body.opening_minor, OPENING, 'opening_minor').toString()
  if (body.tracking_start !== undefined) change.tracking_start = validateTrackingStart(body.tracking_start, bangkokDate(c.now))
  if (Object.keys(change).length === 0) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'name')
  let reason: WalletCorrectionReason | undefined
  if (body.correction_reason !== undefined) {
    if (!WALLET_CORRECTION_REASONS.includes(body.correction_reason as WalletCorrectionReason)) {
      throw new ContractValidationError('VALIDATION_FAILED', 'Unknown correction reason.', 'correction_reason')
    }
    if (change.opening_minor === undefined && change.tracking_start === undefined) {
      throw new ContractValidationError('VALIDATION_FAILED', 'A correction reason goes with an opening balance or tracking start change.', 'correction_reason')
    }
    reason = body.correction_reason as WalletCorrectionReason
  }
  const payload = { id: walletId, ...change, ...(reason ? { correction_reason: reason } : {}) }
  return runCommand(c, { ...command, payload }, () => {
    const wallet = lockedWallet(c, walletId, command.expectedVersion)
    if (wallet.archived) throw stateProblem('errors.wallet_archived', 'archived')
    const corrected = change.opening_minor !== undefined || change.tracking_start !== undefined
    if (corrected) {
      // Once records exist, setup changes are explicit corrections, and tracking
      // can never start after a record the wallet already holds.
      const first = firstRecordOn(c, walletId)
      if (first !== null && !reason) throw stateProblem('errors.correction_reason_required', 'correction_reason')
      if (first !== null && change.tracking_start !== undefined && change.tracking_start > first) {
        throw stateProblem('errors.records_before_tracking_start', 'tracking_start')
      }
    }
    return { ...changed(updateWalletRow(c, walletId, change)), audit: corrected && reason ? { correction: reason } : undefined }
  })
}

/** POST /v1/wallets/:id/archive: only a wallet whose derived balance is zero. */
export function archiveWallet(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'wallet.archive', undefined, 'required')
  const walletId = routeId(call.params.id)
  assertKnownFields(call.body ?? {}, [])
  return runCommand(c, { ...command, payload: { id: walletId } }, () => {
    const wallet = lockedWallet(c, walletId, command.expectedVersion)
    if (wallet.archived) throw stateProblem('errors.already_archived', 'archived')
    if (walletBalances(c, [walletId]).get(walletId) !== '0') throw stateProblem('errors.wallet_balance_not_zero', 'balance_minor')
    return changed(updateWalletRow(c, walletId, { archived: true }))
  })
}

/** POST /v1/wallets/:id/unarchive: an archived wallet becomes editable and countable again. */
export function unarchiveWallet(c: VaultContext, call: VaultCall): CommandAck {
  const command = commandInput(call, 'wallet.unarchive', undefined, 'required')
  const walletId = routeId(call.params.id)
  assertKnownFields(call.body ?? {}, [])
  return runCommand(c, { ...command, payload: { id: walletId } }, () => {
    const wallet = lockedWallet(c, walletId, command.expectedVersion)
    if (!wallet.archived) throw stateProblem('errors.not_archived', 'archived')
    return changed(updateWalletRow(c, walletId, { archived: false }))
  })
}
