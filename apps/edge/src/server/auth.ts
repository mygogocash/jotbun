import { env } from 'cloudflare:workers'

import { failureName } from '@api/common/operational-metrics'

import { AuthConfigError } from '../auth/config'
import { handleAuthRequest } from '../auth/handler'
import { authFor } from '../auth/instance'

export function isAuthPath(pathname: string): boolean {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/')
}

export async function handleAuth(request: Request): Promise<Response> {
  try {
    return await handleAuthRequest(authFor(env), request)
  } catch (error) {
    if (error instanceof AuthConfigError) {
      console.error(JSON.stringify({ level: 'error', event: 'auth_unavailable', failure: failureName(error) }))
      return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    throw error
  }
}
