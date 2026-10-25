import { V1_HEADERS, formatClientHeader, parseClientHeader } from '@gogospend/contracts'
import type { PolicyKind, PolicyVersionDto } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import { errorResponse, jsonResponse, problemResponse } from '../server/http/problem'
import { queryOf, readJsonBody, reqLike } from '../server/http/request'
import { readEdgeConfig } from './config'
import type { EdgeConfig } from './config'
import type { V1Env } from './env'
import { logFailure } from './log'
import { matchRoute } from './match'
import type { PublishedPolicies, VaultReply } from './protocol'
import { VAULT_V1_ROUTES } from './routes'
import { tokenVerifierFromEnv } from './tokens'
import type { TokenVerifier } from './tokens'

export type V1Deps = {
  verifier?: TokenVerifier
  config?: (env: V1Env) => Promise<EdgeConfig>
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
 * made on the Durable Object named by the verified account.
 */
export async function handleVaultV1(request: Request, env: V1Env, deps: V1Deps = {}): Promise<Response> {
  const requestId = crypto.randomUUID()
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  const match = matchRoute(VAULT_V1_ROUTES, method, url.pathname)
  if (!match) return problemResponse(404, 'NOT_FOUND', requestId)
  const { route, params } = match
  try {
    const body = await readJsonBody(request)
    const config = await (deps.config ?? ((e: V1Env) => readEdgeConfig(e.CONFIG, e)))(env)
    config.gates.assertOpen(...(route.gates ?? []))
    if (route.access === 'public') return headOf(jsonResponse(200, latestPerKind(config.policies), requestId), method)
    config.clientVersions.check(route.access, reqLike(request) as never)
    const client = parseClientHeader(request.headers.get(V1_HEADERS.client))
    if (!client) throw new ProblemException(426, 'CLIENT_UPGRADE_REQUIRED')
    const verifier = deps.verifier ?? verifierFor(env)
    const claims = await verifier.verify(request.headers.get('authorization') ?? undefined, formatClientHeader(client))
    if (!route.vault) throw new Error('a bound route names no vault call')
    const stub = env.VAULT.get(env.VAULT.idFromName(claims.accountId), { locationHint: 'apac' })
    const reply = await stub.call({
      route: route.vault,
      access: route.access,
      claims,
      policies: config.policies,
      params,
      query: queryOf(url),
      headers: headersOf(request),
      body,
    })
    return headOf(replyResponse(reply, requestId), method)
  } catch (error) {
    return errorResponse(error, requestId, `${route.method} ${route.path}`)
  }
}

function headersOf(request: Request): Record<string, string | undefined> {
  return Object.fromEntries(FORWARDED_HEADERS.map((name) => [name, request.headers.get(name) ?? undefined]))
}

function replyResponse(reply: VaultReply, requestId: string): Response {
  return reply.ok
    ? jsonResponse(reply.status, reply.body, requestId, reply.headers)
    : problemResponse(reply.status, reply.code, requestId, reply.problem)
}

/** A HEAD request gets the status and headers of its GET, and no body. */
function headOf(response: Response, method: string): Response {
  return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
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
