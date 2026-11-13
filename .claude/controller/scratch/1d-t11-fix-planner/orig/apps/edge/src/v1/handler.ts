import { waitUntil } from 'cloudflare:workers'

import { V1_HEADERS, formatClientHeader, parseClientHeader } from '@gogospend/contracts'
import type { AiFeature, PolicyKind, PolicyVersionDto } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { failureName } from '@api/common/operational-metrics'

import { analyticsIdFor, createServerAnalytics } from '../analytics/server-analytics'
import type { ServerAnalytics, ServerEvent } from '../analytics/server-analytics'
import type { ModelTransport } from './ai/transport'
import { transportFromEnv } from './ai/transport'
import { BASE_HEADERS, errorResponse, jsonResponse, problemResponse } from '../server/http/problem'
import { queryOf, readJsonBody, reqLike } from '../server/http/request'
import { bindCatalogueFetch } from './bridge'
import { livePolicies, readEdgeConfig } from './config'
import type { EdgeConfig } from './config'
import type { V1Env } from './env'
import { logFailure } from './log'
import { matchRoute } from './match'
import type { PublishedPolicies, VaultAccess, VaultAnalytics, VaultClaims, VaultReply, VaultRouteId } from './protocol'
import { VAULT_V1_ROUTES } from './routes'
import type { VaultRoute } from './routes'
import { tokenVerifierFromEnv } from './tokens'
import type { TokenVerifier } from './tokens'
import { WORKER_HANDLERS, workerSessionFor } from './worker-routes'
import type { VaultSession, WorkerContext } from './worker-routes'
import type { UserVault } from '../vault/user-vault'
import { liveRequest, wantsWebSocket } from '../vault/live'

export type V1Deps = {
  verifier?: TokenVerifier
  config?: (env: V1Env) => Promise<EdgeConfig>
  /** Extends this invocation. The default is the Workers `waitUntil`. */
  waitUntil?: (promise: Promise<unknown>) => void
  /** The catalogue fetch. Tests point it at a fake; the source uses `fetch` when it is absent. */
  fetchCatalogue?: typeof fetch
  /** Starts the vault's pending work after a `starts` route answers 2xx (B5). The default is `stub.startPendingWork()`. */
  startWork?: (stub: DurableObjectStub<UserVault>) => Promise<unknown>
  /** The AI routes' model transport (P3-T4). Tests give a fake, or null for AI that is not configured; absent, AI_ENABLED and ANTHROPIC_API_KEY decide. */
  transport?: ModelTransport | null
  /** Each AI route's deadline in ms (P3-T6), in place of AI_ROUTE_DEADLINE_MS's. Tests give short ones; the Worker gives none. */
  aiDeadlines?: Partial<Record<AiFeature, number>>
  /**
   * Server analytics (1D-T11): the PostHog client for this env, or null to send nothing. Absent, it is
   * createServerAnalytics(env, waitUntil), which builds no client without POSTHOG_PROJECT_TOKEN. Tests give one with a fake port.
   */
  analytics?: (env: V1Env) => ServerAnalytics | null
}

/** A route marked `starts` hands its vault to startWork only after a 2xx answer. */
export function startsWork(route: VaultRoute, status: number): boolean {
  return route.starts === true && status >= 200 && status < 300
}

/**
 * Starts the vault's pending work after the reply, through waitUntil. A start
 * that fails is logged and left to the vault's alarm, which starts it again (1B-T11).
 */
function handOffWork(deps: V1Deps, stub: DurableObjectStub<UserVault>): void {
  const start = deps.startWork ?? ((vault: DurableObjectStub<UserVault>) => vault.startPendingWork())
  ;(deps.waitUntil ?? waitUntil)(start(stub).catch((error: unknown) => logFailure('pending_work_unstarted', error)))
}

/**
 * GET /v1/sync/live (1D-T10, L1): only a WebSocket upgrade, else 400 (never
 * 426, which the app reads as "update the app"). The vault gets a fresh
 * internal request whose only claim carrier is the header the Worker writes;
 * the token never reaches it. Its answer, a 101 with the socket or a problem,
 * goes back unchanged.
 */
