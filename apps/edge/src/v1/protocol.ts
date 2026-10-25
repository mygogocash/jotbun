// The Worker-to-vault protocol. A call crosses the Durable Object RPC boundary
// by structured clone, so every type here is plain data: no class instances,
// no functions. Errors travel as VaultReply problems, never as thrown values.
import type { ApiErrorCode, PolicyVersionDto } from '@gogospend/contracts'

import type { ProblemOptions } from '@api/common/api-problem.filter'

/** A token lives at most this long (exp - iat), §6.4. */
export const MAX_TOKEN_LIFETIME_SECONDS = 900

/** What the Worker verified from the access token and the client header. */
export type VaultClaims = {
  accountId: string
  sessionId: string
  /** The token's iat, in epoch seconds. */
  issuedAt: number
  clientId: string
}

/** The published policy versions from config:v1, or null when none are published. */
export type PublishedPolicies = PolicyVersionDto[] | null

export type VaultRouteId =
  | 'me.get' | 'me.logout' | 'me.privacy' | 'policies.accept' | 'commands.status'
  | 'wallets.list' | 'wallets.get' | 'wallets.create' | 'wallets.update' | 'wallets.archive' | 'wallets.unarchive'
  | 'categories.list' | 'categories.builtins' | 'categories.create' | 'categories.update' | 'categories.archive' | 'categories.unarchive'
  | 'transactions.get' | 'transactions.create' | 'transactions.update' | 'transactions.delete' | 'transactions.restore'
  | 'budgets.get' | 'budgets.put' | 'history.list' | 'history.deleted' | 'summary.get' | 'sync.changes'

export type VaultCall = {
  route: VaultRouteId
  access: 'bound_session' | 'current_policy'
  claims: VaultClaims
  policies: PublishedPolicies
  params: Record<string, string>
  query: Record<string, unknown>
  /** Only idempotency-key, x-gogospend-command-schema and if-match, lowercase. */
  headers: Record<string, string | undefined>
  body: unknown
}

export type VaultReply =
  | { ok: true; status: number; body?: unknown; headers?: Record<string, string> }
  | { ok: false; status: number; code: ApiErrorCode; problem: ProblemOptions }
