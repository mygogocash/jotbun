// The deletion Worker (the API's `worker:deletion`): account deletion with
// its heartbeat protocol, one at a time. Logins: HYPERDRIVE_DELETION
// (gogospend_jobs + gogospend_security) and HYPERDRIVE_ERASURE_REGISTRY
// (gogospend_erasure_registry only). The registry's lookup key is the secret
// ERASURE_REGISTRY_LOOKUP_KEY, bound to this Worker alone: Worker secrets are
// bindings, not a process environment a child could inherit, which is what
// the API's descriptor hand-off guarded against.
import { R2ObjectStore } from '../server/storage/r2-object-store'
import type { R2BucketLike } from '../server/storage/r2-object-store'
import { runDeletions } from '../server/jobs/roles'
import { RUN_BUDGET_MS, ackAll, noHttp, poolOf, settingsAndGates, withPools, workerFetch } from './common'
import type { BatchLike, HyperdriveLike } from './common'

export type DeletionEnv = {
  HYPERDRIVE_DELETION?: HyperdriveLike
  HYPERDRIVE_ERASURE_REGISTRY?: HyperdriveLike
  OBJECTS?: R2BucketLike
  ERASURE_REGISTRY_LOOKUP_KEY?: string
}

async function run(env: DeletionEnv): Promise<void> {
  if (!env.OBJECTS) throw new Error('OBJECTS is not bound.')
  const { settings, gates } = settingsAndGates(env)
  const pool = poolOf(env.HYPERDRIVE_DELETION, 'HYPERDRIVE_DELETION')
  const registryPool = poolOf(env.HYPERDRIVE_ERASURE_REGISTRY, 'HYPERDRIVE_ERASURE_REGISTRY')
  await withPools([pool, registryPool], async () => {
    const ran = await runDeletions({ pool, registryPool, lookupKey: env.ERASURE_REGISTRY_LOOKUP_KEY, store: new R2ObjectStore(env.OBJECTS!), settings, gates, fetch: workerFetch }, RUN_BUDGET_MS)
    if (ran > 0) console.log(`deletion worker: ran ${ran} stage(s)`)
  })
}

export default {
  // No HTTP surface: work arrives by Cron Trigger and queue only.
  fetch: noHttp,
  async scheduled(_controller: unknown, env: DeletionEnv): Promise<void> {
    await run(env)
  },
  async queue(batch: BatchLike, env: DeletionEnv): Promise<void> {
    ackAll(batch)
    await run(env)
  },
}
