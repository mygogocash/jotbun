// The one Worker in the real Workers runtime (C1, B15): `wrangler dev`
// (workerd) serves the built dist/server, with config:v1 seeded into its local
// KV first. It answers /live, and /ready from its settings and KV (the
// PostgreSQL checks retired with Hyperdrive), serves the trust page with
// TanStack Start, and answers /v1 from the UserVault. No database. Needs
// `npm run build` in apps/edge first. The cases replace workerd.db.test.ts's
// (1B-T13's mapping table).
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import type { PolicyVersionDto } from '@gogospend/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startDevWorker } from './support/wrangler-dev'
import type { DevWorker } from './support/wrangler-dev'

const EDGE_DIR = fileURLToPath(new URL('../', import.meta.url))
const BUILT = 'dist/server/wrangler.json'
/** 1A-T1's local CONFIG namespace id, which wrangler.jsonc keeps. */
const CONFIG_NAMESPACE = '00000000000000000000000000000000'

/** The published list in kind order, as GET /v1/policies answers it. */
const POLICIES: PolicyVersionDto[] = [
  { kind: 'privacy', version: 1, required: false, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

/** Plan Step 1 (RED only): the old build binds HYPERDRIVE, so wrangler dev needs a local connection string to start. Port 9 refuses at once. Step 4 removes it with the binding. */
const UNREACHABLE = { HYPERDRIVE: 'postgres://nobody:none@127.0.0.1:9/none' }

/** What /ready needs, and the client minimums. The JWKS URL is never fetched here. */
const SETTINGS = {
  JOTBUN_ENV: 'test',
  AUTH_ISSUER: 'http://issuer.test/',
  AUTH_AUDIENCE: 'jotbun-v1',
  AUTH_JWKS_URL: 'http://issuer.test/.well-known/jwks.json',
  COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
  MIN_CLIENT_VERSION_IOS: '1.0.0',
  MIN_CLIENT_VERSION_ANDROID: '1.0.0',
}

const stores: string[] = []
let ready: DevWorker
let notReady: DevWorker

beforeAll(async () => {
  if (!existsSync(join(EDGE_DIR, BUILT))) throw new Error('Build the edge first: npm run build (in apps/edge)')
  const persistTo = mkdtempSync(join(tmpdir(), 'jotbun-c1-'))
  const bare = mkdtempSync(join(tmpdir(), 'jotbun-c1-bare-'))
  stores.push(persistTo, bare)
  await promisify(execFile)(
    'npx',
    ['wrangler', 'kv', 'key', 'put', 'config:v1', JSON.stringify({ policies: POLICIES }), '--namespace-id', CONFIG_NAMESPACE, '--local', '--persist-to', persistTo],
    { cwd: EDGE_DIR, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
  )
  ready = await startDevWorker({ config: BUILT, vars: SETTINGS, persistTo, hyperdrive: UNREACHABLE })
  // wrangler.jsonc's vars set AUTH_ISSUER and AUTH_AUDIENCE for every run, so the only setting this Worker lacks is the digest key.
  const { COMMAND_DIGEST_KEY: _digest, ...rest } = SETTINGS
  notReady = await startDevWorker({ config: BUILT, vars: rest, persistTo: bare, hyperdrive: UNREACHABLE })
}, 120_000)

afterAll(() => {
  ready?.stop()
  notReady?.stop()
  for (const store of stores) rmSync(store, { recursive: true, force: true, maxRetries: 3 })
})

describe('the one Worker in workerd', () => {
  it('answers /live with no-store', async () => {
    const res = await fetch(`${ready.url}/live`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'live' })
  })

  it('/ready is 200 with its settings and KV', async () => {
    const res = await fetch(`${ready.url}/ready`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'ready' })
  })

  it('/ready is 503 without its settings', async () => {
    const res = await fetch(`${notReady.url}/ready`)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.not_ready', retry_after_seconds: 30 })
  })

  it('serves the trust page with TanStack Start', async () => {
    const res = await fetch(`${ready.url}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('คำสัญญาของเรา')
    expect(html).toContain('No diary data is ever sent to GoGoCash')
  })

  it('serves /v1 from the vault: the policy list comes from KV', async () => {
    const res = await fetch(`${ready.url}/v1/policies`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(POLICIES)
  })

  it('an unknown /v1 route is 404', async () => {
    const res = await fetch(`${ready.url}/v1/reports/${randomUUID()}`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' })
  })
})
