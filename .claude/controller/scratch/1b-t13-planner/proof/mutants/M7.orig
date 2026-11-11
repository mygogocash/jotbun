// The HTTP Worker's health checks (C1, B15). /live answers without touching
// anything. /ready answers from the Worker's settings and KV: PostgreSQL and
// its readiness receipts retired with Hyperdrive, so a Worker is ready when it
// can verify tokens, digest commands and read config:v1.
import { jsonResponse, problemResponse } from '../server/http/problem'
import { EDGE_CONFIG_KEY } from './config'
import type { V1Env } from './env'
import { logFailure } from './log'

const NOT_READY_RETRY_SECONDS = 30

/** The settings and binding /ready checks. COMMAND_DIGEST_KEY is the vault's (VaultEnv), read from the same env. */
export type ReadyEnv = Pick<V1Env, 'CONFIG' | 'AUTH_ISSUER' | 'AUTH_AUDIENCE' | 'AUTH_JWKS_URL'> & { COMMAND_DIGEST_KEY?: string }

/** GET /live: the Worker answers; it reads nothing. */
export function live(): Response {
  return jsonResponse(200, { status: 'live' }, crypto.randomUUID())
}

/**
 * GET /ready: 200 when the token settings and the command digest key are set
 * and config:v1 can be read from KV (an absent config reads as null, which is
 * fine: readEdgeConfig then leaves the gates open). Otherwise 503
 * SERVICE_UNAVAILABLE with a 30-second retry, as the PostgreSQL edge answered.
 */
export async function readyResponseOf(env: ReadyEnv): Promise<Response> {
  const requestId = crypto.randomUUID()
  const notReady = () => problemResponse(503, 'SERVICE_UNAVAILABLE', requestId, { messageKey: 'errors.not_ready', retryAfterSeconds: NOT_READY_RETRY_SECONDS })
  if (!env.AUTH_ISSUER || !env.AUTH_AUDIENCE || !env.AUTH_JWKS_URL || !env.COMMAND_DIGEST_KEY) return notReady()
  try {
    await env.CONFIG.get(EDGE_CONFIG_KEY, 'text')
  } catch (error) {
    logFailure('ready_config_unreadable', error)
    return notReady()
  }
  return jsonResponse(200, { status: 'ready' }, requestId)
}
