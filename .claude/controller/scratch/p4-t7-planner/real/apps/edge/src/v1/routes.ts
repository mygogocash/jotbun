// The vault's route table, served by the one Worker (C1). Every NestJS v1 route
// sits in exactly one place: served here (VAULT_V1_ROUTES), deferred to 1C, or
// retired by §6.4; the routes NestJS never had are the edge-only and the added
// ones. route-coverage.test.ts checks that against the NestJS controllers.
import type { EdgeGateScope } from './gates'
import type { VaultRouteId, WorkerRouteId } from './protocol'

/**
 * A route the vault Worker serves. A route with `vault` is answered by that
 * vault call, one with `worker` by the Worker in steps, and the live route by
 * UserVault#fetch; the public policy list has none of them and is answered by
 * the Worker itself.
 */
export type VaultRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  access: 'public' | 'bound_session' | 'current_policy' | 'recent_proof'
  /** A vault call. A route has this or `worker`, except the public policy list, which has neither. */
  vault?: VaultRouteId
  /** A Worker-run route. It calls the vault in steps, through `VAULT_STEP_ROUTES`. */
  worker?: WorkerRouteId
  /** The gates that must all be open (C12): the API's scopes, and `ai` on every route that calls a model (P3-T3). */
  gates?: readonly EdgeGateScope[]
  /** The status a success answers with, when it is not the method's default. */
  status?: number
  /** How the body is read. The default is `json`. `stream` leaves the body unread. */
  body?: 'json' | 'stream'
  /** After a 2xx answer the Worker starts the vault's pending work through waitUntil (B5, 1B-T4). */
  starts?: true
  /** The live socket (1D-T10): UserVault#fetch answers it as a WebSocket, so the route has neither `vault` nor `worker`. */
  live?: true
  /**
   * The release var the route waits for (P4-T3, S13). Until it is `1` or `true`
   * the route answers 404 right after matching, before its body, gates and token,
   * as if it did not exist.
   */
  release?: 'SLIP_IMPORT_ENABLED'
}

/** The default: 201 for POST, 200 otherwise (defaultStatus in the PostgreSQL route table). */
export function vaultStatus(r: VaultRoute): number {
  return r.status ?? (r.method === 'POST' ? 201 : 200)
}

/** Writes to wallets are commands, and every mutating route carries the writes gate (C12). */
const WRITES: readonly EdgeGateScope[] = ['writes']

