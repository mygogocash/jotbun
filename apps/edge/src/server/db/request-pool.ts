import { AsyncLocalStorage } from 'node:async_hooks'

import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'

/**
 * Workers cannot share a socket between requests, so each request gets its
 * own small pg pool (Hyperdrive keeps the real connections warm). The API's
 * services are built once per isolate and hold `requestPool`, a Pool-shaped
 * facade that hands every call to the current request's pool.
 */
export type PoolSource = {
  pool(): Pool
  /** Ends the request's pool, if one was opened. */
  close(): Promise<void>
}

const current = new AsyncLocalStorage<PoolSource>()

export function withRequestPool<T>(source: PoolSource, fn: () => Promise<T>): Promise<T> {
  return current.run(source, fn)
}

function active(): Pool {
  const source = current.getStore()
  if (!source) throw new Error('No database pool for this request.')
  return source.pool()
}

export const requestPool = {
  connect: () => active().connect(),
  query: (...args: Parameters<Pool['query']>) => (active().query as (...a: unknown[]) => unknown)(...args),
  on: () => requestPool,
  end: async () => undefined,
} as unknown as Pool

/** A lazily opened per-request pool; nothing connects until the first query. */
export function lazyPool(config: PoolConfig): PoolSource {
  let pool: Pool | null = null
  return {
    pool() {
      if (!pool) {
        pool = new pg.Pool(config)
        // An idle client's server-side disconnect must not crash the isolate.
        pool.on('error', () => undefined)
      }
      return pool
    },
    async close() {
      const opened = pool
      pool = null
      if (opened) await opened.end()
    },
  }
}

/** A shared pool owned by the caller (Node tests); `close` leaves it open. */
export function sharedPool(pool: Pool): PoolSource {
  return { pool: () => pool, close: async () => undefined }
}

/** Hyperdrive config for one request: a few connections, never cached (caching is disabled on the Hyperdrive config). */
export function hyperdrivePoolConfig(connectionString: string): PoolConfig {
  return { connectionString, max: 4, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 1_000 }
}
