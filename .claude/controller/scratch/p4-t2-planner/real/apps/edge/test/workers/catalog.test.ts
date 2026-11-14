// P4-T2: the catalog database (CATALOG_DB). Its tables, its draft seed (default pending
// owner Q8), the public bank-album list GET /v1/catalog/bank-albums with its ETag, and the
// merchant patterns behind a slip's category guess (S3, A30). apply-catalog-migrations.ts
// migrates this file's CATALOG_DB before its first case. Storage is not undone between the
// cases of a file, so a case that writes rows deletes them again (`withRowsUndone`).
// Every catalog read and write goes through `select` or `put`, which answer a value (rows,
// or the error's class name; 'ok' or 'refused'), so a missing table fails an assertion.
import { env } from 'cloudflare:workers'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { isBankAlbumsDto } from '@gogospend/contracts'

import { MERCHANTS_TTL_MS, matchMerchant, merchantKey, merchantPatterns } from '../../src/catalog/catalog'
import type { MerchantPattern } from '../../src/catalog/catalog'
import { BASE, startV1 } from './support/v1-client'

/** Any fixed time: merchantPatterns takes the time it is called at. */
const AT = Date.UTC(2026, 9, 25, 3, 0, 0)

/** The seed's albums, in the order the list answers them: bank, then platform, then name. */
const SEED_ALBUMS = [
  { bank: 'kbank', platform: 'android', album_name: 'K PLUS' },
  { bank: 'kbank', platform: 'ios', album_name: 'K PLUS' },
  { bank: 'ktb', platform: 'android', album_name: 'Krungthai NEXT' },
  { bank: 'ktb', platform: 'ios', album_name: 'Krungthai NEXT' },
  { bank: 'scb', platform: 'android', album_name: 'SCB EASY' },
  { bank: 'scb', platform: 'ios', album_name: 'SCB EASY' },
]

/** The seed's merchants, in the order merchantPatterns reads them (by pattern). */
const SEED_MERCHANTS: MerchantPattern[] = [
  { pattern: '7-eleven', category_key: 'food' },
  { pattern: 'big c', category_key: 'shopping' },
  { pattern: 'bts', category_key: 'travel' },
  { pattern: "lotus's", category_key: 'shopping' },
  { pattern: 'makro', category_key: 'shopping' },
  { pattern: 'mrt', category_key: 'travel' },
  { pattern: 'เซเว่น', category_key: 'food' },
]

const TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> 'd1_migrations' ORDER BY name"

type Row = Record<string, unknown>

/** A catalog query's rows, or the class name of its error. */
async function select(query: string, ...bindings: unknown[]): Promise<Row[] | { failed: string }> {
  try {
    return (await env.CATALOG_DB.prepare(query).bind(...bindings).all<Row>()).results
  } catch (error) {
    return { failed: error instanceof Error ? error.name : typeof error }
  }
}

/** One row written to a catalog table: 'refused' when D1 refuses it (a rule, a key, a type, or a table that is not there). */
async function put(table: 'bank_albums' | 'merchants', row: Row): Promise<'ok' | 'refused'> {
  const names = Object.keys(row)
  try {
    await env.CATALOG_DB.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).bind(...Object.values(row)).run()
    return 'ok'
  } catch {
    return 'refused'
  }
}

/**
 * Runs a case that writes catalog rows, then deletes every row it added (each has a rowid
 * above the largest one before it ran), so the next case reads the seed again.
 */
async function withRowsUndone(run: () => Promise<void>): Promise<void> {
  const before = await select('SELECT (SELECT coalesce(max(rowid), 0) FROM bank_albums) AS albums, (SELECT coalesce(max(rowid), 0) FROM merchants) AS merchants')
  try {
    await run()
  } finally {
    if (Array.isArray(before)) {
      await select('DELETE FROM bank_albums WHERE rowid > ?', before[0].albums)
      await select('DELETE FROM merchants WHERE rowid > ?', before[0].merchants)
    }
  }
}

const albumsRequest = (headers: Record<string, string> = {}) => new Request(`${BASE}/v1/catalog/bank-albums`, { headers })
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** CATALOG_DB with its queries counted, as a binding of its own. */
function countedCatalog(): { db: D1Database; queries: () => number } {
  let queries = 0
  const db: D1Database = {
    prepare: (query) => {
      queries += 1
      return env.CATALOG_DB.prepare(query)
    },
    batch: (statements) => env.CATALOG_DB.batch(statements),
    exec: (query) => env.CATALOG_DB.exec(query),
  }
  return { db, queries: () => queries }
}

