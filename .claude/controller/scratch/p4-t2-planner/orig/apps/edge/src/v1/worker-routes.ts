import type { AiFeature } from '@gogospend/contracts'

import type { UserVault } from '../vault/user-vault'
import { bridgeCatalogue } from './bridge'
import { uploadRoute } from './files/uploads'
import { serveExportFile, serveReceiptFile, serveSnapshotChunk } from './files/downloads'
import { confirmRoute, replaceRoute, retainRoute } from './files/receipts'
import { aiAskRoute, aiNoteRoute, aiParseRoute, aiPreferencesRoute, aiSetPreferencesRoute, aiSlipRoute } from './ai/routes'
import type { ModelTransport } from './ai/transport'
import { livePolicies } from './config'
import type { EdgeConfig } from './config'
import type { V1Env } from './env'
import type { EdgeGates } from './gates'
import type { PublishedPolicies, VaultAccess, VaultCall, VaultClaims, VaultReply, VaultRouteId, WorkerRouteId } from './protocol'
import type { VaultRoute } from './routes'

/**
 * The caller's vault for the steps of one Worker request. The first call
 * carries the route's charge; every later call is a step and is not charged.
 */
export type VaultSession = {
  readonly vaultId: string
  readonly stub: DurableObjectStub<UserVault>
  readonly policies: PublishedPolicies
  call(route: VaultRouteId, input?: { params?: Record<string, string>; query?: Record<string, unknown>; headers?: Record<string, string | undefined>; body?: unknown }): Promise<VaultReply>
}

/** What a Worker-run route receives. Public routes have no claims and no vault. */
export type WorkerContext = {
  env: V1Env
  request: Request
  claims: VaultClaims | null
  policies: PublishedPolicies
  /** config:v1's gates: the API's scopes and `ai` (P3-T3). */
  gates: EdgeGates
  params: Record<string, string>
  query: Record<string, unknown>
  headers: Record<string, string | undefined>
  body: unknown
  stream?: AsyncIterable<Uint8Array>
  vault: VaultSession | null
  waitUntil(promise: Promise<unknown>): void
  /** The AI routes' model transport (P3-T4), from the front door's deps or built from the env; null when AI is not configured. */
  transport?: ModelTransport | null
  /** The AI routes' deadlines (P3-T6), from the front door's deps; absent, AI_ROUTE_DEADLINE_MS's. */
  aiDeadlines?: Partial<Record<AiFeature, number>>
}

export type WorkerHandler = (w: WorkerContext) => Promise<Response | VaultReply>

export const WORKER_HANDLERS: Partial<Record<WorkerRouteId, WorkerHandler>> = {
  'bridge.catalogue': bridgeCatalogue,
  'import.upload': uploadRoute,
  'export.file.download': serveExportFile,
  'attachment.retain': retainRoute,
  'attachment.replace': replaceRoute,
  'attachment.file.download': serveReceiptFile,
  'import.confirm': confirmRoute,
  'snapshot.chunk.download': serveSnapshotChunk,
  'ai.preferences.get': aiPreferencesRoute,
  'ai.preferences.put': aiSetPreferencesRoute,
  'ai.parse': aiParseRoute,
  'ai.slip': aiSlipRoute,
  'ai.note': aiNoteRoute,
  'ai.ask': aiAskRoute,
}

export function vaultSession(env: V1Env, claims: VaultClaims, policies: PublishedPolicies, access: VaultAccess, charge: 'read' | 'write'): VaultSession {
  const id = env.VAULT.idFromName(claims.accountId)
  const stub = env.VAULT.get(id, { locationHint: 'apac' })
  let charged = false
  return {
    vaultId: id.toString(),
    stub,
    policies,
    async call(route, input = {}) {
      const reply = await stub.call({
        route,
        access,
        charge: charged ? 'step' : charge,
        claims,
        policies,
        params: input.params ?? {},
        query: input.query ?? {},
        headers: input.headers ?? {},
        body: input.body,
      })
      charged = true
      return reply
    },
  }
}

/**
 * The session a Worker route calls. Policies are the live list (a version
 * published later is not in force yet), and the charge follows the method:
 * GET is a read, anything else a write.
 */
export function workerSessionFor(env: V1Env, claims: VaultClaims, config: EdgeConfig, route: VaultRoute, now: Date): VaultSession {
  if (route.access === 'public') throw new Error('a public route has no vault session')
  return vaultSession(env, claims, livePolicies(config.policies, now), route.access, route.method === 'GET' ? 'read' : 'write')
}