/** Every route the vault serves: each NestJS v1 route but the two 1C defers and the six §6.4 retires, the edge-only routes and the added ones. */
export const VAULT_V1_ROUTES: readonly VaultRoute[] = [
  // policies/policy.controller.ts: the published text, answered from config:v1 by the Worker.
  { method: 'GET', path: '/v1/policies', access: 'public' },
  // The GoGoCash bridge (D16): a public catalogue, no account data, answered by the Worker.
  { method: 'GET', path: '/v1/bridge/gogocash/catalogue', access: 'public', worker: 'bridge.catalogue' },
  { method: 'POST', path: '/v1/me/policy-acceptances', access: 'bound_session', vault: 'policies.accept', status: 204 },
  { method: 'PUT', path: '/v1/me/privacy-preferences', access: 'bound_session', vault: 'me.privacy' },
  // privacy/account routes: the account summary and sign-out.
  { method: 'GET', path: '/v1/me', access: 'bound_session', vault: 'me.get' },
  { method: 'POST', path: '/v1/me/logout', access: 'bound_session', vault: 'me.logout', status: 204 },
  // The analytics answer (1D-T11, L5): an added route; the Worker adds the analytics id to the vault's answer.
  { method: 'GET', path: '/v1/me/analytics', access: 'bound_session', vault: 'me.analytics' },
  // wallets/wallets.controller.ts
  { method: 'GET', path: '/v1/wallets', access: 'bound_session', vault: 'wallets.list' },
  { method: 'GET', path: '/v1/wallets/:id', access: 'bound_session', vault: 'wallets.get' },
  { method: 'POST', path: '/v1/wallets', access: 'current_policy', vault: 'wallets.create', gates: WRITES },
  { method: 'PATCH', path: '/v1/wallets/:id', access: 'current_policy', vault: 'wallets.update', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/wallets/:id/archive', access: 'current_policy', vault: 'wallets.archive', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/wallets/:id/unarchive', access: 'current_policy', vault: 'wallets.unarchive', gates: WRITES, status: 200 },
  // categories/categories.controller.ts
  { method: 'GET', path: '/v1/categories', access: 'bound_session', vault: 'categories.list' },
  { method: 'POST', path: '/v1/categories/builtins', access: 'current_policy', vault: 'categories.builtins', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/categories', access: 'current_policy', vault: 'categories.create', gates: WRITES },
  { method: 'PATCH', path: '/v1/categories/:id', access: 'current_policy', vault: 'categories.update', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/categories/:id/archive', access: 'current_policy', vault: 'categories.archive', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/categories/:id/unarchive', access: 'current_policy', vault: 'categories.unarchive', gates: WRITES, status: 200 },
  // transactions/transactions.controller.ts
  { method: 'GET', path: '/v1/transactions/:id', access: 'bound_session', vault: 'transactions.get' },
  { method: 'POST', path: '/v1/transactions', access: 'current_policy', vault: 'transactions.create', gates: WRITES },
  { method: 'PATCH', path: '/v1/transactions/:id', access: 'current_policy', vault: 'transactions.update', gates: WRITES, status: 200 },
  { method: 'DELETE', path: '/v1/transactions/:id', access: 'current_policy', vault: 'transactions.delete', gates: WRITES, status: 200 },
  { method: 'POST', path: '/v1/transactions/:id/restore', access: 'current_policy', vault: 'transactions.restore', gates: WRITES, status: 200 },
  // budgets/budgets.controller.ts
  { method: 'GET', path: '/v1/budgets/:month', access: 'bound_session', vault: 'budgets.get' },
  { method: 'PUT', path: '/v1/budgets/:month', access: 'current_policy', vault: 'budgets.put', gates: WRITES },
  // history/history.controller.ts: reads, so no gates.
  { method: 'GET', path: '/v1/history', access: 'bound_session', vault: 'history.list' },
  { method: 'GET', path: '/v1/history/deleted', access: 'bound_session', vault: 'history.deleted' },
  // summary/summary.controller.ts
  { method: 'GET', path: '/v1/summary', access: 'bound_session', vault: 'summary.get' },
  // commands/command-status.controller.ts
  { method: 'POST', path: '/v1/commands/status', access: 'bound_session', vault: 'commands.status', status: 200 },
  // The live socket (1D-T10, §6.5): an added route, answered by UserVault#fetch as a WebSocket.
  { method: 'GET', path: '/v1/sync/live', access: 'bound_session', live: true },
  // sync/sync.controller.ts: the delta feed (the snapshot routes are 1B).
  { method: 'GET', path: '/v1/sync/changes', access: 'bound_session', vault: 'sync.changes' },
  // imports/imports.controller.ts (1B-T5): the body streams into quarantine in Worker steps; once accepted, the vault's parse starts.
  { method: 'POST', path: '/v1/imports', access: 'current_policy', worker: 'import.upload', body: 'stream', gates: ['uploads', 'imports'], status: 202, starts: true },
  { method: 'GET', path: '/v1/imports/:id', access: 'bound_session', vault: 'imports.status' },
  // exports/exports.controller.ts (1B-T6): a request needs a sign-in from the last five minutes; ExportWorkflow writes the file after the 202.
  { method: 'POST', path: '/v1/exports', access: 'recent_proof', vault: 'exports.request', gates: ['jobs'], status: 202, starts: true },
  { method: 'GET', path: '/v1/exports/:id', access: 'bound_session', vault: 'exports.status' },
  { method: 'GET', path: '/v1/exports/:id/grant', access: 'bound_session', vault: 'exports.grant' },
  // The CSV streams from R2 in the Worker, after the `exports.file` step names it.
  { method: 'GET', path: '/v1/export-files/:grant', access: 'bound_session', worker: 'export.file.download' },
  // attachments/attachments.controller.ts (1B-T9): receipts are commands on the record (If-Match, Idempotency-Key).
  // Retain and replace copy the preview's image in the Worker between their steps; remove is one vault call.
  { method: 'POST', path: '/v1/transactions/:id/attachment', access: 'current_policy', worker: 'attachment.retain', gates: ['imports', 'writes'], status: 200 },
  { method: 'PUT', path: '/v1/transactions/:id/attachment', access: 'current_policy', worker: 'attachment.replace', gates: ['imports', 'writes'], status: 200 },
  { method: 'DELETE', path: '/v1/transactions/:id/attachment', access: 'current_policy', vault: 'attachments.remove', gates: WRITES, status: 200 },
  { method: 'GET', path: '/v1/attachments/:id/grant', access: 'bound_session', vault: 'attachments.grant' },
  // The image streams from R2 in the Worker, after the `attachments.file` step names it.
  { method: 'GET', path: '/v1/attachment-files/:grant', access: 'bound_session', worker: 'attachment.file.download' },
  // imports/imports.controller.ts and confirmation.controller.ts (1B-T10): the preview, corrections, the frozen
  // selection and its progress are one vault call each; a confirmation with a receipt copies the image between its steps.
  { method: 'GET', path: '/v1/imports/:id/preview', access: 'bound_session', vault: 'imports.preview' },
  { method: 'PATCH', path: '/v1/imports/:id/rows', access: 'current_policy', vault: 'imports.patchRows', gates: ['imports'], status: 200 },
  { method: 'POST', path: '/v1/imports/:id/selections', access: 'current_policy', vault: 'imports.freeze', gates: ['imports'], status: 201 },
  { method: 'POST', path: '/v1/imports/:id/confirmations', access: 'current_policy', worker: 'import.confirm', gates: ['imports', 'writes'], status: 200 },
  { method: 'GET', path: '/v1/imports/:id/selections/:selectionId', access: 'bound_session', vault: 'imports.progress' },
  // sync/sync.controller.ts (1B-T8): SnapshotWorkflow builds a requested snapshot after the reply, which the vault
  // sets to 200 (ready) or 202; each chunk streams from R2 in the Worker, after the `snapshots.chunk` step names it.
  { method: 'POST', path: '/v1/sync/snapshots', access: 'bound_session', vault: 'snapshots.request', gates: ['jobs'], starts: true },
  { method: 'GET', path: '/v1/sync/snapshots/:id', access: 'bound_session', vault: 'snapshots.status' },
  { method: 'GET', path: '/v1/sync/snapshot-chunks/:grant', access: 'bound_session', worker: 'snapshot.chunk.download' },
  // The AI companion (1B-T7): the PostgreSQL edge's own routes, run in the Worker with the vault's `ai.*` steps.
  // The four that call a model carry the `ai` gate (P3-T3): paused, they answer 503 AI_PAUSED before the token.
  // The preferences stay open (default pending owner Q5) and say `available: false` while `ai` is paused.
  { method: 'GET', path: '/v1/me/ai-preferences', access: 'bound_session', worker: 'ai.preferences.get' },
  { method: 'PUT', path: '/v1/me/ai-preferences', access: 'bound_session', worker: 'ai.preferences.put' },
  { method: 'POST', path: '/v1/ai/parse', access: 'current_policy', worker: 'ai.parse', gates: ['ai'], status: 200 },
  { method: 'POST', path: '/v1/ai/slip', access: 'current_policy', worker: 'ai.slip', gates: ['ai'], status: 200 },
  { method: 'GET', path: '/v1/ai/note', access: 'bound_session', worker: 'ai.note', gates: ['ai'] },
  { method: 'POST', path: '/v1/ai/ask', access: 'current_policy', worker: 'ai.ask', gates: ['ai'], status: 200 },
  // Slip import (P4-T3, S13): the salt answers before slip import opens (a single read's slip ref needs it); the
  // slip accounts are 404 until SLIP_IMPORT_ENABLED is on. Mapping an account is a plain write (S1).
  { method: 'GET', path: '/v1/slips/salt', access: 'bound_session', vault: 'slips.salt' },
  { method: 'GET', path: '/v1/slip-accounts', access: 'bound_session', vault: 'slipAccounts.list', release: 'SLIP_IMPORT_ENABLED' },
  { method: 'PUT', path: '/v1/slip-accounts/:id', access: 'current_policy', vault: 'slipAccounts.update', gates: ['imports'], status: 200, release: 'SLIP_IMPORT_ENABLED' },
  // The catalog (P4-T2): the bank apps' album names, the same for everyone, answered by the Worker from CATALOG_DB with an ETag.
  { method: 'GET', path: '/v1/catalog/bank-albums', access: 'public', worker: 'catalog.bankAlbums' },
  // Slip drafts (P4-T7, S1): read online; a confirm or a dismiss is a command on the slip inbox. All three are 404
  // until SLIP_IMPORT_ENABLED is on. A single read's slip ref is a plain write that answers before slip import opens (S13).
  { method: 'GET', path: '/v1/drafts', access: 'bound_session', vault: 'drafts.list', release: 'SLIP_IMPORT_ENABLED' },
  { method: 'POST', path: '/v1/drafts/confirm', access: 'current_policy', vault: 'drafts.confirm', gates: ['imports', 'writes'], status: 200, release: 'SLIP_IMPORT_ENABLED' },
  { method: 'POST', path: '/v1/drafts/:id/dismiss', access: 'current_policy', vault: 'drafts.dismiss', gates: ['imports'], status: 200, release: 'SLIP_IMPORT_ENABLED' },
  { method: 'POST', path: '/v1/slips/refs', access: 'current_policy', vault: 'slips.refs', gates: ['imports'], status: 204 },
]

const ROUTE_BY_ID = new Map<VaultRouteId, VaultRoute>(VAULT_V1_ROUTES.flatMap((route) => (route.vault ? [[route.vault, route] as const] : [])))

/** The ported route a vault call names, or undefined when the vault does not serve it yet. */
export function vaultRouteOf(id: VaultRouteId): VaultRoute | undefined {
  return ROUTE_BY_ID.get(id)
}

/**
 * One step-only entry. `anySession`: the step still runs after its request's
 * session ended or its policy changed (the vault skips both checks), because
 * it only continues or cleans up the request's own work, as the API's
 * routines that take no account lock do (1B-T5).
 */
export type VaultStepRoute = { status?: number; anySession?: true }

/**
 * Step-only vault ids. They have no HTTP route of their own: a Worker route
 * calls them as later steps of one request.
 */
export const VAULT_STEP_ROUTES: Partial<Record<VaultRouteId, VaultStepRoute>> = {
  // 1B-T5: the upload's steps. Begin and finish check the session and policy, as the API's do under the account lock.
  'imports.begin': {},
  'imports.reservePart': { anySession: true },
  'imports.finish': {},
  'imports.abort': { anySession: true },
  'imports.discarded': { anySession: true },
  'imports.bytesRetry': { anySession: true },
  // 1B-T6: the export download's step. It checks the session: a download needs the session that asked.
  'exports.file': {},
  // 1B-T9: the receipt steps. Prepare, the two commands and the download check the session; release
  // only gives back the request's own unused copy, so it still runs after the session ended.
  'attachments.prepare': {},
  'attachments.release': { anySession: true },
  'attachments.retain': {},
  'attachments.replace': {},
  'attachments.file': {},
  // 1B-T10: the confirmation's steps. Both check the session: prepare reserves a receipt copy and confirm commits records.
  'imports.confirmPrepare': {},
  'imports.confirm': {},
  // 1B-T8: the snapshot chunk download's step. It checks the session: a download needs the session that asked.
  'snapshots.chunk': {},
  // 1B-T7: the AI routes' steps. Each checks the session, and on a current_policy route the policy, so a
  // request whose session ends or whose policy changes is refused at its next step, before any model call.
  'ai.preferences': {},
  'ai.setPreferences': {},
  'ai.context': {},
  'ai.consume': {},
  'ai.facts': {},
  'ai.tool': {},
  // P3-T7: the use a failed model call gives back. Like the receipt's release, it only gives back the
  // request's own use, so it still runs after the session ended or the policy changed during the call.
  'ai.refund': { anySession: true },
}

/** The step-only entry a vault call names, or undefined when the id is not a step. */
export function stepRouteOf(id: VaultRouteId): VaultStepRoute | undefined {
  return VAULT_STEP_ROUTES[id]
}

/** The success status of a ported route, else the step's status (200 when none is given). */
export function vaultStatusOf(id: VaultRouteId): number {
  const route = ROUTE_BY_ID.get(id)
  if (route) return vaultStatus(route)
  const step = stepRouteOf(id)
  if (step) return step.status ?? 200
  throw new Error(`no ported vault route ${id}`)
}

/** Routes for a later task of Phase 1A. None are left: Task 7 ported history and the summary. */
export const VAULT_PENDING_ROUTES: readonly string[] = []

/** Routes for 1C: account deletion and its receipt, built on 1B-T2's erase (B16). Every other v1 route is served. */
export const VAULT_DEFERRED_ROUTES: readonly string[] = [
  'POST /v1/me/deletion',
  'POST /v1/auth/deletion-receipt',
]

/** §6.4 retires these: the sign-in steps move to Better Auth in 1C. */
export const VAULT_RETIRED_ROUTES: readonly string[] = [
  'POST /v1/auth/bootstrap',
  'POST /v1/auth/challenges',
  'POST /v1/auth/proofs',
  'POST /v1/auth/provider-events',
  'POST /v1/me/global-logout',
  'POST /v1/me/identities',
]

/**
 * Routes the PostgreSQL edge never had (plans 1D and P4): served here, absent from the
 * NestJS controllers and never shadowed by one of their routes
 * (route-coverage.test.ts): the live socket (1D-T10), the analytics answer (1D-T11),
 * the slip salt and slip accounts (P4-T3), the bank-album list (P4-T2), and the slip
 * drafts and a single read's slip ref (P4-T7).
 */
export const VAULT_ADDED_ROUTES: readonly string[] = [
  'GET /v1/sync/live',
  'GET /v1/me/analytics',
  'GET /v1/slips/salt',
  'GET /v1/slip-accounts',
  'PUT /v1/slip-accounts/:id',
  'GET /v1/catalog/bank-albums',
  'GET /v1/drafts',
  'POST /v1/drafts/confirm',
  'POST /v1/drafts/:id/dismiss',
  'POST /v1/slips/refs',
]

/**
 * The PostgreSQL edge's own routes, which NestJS never had: the AI companion
 * (1B-T7) and the GoGoCash bridge. Served here, and never shadowed by a NestJS
 * route (route-coverage.test.ts).
 */
export const VAULT_EDGE_ONLY_ROUTES: readonly string[] = [
  'GET /v1/me/ai-preferences',
  'PUT /v1/me/ai-preferences',
  'POST /v1/ai/parse',
  'POST /v1/ai/slip',
  'GET /v1/ai/note',
  'POST /v1/ai/ask',
  'GET /v1/bridge/gogocash/catalogue',
]
