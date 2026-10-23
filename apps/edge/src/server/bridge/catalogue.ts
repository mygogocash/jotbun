import { BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME, isCashbackCatalogue } from '@gogospend/contracts'
import type { CashbackCatalogue } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { writeLog } from '@api/common/safe-request-logger'

const TTL_MS = 60 * 60 * 1000

export const BUILTIN_CATALOGUE: CashbackCatalogue = { source: 'builtin', updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] }

export type CatalogueOptions = { enabled: boolean; url?: string; fetch?: typeof fetch; now?: () => number }

/**
 * The public cashback catalogue for the GoGoCash bridge. No account data is
 * involved: the phone downloads it and matches its own records locally.
 * With GOGOCASH_CATALOGUE_URL set, GoGoCash's live list is fetched,
 * validated (https links on gogocash.co only) and kept for an hour; anything
 * missing or malformed falls back to the built-in brands. Only the value is
 * cached, never a pending fetch, so no request waits on another's I/O.
 */
export class CashbackCatalogueSource {
  private cached: { at: number; value: CashbackCatalogue } | null = null

  constructor(private readonly options: CatalogueOptions) {}

  async get(): Promise<CashbackCatalogue> {
    if (!this.options.enabled) throw new ProblemException(404, 'NOT_FOUND')
    const url = this.options.url
    if (!url) return BUILTIN_CATALOGUE
    const now = (this.options.now ?? Date.now)()
    if (this.cached && now - this.cached.at < TTL_MS) return this.cached.value
    try {
      const res = await (this.options.fetch ?? fetch)(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) })
      const body = res.ok ? ((await res.json()) as Partial<CashbackCatalogue>) : null
      const live = body ? { source: 'gogocash' as const, updated_at: typeof body.updated_at === 'string' ? body.updated_at : null, home_href: body.home_href ?? GOGOCASH_HOME, brands: body.brands } : null
      if (live && isCashbackCatalogue(live)) {
        this.cached = { at: now, value: live }
        return live
      }
      writeLog({ level: 'warn', event: 'cashback_catalogue_rejected', status: res.status })
    } catch (error) {
      writeLog({ level: 'warn', event: 'cashback_catalogue_unavailable', error: error instanceof Error ? error.name : typeof error })
    }
    return this.cached?.value ?? BUILTIN_CATALOGUE
  }
}
