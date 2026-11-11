import { BodyError, readRawJsonBody } from '../server/http/request'
import { AUTH_BASE_PATH, AUTH_BODY_MAX_BYTES } from './config'
import type { JotbunAuth } from './create-auth'

export const SIGN_IN_ANSWER_PATHS: readonly string[] = [`${AUTH_BASE_PATH}/sign-in/email-otp`, `${AUTH_BASE_PATH}/sign-in/social`]

const JSON_TYPE = /^application\/json\s*(?:;|$)/i

function jsonError(status: number, code: string): Response {
  return Response.json({ code }, { status, headers: { 'cache-control': 'no-store' } })
}

/** BodyInit accepts ArrayBuffer. The reader returns Uint8Array<ArrayBufferLike>, which this TypeScript rejects. */
function bodyBytes(raw: Uint8Array | undefined): ArrayBuffer | undefined {
  if (!raw || raw.byteLength === 0) return undefined
  const copy = new ArrayBuffer(raw.byteLength)
  new Uint8Array(copy).set(raw)
  return copy
}

/**
 * True only when the answer's user was inserted during this request.
 * Better Auth stamps `createdAt` at insert time, which is at or after `receivedAtMs`.
 * An account from an earlier request has an earlier time. An unreadable time is not a creation.
 */
export function createdDuring(answer: unknown, receivedAtMs: number): boolean {
  if (!answer || typeof answer !== 'object') return false
  const user = (answer as { user?: unknown }).user
  if (!user || typeof user !== 'object') return false
  const createdAt = (user as { createdAt?: unknown }).createdAt
  if (typeof createdAt !== 'string' && typeof createdAt !== 'number') return false
  const time = new Date(createdAt).getTime()
  return !Number.isNaN(time) && time >= receivedAtMs
}

export async function handleAuthRequest(auth: JotbunAuth, request: Request): Promise<Response> {
  const receivedAtMs = Date.now()
  let forwarded = request
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const type = request.headers.get('content-type') ?? ''
    if (!JSON_TYPE.test(type)) {
      if (request.body) return jsonError(415, 'UNSUPPORTED_MEDIA_TYPE')
    } else {
      try {
        const read = await readRawJsonBody(request, AUTH_BODY_MAX_BYTES)
        forwarded = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: bodyBytes(read.raw),
        })
      } catch (error) {
        if (error instanceof BodyError) return jsonError(error.reason === 'too_large' ? 413 : 400, error.reason === 'too_large' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED')
        throw error
      }
    }
  }

  const answer = await auth.handler(forwarded)
  const headers = new Headers(answer.headers)
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store')
  const pathname = new URL(request.url).pathname
  if (answer.status === 200 && SIGN_IN_ANSWER_PATHS.includes(pathname)) {
    const text = await answer.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      headers.delete('content-length')
      return new Response(JSON.stringify({ ...parsed, created: createdDuring(parsed, receivedAtMs) }), { status: answer.status, headers })
    }
    headers.delete('content-length')
    return new Response(text, { status: answer.status, headers })
  }
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}