describe('the catalog tables and their seed (P4-T2)', () => {
  it("the catalog migrations make bank_albums and merchants, and the seed lists the boards' three bank apps on both platforms", async () => {
    // The table list is not pinned: P5-T6 adds fx_rates.
    expect(await select(TABLES)).toEqual(expect.arrayContaining([{ name: 'bank_albums' }, { name: 'merchants' }]))
    expect(await select('SELECT bank, platform, album_name FROM bank_albums ORDER BY bank, platform, album_name')).toEqual(SEED_ALBUMS)
    const merchants = await select('SELECT pattern, category_key, gogocash_eligible FROM merchants ORDER BY pattern')
    expect(merchants).toEqual(SEED_MERCHANTS.map((merchant) => ({ ...merchant, gogocash_eligible: 0 })))
    // Each pattern is stored as its own merchant key.
    for (const { pattern } of SEED_MERCHANTS) expect(merchantKey(pattern), pattern).toBe(pattern)
  })

  it('each catalog table takes a well-formed row and refuses one that breaks a rule', async () => {
    const album = (o: Row = {}): Row => ({ bank: 'kbank', platform: 'ios', album_name: 'Slips', ...o })
    const merchant = (o: Row = {}): Row => ({ pattern: 'central', category_key: 'shopping', ...o })
    const bytes = (text: string) => new TextEncoder().encode(text).buffer
    const cases: [string, 'bank_albums' | 'merchants', Row, 'ok' | 'refused'][] = [
      ['album: well formed', 'bank_albums', album(), 'ok'],
      ['album: a bank of two letters', 'bank_albums', album({ bank: 'ab' }), 'ok'],
      ['album: a bank of 16 letters', 'bank_albums', album({ bank: 'a'.repeat(16) }), 'ok'],
      ['album: a name of one letter', 'bank_albums', album({ album_name: 'S' }), 'ok'],
      ['album: a name of 60 Thai letters', 'bank_albums', album({ album_name: 'ก'.repeat(60) }), 'ok'],
      ['album: no bank', 'bank_albums', album({ bank: null }), 'refused'],
      ['album: a bank in capitals', 'bank_albums', album({ bank: 'Kbank' }), 'refused'],
      ['album: a bank of one letter', 'bank_albums', album({ bank: 'k' }), 'refused'],
      ['album: a bank of 17 letters', 'bank_albums', album({ bank: 'b'.repeat(17) }), 'refused'],
      ['album: another platform', 'bank_albums', album({ platform: 'web' }), 'refused'],
      ['album: no platform', 'bank_albums', album({ platform: null }), 'refused'],
      ['album: an empty name', 'bank_albums', album({ album_name: '' }), 'refused'],
      ['album: a name of 61 letters', 'bank_albums', album({ album_name: 'x'.repeat(61) }), 'refused'],
      ['album: no name', 'bank_albums', album({ album_name: null }), 'refused'],
      ['album: K PLUS on ios again', 'bank_albums', album({ album_name: 'K PLUS' }), 'refused'],
      ['album: a name as bytes (STRICT)', 'bank_albums', album({ album_name: bytes('Slips 2') }), 'refused'],
      ['merchant: well formed', 'merchants', merchant(), 'ok'],
      ['merchant: GoGoCash eligible', 'merchants', merchant({ pattern: 'central world', gogocash_eligible: 1 }), 'ok'],
      ['merchant: a pattern of two letters', 'merchants', merchant({ pattern: 'cp' }), 'ok'],
      ['merchant: a pattern of 60 letters', 'merchants', merchant({ pattern: 'x'.repeat(60) }), 'ok'],
      ['merchant: a category of 32 letters', 'merchants', merchant({ pattern: 'tops', category_key: 'c'.repeat(32) }), 'ok'],
      ['merchant: no pattern', 'merchants', merchant({ pattern: null }), 'refused'],
      ['merchant: a pattern of one letter', 'merchants', merchant({ pattern: 'y' }), 'refused'],
      ['merchant: a pattern of 61 letters', 'merchants', merchant({ pattern: 'y'.repeat(61) }), 'refused'],
      ['merchant: a pattern in capitals', 'merchants', merchant({ pattern: 'Big C Extra' }), 'refused'],
      ['merchant: a pattern with a space before it', 'merchants', merchant({ pattern: ' big c extra' }), 'refused'],
      ['merchant: bts again', 'merchants', merchant({ pattern: 'bts' }), 'refused'],
      ['merchant: no category', 'merchants', merchant({ pattern: 'tops a', category_key: null }), 'refused'],
      ['merchant: a category of one letter', 'merchants', merchant({ pattern: 'tops b', category_key: 'f' }), 'refused'],
      ['merchant: a category of 33 letters', 'merchants', merchant({ pattern: 'tops c', category_key: 'c'.repeat(33) }), 'refused'],
      ['merchant: GoGoCash 2', 'merchants', merchant({ pattern: 'tops d', gogocash_eligible: 2 }), 'refused'],
      ['merchant: GoGoCash unknown', 'merchants', merchant({ pattern: 'tops e', gogocash_eligible: null }), 'refused'],
      ['merchant: a category as bytes (STRICT)', 'merchants', merchant({ pattern: 'tops f', category_key: bytes('food') }), 'refused'],
    ]
    await withRowsUndone(async () => {
      const outcomes: [string, 'ok' | 'refused'][] = []
      for (const [what, table, row] of cases) outcomes.push([what, await put(table, row)])
      expect(outcomes).toEqual(cases.map(([what, , , expected]) => [what, expected]))
      // A merchant written without its flag is not GoGoCash-eligible.
      expect(await select("SELECT gogocash_eligible FROM merchants WHERE pattern = 'central'")).toEqual([{ gogocash_eligible: 0 }])
    })
  })
})

