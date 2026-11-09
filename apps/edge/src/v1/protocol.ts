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
  /** The token's auth_time, in epoch seconds, when the token carries one. */
  authTime?: number
}

/** How a vault call is authorised. `recent_proof` is policy-exempt, like `bound_session`. */
export type VaultAccess = 'bound_session' | 'current_policy' | 'recent_proof'

/** A route the Worker answers itself. Later tasks add their ids. */
export type WorkerRouteId =
  | 'bridge.catalogue'
  // 1B-T5
  | 'import.upload'
  // 1B-T6
  | 'export.file.download'

/** The published policy versions from config:v1, or null when none are published. */
export type PublishedPolicies = PolicyVersionDto[] | null

export type VaultRouteId =
  | 'me.get' | 'me.logout' | 'me.privacy' | 'policies.accept' | 'commands.status'
  | 'wallets.list' | 'wallets.get' | 'wallets.create' | 'wallets.update' | 'wallets.archive' | 'wallets.unarchive'
  | 'categories.list' | 'categories.builtins' | 'categories.create' | 'categories.update' | 'categories.archive' | 'categories.unarchive'
  | 'transactions.get' | 'transactions.create' | 'transactions.update' | 'transactions.delete' | 'transactions.restore'
  | 'budgets.get' | 'budgets.put' | 'history.list' | 'history.deleted' | 'summary.get' | 'sync.changes'
  // 1B-T5: the import status route, then the upload's step-only ids.
  | 'imports.status' | 'imports.begin' | 'imports.reservePart' | 'imports.finish' | 'imports.abort' | 'imports.discarded' | 'imports.bytesRetry'
  // 1B-T6: the three export routes, then the download's step-only id.
  | 'exports.request' | 'exports.status' | 'exports.grant' | 'exports.file'

export type VaultCall = {
  route: VaultRouteId
  access: VaultAccess
  /**
   * 'read' or 'write' charges the principal budget and that one.
   * 'step' is a later step of the same request, and it is not charged.
   */
  charge: 'read' | 'write' | 'step'
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
