// Shared pieces of the differential parity tests: what is compared of each
// response, and how per-run values are replaced before comparing. Test use only.
import { appendFileSync } from 'node:fs'

export type Seen = { status: number; headers: Record<string, string | null>; body: unknown }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/

/**
 * Replaces per-account values with placeholders numbered by first appearance
 * in the run. `shared` values are the same in both runs and stay as they are;
 * `opaque` keys (secrets such as bindings and nonces) become their key name.
 */
export function normalizer(shared: ReadonlySet<string> = new Set(), opaque: readonly string[] = []) {
  const seen = new Map<string, string>()
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]))
    if (typeof value !== 'string') return value
    if (key === 'request_id') return '<request-id>'
    if (key === 'next_cursor' || key === 'cursor') return '<cursor>'
    if (key !== undefined && opaque.includes(key)) return `<${key}>`
    if (TIMESTAMP.test(value)) return key === 'published_at' ? value : '<timestamp>'
    if (UUID.test(value) && !shared.has(value)) {
      if (!seen.has(value)) seen.set(value, `<id:${seen.size + 1}>`)
      return seen.get(value)
    }
    return value
  }
  return walk
}

/** The parts of a response both servers must agree on. */
export async function seenOf(res: Response): Promise<Seen> {
  const raw = await res.text()
  let body: unknown = null
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = raw
    }
  }
  return {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type'),
      'cache-control': res.headers.get('cache-control'),
      'retry-after': res.headers.get('retry-after'),
    },
    body,
  }
}

/** With PARITY_DEBUG=<file>, appends each step's status and body start (to read a passing run's outcomes). */
export function trace(step: string, seen: Seen): void {
  const file = process.env.PARITY_DEBUG
  if (file) appendFileSync(file, `${step}\t${seen.status}\t${JSON.stringify(seen.body).slice(0, 200)}\n`)
}
