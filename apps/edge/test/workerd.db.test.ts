// The production build in the real Workers runtime: `wrangler dev` (workerd)
// serves dist/server with Hyperdrive's local connection to a disposable
// database, and a signed-in session goes through it. Needs `npm run build`
// in apps/edge first.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startEdge, testSettings } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'

const BUILT = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url))
const EDGE_DIR = fileURLToPath(new URL('../', import.meta.url))

let edge: Edge
let worker: ChildProcess | undefined
let url = ''
let logs = ''

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('Build the edge first: npm run build -w gogospend-edge (in apps/edge: npm run build)')
  edge = await startEdge()
  const port = await freePort()
  url = `http://127.0.0.1:${port}`
  const settings = testSettings(edge.issuer, { JOTBUN_ENV: 'local' })
  const vars = Object.entries(settings).flatMap(([key, value]) => (typeof value === 'string' ? ['--var', `${key}:${value}`] : []))
  worker = spawn('npx', ['wrangler', 'dev', '-c', BUILT, '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false', '--log-level', 'warn', ...vars], {
    cwd: EDGE_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: await edge.db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
      WRANGLER_SEND_METRICS: 'false',
    },
  })
  worker.stdout?.on('data', (chunk) => (logs += String(chunk)))
  worker.stderr?.on('data', (chunk) => (logs += String(chunk)))
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      if ((await fetch(`${url}/live`)).ok) return
    } catch {
      // not listening yet
    }
    if (worker.exitCode !== null) throw new Error(`wrangler dev exited: ${logs.slice(-3000)}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`wrangler dev did not start: ${logs.slice(-3000)}`)
}, 120_000)

afterAll(async () => {
  worker?.kill('SIGTERM')
  await edge?.close()
})

const headers = async (user: SignedUp, extra: Record<string, string> = {}) => ({
  'x-gogospend-client': 'android/1.0.0',
  authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
  'x-gogospend-session': user.binding,
  ...extra,
})

describe('the Worker in workerd', () => {
  it('answers /live without the database', async () => {
    const res = await fetch(`${url}/live`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'live' })
  })

  it('/ready reaches PostgreSQL through Hyperdrive and holds without readiness receipts', async () => {
    const res = await fetch(`${url}/ready`)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', message_key: 'errors.not_ready', retry_after_seconds: 30 })
  })

  it('serves the trust page with TanStack Start', async () => {
    const res = await fetch(`${url}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('คำสัญญาของเรา')
    expect(html).toContain('No diary data is ever sent to GoGoCash')
  })

  it('runs a signed-in money session against PostgreSQL', async () => {
    const user = await edge.member()
    const id = randomUUID()
    const created = await fetch(`${url}/v1/wallets`, {
      method: 'POST',
      headers: await headers(user, { 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' }),
      body: JSON.stringify({ id, name: 'เงินสด', opening_minor: '50000', tracking_start: '2026-10-01' }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ entity_id: id, outcome: 'created', committed_revision: '1' })
    const list = await fetch(`${url}/v1/wallets`, { headers: await headers(user) })
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual([expect.objectContaining({ id, name: 'เงินสด', balance_minor: '50000' })])
    const me = await fetch(`${url}/v1/me`, { headers: await headers(user) })
    expect(await me.json()).toMatchObject({ account_id: user.accountId, status: 'active' })
  })

  it('isolates accounts in the runtime too', async () => {
    const owner = await edge.member()
    const stranger = await edge.member()
    const id = randomUUID()
    await fetch(`${url}/v1/wallets`, {
      method: 'POST',
      headers: await headers(owner, { 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1' }),
      body: JSON.stringify({ id, name: 'Mine', opening_minor: '0', tracking_start: '2026-10-01' }),
    })
    expect((await fetch(`${url}/v1/wallets/${id}`, { headers: await headers(stranger) })).status).toBe(404)
  })

  it('a route the edge does not serve is 404 without a legacy origin', async () => {
    const res = await fetch(`${url}/v1/reports/${randomUUID()}`, { headers: { 'x-gogospend-client': 'ios/1.0.0' } })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' })
  })
})
