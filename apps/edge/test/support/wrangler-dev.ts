// A built Worker in the real Workers runtime: `wrangler dev` (workerd) on a
// free loopback port, with settings as --var and Hyperdrive's local
// connections, if it has any, from the environment. Test use only.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const EDGE_DIR = fileURLToPath(new URL('../../', import.meta.url))

export type DevWorker = { url: string; logs(): string; stop(): void }

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

export type DevWorkerOptions = {
  /** dist/<worker>/wrangler.json from `npm run build`. */
  config: string
  vars: Record<string, string | undefined>
  /** Hyperdrive bindings to local connection strings. The vault Worker has none. */
  hyperdrive?: Record<string, string>
  /** Shared by Workers that must see the same local R2 bucket. */
  persistTo: string
  /** Exposes /cdn-cgi/local/scheduled to fire the Cron handler. */
  scheduled?: boolean
  /** The path that answers once the Worker is up (default /live; any answer counts). */
  probe?: string
}

export async function startDevWorker(options: DevWorkerOptions): Promise<DevWorker> {
  const port = await freePort()
  const inspector = await freePort()
  const url = `http://127.0.0.1:${port}`
  const vars = Object.entries(options.vars).flatMap(([key, value]) => (typeof value === 'string' ? ['--var', `${key}:${value}`] : []))
  const env: NodeJS.ProcessEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  for (const [binding, connection] of Object.entries(options.hyperdrive ?? {})) env[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${binding}`] = connection
  const args = ['wrangler', 'dev', '-c', options.config, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', options.persistTo, '--show-interactive-dev-session=false', '--log-level', 'info', ...(options.scheduled ? ['--test-scheduled'] : []), ...vars]
  const child: ChildProcess = spawn('npx', args, { cwd: EDGE_DIR, stdio: ['ignore', 'pipe', 'pipe'], env })
  let logs = ''
  child.stdout?.on('data', (chunk) => (logs += String(chunk)))
  child.stderr?.on('data', (chunk) => (logs += String(chunk)))
  const stop = () => void child.kill('SIGTERM')
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await (await fetch(`${url}${options.probe ?? '/live'}`)).body?.cancel()
      return { url, logs: () => logs, stop }
    } catch {
      // not listening yet
    }
    if (child.exitCode !== null) throw new Error(`wrangler dev exited: ${logs.slice(-3000)}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  stop()
  throw new Error(`wrangler dev did not start: ${logs.slice(-3000)}`)
}
