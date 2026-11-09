import type { Pool } from 'pg'

import { MANDATORY_RECEIPTS, readinessReceiptsFromEnv, receiptState } from '@api/health/health.service'

import { jsonResponse, problemResponse } from '../http/problem'

const NOT_READY_RETRY_SECONDS = 30
const DATABASE_TIMEOUT_MS = 2_000

/** GET /live: the process answers; never touches the database. */
export function live(): Response {
  return jsonResponse(200, { status: 'live' }, crypto.randomUUID())
}

/**
 * GET /ready, with the API's checks evaluated per request: the database
 * answers within 2 s and every mandatory readiness receipt has passed
 * (READINESS_RECEIPTS, inline JSON on Workers). The API's HealthService shares
 * one in-flight check between requests, which a Worker must not do.
 */
export async function ready(pool: Pick<Pool, 'query'>, settings: NodeJS.ProcessEnv): Promise<{ ready: boolean; checks: Record<string, string> }> {
  const checks: Record<string, string> = { process: 'ok', database: await database(pool) }
  let receipts: ReturnType<typeof readinessReceiptsFromEnv>
  try {
    receipts = readinessReceiptsFromEnv(settings, () => {
      throw new Error('READINESS_RECEIPTS_FILE is not available on Workers.')
    })
  } catch {
    checks.receipts = 'invalid'
    return { ready: false, checks }
  }
  const now = new Date()
  for (const kind of MANDATORY_RECEIPTS) checks[`receipt.${kind}`] = receiptState(kind, receipts[kind], now)
  const ready = checks.database === 'ok' && MANDATORY_RECEIPTS.every((kind) => checks[`receipt.${kind}`] === 'passed')
  return { ready, checks }
}

async function database(pool: Pick<Pool, 'query'>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), DATABASE_TIMEOUT_MS)
    })
    const result = await Promise.race([pool.query('SELECT 1 AS ok').then(() => 'ok' as const), timeout])
    return result
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}

export function readyResponse(result: { ready: boolean }): Response {
  const requestId = crypto.randomUUID()
  if (!result.ready) return problemResponse(503, 'SERVICE_UNAVAILABLE', requestId, { messageKey: 'errors.not_ready', retryAfterSeconds: NOT_READY_RETRY_SECONDS })
  return jsonResponse(200, { status: 'ready' }, requestId)
}
