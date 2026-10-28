import { CashbackCatalogueSource } from '../server/bridge/catalogue'
import { flag } from '../server/env'
import type { V1Env } from './env'
import type { WorkerHandler } from './worker-routes'

type CachedSource = {
  enabled: string | undefined
  url: string | undefined
  fetchCatalogue: typeof fetch | undefined
  source: CashbackCatalogueSource
}

/** One source per isolate, so the catalogue's one-hour cache survives across requests. */
const sources: CachedSource[] = []

/**
 * The fetch the catalogue source of this request uses. The handler reads it
 * before its first await, so two requests cannot swap each other's fetch.
 */
let catalogueFetch: typeof fetch | undefined

export function bindCatalogueFetch(fetchCatalogue: typeof fetch | undefined): void {
  catalogueFetch = fetchCatalogue
}

function catalogueSource(env: V1Env): CashbackCatalogueSource {
  const enabled = env.GOGOCASH_BRIDGE_ENABLED
  const url = env.GOGOCASH_CATALOGUE_URL
  const fetchCatalogue = catalogueFetch
  const found = sources.find((entry) => entry.enabled === enabled && entry.url === url && entry.fetchCatalogue === fetchCatalogue)
  if (found) return found.source
  const source = new CashbackCatalogueSource({ enabled: flag(enabled), url: url || undefined, fetch: fetchCatalogue })
  sources.push({ enabled, url, fetchCatalogue, source })
  return source
}

/** The public cashback catalogue. Off, it is 404; a failed live fetch falls back to the built-in brands. */
export const bridgeCatalogue: WorkerHandler = async (w) => {
  const source = catalogueSource(w.env)
  return { ok: true, status: 200, body: await source.get() }
}
