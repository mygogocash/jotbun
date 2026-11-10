// LOCAL PROBE, never committed (1B-T12 fix planner): the 1B-T12 review's n6. When configFor throws,
// startVaultWorker must leave no temporary store (jotbun-vault-*) behind. A directory where the parity copy
// goes makes configFor's write throw EISDIR; the built config itself stays valid, so on ef37c41's order the
// store is made and seeded first, then left behind.
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { startVaultWorker } from './support/vault-worker'

const PARITY = fileURLToPath(new URL('../dist/jotbun_vault/wrangler.parity.json', import.meta.url))
const stores = () => readdirSync(tmpdir()).filter((name) => name.startsWith('jotbun-vault-'))

let issuer: JwksFixture

beforeAll(async () => {
  issuer = await startJwksFixture()
})

afterAll(async () => {
  rmSync(PARITY, { recursive: true, force: true })
  await issuer?.close()
})

it('a parity config that cannot be written leaves no temporary store behind', async () => {
  rmSync(PARITY, { recursive: true, force: true })
  mkdirSync(PARITY)
  const before = stores()
  await expect(startVaultWorker({ issuer, policies: [], background: 'off' })).rejects.toThrow(/EISDIR/)
  const leaked = stores().filter((name) => !before.includes(name))
  for (const name of leaked) rmSync(join(tmpdir(), name), { recursive: true, force: true })
  expect(leaked).toEqual([])
})