async function openLiveSocket(request: Request, stub: DurableObjectStub<UserVault>, claims: VaultClaims): Promise<Response> {
  if (!wantsWebSocket(request)) throw new ProblemException(400, 'VALIDATION_FAILED')
  return stub.fetch(liveRequest(claims))
}

/** The request headers a vault call receives: the command headers, lowercase, and nothing else. */
const FORWARDED_HEADERS = ['idempotency-key', 'x-gogospend-command-schema', 'if-match'] as const

/**
 * The verifier for this Worker's settings, built once per isolate. A missing or
 * invalid setting is a server misconfiguration: 503 with a retry, never a 500.
 */
const verifiers = new WeakMap<V1Env, TokenVerifier>()

function verifierFor(env: V1Env): TokenVerifier {
  const known = verifiers.get(env)
  if (known) return known
  let built: TokenVerifier
  try {
    built = tokenVerifierFromEnv(env)
  } catch (error) {
    logFailure('token_verifier_unavailable', error)
    throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 30 })
  }
  verifiers.set(env, built)
  return built
}

/**
 * One v1 request, through the API's pipeline in the same order as the
 * PostgreSQL dispatcher: route (404), JSON body (400, 413), gates (503), the
 * public policy list, client version (426), token (401), then the vault call,
 * made on the Durable Object named by the verified account. A Worker route
 * runs in place of the vault call: a public one straight after the gates, any
 * other after the client version and the token.
 */
export async function handleVaultV1(request: Request, env: V1Env, deps: V1Deps = {}): Promise<Response> {
  const requestId = crypto.randomUUID()
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  const match = matchRoute(VAULT_V1_ROUTES, method, url.pathname)
  if (!match) return problemResponse(404, 'NOT_FOUND', requestId)
  const { route, params } = match
  try {
    const { body, stream } = await readRouteBody(request, route)
    const config = await (deps.config ?? ((e: V1Env) => readEdgeConfig(e.CONFIG, e)))(env)
    const now = new Date()
    const policies = livePolicies(config.policies, now)
    config.gates.assertOpen(...(route.gates ?? []))
    if (route.worker) {
      let claims: VaultClaims | null = null
      let vault: VaultSession | null = null
      if (route.access !== 'public') {
        claims = await authenticate(request, env, deps, config, route.access)
        vault = workerSessionFor(env, claims, config, route, now)
      }
      return await runWorker(route, method, requestId, deps, {
        env,
        request,
        claims,
        policies,
        gates: config.gates,
        params,
        query: queryOf(url),
        headers: reqLike(request).headers,
        body,
        stream,
        vault,
        transport: deps.transport !== undefined ? deps.transport : transportFromEnv(env),
        aiDeadlines: deps.aiDeadlines,
        waitUntil: deps.waitUntil ?? waitUntil,
      })
    }
    if (route.access === 'public') return await headOf(jsonResponse(200, latestPerKind(policies), requestId), method)
    const claims = await authenticate(request, env, deps, config, route.access)
    const stub = env.VAULT.get(env.VAULT.idFromName(claims.accountId), { locationHint: 'apac' })
    // The live socket (1D-T10): after every check above, the vault's fetch answers it in place of the vault call.
    if (route.live) return await openLiveSocket(request, stub, claims)
    if (!route.vault) throw new Error('a bound route names no vault call')
    const { reply, analytics } = await stub.callWithAnalytics({
      route: route.vault,
      access: route.access,
      charge: route.method === 'GET' ? 'read' : 'write',
      claims,
      policies,
      params,
      query: queryOf(url),
      headers: headersOf(request),
      body,
    })
    if (startsWork(route, reply.status)) handOffWork(deps, stub)
    // Server events (1D-T11): what the vault read goes to PostHog or nowhere, never into the response.
    await sendServerEvents(request, env, deps, route.vault, claims, reply, analytics)
    const answer = route.vault === 'me.analytics' ? await withAnalyticsId(reply, env, claims) : reply
    return await headOf(replyResponse(answer, requestId), method)
  } catch (error) {
    const response = errorResponse(error, requestId, `${route.method} ${route.path}`)
    // An unexpected Worker exception (1D-T11, L6): only what errorResponse answers with 500 INTERNAL_ERROR is
    // counted, by its class name and anonymously; a deliberate refusal never is.
    if (response.status === 500) countWorkerFailure(env, deps, error)
    return response
  }
}

