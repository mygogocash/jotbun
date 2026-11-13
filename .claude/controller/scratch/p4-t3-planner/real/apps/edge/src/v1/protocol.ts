// The Worker-to-vault protocol. A call crosses the Durable Object RPC boundary
// by structured clone, so every type here is plain data: no class instances,
// no functions. Errors travel as VaultReply problems, never as thrown values.
import type { ApiErrorCode, PolicyVersionDto } from '@gogospend/contracts'

import type { ProblemOptions } from '@api/common/api-problem.filter'

import type { ServerEvent } from '../analytics/server-analytics'

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
  // 1B-T9
  | 'attachment.retain' | 'attachment.replace' | 'attachment.file.download'
  // 1B-T10
  | 'import.confirm'
  // 1B-T8
  | 'snapshot.chunk.download'
  // 1B-T7
  | 'ai.preferences.get' | 'ai.preferences.put' | 'ai.parse' | 'ai.slip' | 'ai.note' | 'ai.ask'

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
  // 1B-T9: the two receipt routes, then the retain, replace and download steps.
  | 'attachments.remove' | 'attachments.grant' | 'attachments.prepare' | 'attachments.release' | 'attachments.retain' | 'attachments.replace' | 'attachments.file'
  // 1B-T10: the four review routes, then the confirmation's prepare and command steps.
  | 'imports.preview' | 'imports.patchRows' | 'imports.freeze' | 'imports.progress' | 'imports.confirmPrepare' | 'imports.confirm'
  // 1B-T8: the two snapshot routes, then the chunk download's step-only id.
  | 'snapshots.request' | 'snapshots.status' | 'snapshots.chunk'
  // 1B-T7: the AI routes' step-only ids (the six routes are Worker routes).
  | 'ai.preferences' | 'ai.setPreferences' | 'ai.context' | 'ai.consume' | 'ai.facts' | 'ai.tool'
  // P3-T7: the use a failed model call gives back.
  | 'ai.refund'
  // 1D-T11: the analytics answer's vault half (the Worker adds the analytics id).
  | 'me.analytics'
  // P4-T3: the slip salt and the slip accounts.
  | 'slips.salt' | 'slipAccounts.list' | 'slipAccounts.update'

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

/**
 * What a vault call read after its block, beside the reply (1D-T11, plan 1D's
 * L6), for the Worker's server events; never sent to the phone. `consent` is
 * the caller's own answer ('unasked' whenever the vault did not hold the
 * caller's account), `events` the record_saved events of what the call
 * committed, and `failure` the class name of a 500 INTERNAL_ERROR, else null.
 */
export type VaultAnalytics = { consent: 'yes' | 'no' | 'unasked'; events: ServerEvent[]; failure: string | null }
