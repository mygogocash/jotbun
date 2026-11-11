// LOCAL SMOKE, never committed (1B-T13 planner): the live socket (1D-T10) on the built one Worker. /v1 now
// reaches the vault through TanStack Start's server route (src/routes/v1/$.ts), so this checks that a WebSocket
// upgrade still passes through it: the 101 arrives, `ping` gets the vault's `pong`, and a write from the same
// person's other session pokes this socket with its revision. 1D-T12 proves the live socket on the deployed shape.
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { TEST_AUDIENCE, startJwksFixture } from '@api/testing/jwks-server'
import type { JwksFixture } from '@api/testing/jwks-server'

import { BASE } from './support/edge-harness'
import { startVaultWorker } from './support/vault-worker'
import type { VaultWorker } from './support/vault-worker'

const day = new Date(Date.now() - 86_400_000).toISOString()
const POLICIES = [
  { kind: 'privacy', version: 1, required: false, published_at: day, text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: day, text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

let issuer: JwksFixture
let vault: VaultWorker

beforeAll(async () => {
  issuer = await startJwksFixture()
  vault = await startVaultWorker({ issuer, policies: POLICIES })
}, 120_000)

afterAll(async () => {
  vault?.stop()
  await issuer?.close()
})

it('a live socket opens through the /v1 route, answers ping, and hears the other session write', async () => {
  const sub = randomUUID()
  const now = () => Math.floor(Date.now() / 1000)
  const headers = async (sid: string) => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.sign({ iss: issuer.issuer, aud: TEST_AUDIENCE, sub, sid, iat: now(), exp: now() + 300 })}` })
  const [listening, writing] = [randomUUID(), randomUUID()]
  const accepted = await vault.send(new Request(`${BASE}/v1/me/policy-acceptances`, { method: 'POST', headers: { ...(await headers(writing)), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'terms', version: 1 }) }))
  expect(accepted.status).toBe(204)
  const socket = new WebSocket(`${vault.url.replace('http', 'ws')}/v1/sync/live`, { headers: await headers(listening) } as unknown as string[])
  const messages: string[] = []
  const next = () =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no message; so far ${JSON.stringify(messages)}`)), 5_000)
      socket.addEventListener('message', (event) => {
        clearTimeout(timer)
        resolve(String(event.data))
      }, { once: true })
    })
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('the socket did not open')), { once: true })
  })
  const pong = next()
  socket.send('ping')
  messages.push(await pong)
  const poke = next()
  const wallet = await vault.send(
    new Request(`${BASE}/v1/wallets`, {
      method: 'POST',
      headers: { ...(await headers(writing)), 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' },
      body: JSON.stringify({ id: randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' }),
    }),
  )
  expect(wallet.status).toBe(201)
  const { committed_revision } = (await wallet.json()) as { committed_revision: string }
  messages.push(await poke)
  socket.close()
  expect(messages).toEqual(['pong', JSON.stringify({ revision: committed_revision })])
})