/** The routes the phone's outbox and sync use: a 500 on one is a sync_failed (L6). */
const OUTBOX_ROUTES: readonly VaultRouteId[] = ['transactions.create', 'sync.changes']

const isInternalError = (reply: VaultReply): boolean => !reply.ok && reply.status === 500 && reply.code === 'INTERNAL_ERROR'

/** The server's PostHog client for this request, or null (1D-T11); built only when there is something to send. */
function analyticsOf(env: V1Env, deps: V1Deps): ServerAnalytics | null {
  return deps.analytics ? deps.analytics(env) : createServerAnalytics(env, deps.waitUntil ?? waitUntil)
}

/** The analytics id (L5): the HMAC of the account id under ANALYTICS_ID_KEY, or null while the key is unset. */
async function analyticsIdOf(env: V1Env, claims: VaultClaims): Promise<string | null> {
  const key = env.ANALYTICS_ID_KEY
  return key ? analyticsIdFor(claims.accountId, key) : null
}

/** GET /v1/me/analytics (L5): exactly the analytics id, the weeks and the consent; a refusal goes back unchanged. */
async function withAnalyticsId(reply: VaultReply, env: V1Env, claims: VaultClaims): Promise<VaultReply> {
  if (!reply.ok) return reply
  const { weeks_since_signup, consent } = reply.body as { weeks_since_signup: number; consent: VaultAnalytics['consent'] }
  return { ...reply, body: { analytics_id: await analyticsIdOf(env, claims), weeks_since_signup, consent } }
}

/** The events a reply itself says (L6): resync_required for a 410 RESYNC_REQUIRED, sync_failed for a 500 INTERNAL_ERROR on the outbox's routes. */
function replyEvents(vault: VaultRouteId, reply: VaultReply): ServerEvent[] {
  if (!reply.ok && reply.status === 410 && reply.code === 'RESYNC_REQUIRED') return [{ name: 'resync_required', properties: { reason_code: 'RESYNC_REQUIRED' } }]
  if (isInternalError(reply) && OUTBOX_ROUTES.includes(vault)) return [{ name: 'sync_failed', properties: { reason_code: 'INTERNAL_ERROR' } }]
  return []
}

/** `X-GoGoSpend-Analytics: off`, which the phone sends unless its answer is yes (L4), stops server events for this request. */
function analyticsOff(request: Request): boolean {
  return request.headers.get('x-gogospend-analytics')?.toLowerCase() === 'off'
}

/**
 * Server events after a vault call (1D-T11, L6). A 500 INTERNAL_ERROR is counted by its class name,
 * anonymously, whatever the consent. Under the analytics id, only when the person said yes, this request is
 * not marked off and ANALYTICS_ID_KEY is set: the records the call committed, and what the reply says.
 * Never throws, so the reply stands whatever PostHog does; a failure is logged by its class name only.
 */
async function sendServerEvents(request: Request, env: V1Env, deps: V1Deps, vault: VaultRouteId, claims: VaultClaims, reply: VaultReply, analytics: VaultAnalytics): Promise<void> {
  try {
    const failed = isInternalError(reply)
    const events = analytics.consent === 'yes' && !analyticsOff(request) ? [...analytics.events, ...replyEvents(vault, reply)] : []
    if (!failed && events.length === 0) return
    const client = analyticsOf(env, deps)
    if (client === null) return
    if (failed) client.captureFailure(analytics.failure ?? 'Error', vault)
    if (events.length === 0) return
    const analyticsId = await analyticsIdOf(env, claims)
    if (analyticsId === null) return
    for (const event of events) client.capture(analyticsId, event)
  } catch (error) {
    logFailure('server_events_failed', error)
  }
}

