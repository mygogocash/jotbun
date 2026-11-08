// The HTTP Worker's glue for Better Auth, and the only auth module that reads
// cloudflare:workers. It reads it on first use, not at import: src/server.ts is
// also loaded by Node unit tests (test/posthog-proxy.test.ts), where that
// module does not exist.
import { AuthConfigError } from '../auth/config'
import { handleAuthRequest } from '../auth/handler'
import { authFor } from '../auth/instance'
import { logFailure } from '../v1/log'

export function isAuthPath(pathname: string): boolean {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/')
}

export async function handleAuth(request: Request): Promise<Response> {
  try {
    const { env } = await import('cloudflare:workers')
    return await handleAuthRequest(authFor(env), request)
  } catch (error) {
    if (error instanceof AuthConfigError) {
      logFailure('auth_unavailable', error)
      return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    throw error
  }
}
