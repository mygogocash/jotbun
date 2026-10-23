// The real NestJS v1 server (apps/api/dist), started as a child process on
// the edge harness's database and issuer, for differential parity tests.
// Needs `npm run build -w gogospend-api` first. Test use only.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { testSettings } from './edge-harness'
import type { Edge } from './edge-harness'
import type { EdgeEnv } from '../../src/server/env'

const API_MAIN = fileURLToPath(new URL('../../../api/dist/v1/main.js', import.meta.url))
const REPO = fileURLToPath(new URL('../../../../', import.meta.url))

export type Send = (request: Request) => Promise<Response>
export type NestServer = { url: string; send: Send; stop(): void }

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

/** Starts the API with the same settings as the edge (`overrides` are the edge's too). */
export async function startNest(edge: Edge, overrides: Partial<EdgeEnv> = {}, extraEnv: Record<string, string> = {}): Promise<NestServer> {
  if (!existsSync(API_MAIN)) throw new Error('Build the API first: npm run build -w gogospend-api')
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const settings: Record<string, unknown> = testSettings(edge.issuer, overrides)
  const passed = Object.fromEntries(Object.entries(settings).filter(([key, value]) => key !== 'JOTBUN_ENV' && typeof value === 'string')) as Record<string, string>
  const nest: ChildProcess = spawn(process.execPath, [API_MAIN], {
    cwd: REPO,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: await edge.db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
      TRUST_PROXY_HOPS: '0',
      OBJECT_STORE: 'memory',
      ...passed,
      ...extraEnv,
    },
  })
  let stderr = ''
  nest.stderr?.on('data', (chunk) => (stderr += String(chunk)))
  const send: Send = (request) => {
    const target = new URL(request.url)
    return fetch(`${url}${target.pathname}${target.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      duplex: 'half',
    } as RequestInit)
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${url}/live`)).ok) return { url, send, stop: () => void nest.kill('SIGTERM') }
    } catch {
      // not listening yet
    }
    if (nest.exitCode !== null) throw new Error(`The NestJS v1 server exited: ${stderr.slice(0, 2000)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  nest.kill('SIGTERM')
  throw new Error(`The NestJS v1 server did not start: ${stderr.slice(0, 2000)}`)
}
