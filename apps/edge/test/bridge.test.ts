import { BUILTIN_CASHBACK_BRANDS, isCashbackCatalogue, matchCashbackBrand } from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

import { ProblemException } from '@api/common/api-problem.filter'

import { BUILTIN_CATALOGUE, CashbackCatalogueSource } from '../src/server/bridge/catalogue'

describe('matchCashbackBrand', () => {
  it.each([
    ['Shopee 11.11', 'shopee'],
    ['ซื้อของ ช้อปปี้ 299', 'shopee'],
    ['lazada flash sale', 'lazada'],
    ['Agoda hotel Chiang Mai', 'agoda'],
    ['TikTok Shop live', 'tiktok_shop'],
  ])('%s → %s', (text, key) => {
    expect(matchCashbackBrand(text, BUILTIN_CASHBACK_BRANDS)?.key).toBe(key)
  })

  it('matches Latin brand names as whole words only, and nothing without text', () => {
    expect(matchCashbackBrand('myshopeefan', BUILTIN_CASHBACK_BRANDS)).toBeNull()
    expect(matchCashbackBrand('agodas', BUILTIN_CASHBACK_BRANDS)).toBeNull()
    expect(matchCashbackBrand(null, BUILTIN_CASHBACK_BRANDS)).toBeNull()
    expect(matchCashbackBrand('ข้าวมันไก่', BUILTIN_CASHBACK_BRANDS)).toBeNull()
  })
})

const live = { updated_at: '2026-10-24T00:00:00Z', home_href: 'https://gogocash.co', brands: [{ key: 'klook', name: 'Klook', patterns: ['klook'], href: 'https://gogocash.co/shops/klook' }] }
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch

describe('the cashback catalogue', () => {
  it('is 404 while the bridge is off', async () => {
    await expect(new CashbackCatalogueSource({ enabled: false }).get()).rejects.toEqual(new ProblemException(404, 'NOT_FOUND'))
  })

  it('serves the built-in brands, all linking to gogocash.co, without a live catalogue', async () => {
    const catalogue = await new CashbackCatalogueSource({ enabled: true }).get()
    expect(catalogue).toEqual(BUILTIN_CATALOGUE)
    expect(isCashbackCatalogue(catalogue)).toBe(true)
  })

  it('serves a valid live catalogue and keeps it for an hour', async () => {
    let calls = 0
    let now = 0
    const fetchLive = (async (...args: Parameters<typeof fetch>) => {
      calls += 1
      return reply(live)(...args)
    }) as typeof fetch
    const source = new CashbackCatalogueSource({ enabled: true, url: 'https://partner.gogocash.co/catalogue.json', fetch: fetchLive, now: () => now })
    expect(await source.get()).toEqual({ source: 'gogocash', ...live })
    now = 59 * 60 * 1000
    await source.get()
    expect(calls).toBe(1)
    now = 61 * 60 * 1000
    await source.get()
    expect(calls).toBe(2)
  })

  it('refuses links off gogocash.co, errors and outages, falling back to the built-in brands', async () => {
    for (const fetchLive of [
      reply({ ...live, brands: [{ ...live.brands[0], href: 'https://evil.example/klook' }] }),
      reply({ ...live, brands: [{ ...live.brands[0], href: 'http://gogocash.co/klook' }] }),
      reply({ ...live, brands: [{ ...live.brands[0], patterns: ['Klook'] }] }),
      reply({ error: 'down' }, 503),
      (async () => {
        throw new TypeError('fetch failed')
      }) as typeof fetch,
    ]) {
      expect(await new CashbackCatalogueSource({ enabled: true, url: 'https://partner.gogocash.co/c.json', fetch: fetchLive }).get()).toEqual(BUILTIN_CATALOGUE)
    }
  })
})
