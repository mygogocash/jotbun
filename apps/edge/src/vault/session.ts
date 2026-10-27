import { ProblemException } from '@api/common/api-problem.filter'

import { MAX_TOKEN_LIFETIME_SECONDS } from '../v1/protocol'
import type { VaultContext } from './context'
import { logFailure } from '../v1/log'

/** The vault's first call found another account's name in it. */
export class VaultOwnerMismatch extends Error {
  constructor() {
    super('This vault belongs to another account.')
    this.name = 'VaultOwnerMismatch'
  }
}

/**
 * Makes the account and sync rows on the vault's first call. A vault that
 * already holds another account refuses the call, logs it and writes nothing (§6.2).
 * An erased vault keeps only its `deleted` marker (B22): it refuses with 403
 * and never makes an account again, even after it sleeps and wakes.
 */
export function ensureAccount(c: VaultContext): void {
  const [account] = c.sql.exec<{ account_id: string; status: string }>('SELECT account_id, status FROM account_state WHERE id = 1').toArray()
  if (!account) {
    c.sql.exec("INSERT INTO account_state (id, account_id, status, not_before, created_at) VALUES (1, ?, 'active', 0, ?)", c.claims.accountId, c.now.toISOString())
    c.sql.exec('INSERT INTO sync_state (id, revision, pruned_through) VALUES (1, 0, 0)')
    return
  }
  if (account.status === 'deleted') throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE')
  if (account.account_id !== c.claims.accountId) {
    const error = new VaultOwnerMismatch()
    logFailure('vault_owner_mismatch', error)
    throw error
  }
}

/**
 * The session rules (§6.4): an account that is not active refuses everything
 * (403), a token issued before the account's not-before instant is stale, and a
 * session that was signed out is over. Each of the last two is 401.
 */
export function assertSession(c: VaultContext): void {
  const account = c.sql.exec<{ status: string; not_before: number }>('SELECT status, not_before FROM account_state WHERE id = 1').one()
  if (account.status !== 'active') throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE')
  if (c.claims.issuedAt < account.not_before) throw new ProblemException(401, 'SESSION_REQUIRED')
  if (c.sql.exec('SELECT 1 FROM revoked_sessions WHERE session_id = ?', c.claims.sessionId).toArray().length > 0) {
    throw new ProblemException(401, 'SESSION_REQUIRED')
  }
}

/**
 * Signs out this session only. The record is kept until the token could no
 * longer be valid: its issue time plus the longest token lifetime.
 */
export function revokeSession(c: VaultContext): void {
  const expiresAt = new Date((c.claims.issuedAt + MAX_TOKEN_LIFETIME_SECONDS) * 1000).toISOString()
  c.sql.exec('INSERT INTO revoked_sessions (session_id, revoked_at, expires_at) VALUES (?, ?, ?) ON CONFLICT (session_id) DO NOTHING', c.claims.sessionId, c.now.toISOString(), expiresAt)
}
