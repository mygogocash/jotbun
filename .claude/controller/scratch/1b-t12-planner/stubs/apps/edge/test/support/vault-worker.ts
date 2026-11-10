// The built vault Worker (dist/jotbun_vault) in the real Workers runtime:
// `wrangler dev` (workerd) with config:v1 seeded into its local KV first, and
// the synthetic JWKS issuer as its token issuer. No database. Needs
// `npm run build` in apps/edge first. Test use only.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { TEST_AUDIENCE } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { testSettings } from './edge-harness'
import type { Send } from './nest-server'
import { startDevWorker } from './wrangler-dev'
import type { DevWorker } from './wrangler-dev'

const EDGE_DIR = fileURLToPath(new URL('../../', import.meta.url))
const VAULT_CONFIG = 'dist/jotbun_vault/wrangler.json'
/** B13: the built config without background work, next to it so that its `main` still resolves. */
const PARITY_CONFIG = 'dist/jotbun_vault/wrangler.parity.json'

/** `config`: the config file `wrangler dev` started (the built one, or the parity copy). */
export type VaultWorker = DevWorker & { send: Send; config: string }

/**
 * The config `wrangler dev` starts. With background work `off` (B13) it is a
 * copy of the built config without `workflows`, `queues.consumers` and
 * `containers`, so nothing a request leaves pending advances while a parity
 * session runs, as the PostgreSQL parity ran with no job runner. The parse
 * queue's producer stays, so an upload is still sent to it.
 */
function configFor(background: 'on' | 'off'): string {
  if (background === 'on') return join(EDGE_DIR, VAULT_CONFIG)
  // STUB (1B-T12 Step 2): the copy is unchanged for now, so background work still advances; Step 5 removes the three entries.
  const config = JSON.parse(readFileSync(join(EDGE_DIR, VAULT_CONFIG), 'utf8')) as Record<string, unknown>
  writeFileSync(join(EDGE_DIR, PARITY_CONFIG), `${JSON.stringify(config, null, 2)}\n`)
  return join(EDGE_DIR, PARITY_CONFIG)
}

/**
 * Starts the vault Worker with `policies` published in config:v1. The KV value
 * is written with wrangler into the same local store the dev Worker then reads
 * (`--persist-to`). `vars` are passed as `--var` after the issuer's settings.
 * `background` is `on` unless given (see configFor). `stop()` ends the Worker
 * and removes that store.
 */
export async function startVaultWorker(o: { issuer: JwksFixture; policies: unknown; vars?: Record<string, string>; background?: 'on' | 'off' }): Promise<VaultWorker> {
  if (!existsSync(join(EDGE_DIR, VAULT_CONFIG))) throw new Error('Build the edge first: npm run build (in apps/edge)')
  const persistTo = mkdtempSync(join(tmpdir(), 'jotbun-vault-'))
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  await promisify(execFile)(
    'npx',
    ['wrangler', 'kv', 'key', 'put', '--local', '--persist-to', persistTo, '-c', VAULT_CONFIG, '--binding', 'CONFIG', 'config:v1', JSON.stringify({ policies: o.policies })],
    { cwd: EDGE_DIR, env },
  )
  const config = configFor(o.background ?? 'on')
  const worker = await startDevWorker({
    config,
    vars: {
      AUTH_ISSUER: o.issuer.issuer,
      AUTH_AUDIENCE: TEST_AUDIENCE,
      AUTH_JWKS_URL: `${o.issuer.issuer}.well-known/jwks.json`,
      COMMAND_DIGEST_KEY: testSettings(o.issuer).COMMAND_DIGEST_KEY,
      MIN_CLIENT_VERSION_IOS: '1.0.0',
      MIN_CLIENT_VERSION_ANDROID: '1.0.0',
      JOTBUN_ENV: 'test',
      ...o.vars,
    },
    persistTo,
  })
  const send: Send = (request) => {
    const target = new URL(request.url)
    return fetch(`${worker.url}${target.pathname}${target.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      duplex: 'half',
    } as RequestInit)
  }
  return {
    ...worker,
    send,
    config,
    stop() {
      worker.stop()
      rmSync(persistTo, { recursive: true, force: true, maxRetries: 3 })
    },
  }
}
