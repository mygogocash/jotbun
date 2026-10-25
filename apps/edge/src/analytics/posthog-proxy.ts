import { logFailure } from '../v1/log'

/**
 * PostHog's proxy on the HTTP Worker (spec §7). `/ingest/*` is forwarded to
 * PostHog EU as PostHog's Cloudflare proxy guide does, except that the
 * caller's cookies, credentials and client addresses are not forwarded, so
 * PostHog keeps no IP address and no country. Request bodies are bounded.
 */
export const POSTHOG_PROXY_PREFIX = '/ingest'
export const POSTHOG_API_HOST = 'eu.i.posthog.com'
export const POSTHOG_ASSET_HOST = 'eu-assets.i.posthog.com'
export const POSTHOG_PROXY_BODY_LIMIT_BYTES = 5 * 1024 * 1024

const PROXIED_METHODS = new Set(['GET', 'HEAD', 'POST'])
const ASSET_PATHS = ['/static/', '/array/']

// Request headers that never go upstream: credentials, the caller's own host
// and framing, and the client addresses that Cloudflare and proxies add.
const DROPPED_HEADERS = new Set([
  'cookie',
  'authorization',
  'host',
  'content-length',
  'connection',
  'forwarded',
  'x-real-ip',
  'true-client-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'x-originating-ip',
  'x-remote-ip',
  'x-remote-addr',
  'fastly-client-ip',
])
const DROPPED_PREFIXES = ['x-forwarded-', 'cf-', 'x-gogospend-']

/** `/ingest/` followed by at least one character. */
export function isPostHogProxyPath(pathname: string): boolean {
  return pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`) && pathname.length > POSTHOG_PROXY_PREFIX.length + 1
}

/**
 * Forwards a GET, HEAD or POST under `/ingest/` and answers with PostHog's
 * status and body. The target host comes from the path, never from the
 * request's headers.
 */
export async function proxyPostHog(request: Request, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<Response> {
  const url = new URL(request.url)
  if (!isPostHogProxyPath(url.pathname)) return new Response(null, { status: 404 })
  if (!PROXIED_METHODS.has(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })

  let body: Uint8Array<ArrayBuffer> | undefined
  if (request.method === 'POST') {
    const read = await readRequestBody(request)
    if (read === 'too_large') return new Response(null, { status: 413 })
    if (read === 'unreadable') return new Response(null, { status: 400 })
    body = read
  }

  const path = url.pathname.slice(POSTHOG_PROXY_PREFIX.length)
  const host = ASSET_PATHS.some((prefix) => path.startsWith(prefix)) ? POSTHOG_ASSET_HOST : POSTHOG_API_HOST

  let upstream: Response
  try {
    upstream = await fetchImpl(`https://${host}${path}${url.search}`, {
      method: request.method,
      headers: upstreamHeaders(request.headers),
      body,
      redirect: 'manual',
    })
  } catch (error) {
    logFailure('posthog_proxy_failed', error)
    return new Response(null, { status: 502 })
  }

  const headers = new Headers(upstream.headers)
  headers.delete('set-cookie')
  return new Response(upstream.body, { status: upstream.status, headers })
}

function upstreamHeaders(received: Headers): Headers {
  const headers = new Headers()
  received.forEach((value, name) => {
    if (!DROPPED_HEADERS.has(name) && !DROPPED_PREFIXES.some((prefix) => name.startsWith(prefix))) headers.set(name, value)
  })
  return headers
}

/**
 * The request body as bytes, or 'too_large' or 'unreadable'. A declared length
 * over the limit is refused before a byte is read; a body without one (or with
 * a false one) is counted as it arrives and cancelled past the limit.
 */
async function readRequestBody(request: Request): Promise<Uint8Array<ArrayBuffer> | 'too_large' | 'unreadable'> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > POSTHOG_PROXY_BODY_LIMIT_BYTES) return 'too_large'
  if (request.body === null) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > POSTHOG_PROXY_BODY_LIMIT_BYTES) {
        await reader.cancel().catch(() => undefined)
        return 'too_large'
      }
      chunks.push(value)
    }
  } catch {
    return 'unreadable'
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}