describe('GET /v1/catalog/bank-albums (P4-T2)', () => {
  it('the bank-album list is public, carries an ETag, and answers 304 to the same tag', async () => {
    const client = await startV1()
    // No token and no client header: the list is public.
    const res = await client.raw(albumsRequest())
    expect(res.status).toBe(200)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body).toEqual({ albums: SEED_ALBUMS })
    expect(isBankAlbumsDto(body)).toBe(true)
    const etag = res.headers.get('etag')
    expect(etag ?? '').toMatch(/^"[0-9a-f]{64}"$/)
    expect(etag).toBe(`"${sha256(text)}"`)
    // The same tag, as sent, weakened by a proxy (W/), or among others, is 304 with no body and the same tag.
    for (const tag of [String(etag), `W/${etag}`, `"${'0'.repeat(64)}", ${etag}`]) {
      const again = await client.raw(albumsRequest({ 'if-none-match': tag }))
      expect([again.status, await again.text(), again.headers.get('etag')], tag).toEqual([304, '', etag])
    }
    // Another tag gets the whole list.
    const other = await client.raw(albumsRequest({ 'if-none-match': `"${'0'.repeat(64)}"` }))
    expect([other.status, await other.text(), other.headers.get('etag')]).toEqual([200, text, etag])
  })

  it('an album row of an unknown bank is left out, and the list stays in order of bank, platform and name', async () => {
    await withRowsUndone(async () => {
      expect([
        await put('bank_albums', { bank: 'zzbank', platform: 'ios', album_name: 'Z Bank' }),
        await put('bank_albums', { bank: 'bbl', platform: 'ios', album_name: 'Bualuang mBanking' }),
        await put('bank_albums', { bank: 'kbank', platform: 'android', album_name: 'กสิกรไทย' }),
      ]).toEqual(['ok', 'ok', 'ok'])
      const res = await (await startV1()).raw(albumsRequest())
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(JSON.parse(text)).toEqual({
        albums: [{ bank: 'bbl', platform: 'ios', album_name: 'Bualuang mBanking' }, SEED_ALBUMS[0], { bank: 'kbank', platform: 'android', album_name: 'กสิกรไทย' }, ...SEED_ALBUMS.slice(1)],
      })
      expect(res.headers.get('etag')).toBe(`"${sha256(text)}"`)
    })
  })

  it('without CATALOG_DB the route is 503 and merchant patterns are empty', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await (await startV1(undefined, { env: { CATALOG_DB: undefined } })).raw(albumsRequest())
      expect([res.status, res.headers.get('retry-after')]).toEqual([503, '30'])
      expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retry_after_seconds: 30 })
      expect(await merchantPatterns({}, AT)).toEqual([])
      expect(await merchantPatterns({ CATALOG_DB: undefined }, AT)).toEqual([])
      // A missing binding is not a failure: nothing is logged.
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })
})

