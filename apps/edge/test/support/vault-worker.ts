// The built vault Worker (dist/jotbun_vault) in the real Workers runtime:
// `wrangler dev` (workerd) with config:v1 seeded into its local KV first, and
// the synthetic JWKS issuer as its token issuer. No database. Needs
// `npm run build` in apps/edge first. Test use only.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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

export type VaultWorker = DevWorker & { send: Send }

/**
 * Starts the vault Worker with `policies` published in config:v1. The KV value
 * is written with wrangler into the same local store the dev Worker then reads
 * (`--persist-to`). `stop()` ends the Worker and removes that store.
 */
export async function startVaultWorker(o: { issuer: JwksFixture; policies: unknown }): Promise<VaultWorker> {
  if (!existsSync(join(EDGE_DIR, VAULT_CONFIG))) throw new Error('Build the edge first: npm run build (in apps/edge)')
  const persistTo = mkdtempSync(join(tmpdir(), 'jotbun-vault-'))
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  await promisify(execFile)(
    'npx',
    ['wrangler', 'kv', 'key', 'put', '--local', '--persist-to', persistTo, '-c', VAULT_CONFIG, '--binding', 'CONFIG', 'config:v1', JSON.stringify({ policies: o.policies })],
    { cwd: EDGE_DIR, env },
  )
  const worker = await startDevWorker({
    config: join(EDGE_DIR, VAULT_CONFIG),
    vars: {
      AUTH_ISSUER: o.issuer.issuer,
      AUTH_AUDIENCE: TEST_AUDIENCE,
      AUTH_JWKS_URL: `${o.issuer.issuer}.well-known/jwks.json`,
      COMMAND_DIGEST_KEY: testSettings(o.issuer).COMMAND_DIGEST_KEY,
      MIN_CLIENT_VERSION_IOS: '1.0.0',
      MIN_CLIENT_VERSION_ANDROID: '1.0.0',
      JOTBUN_ENV: 'test',
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
    stop() {
      worker.stop()
      rmSync(persistTo, { recursive: true, force: true, maxRetries: 3 })
    },
  }
}
