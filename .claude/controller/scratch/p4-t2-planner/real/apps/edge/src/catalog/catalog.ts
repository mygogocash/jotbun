// The shared catalog (P4-T2, spec section 6.3) in CATALOG_DB: the bank apps' photo
// albums, which GET /v1/catalog/bank-albums lists for the phone's album picker, and
// the merchant patterns behind a slip's category guess (S3). It holds no person's
// data. A29: no category_packs table (P2's code pack holds the packs). A30: merchants
// are read from D1 with a one-hour cache per isolate, in place of a KV snapshot.
import { createHash } from 'node:crypto'

import { isThaiBankKey } from '@gogospend/contracts'
import type { BankAlbumDto } from '@gogospend/contracts'

import { logFailure } from '../v1/log'
import type { WorkerHandler } from '../v1/worker-routes'

export type MerchantPattern = { pattern: string; category_key: string }

/** How long an isolate keeps the merchant patterns it read (A30). */
export const MERCHANTS_TTL_MS = 3_600_000

/**
 * The patterns this isolate read, per catalog binding, and when. Only a read
 * that succeeded is kept, so a failed read is tried again on the next call.
 */
const merchantReads = new WeakMap<D1Database, { readAt: number; patterns: MerchantPattern[] }>()

/**
 * The merchant patterns, read from D1 at most once an hour per isolate; `[]`
 * without the binding. A failed read logs `catalog_merchants_failed` (its class
 * name only) and answers the last list read, or `[]` when there is none.
 */
export async function merchantPatterns(env: { CATALOG_DB?: D1Database }, nowMs: number = Date.now()): Promise<MerchantPattern[]> {
  const db = env.CATALOG_DB
  if (!db) return []
  const last = merchantReads.get(db)
  if (last && nowMs - last.readAt < MERCHANTS_TTL_MS) return last.patterns
  try {
    const { results } = await db.prepare('SELECT pattern, category_key FROM merchants ORDER BY pattern').all<MerchantPattern>()
    merchantReads.set(db, { readAt: nowMs, patterns: results })
    return results
  } catch (error) {
    logFailure('catalog_merchants_failed', error)
    return last?.patterns ?? []
  }
}

/** Every run of characters that are not letters, marks (Thai vowels and tone marks), digits, `-`, `.` or `'`. */
const SEPARATORS = /[^\p{L}\p{M}\p{Nd}.'-]+/gu

/** A name as merchants are compared: NFC, ASCII letters in lower case, each run of separators one space, trimmed. */
export function merchantKey(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[A-Z]+/g, (upper) => upper.toLowerCase())
    .replace(SEPARATORS, ' ')
    .trim()
}

const THAI = /\p{Script=Thai}/u

/**
 * The category key of the longest pattern found in the name, compared as
 * merchant keys; the first listed wins a tie. Thai is written without spaces
 * between words, so a pattern with a Thai character is found anywhere in the
 * name; any other pattern only as whole words. A pattern with no letter, digit
 * or mark left matches nothing.
 */
export function matchMerchant(name: string | null, patterns: readonly MerchantPattern[]): string | null {
  if (name === null) return null
  const key = merchantKey(name)
  const words = ` ${key} `
  let best: { length: number; category: string } | null = null
  for (const { pattern, category_key } of patterns) {
    const wanted = merchantKey(pattern)
    if (wanted === '') continue
    const found = THAI.test(wanted) ? key.includes(wanted) : words.includes(` ${wanted} `)
    if (found && (best === null || wanted.length > best.length)) best = { length: wanted.length, category: category_key }
  }
  return best?.category ?? null
}

/**
 * Whether `If-None-Match` names this tag. Entity tags compare weakly there
 * (RFC 9110, 13.1.2), so a `W/` that a proxy adds when it compresses the body
 * still matches. `*` is not read: the list answers 200.
 */
function namesTag(header: string | undefined, etag: string): boolean {
  return header !== undefined && header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)
}

/**
 * GET /v1/catalog/bank-albums (public): `{ albums }` of known banks, by bank,
 * platform and name, with the hex SHA-256 of that body as its ETag; the same tag
 * in `If-None-Match` is 304 with no body. Without CATALOG_DB, 503 with a retry.
 */
export const handleBankAlbums: WorkerHandler = async (w) => {
  const db = w.env.CATALOG_DB
  if (!db) return { ok: false, status: 503, code: 'SERVICE_UNAVAILABLE', problem: { retryAfterSeconds: 30 } }
  const { results } = await db.prepare('SELECT bank, platform, album_name FROM bank_albums ORDER BY bank, platform, album_name').all<BankAlbumDto>()
  const body = { albums: results.filter((album) => isThaiBankKey(album.bank)) }
  const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}"`
  if (namesTag(w.headers['if-none-match'], etag)) return { ok: true, status: 304, headers: { etag } }
  return { ok: true, status: 200, body, headers: { etag } }
}
