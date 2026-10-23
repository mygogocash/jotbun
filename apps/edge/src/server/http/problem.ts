import { ContractValidationError } from '@gogospend/contracts'
import type { ApiErrorCode, ApiProblem } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import type { ProblemOptions } from '@api/common/api-problem.filter'
import { writeLog } from '@api/common/safe-request-logger'

import { BodyError } from './request'

export { ProblemException }

/** Headers on every v1 response (the API's middleware and helmet's defaults for a JSON API). */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-permitted-cross-domain-policies': 'none',
  'origin-agent-cluster': '?1',
}

export function jsonResponse(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}): Response {
  const headers = new Headers({ ...BASE_HEADERS, 'x-request-id': requestId, ...extra })
  if (status === 204 || body === undefined) return new Response(null, { status, headers })
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

export function problemResponse(status: number, code: ApiErrorCode, requestId: string, problem: ProblemOptions = {}): Response {
  const body: ApiProblem = { code, request_id: requestId, message_key: problem.messageKey ?? `errors.${code.toLowerCase()}` }
  if (problem.fields) body.fields = problem.fields
  if (problem.current !== undefined) body.current = problem.current
  if (problem.retryAfterSeconds !== undefined) body.retry_after_seconds = problem.retryAfterSeconds
  const extra: Record<string, string> = {}
  if (problem.retryAfterSeconds !== undefined) extra['retry-after'] = String(problem.retryAfterSeconds)
  return jsonResponse(status, body, requestId, extra)
}

// Network failures reaching PostgreSQL, and SQLSTATE classes 08, 53 and 57P0x,
// exactly as the API's problem filter treats them.
const UNAVAILABLE_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE'])

export function isDatabaseUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code !== 'string') {
    return error instanceof Error && /Connection terminated|timeout exceeded when trying to connect|No database pool/i.test(error.message)
  }
  return UNAVAILABLE_NETWORK_CODES.has(code) || /^(08|53)[0-9A-Z]{3}$|^57P0[1-3]$/.test(code)
}

/**
 * Every error becomes an ApiProblem, as in the API's ApiProblemFilter.
 * Unexpected errors are 500 INTERNAL_ERROR with no detail in the response and
 * only the error class name in the log.
 */
export function errorResponse(error: unknown, requestId: string, route: string): Response {
  if (error instanceof ProblemException) return problemResponse(error.getStatus(), error.code, requestId, error.problem)
  if (error instanceof ContractValidationError) {
    return problemResponse(422, error.code as ApiErrorCode, requestId, { fields: { [error.field ?? 'body']: error.code } })
  }
  if (error instanceof BodyError) {
    return error.reason === 'too_large' ? problemResponse(413, 'COMMAND_TOO_LARGE', requestId) : problemResponse(400, 'VALIDATION_FAILED', requestId)
  }
  if (isDatabaseUnavailable(error)) return problemResponse(503, 'SERVICE_UNAVAILABLE', requestId, { retryAfterSeconds: 5 })
  writeLog({ level: 'error', request_id: requestId, route, status: 500, error: error instanceof Error ? error.name : typeof error })
  return problemResponse(500, 'INTERNAL_ERROR', requestId)
}
