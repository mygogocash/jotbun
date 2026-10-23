/**
 * The slice of an Express request that the shared v1 guards read: lowercase
 * headers as Node gives them, the client address and the method. Built from a
 * Fetch `Request` so the API's guard helpers run unchanged.
 */
export type HeaderBag = Record<string, string | undefined>

export type ReqLike = {
  method: string
  headers: HeaderBag
  ip: string | undefined
}

export function reqLike(request: Request): ReqLike {
  const headers: HeaderBag = {}
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value
  })
  // Cloudflare sets CF-Connecting-IP at the edge; a client cannot spoof it there.
  // Locally there is no proxy, so the address is unknown and shares one bucket.
  return { method: request.method.toUpperCase(), headers, ip: headers['cf-connecting-ip'] }
}

/**
 * Query parameters as Express 5's simple parser gives them: a repeated name
 * becomes an array of strings, so the shared parsers reject it the same way.
 */
export function queryOf(url: URL): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  for (const [name, value] of url.searchParams) {
    const existing = query[name]
    if (existing === undefined) query[name] = value
    else if (Array.isArray(existing)) existing.push(value)
    else query[name] = [existing, value]
  }
  return query
}

export const JSON_BODY_LIMIT_BYTES = 2 * 1024 * 1024

export class BodyError extends Error {
  constructor(readonly reason: 'too_large' | 'invalid') {
    super(reason === 'too_large' ? 'The JSON body is too large.' : 'The JSON body is malformed.')
    this.name = 'BodyError'
  }
}

// express.json() parses `application/json` only (type-is), with any parameters.
const JSON_TYPE = /^application\/json\s*(?:;|$)/i

/**
 * Reads a JSON body like Express's `json({ strict: true, limit: '2mb' })`:
 * only JSON content types are parsed (anything else leaves the body
 * undefined), an empty body is `{}`, and only objects and arrays are allowed.
 */
export async function readJsonBody(request: Request, limit = JSON_BODY_LIMIT_BYTES): Promise<unknown> {
  return (await readJson(request, limit))?.body
}

/** Signed provider events: 8 KiB, as the API's `jsonBody('8kb', { keepRaw: true })`. */
export const RAW_JSON_BODY_LIMIT_BYTES = 8 * 1024

/**
 * The same parse, keeping the exact bytes for a route that authenticates
 * them. `raw` is set only when a JSON body was read, as Express's `verify`
 * hook runs only then.
 */
export async function readRawJsonBody(request: Request, limit = RAW_JSON_BODY_LIMIT_BYTES): Promise<{ body: unknown; raw: Uint8Array | undefined }> {
  const read = await readJson(request, limit)
  return { body: read?.body, raw: read?.raw }
}

async function readJson(request: Request, limit: number): Promise<{ body: unknown; raw: Uint8Array } | undefined> {
  const type = request.headers.get('content-type') ?? ''
  if (!JSON_TYPE.test(type) || !request.body) return undefined
  const length = request.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > limit) throw new BodyError('too_large')
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > limit) throw new BodyError('too_large')
  return { body: parseJson(bytes), raw: bytes }
}

function parseJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return {}
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new BodyError('invalid')
  }
  const first = text.trimStart()[0]
  if (first !== '{' && first !== '[') throw new BodyError('invalid')
  try {
    return JSON.parse(text)
  } catch {
    throw new BodyError('invalid')
  }
}
