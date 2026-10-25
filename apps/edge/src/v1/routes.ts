// The vault Worker's route table. Every route the PostgreSQL edge declares sits
// in exactly one place: ported here (VAULT_V1_ROUTES), pending for a later task
// of Phase 1A, deferred to 1B, or retired by §6.4. vault-route-coverage.test.ts
// checks that. Each task moves its routes from pending into VAULT_V1_ROUTES.
import type { GateScope } from '@api/common/feature-gates'

import type { VaultRouteId, WorkerRouteId } from './protocol'

/**
 * A route the vault Worker serves. A route with `vault` is answered by that
 * vault call; a public route without one is answered by the Worker itself.
 */
export type VaultRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  access: 'public' | 'bound_session' | 'current_policy' | 'recent_proof'
  /** A vault call. A route has this or `worker`, except the public policy list, which has neither. */
  vault?: VaultRouteId
  /** A Worker-run route. It calls the vault in steps, through `VAULT_STEP_ROUTES`. */
  worker?: WorkerRouteId
  gates?: readonly GateScope[]
  /** The status a success answers with, when it is not the method's default. */
  status?: number
  /** How the body is read. The default is `json`. `stream` leaves the body unread. */
  body?: 'json' | 'stream'
}

/** The default: 201 for POST, 200 otherwise (defaultStatus in the PostgreSQL route table). */
export function vaultStatus(r: VaultRoute): number {
  return r.status ?? (r.method === 'POST' ? 201 : 200)
}

/** Writes to wallets are commands, and every mutating route carries the writes gate (C12). */
const WRITES: readonly GateScope[] = ['writes']

/** The routes ported so far: the front door, wallets, categories, command status, the sync delta feed and the cashback catalogue. */
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
  // commands/command-status.controller.ts
  { method: 'POST', path: '/v1/commands/status', access: 'bound_session', vault: 'commands.status', status: 200 },
  // sync/sync.controller.ts: the delta feed (the snapshot routes are 1B).
  { method: 'GET', path: '/v1/sync/changes', access: 'bound_session', vault: 'sync.changes' },
]

const ROUTE_BY_ID = new Map<VaultRouteId, VaultRoute>(VAULT_V1_ROUTES.flatMap((route) => (route.vault ? [[route.vault, route] as const] : [])))

/** The ported route a vault call names, or undefined when the vault does not serve it yet. */
export function vaultRouteOf(id: VaultRouteId): VaultRoute | undefined {
  return ROUTE_BY_ID.get(id)
}

/**
 * Step-only vault ids. They have no HTTP route of their own: a Worker route
 * calls them as later steps of one request. Empty until a task adds one.
 */
export const VAULT_STEP_ROUTES: Partial<Record<VaultRouteId, { status?: number }>> = {}

/** The step-only entry a vault call names, or undefined when the id is not a step. */
export function stepRouteOf(id: VaultRouteId): { status?: number } | undefined {
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

/** Routes for Tasks 5 to 7 of Phase 1A: transactions, budgets, history and summary. */
export const VAULT_PENDING_ROUTES: readonly string[] = [
  'GET /v1/transactions/:id',
  'POST /v1/transactions',
  'PATCH /v1/transactions/:id',
  'DELETE /v1/transactions/:id',
  'POST /v1/transactions/:id/restore',
  'GET /v1/budgets/:month',
  'PUT /v1/budgets/:month',
  'GET /v1/history',
  'GET /v1/history/deleted',
  'GET /v1/summary',
]

/** Routes for later Phase 1B tasks: snapshots, exports, imports, attachments, deletion and the AI companion. */
export const VAULT_DEFERRED_ROUTES: readonly string[] = [
  'POST /v1/me/deletion',
  'POST /v1/auth/deletion-receipt',
  'POST /v1/sync/snapshots',
  'GET /v1/sync/snapshots/:id',
  'GET /v1/sync/snapshot-chunks/:grant',
  'POST /v1/exports',
  'GET /v1/exports/:id',
  'GET /v1/exports/:id/grant',
  'GET /v1/export-files/:grant',
  'POST /v1/imports',
  'GET /v1/imports/:id',
  'GET /v1/imports/:id/preview',
  'PATCH /v1/imports/:id/rows',
  'POST /v1/imports/:id/selections',
  'POST /v1/imports/:id/confirmations',
  'GET /v1/imports/:id/selections/:selectionId',
  'POST /v1/transactions/:id/attachment',
  'PUT /v1/transactions/:id/attachment',
  'DELETE /v1/transactions/:id/attachment',
  'GET /v1/attachments/:id/grant',
  'GET /v1/attachment-files/:grant',
  'GET /v1/me/ai-preferences',
  'PUT /v1/me/ai-preferences',
  'POST /v1/ai/parse',
  'POST /v1/ai/slip',
  'GET /v1/ai/note',
  'POST /v1/ai/ask',
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
