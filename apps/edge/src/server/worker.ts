import { env, waitUntil } from 'cloudflare:workers'

import { buildContainer } from './app/container'
import type { Container } from './app/container'
import { dispatch } from './app/dispatch'
import { ready, readyResponse } from './app/health'
import { ALL_ROUTES } from './app/routes'
import type { WakeRole } from './app/routes'
import { hyperdrivePoolConfig, lazyPool, requestPool, withRequestPool } from './db/request-pool'
import type { PoolSource } from './db/request-pool'
import { settingsOf } from './env'
import type { EdgeEnv, QueueProducer } from './env'

import { writeLog } from '@api/common/safe-request-logger'

// The Worker glue: the only module that reads `cloudflare:workers`, so the
// rest of the server is plain TypeScript that Node tests can run.
const bindings = env as unknown as EdgeEnv

let container: Container | null = null
const edgeContainer = (): Container => (container ??= buildContainer(bindings))

function requestSource(): PoolSource {
  const connectionString = bindings.HYPERDRIVE?.connectionString ?? bindings.DATABASE_URL
  if (!connectionString) throw new Error('No database is configured (HYPERDRIVE binding).')
  return lazyPool(hyperdrivePoolConfig(connectionString))
}

/** Runs `fn` with this request's pool and closes the pool before the response leaves. */
async function withDatabase<T>(fn: () => Promise<T>): Promise<T> {
  const source = requestSource()
  try {
    return await withRequestPool(source, fn)
  } finally {
    await source.close()
  }
}

const WAKE_QUEUES: Record<WakeRole, keyof EdgeEnv> = { jobs: 'JOBS', security: 'SECURITY_JOBS', deletion: 'DELETION_JOBS' }

/**
 * A wake-up message for a background Worker, sent after the response. The job
 * row is already committed in PostgreSQL, so a lost message only means the
 * work waits for that Worker's next cron sweep.
 */
function wake(role: WakeRole): void {
  const queue = bindings[WAKE_QUEUES[role]] as QueueProducer | undefined
  if (!queue) return
  waitUntil(queue.send({ kind: role }).catch(() => writeLog({ level: 'warn', event: 'job_wakeup_failed', role })))
}

export function handleV1(request: Request): Promise<Response> {
  return withDatabase(() =>
    dispatch(request, { container: edgeContainer, routes: ALL_ROUTES, legacyOrigin: bindings.LEGACY_V1_ORIGIN || undefined, wake }),
  )
}

export async function handleReady(): Promise<Response> {
  return withDatabase(async () => readyResponse(await ready(requestPool, settingsOf(bindings) as NodeJS.ProcessEnv)))
}

export { edgeContainer, bindings, withDatabase }