describe('merchant patterns (S3, A30)', () => {
  it('merchant patterns are read once an hour per isolate, and each catalog binding keeps its own', async () => {
    expect(MERCHANTS_TTL_MS).toBe(3_600_000)
    const counted = countedCatalog()
    expect([await merchantPatterns({ CATALOG_DB: counted.db }, AT), counted.queries()]).toEqual([SEED_MERCHANTS, 1])
    expect([await merchantPatterns({ CATALOG_DB: counted.db }, AT + 3_599_999), counted.queries()]).toEqual([SEED_MERCHANTS, 1])
    expect([await merchantPatterns({ CATALOG_DB: counted.db }, AT + 3_600_000), counted.queries()]).toEqual([SEED_MERCHANTS, 2])
    // Another binding reads its own list.
    const other = countedCatalog()
    expect([await merchantPatterns({ CATALOG_DB: other.db }, AT), other.queries()]).toEqual([SEED_MERCHANTS, 1])
  })

  it('a failed read logs catalog_merchants_failed by its class name, keeps the last list, and is tried again on the next call', async () => {
    let down = false
    let reads = 0
    const outage = () => Promise.reject(new Error('D1_ERROR: synthetic outage'))
    const failing = { all: outage, first: outage, run: outage } as unknown as D1PreparedStatement
    const flaky: D1Database = {
      prepare: (query) => {
        if (down) return failing
        reads += 1
        return env.CATALOG_DB.prepare(query)
      },
      batch: (statements) => env.CATALOG_DB.batch(statements),
      exec: (query) => env.CATALOG_DB.exec(query),
    }
    const never: D1Database = { prepare: () => failing, batch: () => outage(), exec: () => outage() }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(await merchantPatterns({ CATALOG_DB: flaky }, AT)).toEqual(SEED_MERCHANTS)
      down = true
      expect(await merchantPatterns({ CATALOG_DB: flaky }, AT + 3_600_000)).toEqual(SEED_MERCHANTS)
      // A binding never read has no list to keep.
      expect(await merchantPatterns({ CATALOG_DB: never }, AT)).toEqual([])
      const line = JSON.stringify({ level: 'error', event: 'catalog_merchants_failed', failure: 'Error' })
      expect(errors.mock.calls).toEqual([[line], [line]])
      // The failed read was not kept as a read: once the catalog answers, the next call reads it.
      down = false
      expect([await merchantPatterns({ CATALOG_DB: flaky }, AT + 3_600_001), reads]).toEqual([SEED_MERCHANTS, 2])
    } finally {
      errors.mockRestore()
    }
  })

  it('matchMerchant takes the longest whole-word Latin pattern or a Thai substring, ignoring case and spacing', async () => {
    const seed = await merchantPatterns(env, AT)
    expect(seed).toEqual(SEED_MERCHANTS)
    const cases: [string | null, string | null][] = [
      ['7-ELEVEN สาขา 01234', 'food'],
      ['ร้านเซเว่นอีเลฟเว่น', 'food'],
      ['BTS SKYTRAIN', 'travel'],
      ['Big  C Extra', 'shopping'],
      ["LOTUS'S GO FRESH", 'shopping'],
      ['Makrobiotic', null],
      [null, null],
    ]
    expect(() => cases.map(([name]) => matchMerchant(name, seed))).not.toThrow()
    expect(cases.map(([name]) => [name, matchMerchant(name, seed)])).toEqual(cases)
    // Thai vowels and tone marks are marks, so they stay.
    expect(merchantKey('ร้านเซเว่น')).toBe('ร้านเซเว่น')
  })

  it('the longest pattern wins and the first listed wins a tie; patterns compare as merchant keys, and one with nothing left matches nothing', () => {
    const list = (...entries: [string, string][]): MerchantPattern[] => entries.map(([pattern, category_key]) => ({ pattern, category_key }))
    expect(matchMerchant('BTS Skytrain Shop', list(['bts', 'travel'], ['bts skytrain shop', 'shopping']))).toBe('shopping')
    expect(matchMerchant('Big C Extra', list(['big c', 'shopping'], ['extra', 'food']))).toBe('shopping')
    expect(matchMerchant('Big C Extra', list(['extra', 'food'], ['big c', 'shopping']))).toBe('food')
    expect(matchMerchant('big c extra', list(['  BIG   C ', 'shopping']))).toBe('shopping')
    expect(matchMerchant('!!', list(['!!', 'food']))).toBeNull()
  })

  it("merchantKey keeps letters, marks, digits, '-', '.' and an apostrophe, lowers ASCII letters only, and makes each other run one space", () => {
    const combiningAcute = String.fromCharCode(0x0301)
    const cases: [string, string][] = [
      ["  LOTUS'S  Go-Fresh, No.5 ", "lotus's go-fresh no.5"],
      ['ร้านเซเว่น', 'ร้านเซเว่น'],
      // NFC first: an e followed by a combining accent becomes one letter.
      [`Cafe${combiningAcute}`, 'café'],
      // Only ASCII letters are lowered, as SQLite's lower() lowers the stored patterns.
      ['ÉCOLE', 'École'],
      // Thai digits are digits.
      ['สาขา ๑๒/3', 'สาขา ๑๒ 3'],
      ['7-ELEVEN!!!(สาขา)', '7-eleven สาขา'],
    ]
    expect(cases.map(([text]) => [text, merchantKey(text)])).toEqual(cases)
  })
})
