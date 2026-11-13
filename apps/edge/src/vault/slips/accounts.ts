// Slip accounts (P4-T3, S2): one per bank and last four digits as a slip prints them. A
// slip read makes one only for the person's own side (P4-T6), and the person maps it to a
// wallet. A mapping is a plain write (S1): no command and no change log; the phone reads the
// accounts online (GET /v1/slip-accounts) and sends the version it saw (If-Match).
import { ContractValidationError, parseSlipAccountUpdate } from '@gogospend/contracts'
import type { SlipAccountDto, ThaiBankKey } from '@gogospend/contracts'

import { routeId, stateProblem } from '@api/commands/versioned-entity'

import type { VaultCall } from '../../v1/protocol'
import { expectVersion } from '../commands/entity-state'
import type { VaultContext } from '../context'

/** If-Match as the command headers read it: the version in quotes, for example "7". */
const IF_MATCH = /^"([1-9][0-9]{0,8})"$/

// Each account with its open drafts, on either side of a slip (every slip_drafts row is open).
const ACCOUNT_COLUMNS = `a.id, a.version, a.bank, a.account_last4, a.wallet_id,
  (SELECT count(*) FROM slip_drafts d
    WHERE (d.from_bank = a.bank AND d.from_last4 = a.account_last4) OR (d.to_bank = a.bank AND d.to_last4 = a.account_last4)) AS open_drafts`

const toDto = (row: SlipAccountDto): SlipAccountDto => ({
  id: row.id,
  version: row.version,
  bank: row.bank,
  account_last4: row.account_last4,
  wallet_id: row.wallet_id,
  open_drafts: row.open_drafts,
})

function accountById(c: VaultContext, id: string): SlipAccountDto | undefined {
  const [row] = c.sql.exec<SlipAccountDto>(`SELECT ${ACCOUNT_COLUMNS} FROM slip_accounts a WHERE a.id = ?`, id).toArray()
  return row === undefined ? undefined : toDto(row)
}

/** The account for this bank and last four digits, made on first use; its id. UNIQUE (bank, account_last4) keeps one. */
export function ensureSlipAccount(c: VaultContext, bank: ThaiBankKey, last4: string): string {
  const now = c.now.toISOString()
  c.sql
    .exec(
      `INSERT INTO slip_accounts (id, version, bank, account_last4, wallet_id, created_at, updated_at)
       VALUES (?, 1, ?, ?, NULL, ?, ?) ON CONFLICT (bank, account_last4) DO NOTHING`,
      crypto.randomUUID(),
      bank,
      last4,
      now,
      now,
    )
    .toArray()
  const [row] = c.sql.exec<{ id: string }>('SELECT id FROM slip_accounts WHERE bank = ? AND account_last4 = ?', bank, last4).toArray()
  return row.id
}

/** The account for one side of a slip, or null. A side with no bank or no last four digits has none: `= NULL` matches no row. */
export function slipAccountFor(c: VaultContext, bank: ThaiBankKey | null, last4: string | null): { id: string; wallet_id: string | null } | null {
  const [row] = c.sql.exec<{ id: string; wallet_id: string | null }>('SELECT id, wallet_id FROM slip_accounts WHERE bank = ? AND account_last4 = ?', bank, last4).toArray()
  return row === undefined ? null : { id: row.id, wallet_id: row.wallet_id }
}

/** GET /v1/slip-accounts: every account, most open drafts first, then by bank, then by last four digits. */
export function listSlipAccounts(c: VaultContext): { accounts: SlipAccountDto[] } {
  const rows = c.sql.exec<SlipAccountDto>(`SELECT ${ACCOUNT_COLUMNS} FROM slip_accounts a ORDER BY open_drafts DESC, a.bank, a.account_last4`).toArray()
  return { accounts: rows.map(toDto) }
}

/** The version If-Match names; a missing or malformed one is 422 on `if_match`, as a command's would be. */
function expectedVersionOf(call: VaultCall): number {
  const match = IF_MATCH.exec(call.headers['if-match'] ?? '')
  if (!match) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match must be the current version, e.g. "7".', 'if_match')
  return Number(match[1])
}

/**
 * PUT /v1/slip-accounts/:id: maps the account to a live, unarchived wallet, or
 * unmaps it (null). If-Match first, then the id (404), then the body, as a
 * command reads them (R41); then the version (409 VERSION_CONFLICT with the
 * current account) and the wallet (422 on `wallet_id`). The version moves by one.
 */
export function updateSlipAccount(c: VaultContext, call: VaultCall): SlipAccountDto {
  const expected = expectedVersionOf(call)
  const id = routeId(call.params.id ?? '')
  const { wallet_id: walletId } = parseSlipAccountUpdate(call.body)
  expectVersion(accountById(c, id), expected, (account) => account)
  if (walletId !== null) {
    const [wallet] = c.sql.exec<{ archived: number }>('SELECT archived FROM wallets WHERE id = ?', walletId).toArray()
    if (!wallet) throw stateProblem('errors.wallet_not_found', 'wallet_id')
    if (wallet.archived === 1) throw stateProblem('errors.wallet_archived', 'wallet_id')
  }
  c.sql.exec('UPDATE slip_accounts SET wallet_id = ?, version = version + 1, updated_at = ? WHERE id = ?', walletId, c.now.toISOString(), id).toArray()
  return accountById(c, id) as SlipAccountDto
}