/** Counts an unexpected Worker exception by its class name, as the Worker's own; never throws. */
function countWorkerFailure(env: V1Env, deps: V1Deps, error: unknown): void {
  try {
    analyticsOf(env, deps)?.captureFailure(failureName(error), 'worker')
  } catch (failure) {
    logFailure('server_events_failed', failure)
  }
}

/**
 * JSON, as the edge's dispatcher reads it: `readJsonBody` ignores any other
 * content type. A `stream` route then keeps that unread body for the handler.
 * A JSON body sent to a stream route is parsed here, and there is no stream.
 */
async function readRouteBody(request: Request, route: VaultRoute): Promise<{ body: unknown; stream?: AsyncIterable<Uint8Array> }> {
  const body = await readJsonBody(request)
  const stream = route.body === 'stream' && !request.bodyUsed && request.body ? (request.body as unknown as AsyncIterable<Uint8Array>) : undefined
  return { body, stream }
}

/** Client version, then the access token. Public routes never reach this. */
async function authenticate(request: Request, env: V1Env, deps: V1Deps, config: EdgeConfig, access: VaultAccess): Promise<VaultClaims> {
  config.clientVersions.check(access, reqLike(request) as never)
  const client = parseClientHeader(request.headers.get(V1_HEADERS.client))
  if (!client) throw new ProblemException(426, 'CLIENT_UPGRADE_REQUIRED')
  const verifier = deps.verifier ?? verifierFor(env)
  return verifier.verify(request.headers.get('authorization') ?? undefined, formatClientHeader(client))
}

async function runWorker(route: VaultRoute, method: string, requestId: string, deps: V1Deps, context: WorkerContext): Promise<Response> {
  if (!route.worker) throw new Error('a worker route names no handler')
  bindCatalogueFetch(deps.fetchCatalogue)
  const handler = WORKER_HANDLERS[route.worker]
  if (!handler) throw new Error('a worker route names no handler')
  const result = await handler(context)
  const response = result instanceof Response ? withV1Headers(result, requestId) : replyResponse(result, requestId)
  if (context.vault && startsWork(route, response.status)) handOffWork(deps, context.vault.stub)
  return headOf(response, method)
}

function headersOf(request: Request): Record<string, string | undefined> {
  return Object.fromEntries(FORWARDED_HEADERS.map((name) => [name, request.headers.get(name) ?? undefined]))
}

function replyResponse(reply: VaultReply, requestId: string): Response {
  return reply.ok
    ? jsonResponse(reply.status, reply.body, requestId, reply.headers)
    : problemResponse(reply.status, reply.code, requestId, reply.problem)
}

/** A handler's file response, with the v1 headers every response carries (its own take precedence). */
function withV1Headers(response: Response, requestId: string): Response {
  const headers = new Headers({ ...BASE_HEADERS, 'x-request-id': requestId })
  response.headers.forEach((value, name) => headers.set(name, value))
  return new Response(response.body, { status: response.status, headers })
}

/**
 * A HEAD request gets the status and headers of its GET, and no body. The
 * GET's body is read to its end and discarded, not just dropped, so what it
 * holds is given back before the HEAD is answered: a download returns its slot
 * and finishes its R2 read (R96). Cancelling the body is not enough: the
 * Workers runtime ends the request before a cancel reaches the stream behind
 * a download's FixedLengthStream, and the slot would stay taken. Never rejects;
 * its callers inside a `try` still await it, so a rejection would reach
 * errorResponse (the 1B-T6 confirming review's n-1).
 */
async function headOf(response: Response, method: string): Promise<Response> {
  if (method !== 'HEAD') return response
  await response.body?.pipeTo(new WritableStream()).catch(() => undefined)
  return new Response(null, { status: response.status, headers: response.headers })
}

/** The latest published version of each kind, ordered by kind: what GET /v1/policies answers. */
function latestPerKind(policies: PublishedPolicies): PolicyVersionDto[] {
  const latest = new Map<PolicyKind, PolicyVersionDto>()
  for (const policy of policies ?? []) {
    const current = latest.get(policy.kind)
    if (!current || policy.version > current.version) latest.set(policy.kind, policy)
  }
  return [...latest.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
}
