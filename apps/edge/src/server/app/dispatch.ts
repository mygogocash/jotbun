import type { ApiIdentity, SessionContext } from '@gogospend/contracts'

import { needsBinding } from '@api/auth/route-policy'
import { chargeBeforeSession, chargeSession } from '@api/common/shared-rate-limit'

import { BASE_HEADERS, errorResponse, jsonResponse, problemResponse } from '../http/problem'
import { queryOf, readJsonBody, readRawJsonBody, reqLike } from '../http/request'
import type { Container } from './container'
import { Reply, defaultStatus, matchRoute } from './routes'
import type { Route, WakeRole } from './routes'

export type DispatchOptions = {
  container: () => Container
  routes: readonly Route[]
  /** The NestJS v1 origin for routes not ported yet; without it they are 404. */
  legacyOrigin?: string
  fetchLegacy?: typeof fetch
  /** Wakes a background role after a route that may have queued its work succeeded (never awaited). */
  wake?: (role: WakeRole) => void
}

/**
 * One v1 request, through the same pipeline as the API's middleware and
 * V1AccessGuard, in the same order:
 *   request id → JSON body (400/413) → route (404, or forward) →
 *   operational gates → client version → access token → principal budget →
 *   session binding → session budget → current policy → handler.
 * Charging the principal before the session lookup means invented bindings
 * cannot bypass rate limits.
 */
export async function dispatch(request: Request, options: DispatchOptions): Promise<Response> {
  const requestId = crypto.randomUUID()
  const url = new URL(request.url)
  const match = matchRoute(options.routes, request.method.toUpperCase(), url.pathname)
  if (!match) {
    if (options.legacyOrigin) return forward(request, url, options.legacyOrigin, requestId, options.fetchLegacy ?? fetch)
    return problemResponse(404, 'NOT_FOUND', requestId)
  }
  const { route, params } = match
  const label = `${route.method} ${route.path}`
  try {
    // Express's JSON parser reads only JSON bodies, so an upload's stream is
    // left for its handler; a JSON body sent to an upload route is read here.
    let body: unknown
    let rawBody: Uint8Array | undefined
    if (route.body === 'raw') ({ body, raw: rawBody } = await readRawJsonBody(request))
    else body = await readJsonBody(request)
    const stream = route.body === 'stream' && !request.bodyUsed && request.body ? (request.body as unknown as AsyncIterable<Uint8Array>) : undefined
    const c = options.container()
    c.gates.assertOpen(...(route.gates ?? []))
    let identity: ApiIdentity | undefined
    let session: SessionContext | undefined
    if (route.access !== 'public') {
      const req = reqLike(request)
      c.clientVersions.check(route.access, req as never)
      identity = await c.tokens.authenticate(req as never)
      await chargeBeforeSession(c.limiter, route.access, identity, req as never)
      session = await c.sessions.bind(route.access, identity, req as never)
      if (session) await chargeSession(c.limiter, req as never, session)
      await c.sessions.assertPolicy(route.access, session)
    }
    if (needsBinding(route.access) && !session) throw new Error('A bound route ran without a session.')
    const result = await route.handle({
      c,
      session: session as SessionContext,
      identity,
      params,
      query: queryOf(url),
      headers: reqLike(request).headers,
      body,
      rawBody,
      stream,
    })
    let response: Response
    if (result instanceof Response) response = withV1Headers(result, requestId)
    else if (result instanceof Reply) response = jsonResponse(result.status, result.status === 204 ? undefined : result.body, requestId, { ...result.headers })
    else {
      const status = defaultStatus(route)
      response = jsonResponse(status, status === 204 ? undefined : result, requestId)
    }
    if (route.wakes && response.status < 300) options.wake?.(route.wakes)
    if (request.method.toUpperCase() !== 'HEAD') return response
    await response.body?.cancel()
    return new Response(null, { status: response.status, headers: response.headers })
  } catch (error) {
    return errorResponse(error, requestId, label)
  }
}

/** A handler's file response with the v1 headers every response carries (its own take precedence). */
function withV1Headers(response: Response, requestId: string): Response {
  const headers = new Headers({ ...BASE_HEADERS, 'x-request-id': requestId })
  response.headers.forEach((value, name) => headers.set(name, value))
  return new Response(response.body, { status: response.status, headers })
}

// Hop-by-hop headers are never forwarded (RFC 9110 §7.6.1).
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']

/**
 * Strangler cutover: a v1 route the edge has not ported (sign-in steps,
 * imports, receipts, exports, snapshots, deletion) goes to the NestJS origin
 * unchanged, body streamed, so the app keeps one base URL. The origin's
 * response, its own request id included, comes back as it is.
 */
async function forward(request: Request, url: URL, origin: string, requestId: string, fetchLegacy: typeof fetch): Promise<Response> {
  const target = new URL(url.pathname + url.search, origin)
  const headers = new Headers(request.headers)
  for (const name of HOP_BY_HOP) headers.delete(name)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-jotbun-edge-request-id', requestId)
  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase())
  try {
    const upstream = await fetchLegacy(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit)
    const out = new Headers(upstream.headers)
    for (const name of HOP_BY_HOP) out.delete(name)
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
  } catch {
    return problemResponse(503, 'SERVICE_UNAVAILABLE', requestId, { retryAfterSeconds: 5 })
  }
}
