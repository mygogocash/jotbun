// /live and /ready on the one Worker (C1, B15): /ready answers from the
// Worker's settings and KV, since its PostgreSQL checks retired with
// Hyperdrive. c1-worker.db.test.ts runs both in workerd on the built Worker;
// these cases pin each check on its own.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { live, readyResponseOf } from '../src/v1/ready'
import type { ReadyEnv } from '../src/v1/ready'

const kvWith = (get: (key: string, type: 'text') => Promise<string | null>) => ({ get }) as unknown as KVNamespace

const READY: ReadyEnv = {
  CONFIG: kvWith(async () => '{"policies":[]}'),
  AUTH_ISSUER: 'http://issuer.test/',
  AUTH_AUDIENCE: 'jotbun-v1',
  AUTH_JWKS_URL: 'http://issuer.test/.well-known/jwks.json',
  COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function expectNotReady(res: Response) {
  expect(res.status).toBe(503)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('retry-after')).toBe('30')
  expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.not_ready', retry_after_seconds: 30 })
}

describe('/live and /ready (B15)', () => {
  it('/live answers 200 with no-store', async () => {
    const res = live()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'live' })
  })

  it('/ready is 200 with every setting and a readable config:v1, also when config:v1 is absent', async () => {
    for (const config of [READY.CONFIG, kvWith(async () => null)]) {
      const res = await readyResponseOf({ ...READY, CONFIG: config })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.json()).toEqual({ status: 'ready' })
    }
  })

  it('/ready reads config:v1 by its key', async () => {
    const get = vi.fn(async (_key: string, _type: 'text') => null)
    await readyResponseOf({ ...READY, CONFIG: kvWith(get) })
    expect(get).toHaveBeenCalledWith('config:v1', 'text')
  })

  it.each(['AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_JWKS_URL', 'COMMAND_DIGEST_KEY'] as const)('/ready is 503 without %s', async (name) => {
    await expectNotReady(await readyResponseOf({ ...READY, [name]: undefined }))
  })

  it('/ready is 503 when config:v1 cannot be read, and the log names only the failure class', async () => {
    const logged: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
    const unreadable = kvWith(async () => {
      throw new TypeError('KV is down at 10.0.0.1')
    })
    await expectNotReady(await readyResponseOf({ ...READY, CONFIG: unreadable }))
    expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'error', event: 'ready_config_unreadable', failure: 'TypeError' }])
    expect(logged.join('')).not.toContain('10.0.0.1')
  })
})
